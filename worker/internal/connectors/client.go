package connectors

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const maxProviderResponse = 2 << 20

var supported = map[string]struct{}{
	"app-store-connect": {},
	"revenuecat":        {},
	"posthog":           {},
	"superwall":         {},
}

type Verification struct {
	Provider     string    `json:"provider"`
	AccountLabel string    `json:"accountLabel,omitempty"`
	Message      string    `json:"message"`
	CheckedAt    time.Time `json:"checkedAt"`
}

type ProviderError struct {
	Status    int
	Retryable bool
	Code      string
}

func (e ProviderError) Error() string {
	return e.Code
}

type Client struct {
	HTTP *http.Client
	Now  func() time.Time
	// AppleBaseURL is the App Store Connect API root used for analytics
	// navigation. Configurable so tests can point it at httptest.
	AppleBaseURL string
	// AppleReportLagDays reflects Apple's analytics processing delay and drives
	// the completeness of recently-imported days.
	AppleReportLagDays int
}

func NewClient() *Client {
	dialer := &net.Dialer{Timeout: 8 * time.Second, KeepAlive: 30 * time.Second}
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          32,
		MaxIdleConnsPerHost:   4,
		IdleConnTimeout:       60 * time.Second,
		TLSHandshakeTimeout:   8 * time.Second,
		ResponseHeaderTimeout: 12 * time.Second,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}
			addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, err
			}
			for _, address := range addresses {
				if !publicIP(address.IP) {
					return nil, errors.New("provider host resolves to a non-public address")
				}
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(host, port))
		},
	}
	return &Client{
		HTTP: &http.Client{
			Transport: transport,
			Timeout:   20 * time.Second,
			CheckRedirect: func(request *http.Request, via []*http.Request) error {
				if len(via) >= 3 {
					return errors.New("too many redirects")
				}
				return validateExternalHTTPS(request.URL)
			},
		},
		Now:               time.Now,
		AppleBaseURL:      "https://api.appstoreconnect.apple.com",
		AppleReportLagDays: 2,
	}
}

// WithConfig applies provider-specific configuration from the runtime config.
func (c *Client) WithConfig(appleBaseURL string, appleReportLagDays int) *Client {
	if strings.TrimSpace(appleBaseURL) != "" {
		c.AppleBaseURL = strings.TrimRight(appleBaseURL, "/")
	}
	if appleReportLagDays >= 0 {
		c.AppleReportLagDays = appleReportLagDays
	}
	return c
}

func Supported(provider string) bool {
	_, ok := supported[provider]
	return ok
}

func (c *Client) Verify(
	ctx context.Context,
	provider string,
	credentials map[string]any,
) (Verification, error) {
	if !Supported(provider) {
		return Verification{}, ProviderError{Status: 400, Code: "unsupported_provider"}
	}
	switch provider {
	case "app-store-connect":
		return c.verifyApple(ctx, credentials)
	case "revenuecat":
		return c.verifyRevenueCat(ctx, credentials)
	case "posthog":
		return c.verifyPostHog(ctx, credentials)
	case "superwall":
		return c.verifySuperwall(ctx, credentials)
	default:
		return Verification{}, ProviderError{Status: 400, Code: "unsupported_provider"}
	}
}

func (c *Client) verifyApple(
	ctx context.Context,
	credentials map[string]any,
) (Verification, error) {
	issuerID, keyID, privateKey, err := require3(
		credentials,
		"issuerId",
		"keyId",
		"privateKey",
	)
	if err != nil {
		return Verification{}, err
	}
	token, err := appleToken(issuerID, keyID, privateKey, c.Now().UTC())
	if err != nil {
		return Verification{}, err
	}
	body, err := c.getJSON(
		ctx,
		"https://api.appstoreconnect.apple.com/v1/apps?limit=1",
		token,
	)
	if err != nil {
		return Verification{}, err
	}
	var response struct {
		Data []struct {
			Attributes struct {
				Name string `json:"name"`
			} `json:"attributes"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return Verification{}, ProviderError{Status: 502, Retryable: true, Code: "invalid_provider_response"}
	}
	label := ""
	if len(response.Data) > 0 {
		label = response.Data[0].Attributes.Name
	}
	return Verification{
		Provider:     "app-store-connect",
		AccountLabel: label,
		Message:      "Key verified. Apple analytics availability is checked by the worker.",
		CheckedAt:    c.Now().UTC(),
	}, nil
}

func appleToken(
	issuerID, keyID, privateKey string,
	now time.Time,
) (string, error) {
	block, _ := pem.Decode([]byte(privateKey))
	if block == nil {
		return "", ProviderError{Status: 400, Code: "invalid_apple_private_key"}
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		if ecKey, ecErr := x509.ParseECPrivateKey(block.Bytes); ecErr == nil {
			parsed = ecKey
		} else {
			return "", ProviderError{Status: 400, Code: "invalid_apple_private_key"}
		}
	}
	ecKey, ok := parsed.(*ecdsa.PrivateKey)
	if !ok {
		return "", ProviderError{Status: 400, Code: "invalid_apple_private_key"}
	}
	token := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{
		"iss": issuerID,
		"iat": now.Unix(),
		"exp": now.Add(15 * time.Minute).Unix(),
		"aud": "appstoreconnect-v1",
	})
	token.Header["kid"] = keyID
	signed, err := token.SignedString(ecKey)
	if err != nil {
		return "", ProviderError{Status: 400, Code: "invalid_apple_private_key"}
	}
	return signed, nil
}

func (c *Client) verifyRevenueCat(
	ctx context.Context,
	credentials map[string]any,
) (Verification, error) {
	apiKey, projectID, err := require2(credentials, "apiKey", "projectId")
	if err != nil {
		return Verification{}, err
	}
	endpoint := "https://api.revenuecat.com/v2/projects/" +
		url.PathEscape(projectID) +
		"/charts/revenue/options"
	if _, err := c.getJSON(ctx, endpoint, apiKey); err != nil {
		return Verification{}, err
	}
	return Verification{
		Provider:     "revenuecat",
		AccountLabel: projectID,
		Message:      "V2 key verified with Charts read access.",
		CheckedAt:    c.Now().UTC(),
	}, nil
}

func (c *Client) verifyPostHog(
	ctx context.Context,
	credentials map[string]any,
) (Verification, error) {
	apiKey, projectID, host, err := require3(
		credentials,
		"personalApiKey",
		"projectId",
		"host",
	)
	if err != nil {
		return Verification{}, err
	}
	parsedHost, err := url.Parse(host)
	if err != nil || validateExternalHTTPS(parsedHost) != nil {
		return Verification{}, ProviderError{Status: 400, Code: "invalid_posthog_host"}
	}
	endpoint := parsedHost.Scheme + "://" + parsedHost.Host +
		"/api/projects/" + url.PathEscape(projectID) + "/"
	body, err := c.getJSON(ctx, endpoint, apiKey)
	if err != nil {
		return Verification{}, err
	}
	var response struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return Verification{}, ProviderError{Status: 502, Retryable: true, Code: "invalid_provider_response"}
	}
	label := strings.TrimSpace(response.Name)
	if label == "" {
		label = projectID
	}
	return Verification{
		Provider:     "posthog",
		AccountLabel: label,
		Message:      "Project verified. Syncs use bounded aggregate queries only.",
		CheckedAt:    c.Now().UTC(),
	}, nil
}

func (c *Client) verifySuperwall(
	ctx context.Context,
	credentials map[string]any,
) (Verification, error) {
	apiKey, projectID, err := require2(credentials, "apiKey", "projectId")
	if err != nil {
		return Verification{}, err
	}
	endpoint := "https://api.superwall.com/v2/projects/" + url.PathEscape(projectID)
	body, err := c.getJSON(ctx, endpoint, apiKey)
	if err != nil {
		return Verification{}, err
	}
	var response struct {
		Name string `json:"name"`
		Data struct {
			Name string `json:"name"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return Verification{}, ProviderError{Status: 502, Retryable: true, Code: "invalid_provider_response"}
	}
	label := response.Data.Name
	if label == "" {
		label = response.Name
	}
	if label == "" {
		label = projectID
	}
	return Verification{
		Provider:     "superwall",
		AccountLabel: label,
		Message:      "Project verified with the read-only Superwall API.",
		CheckedAt:    c.Now().UTC(),
	}, nil
}

func (c *Client) getJSON(
	ctx context.Context,
	endpoint, bearerToken string,
) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, ProviderError{Status: 400, Code: "invalid_provider_request"}
	}
	if err := validateExternalHTTPS(request.URL); err != nil {
		return nil, ProviderError{Status: 400, Code: "invalid_provider_host"}
	}
	request.Header.Set("Authorization", "Bearer "+bearerToken)
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", "AppClimb/1.0")
	response, err := c.HTTP.Do(request)
	if err != nil {
		return nil, ProviderError{Status: 502, Retryable: true, Code: "provider_unavailable"}
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 8<<10))
		return nil, ProviderError{
			Status:    response.StatusCode,
			Retryable: response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= 500,
			Code:      "provider_rejected_credentials",
		}
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxProviderResponse+1))
	if err != nil || len(body) > maxProviderResponse {
		return nil, ProviderError{Status: 502, Retryable: true, Code: "provider_response_too_large"}
	}
	return body, nil
}

// get opens a streaming GET for large provider payloads (e.g. gzip-compressed
// analytics segments). Unlike getJSON it does not cap the body or buffer it in
// memory; the caller owns the returned ReadCloser and must close it. The same
// SSRF and redirect hardening applies.
func (c *Client) get(
	ctx context.Context,
	endpoint, bearerToken string,
) (io.ReadCloser, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, ProviderError{Status: 400, Code: "invalid_provider_request"}
	}
	if err := validateExternalHTTPS(request.URL); err != nil {
		return nil, ProviderError{Status: 400, Code: "invalid_provider_host"}
	}
	request.Header.Set("Authorization", "Bearer "+bearerToken)
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", "AppClimb/1.0")
	response, err := c.HTTP.Do(request)
	if err != nil {
		return nil, ProviderError{Status: 502, Retryable: true, Code: "provider_unavailable"}
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 8<<10))
		response.Body.Close()
		return nil, ProviderError{
			Status:    response.StatusCode,
			Retryable: response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= 500,
			Code:      "provider_query_failed",
		}
	}
	return response.Body, nil
}

// post performs a provider POST and discards the response body. Used for
// idempotent create operations where only the status matters.
func (c *Client) post(
	ctx context.Context,
	endpoint, bearerToken string,
	payload []byte,
) error {
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		endpoint,
		bytes.NewReader(payload),
	)
	if err != nil {
		return ProviderError{Status: 400, Code: "invalid_provider_request"}
	}
	if err := validateExternalHTTPS(request.URL); err != nil {
		return ProviderError{Status: 400, Code: "invalid_provider_host"}
	}
	request.Header.Set("Authorization", "Bearer "+bearerToken)
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", "AppClimb/1.0")
	response, err := c.HTTP.Do(request)
	if err != nil {
		return ProviderError{Status: 502, Retryable: true, Code: "provider_unavailable"}
	}
	defer response.Body.Close()
	// 2xx and 409 (already exists) are both acceptable for idempotent creates.
	if response.StatusCode == http.StatusConflict {
		return nil
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 8<<10))
		return ProviderError{
			Status:    response.StatusCode,
			Retryable: response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= 500,
			Code:      "provider_query_failed",
		}
	}
	return nil
}

func require2(
	credentials map[string]any,
	first, second string,
) (string, string, error) {
	a, err := requiredString(credentials, first)
	if err != nil {
		return "", "", err
	}
	b, err := requiredString(credentials, second)
	if err != nil {
		return "", "", err
	}
	return a, b, nil
}

func require3(
	credentials map[string]any,
	first, second, third string,
) (string, string, string, error) {
	a, err := requiredString(credentials, first)
	if err != nil {
		return "", "", "", err
	}
	b, err := requiredString(credentials, second)
	if err != nil {
		return "", "", "", err
	}
	c, err := requiredString(credentials, third)
	if err != nil {
		return "", "", "", err
	}
	return a, b, c, nil
}

func requiredString(credentials map[string]any, key string) (string, error) {
	value, ok := credentials[key].(string)
	value = strings.TrimSpace(value)
	if !ok || value == "" || len(value) > 12000 {
		return "", ProviderError{Status: 400, Code: "invalid_credentials_payload"}
	}
	return value, nil
}

func validateExternalHTTPS(value *url.URL) error {
	if value == nil ||
		value.Scheme != "https" ||
		value.Hostname() == "" ||
		value.User != nil {
		return errors.New("external endpoint must use HTTPS")
	}
	host := strings.ToLower(value.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return errors.New("localhost is not allowed")
	}
	if ip := net.ParseIP(host); ip != nil && !publicIP(ip) {
		return errors.New("non-public address is not allowed")
	}
	return nil
}

func publicIP(ip net.IP) bool {
	return !(ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsUnspecified() ||
		ip.IsMulticast())
}

func AsProviderError(err error) (ProviderError, bool) {
	var providerErr ProviderError
	return providerErr, errors.As(err, &providerErr)
}

func RedactedError(err error) string {
	var providerErr ProviderError
	if errors.As(err, &providerErr) {
		return providerErr.Code
	}
	return fmt.Sprintf("connector_error_%T", err)
}

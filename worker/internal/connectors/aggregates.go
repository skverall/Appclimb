package connectors

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"appclimb.app/backend/internal/connectors/appleanalytics"
)

// Compile-time assertion that the appleNav adapter satisfies the navigation
// interface the appleanalytics package requires.
var _ appleanalytics.Navigator = appleNav{}

// appleNav adapts *Client to the appleanalytics.Navigator interface. The
// underlying methods are package-private, so a thin adapter lets the
// appleanalytics package depend on an interface without exporting the client's
// internals.
type appleNav struct{ c *Client }

func (n appleNav) GetJSON(ctx context.Context, endpoint, token string) ([]byte, error) {
	return n.c.getJSON(ctx, endpoint, token)
}

func (n appleNav) Get(ctx context.Context, endpoint, token string) (io.ReadCloser, error) {
	return n.c.get(ctx, endpoint, token)
}

func (n appleNav) Post(ctx context.Context, endpoint, token string, payload []byte) error {
	return n.c.post(ctx, endpoint, token, payload)
}

type Aggregate struct {
	MetricKey       string
	OccurredAt      time.Time
	Value           float64
	Unit            string
	Dimensions      map[string]string
	SourceUpdatedAt time.Time
	Completeness    float64
}

func (c *Client) ReadAggregates(
	ctx context.Context,
	provider string,
	credentials map[string]any,
	from, to time.Time,
) ([]Aggregate, error) {
	if _, err := c.Verify(ctx, provider, credentials); err != nil {
		return nil, err
	}
	switch provider {
	case "app-store-connect":
		return c.readApple(ctx, credentials, from, to)
	case "revenuecat":
		return c.readRevenueCat(ctx, credentials, from, to)
	case "posthog":
		return c.readPostHog(ctx, credentials, from, to)
	case "superwall":
		return c.readSuperwall(ctx, credentials, from, to)
	default:
		return nil, ProviderError{Status: 400, Code: "unsupported_provider"}
	}
}

func (c *Client) readRevenueCat(
	ctx context.Context,
	credentials map[string]any,
	from, to time.Time,
) ([]Aggregate, error) {
	apiKey, projectID, err := require2(credentials, "apiKey", "projectId")
	if err != nil {
		return nil, err
	}
	charts := []struct {
		Name string
		Key  string
		Unit string
	}{
		{Name: "revenue", Key: "revenue", Unit: "currency"},
		{Name: "trials_new", Key: "trials_new", Unit: "count"},
		{Name: "actives_new", Key: "paid_new", Unit: "count"},
		{Name: "trial_conversion_rate", Key: "trial_to_paid", Unit: "ratio"},
		{Name: "subscription_retention", Key: "renewal_rate", Unit: "ratio"},
		{Name: "churn", Key: "churn_rate", Unit: "ratio"},
	}
	result := []Aggregate{}
	for _, chart := range charts {
		query := url.Values{}
		query.Set("realtime", "false")
		query.Set("resolution", "0")
		query.Set("start_date", from.UTC().Format("2006-01-02"))
		query.Set("end_date", to.UTC().Add(-time.Nanosecond).Format("2006-01-02"))
		endpoint := "https://api.revenuecat.com/v2/projects/" +
			url.PathEscape(projectID) +
			"/charts/" +
			url.PathEscape(chart.Name) +
			"?" +
			query.Encode()
		body, err := c.getJSON(ctx, endpoint, apiKey)
		if err != nil {
			var providerErr ProviderError
			if AsProviderErrorValue(err, &providerErr) &&
				(providerErr.Status == http.StatusBadRequest ||
					providerErr.Status == http.StatusNotFound) {
				continue
			}
			return nil, err
		}
		var response struct {
			LastComputedAt json.Number    `json:"last_computed_at"`
			Values         [][]any        `json:"values"`
			Summary        map[string]any `json:"summary"`
		}
		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.UseNumber()
		if err := decoder.Decode(&response); err != nil {
			return nil, ProviderError{Status: 502, Retryable: true, Code: "invalid_provider_response"}
		}
		updatedAt := numberTime(response.LastComputedAt)
		for _, row := range response.Values {
			occurredAt, value, ok := chartRow(row)
			if !ok || occurredAt.Before(from) || !occurredAt.Before(to) {
				continue
			}
			if chart.Unit == "ratio" && value > 1 {
				value /= 100
			}
			result = append(result, Aggregate{
				MetricKey:       chart.Key,
				OccurredAt:      occurredAt,
				Value:           value,
				Unit:            chart.Unit,
				Dimensions:      map[string]string{"chart": chart.Name},
				SourceUpdatedAt: updatedAt,
				Completeness:    completeness(to, occurredAt, 0),
			})
		}
	}
	return result, nil
}

var eventNamePattern = regexp.MustCompile(`^[A-Za-z0-9_.$:/-]{1,100}$`)

func (c *Client) readPostHog(
	ctx context.Context,
	credentials map[string]any,
	from, to time.Time,
) ([]Aggregate, error) {
	apiKey, projectID, host, err := require3(
		credentials,
		"personalApiKey",
		"projectId",
		"host",
	)
	if err != nil {
		return nil, err
	}
	eventKeys := []struct {
		Credential string
		Default    string
		Metric     string
	}{
		{Credential: "activationEvent", Default: "app_activated", Metric: "activation_24h"},
		{Credential: "paywallEvent", Default: "paywall_viewed", Metric: "paywall_views"},
		{Credential: "sessionEvent", Default: "$session_start", Metric: "sessions"},
	}
	events := make([]string, 0, len(eventKeys))
	metricByEvent := map[string]string{}
	for _, item := range eventKeys {
		event := item.Default
		if configured, ok := credentials[item.Credential].(string); ok &&
			strings.TrimSpace(configured) != "" {
			event = strings.TrimSpace(configured)
		}
		if !eventNamePattern.MatchString(event) {
			return nil, ProviderError{Status: 400, Code: "invalid_posthog_event_name"}
		}
		events = append(events, event)
		metricByEvent[event] = item.Metric
	}
	quotedEvents := make([]string, 0, len(events))
	for _, event := range events {
		quotedEvents = append(quotedEvents, "'"+strings.ReplaceAll(event, "'", "''")+"'")
	}
	queryText := fmt.Sprintf(
		`select
		   toStartOfDay(timestamp) as day,
		   event,
		   count() as total
		 from events
		 where timestamp >= toDateTime('%s','UTC')
		   and timestamp < toDateTime('%s','UTC')
		   and event in (%s)
		 group by day,event
		 order by day,event`,
		from.UTC().Format("2006-01-02 15:04:05"),
		to.UTC().Format("2006-01-02 15:04:05"),
		strings.Join(quotedEvents, ","),
	)
	payload, _ := json.Marshal(map[string]any{
		"query": map[string]any{
			"kind":  "HogQLQuery",
			"query": queryText,
		},
	})
	parsedHost, _ := url.Parse(host)
	endpoint := parsedHost.Scheme + "://" + parsedHost.Host +
		"/api/projects/" + url.PathEscape(projectID) + "/query/"
	body, err := c.doJSON(ctx, http.MethodPost, endpoint, apiKey, payload)
	if err != nil {
		return nil, err
	}
	var response struct {
		Results [][]any `json:"results"`
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(&response); err != nil {
		return nil, ProviderError{Status: 502, Retryable: true, Code: "invalid_provider_response"}
	}
	result := []Aggregate{}
	for _, row := range response.Results {
		if len(row) < 3 {
			continue
		}
		occurredAt, ok := flexibleTime(row[0])
		event, eventOK := row[1].(string)
		value, valueOK := flexibleNumber(row[2])
		if !ok || !eventOK || !valueOK {
			continue
		}
		result = append(result, Aggregate{
			MetricKey:       metricByEvent[event],
			OccurredAt:      occurredAt,
			Value:           value,
			Unit:            "count",
			Dimensions:      map[string]string{"event": event},
			SourceUpdatedAt: c.Now().UTC(),
			Completeness:    completeness(to, occurredAt, 0),
		})
	}
	return result, nil
}

func (c *Client) readSuperwall(
	ctx context.Context,
	credentials map[string]any,
	from, to time.Time,
) ([]Aggregate, error) {
	apiKey, projectID, err := require2(credentials, "apiKey", "projectId")
	if err != nil {
		return nil, err
	}
	applicationID, _ := credentials["applicationId"].(string)
	applicationID = strings.TrimSpace(applicationID)
	if applicationID == "" {
		// The project credential is still valid, but chart statistics are scoped
		// to an application. The source stays connected and becomes measurable
		// as soon as applicationId is added to the encrypted credential payload.
		return []Aggregate{}, nil
	}
	query := url.Values{}
	query.Set("environment", "PRODUCTION")
	query.Set("from", from.UTC().Format(time.RFC3339))
	query.Set("to", to.UTC().Format(time.RFC3339))
	endpoint := "https://api.superwall.com/v2/projects/" +
		url.PathEscape(projectID) +
		"/applications/" +
		url.PathEscape(applicationID) +
		"/statistics?" +
		query.Encode()
	body, err := c.getJSON(ctx, endpoint, apiKey)
	if err != nil {
		return nil, err
	}
	var response struct {
		Statistics []struct {
			Key   string `json:"key"`
			Name  string `json:"name"`
			Value struct {
				Type  string  `json:"type"`
				Value float64 `json:"value"`
			} `json:"value"`
		} `json:"statistics"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, ProviderError{Status: 502, Retryable: true, Code: "invalid_provider_response"}
	}
	result := []Aggregate{}
	for _, statistic := range response.Statistics {
		key := strings.ToLower(statistic.Key + " " + statistic.Name)
		metricKey := ""
		unit := "count"
		switch {
		case strings.Contains(key, "paywall") && strings.Contains(key, "view"):
			metricKey = "paywall_views"
		case strings.Contains(key, "paywall") && strings.Contains(key, "conversion"):
			metricKey = "paywall_conversion"
			unit = "ratio"
		case strings.Contains(key, "trial"):
			metricKey = "superwall_trials"
		}
		if metricKey == "" {
			continue
		}
		value := statistic.Value.Value
		if unit == "ratio" && value > 1 {
			value /= 100
		}
		result = append(result, Aggregate{
			MetricKey:       metricKey,
			OccurredAt:      to.UTC().Add(-time.Nanosecond),
			Value:           value,
			Unit:            unit,
			Dimensions:      map[string]string{"statistic": statistic.Key},
			SourceUpdatedAt: c.Now().UTC(),
			Completeness:    1,
		})
	}
	return result, nil
}

func (c *Client) readApple(
	ctx context.Context,
	credentials map[string]any,
	from, to time.Time,
) ([]Aggregate, error) {
	issuerID, keyID, privateKey, err := require3(
		credentials,
		"issuerId",
		"keyId",
		"privateKey",
	)
	if err != nil {
		return nil, err
	}
	appID := strings.TrimSpace(credentials["appId"].(string))
	if appID == "" {
		return nil, ProviderError{Status: 400, Code: "apple_app_id_required"}
	}
	token, err := appleToken(issuerID, keyID, privateKey, c.Now().UTC())
	if err != nil {
		return nil, err
	}
	baseURL := c.AppleBaseURL
	if baseURL == "" {
		baseURL = "https://api.appstoreconnect.apple.com"
	}
	lagDays := c.AppleReportLagDays
	if lagDays < 0 {
		lagDays = 2
	}
	rows, err := appleanalytics.Fetch(
		ctx,
		appleNav{c},
		baseURL,
		token,
		appID,
		from,
		to,
		lagDays,
		c.Now().UTC(),
	)
	if err != nil {
		return nil, err
	}
	result := make([]Aggregate, len(rows))
	for i, row := range rows {
		result[i] = Aggregate{
			MetricKey:       row.MetricKey,
			OccurredAt:      row.OccurredAt,
			Value:           row.Value,
			Unit:            row.Unit,
			Dimensions:      row.Dimensions,
			SourceUpdatedAt: row.SourceUpdatedAt,
			Completeness:    row.Completeness,
		}
	}
	return result, nil
}

func (c *Client) doJSON(
	ctx context.Context,
	method, endpoint, bearerToken string,
	payload []byte,
) ([]byte, error) {
	request, err := http.NewRequestWithContext(
		ctx,
		method,
		endpoint,
		bytes.NewReader(payload),
	)
	if err != nil {
		return nil, ProviderError{Status: 400, Code: "invalid_provider_request"}
	}
	if err := validateExternalHTTPS(request.URL); err != nil {
		return nil, ProviderError{Status: 400, Code: "invalid_provider_host"}
	}
	request.Header.Set("Authorization", "Bearer "+bearerToken)
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
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
			Code:      "provider_query_failed",
		}
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxProviderResponse+1))
	if err != nil || len(body) > maxProviderResponse {
		return nil, ProviderError{Status: 502, Retryable: true, Code: "provider_response_too_large"}
	}
	return body, nil
}

func chartRow(row []any) (time.Time, float64, bool) {
	if len(row) < 2 {
		return time.Time{}, 0, false
	}
	occurredAt, ok := flexibleTime(row[0])
	if !ok {
		return time.Time{}, 0, false
	}
	for index := len(row) - 1; index > 0; index-- {
		if value, ok := flexibleNumber(row[index]); ok && !math.IsNaN(value) && !math.IsInf(value, 0) {
			return occurredAt, value, true
		}
	}
	return time.Time{}, 0, false
}

func flexibleTime(value any) (time.Time, bool) {
	if text, ok := value.(string); ok {
		formats := []string{
			time.RFC3339Nano,
			"2006-01-02",
			"2006-01-02 15:04:05",
			"2006-01-02T15:04:05",
		}
		for _, format := range formats {
			if parsed, err := time.Parse(format, text); err == nil {
				return parsed.UTC(), true
			}
		}
		if number, err := strconv.ParseFloat(text, 64); err == nil {
			return unixTime(number), true
		}
	}
	if number, ok := flexibleNumber(value); ok {
		return unixTime(number), true
	}
	return time.Time{}, false
}

func flexibleNumber(value any) (float64, bool) {
	switch typed := value.(type) {
	case json.Number:
		parsed, err := typed.Float64()
		return parsed, err == nil
	case float64:
		return typed, true
	case int:
		return float64(typed), true
	case string:
		parsed, err := strconv.ParseFloat(typed, 64)
		return parsed, err == nil
	default:
		return 0, false
	}
}

func unixTime(value float64) time.Time {
	if value > 1_000_000_000_000 {
		return time.UnixMilli(int64(value)).UTC()
	}
	return time.Unix(int64(value), 0).UTC()
}

func numberTime(value json.Number) time.Time {
	number, err := value.Float64()
	if err != nil || number == 0 {
		return time.Time{}
	}
	return unixTime(number)
}

func completeness(windowEnd, occurredAt time.Time, lagDays int) float64 {
	completeBefore := windowEnd.UTC().AddDate(0, 0, -lagDays)
	if occurredAt.Before(completeBefore) {
		return 1
	}
	return 0.7
}

func AsProviderErrorValue(err error, target *ProviderError) bool {
	if providerErr, ok := err.(ProviderError); ok {
		*target = providerErr
		return true
	}
	return false
}

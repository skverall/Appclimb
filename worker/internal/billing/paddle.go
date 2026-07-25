package billing

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sort"
	"strconv"
	"strings"
	"time"
)

var (
	ErrMalformedSubscription = errors.New("malformed Paddle subscription")
	ErrProductNotAllowed     = errors.New("Paddle product is not allowed")
	ErrCheckoutBindingToken  = errors.New("checkout binding token is invalid")
)

const checkoutBindingPrefix = "acb_"

type ProductPolicy struct {
	ProductID       string
	ProductIdentity string
	AllowedPriceIDs map[string]bool
}

type SubscriptionUpdate struct {
	SubscriptionID    string
	CustomerID        string
	TransactionID     string
	CustomWorkspaceID string
	CheckoutBinding   string
	Status            string
	ProductID         string
	PriceID           string
	EntitlementEndsAt *time.Time
}

// ParseSubscriptionUpdate validates the signed Paddle payload against the
// server-owned product and price allowlist. custom_data is retained only as a
// consistency assertion for the database binding; it never authorizes a
// workspace by itself.
func ParseSubscriptionUpdate(
	data json.RawMessage,
	policy ProductPolicy,
) (SubscriptionUpdate, error) {
	var payload struct {
		ID            string `json:"id"`
		CustomerID    string `json:"customer_id"`
		TransactionID string `json:"transaction_id"`
		Status        string `json:"status"`
		CustomData    struct {
			Product         string `json:"product"`
			WorkspaceID     string `json:"workspace_id"`
			CheckoutBinding string `json:"checkout_binding"`
		} `json:"custom_data"`
		Items []struct {
			Price struct {
				ID        string `json:"id"`
				ProductID string `json:"product_id"`
			} `json:"price"`
		} `json:"items"`
		CurrentBillingPeriod struct {
			EndsAt string `json:"ends_at"`
		} `json:"current_billing_period"`
	}
	if err := json.Unmarshal(data, &payload); err != nil ||
		payload.ID == "" ||
		payload.Status == "" ||
		payload.CustomerID == "" ||
		len(payload.Items) == 0 {
		return SubscriptionUpdate{}, ErrMalformedSubscription
	}
	switch payload.Status {
	case "active", "trialing", "past_due", "paused", "canceled", "expired":
	default:
		return SubscriptionUpdate{}, ErrMalformedSubscription
	}
	if policy.ProductID == "" ||
		policy.ProductIdentity == "" ||
		(payload.CustomData.Product != "" &&
			payload.CustomData.Product != policy.ProductIdentity) {
		return SubscriptionUpdate{}, ErrProductNotAllowed
	}
	prices := map[string]bool{}
	for _, item := range payload.Items {
		if item.Price.ProductID != policy.ProductID ||
			!policy.AllowedPriceIDs[item.Price.ID] {
			return SubscriptionUpdate{}, ErrProductNotAllowed
		}
		prices[item.Price.ID] = true
	}
	if len(prices) != 1 {
		return SubscriptionUpdate{}, ErrProductNotAllowed
	}
	priceIDs := make([]string, 0, len(prices))
	for priceID := range prices {
		priceIDs = append(priceIDs, priceID)
	}
	sort.Strings(priceIDs)

	var entitlementEndsAt *time.Time
	if payload.CurrentBillingPeriod.EndsAt != "" {
		parsed, err := time.Parse(
			time.RFC3339Nano,
			payload.CurrentBillingPeriod.EndsAt,
		)
		if err != nil {
			return SubscriptionUpdate{}, ErrMalformedSubscription
		}
		parsed = parsed.UTC()
		entitlementEndsAt = &parsed
	}
	return SubscriptionUpdate{
		SubscriptionID:    payload.ID,
		CustomerID:        payload.CustomerID,
		TransactionID:     payload.TransactionID,
		CustomWorkspaceID: payload.CustomData.WorkspaceID,
		CheckoutBinding:   payload.CustomData.CheckoutBinding,
		Status:            payload.Status,
		ProductID:         policy.ProductID,
		PriceID:           priceIDs[0],
		EntitlementEndsAt: entitlementEndsAt,
	}, nil
}

// NewCheckoutBindingToken returns an opaque, high-entropy token for one
// authenticated checkout attempt. Only HashCheckoutBindingToken(raw) is stored.
func NewCheckoutBindingToken() (string, []byte, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", nil, err
	}
	raw := checkoutBindingPrefix + base64.RawURLEncoding.EncodeToString(value)
	hash := sha256.Sum256([]byte(raw))
	return raw, hash[:], nil
}

// HashCheckoutBindingToken validates the public token format before hashing it.
// The raw value must never be persisted or logged.
func HashCheckoutBindingToken(raw string) ([]byte, error) {
	if !strings.HasPrefix(raw, checkoutBindingPrefix) {
		return nil, ErrCheckoutBindingToken
	}
	decoded, err := base64.RawURLEncoding.DecodeString(
		strings.TrimPrefix(raw, checkoutBindingPrefix),
	)
	if err != nil || len(decoded) != 32 {
		return nil, ErrCheckoutBindingToken
	}
	hash := sha256.Sum256([]byte(raw))
	return hash[:], nil
}

func VerifyPaddleSignature(
	rawBody []byte,
	header, secret string,
	now time.Time,
	tolerance time.Duration,
) error {
	var timestampText, signatureText string
	for _, part := range strings.Split(header, ";") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		switch key {
		case "ts":
			timestampText = value
		case "h1":
			signatureText = value
		}
	}
	if timestampText == "" || signatureText == "" || secret == "" {
		return errors.New("signature header is incomplete")
	}
	timestamp, err := strconv.ParseInt(timestampText, 10, 64)
	if err != nil {
		return errors.New("signature timestamp is invalid")
	}
	signedAt := time.Unix(timestamp, 0)
	if now.Sub(signedAt) > tolerance || signedAt.Sub(now) > tolerance {
		return errors.New("signature timestamp is outside tolerance")
	}
	provided, err := hex.DecodeString(signatureText)
	if err != nil {
		return errors.New("signature is invalid")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(timestampText))
	_, _ = mac.Write([]byte(":"))
	_, _ = mac.Write(rawBody)
	if !hmac.Equal(mac.Sum(nil), provided) {
		return errors.New("signature does not match")
	}
	return nil
}

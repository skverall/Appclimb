package billing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strconv"
	"testing"
	"time"
)

func TestParseSubscriptionUpdateEnforcesProductAndPrice(t *testing.T) {
	policy := ProductPolicy{
		ProductID:       "pro_appclimb",
		ProductIdentity: "appclimb-pro",
		AllowedPriceIDs: map[string]bool{
			"pri_monthly": true,
			"pri_yearly":  true,
		},
	}
	data := json.RawMessage(`{
		"id":"sub_1",
		"customer_id":"ctm_1",
		"transaction_id":"txn_1",
		"status":"active",
		"custom_data":{
			"product":"appclimb-pro",
			"workspace_id":"workspace-from-client",
			"checkout_binding":"acb_test"
		},
		"items":[{"price":{"id":"pri_monthly","product_id":"pro_appclimb"}}],
		"current_billing_period":{"ends_at":"2026-08-25T12:00:00Z"}
	}`)
	update, err := ParseSubscriptionUpdate(data, policy)
	if err != nil {
		t.Fatalf("ParseSubscriptionUpdate: %v", err)
	}
	if update.SubscriptionID != "sub_1" ||
		update.CustomerID != "ctm_1" ||
		update.PriceID != "pri_monthly" ||
		update.CustomWorkspaceID != "workspace-from-client" ||
		update.CheckoutBinding != "acb_test" ||
		update.EntitlementEndsAt == nil {
		t.Fatalf("unexpected update: %+v", update)
	}

	var wrongPrice map[string]any
	if err := json.Unmarshal(data, &wrongPrice); err != nil {
		t.Fatal(err)
	}
	items := wrongPrice["items"].([]any)
	price := items[0].(map[string]any)["price"].(map[string]any)
	price["id"] = "pri_other"
	encoded, _ := json.Marshal(wrongPrice)
	if _, err := ParseSubscriptionUpdate(encoded, policy); !errors.Is(err, ErrProductNotAllowed) {
		t.Fatalf("wrong price must fail closed, got %v", err)
	}

	price["id"] = "pri_monthly"
	price["product_id"] = "pro_other"
	encoded, _ = json.Marshal(wrongPrice)
	if _, err := ParseSubscriptionUpdate(encoded, policy); !errors.Is(err, ErrProductNotAllowed) {
		t.Fatalf("wrong product must fail closed, got %v", err)
	}
}

func TestCheckoutBindingTokenIsOpaqueAndHashOnly(t *testing.T) {
	raw, storedHash, err := NewCheckoutBindingToken()
	if err != nil {
		t.Fatal(err)
	}
	if raw == "" || len(storedHash) != sha256.Size {
		t.Fatalf("unexpected token shape: raw=%q hash=%d", raw, len(storedHash))
	}
	rehash, err := HashCheckoutBindingToken(raw)
	if err != nil {
		t.Fatal(err)
	}
	if !hmac.Equal(storedHash, rehash) {
		t.Fatal("generated and parsed hashes differ")
	}
	for _, invalid := range []string{"", "workspace-1", "acb_short", raw + "!"} {
		if _, err := HashCheckoutBindingToken(invalid); !errors.Is(err, ErrCheckoutBindingToken) {
			t.Fatalf("%q: want ErrCheckoutBindingToken, got %v", invalid, err)
		}
	}
}

func TestVerifyPaddleSignature(t *testing.T) {
	now := time.Date(2026, 7, 23, 12, 0, 0, 0, time.UTC)
	body := []byte(`{"event_id":"evt_1"}`)
	secret := "pdl_ntfset_secret"
	timestamp := strconv.FormatInt(now.Unix(), 10)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(timestamp + ":"))
	_, _ = mac.Write(body)
	header := "ts=" + timestamp + ";h1=" + hex.EncodeToString(mac.Sum(nil))

	if err := VerifyPaddleSignature(body, header, secret, now, 5*time.Minute); err != nil {
		t.Fatal(err)
	}
	if err := VerifyPaddleSignature(
		[]byte(`{"event_id":"tampered"}`),
		header,
		secret,
		now,
		5*time.Minute,
	); err == nil {
		t.Fatal("tampered body must be rejected")
	}
	if err := VerifyPaddleSignature(
		body,
		header,
		secret,
		now.Add(10*time.Minute),
		5*time.Minute,
	); err == nil {
		t.Fatal("stale signature must be rejected")
	}
}

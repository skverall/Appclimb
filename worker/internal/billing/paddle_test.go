package billing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"testing"
	"time"
)

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

package secure

import (
	"crypto/rand"
	"encoding/base64"
	"testing"
)

func TestEnvelopeRoundTripAndTamperDetection(t *testing.T) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatal(err)
	}
	encodedKey := base64.StdEncoding.EncodeToString(key)
	payload := map[string]any{
		"apiKey":    "secret-value",
		"projectId": "project-1",
	}
	envelope, err := Seal(payload, encodedKey)
	if err != nil {
		t.Fatal(err)
	}
	opened, err := Open(envelope, encodedKey)
	if err != nil {
		t.Fatal(err)
	}
	if opened["apiKey"] != payload["apiKey"] {
		t.Fatalf("unexpected decrypted payload: %#v", opened)
	}
	envelope.Ciphertext = envelope.Ciphertext[:len(envelope.Ciphertext)-2] + "AA"
	if _, err := Open(envelope, encodedKey); err == nil {
		t.Fatal("tampered ciphertext must be rejected")
	}
}

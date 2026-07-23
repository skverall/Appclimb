package billing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"time"
)

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

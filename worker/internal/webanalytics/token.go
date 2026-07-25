package webanalytics

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
)

const tokenPrefix = "acwa1_"

var ErrInvalidToken = errors.New("invalid web analytics token")

type TokenClaims struct {
	WorkspaceID string `json:"w"`
	PropertyID  string `json:"p"`
	Version     int    `json:"v"`
}

type TokenIssuer struct {
	Key []byte
}

func (issuer TokenIssuer) Issue(claims TokenClaims) (string, error) {
	if len(issuer.Key) < 32 ||
		claims.WorkspaceID == "" ||
		claims.PropertyID == "" ||
		claims.Version < 1 {
		return "", ErrInvalidToken
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	signature := issuer.signature(encoded)
	return tokenPrefix + encoded + "." +
		base64.RawURLEncoding.EncodeToString(signature), nil
}

func (issuer TokenIssuer) Parse(raw string) (TokenClaims, error) {
	if len(issuer.Key) < 32 || !strings.HasPrefix(raw, tokenPrefix) {
		return TokenClaims{}, ErrInvalidToken
	}
	parts := strings.Split(strings.TrimPrefix(raw, tokenPrefix), ".")
	if len(parts) != 2 {
		return TokenClaims{}, ErrInvalidToken
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil ||
		base64.RawURLEncoding.EncodeToString(signature) != parts[1] ||
		!hmac.Equal(signature, issuer.signature(parts[0])) {
		return TokenClaims{}, ErrInvalidToken
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil ||
		base64.RawURLEncoding.EncodeToString(payload) != parts[0] {
		return TokenClaims{}, ErrInvalidToken
	}
	var claims TokenClaims
	if err := json.Unmarshal(payload, &claims); err != nil ||
		claims.WorkspaceID == "" ||
		claims.PropertyID == "" ||
		claims.Version < 1 {
		return TokenClaims{}, ErrInvalidToken
	}
	return claims, nil
}

func (issuer TokenIssuer) signature(value string) []byte {
	mac := hmac.New(sha256.New, issuer.Key)
	_, _ = mac.Write([]byte("appclimb-web-analytics\x00" + value))
	return mac.Sum(nil)
}

package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Claims struct {
	WorkspaceID string `json:"wid"`
	Role        string `json:"role"`
	jwt.RegisteredClaims
}

type TokenIssuer struct {
	Key       []byte
	AccessTTL time.Duration
	Issuer    string
}

func (i TokenIssuer) AccessToken(userID, workspaceID, role string, now time.Time) (string, error) {
	claims := Claims{
		WorkspaceID: workspaceID,
		Role:        role,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    i.Issuer,
			Subject:   userID,
			Audience:  jwt.ClaimStrings{"appclimb-web"},
			ExpiresAt: jwt.NewNumericDate(now.Add(i.AccessTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now.Add(-5 * time.Second)),
			ID:        uuid.NewString(),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(i.Key)
}

func (i TokenIssuer) ParseAccessToken(raw string) (Claims, error) {
	var claims Claims
	token, err := jwt.ParseWithClaims(
		raw,
		&claims,
		func(token *jwt.Token) (any, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, errors.New("unexpected signing method")
			}
			return i.Key, nil
		},
		jwt.WithAudience("appclimb-web"),
		jwt.WithIssuer(i.Issuer),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithLeeway(15*time.Second),
	)
	if err != nil || !token.Valid || claims.Subject == "" || claims.WorkspaceID == "" {
		return Claims{}, errors.New("invalid access token")
	}
	return claims, nil
}

func NewRefreshToken() (raw string, hash []byte, err error) {
	value := make([]byte, 48)
	if _, err := rand.Read(value); err != nil {
		return "", nil, err
	}
	raw = base64.RawURLEncoding.EncodeToString(value)
	sum := sha256.Sum256([]byte(raw))
	return raw, sum[:], nil
}

func HashRefreshToken(raw string) []byte {
	sum := sha256.Sum256([]byte(raw))
	return sum[:]
}

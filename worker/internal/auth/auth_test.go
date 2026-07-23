package auth

import (
	"bytes"
	"testing"
	"time"
)

func TestPasswordHashAndVerification(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	if !CheckPassword(hash, "correct horse battery staple") {
		t.Fatal("expected password to verify")
	}
	if CheckPassword(hash, "wrong password") {
		t.Fatal("wrong password must not verify")
	}
}

func TestAccessTokenClaimsAndAudience(t *testing.T) {
	issuer := TokenIssuer{
		Key:       bytes.Repeat([]byte{0x42}, 32),
		AccessTTL: 15 * time.Minute,
		Issuer:    "appclimb-api",
	}
	now := time.Now().UTC()
	raw, err := issuer.AccessToken("user-1", "workspace-1", "owner", now)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := issuer.ParseAccessToken(raw)
	if err != nil {
		t.Fatal(err)
	}
	if claims.Subject != "user-1" ||
		claims.WorkspaceID != "workspace-1" ||
		claims.Role != "owner" {
		t.Fatalf("unexpected claims: %#v", claims)
	}
}

func TestRefreshTokensAreRandomAndHashable(t *testing.T) {
	first, firstHash, err := NewRefreshToken()
	if err != nil {
		t.Fatal(err)
	}
	second, secondHash, err := NewRefreshToken()
	if err != nil {
		t.Fatal(err)
	}
	if first == second || bytes.Equal(firstHash, secondHash) {
		t.Fatal("refresh tokens must be unique")
	}
	if !bytes.Equal(firstHash, HashRefreshToken(first)) {
		t.Fatal("refresh token hash is not stable")
	}
}

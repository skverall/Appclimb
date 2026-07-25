package database

import (
	"strings"
	"testing"
)

func TestPasswordRecoveryMigrationKeepsRawTokensOutOfStorage(t *testing.T) {
	body, err := migrationFS.ReadFile("migrations/007_password_recovery.sql")
	if err != nil {
		t.Fatal(err)
	}
	sql := string(body)
	for _, required := range []string{
		"token_hash bytea not null unique",
		"expires_at timestamptz not null",
		"used_at timestamptz",
		"where used_at is null",
	} {
		if !strings.Contains(sql, required) {
			t.Fatalf("password recovery migration missing %q", required)
		}
	}
	if strings.Contains(sql, "raw_token") {
		t.Fatal("raw password reset tokens must never be stored")
	}
}

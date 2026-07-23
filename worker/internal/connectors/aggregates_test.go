package connectors

import (
	"encoding/json"
	"net"
	"net/url"
	"testing"
	"time"
)

func TestChartRowSupportsMillisecondTimestamps(t *testing.T) {
	row := []any{json.Number("1784808000000"), json.Number("42.5")}
	occurredAt, value, ok := chartRow(row)
	if !ok {
		t.Fatal("chart row was not parsed")
	}
	if occurredAt.Year() != 2026 || value != 42.5 {
		t.Fatalf("unexpected chart row: %s %f", occurredAt, value)
	}
}

func TestExternalProviderURLRejectsPrivateHosts(t *testing.T) {
	for _, raw := range []string{
		"http://example.com",
		"https://localhost/api",
		"https://127.0.0.1/api",
		"https://10.0.0.4/api",
	} {
		parsed, err := url.Parse(raw)
		if err != nil {
			t.Fatal(err)
		}
		if err := validateExternalHTTPS(parsed); err == nil {
			t.Fatalf("expected %s to be rejected", raw)
		}
	}
	parsed, _ := url.Parse("https://us.posthog.com")
	if err := validateExternalHTTPS(parsed); err != nil {
		t.Fatalf("public HTTPS URL should be accepted: %v", err)
	}
}

func TestCompletenessUsesProviderLag(t *testing.T) {
	to := time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC)
	if got := completeness(to, to.AddDate(0, 0, -3), 2); got != 1 {
		t.Fatalf("expected complete point, got %f", got)
	}
	if got := completeness(to, to.AddDate(0, 0, -1), 2); got >= 1 {
		t.Fatalf("expected provisional point, got %f", got)
	}
}

func TestPublicIP(t *testing.T) {
	if publicIP(net.ParseIP("192.168.1.2")) {
		t.Fatal("private IP must be rejected")
	}
	if !publicIP(net.ParseIP("8.8.8.8")) {
		t.Fatal("public IP should be accepted")
	}
}

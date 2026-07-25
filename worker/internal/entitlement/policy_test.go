package entitlement

import (
	"testing"
	"time"
)

func TestStateAllowed(t *testing.T) {
	now := time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
	future := now.Add(time.Hour)
	past := now.Add(-time.Hour)
	tests := []struct {
		name    string
		state   State
		allowed bool
	}{
		{
			name:    "trial before expiry",
			state:   State{Status: "trialing", TrialEndsAt: future},
			allowed: true,
		},
		{
			name:    "trial at expiry",
			state:   State{Status: "trialing", TrialEndsAt: now},
			allowed: false,
		},
		{
			name: "Paddle trial after local trial",
			state: State{
				Status:            "trialing",
				TrialEndsAt:       past,
				EntitlementEndsAt: &future,
			},
			allowed: true,
		},
		{
			name: "active paid period",
			state: State{
				Status:            "active",
				EntitlementEndsAt: &future,
			},
			allowed: true,
		},
		{
			name: "active but expired period",
			state: State{
				Status:            "active",
				EntitlementEndsAt: &past,
			},
			allowed: false,
		},
		{
			name:    "active without entitlement boundary",
			state:   State{Status: "active"},
			allowed: false,
		},
		{
			name:    "past due",
			state:   State{Status: "past_due", EntitlementEndsAt: &future},
			allowed: false,
		},
		{
			name:    "canceled",
			state:   State{Status: "canceled", EntitlementEndsAt: &future},
			allowed: false,
		},
		{
			name:    "expired",
			state:   State{Status: "expired", EntitlementEndsAt: &future},
			allowed: false,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := test.state.Allowed(now); got != test.allowed {
				t.Fatalf("Allowed: want %v, got %v", test.allowed, got)
			}
		})
	}
}

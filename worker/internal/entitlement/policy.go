package entitlement

import (
	"strings"
	"time"
)

const (
	StatusActive   = "active"
	StatusTrialing = "trialing"
)

// State is the minimum workspace billing state needed to decide whether paid
// data capabilities may run. Authentication and account-management endpoints
// deliberately do not depend on this decision.
type State struct {
	Status            string
	TrialEndsAt       time.Time
	EntitlementEndsAt *time.Time
}

// Allowed is fail-closed. A local trial is valid only before its explicit end;
// a paid subscription must be active and have a future entitlement boundary.
// Canceled, past_due, paused, expired and unknown statuses are denied.
func (state State) Allowed(now time.Time) bool {
	switch strings.ToLower(strings.TrimSpace(state.Status)) {
	case StatusTrialing:
		return (!state.TrialEndsAt.IsZero() &&
			state.TrialEndsAt.After(now.UTC())) ||
			(state.EntitlementEndsAt != nil &&
				state.EntitlementEndsAt.After(now.UTC()))
	case StatusActive:
		return state.EntitlementEndsAt != nil &&
			state.EntitlementEndsAt.After(now.UTC())
	default:
		return false
	}
}

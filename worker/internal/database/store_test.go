package database

import (
	"testing"
	"time"
)

func TestEvaluatePaddleBindingDoesNotTrustCustomWorkspace(t *testing.T) {
	now := time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
	update := BillingSubscriptionUpdate{
		SubscriptionID:    "sub_1",
		CustomerID:        "ctm_1",
		TransactionID:     "txn_1",
		CustomWorkspaceID: "workspace-from-client",
		ProductID:         "pro_appclimb",
	}
	if _, reason, apply := evaluatePaddleBinding(nil, update, now); apply || reason != "unbound" {
		t.Fatalf("custom workspace without server binding must be unbound, got apply=%v reason=%s", apply, reason)
	}

	bound := paddleBinding{
		workspaceID:    "workspace-server-bound",
		subscriptionID: "sub_1",
		customerID:     "ctm_1",
		productID:      "pro_appclimb",
	}
	if _, reason, apply := evaluatePaddleBinding([]paddleBinding{bound}, update, now); apply || reason != "binding_mismatch" {
		t.Fatalf("custom workspace mismatch must fail closed, got apply=%v reason=%s", apply, reason)
	}

	update.CustomWorkspaceID = bound.workspaceID
	if _, reason, apply := evaluatePaddleBinding([]paddleBinding{bound}, update, now); !apply || reason != "apply" {
		t.Fatalf("matching server binding should apply, got apply=%v reason=%s", apply, reason)
	}

	bound.transactionID = "txn_server"
	if _, reason, apply := evaluatePaddleBinding([]paddleBinding{bound}, update, now); !apply || reason != "apply" {
		t.Fatalf("a later transaction on the same bound subscription must remain valid, got apply=%v reason=%s", apply, reason)
	}
}

func TestEvaluateCheckoutBindingIsOneTimeWorkspaceAndPriceBound(t *testing.T) {
	issuedAt := time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
	binding := PaddleCheckoutBinding{
		ID:             "binding-1",
		WorkspaceID:    "workspace-1",
		PriceID:        "pri_yearly",
		ExpectedStatus: "trialing",
		Status:         "trialing",
		ExpiresAt:      issuedAt.Add(30 * time.Minute),
	}
	update := BillingSubscriptionUpdate{
		SubscriptionID:    "sub_1",
		CustomerID:        "ctm_1",
		TransactionID:     "txn_1",
		CustomWorkspaceID: "workspace-1",
		ProductID:         "pro_appclimb",
		PriceID:           "pri_yearly",
	}

	bound, reason, apply := evaluateCheckoutBinding(
		binding,
		update,
		"evt_1",
		issuedAt.Add(time.Minute),
	)
	if !apply || reason != "apply" || bound.workspaceID != "workspace-1" {
		t.Fatalf("matching checkout binding should apply: bound=%+v reason=%s apply=%v", bound, reason, apply)
	}

	wrongWorkspace := update
	wrongWorkspace.CustomWorkspaceID = "workspace-2"
	if _, reason, apply := evaluateCheckoutBinding(
		binding,
		wrongWorkspace,
		"evt_2",
		issuedAt.Add(time.Minute),
	); apply || reason != "checkout_binding_mismatch" {
		t.Fatalf("workspace mismatch must fail closed, got apply=%v reason=%s", apply, reason)
	}

	wrongPrice := update
	wrongPrice.PriceID = "pri_monthly"
	if _, reason, apply := evaluateCheckoutBinding(
		binding,
		wrongPrice,
		"evt_3",
		issuedAt.Add(time.Minute),
	); apply || reason != "checkout_binding_mismatch" {
		t.Fatalf("price mismatch must fail closed, got apply=%v reason=%s", apply, reason)
	}

	if _, reason, apply := evaluateCheckoutBinding(
		binding,
		update,
		"evt_4",
		binding.ExpiresAt.Add(time.Hour),
	); !apply || reason != "apply" {
		t.Fatalf("a signed late completion must still provision access, got apply=%v reason=%s", apply, reason)
	}

	consumedAt := issuedAt.Add(2 * time.Minute)
	binding.ConsumedAt = &consumedAt
	if _, reason, apply := evaluateCheckoutBinding(
		binding,
		update,
		"evt_5",
		issuedAt.Add(3*time.Minute),
	); apply || reason != "checkout_binding_consumed" {
		t.Fatalf("consumed binding must fail closed, got apply=%v reason=%s", apply, reason)
	}
}

func TestEvaluateCheckoutBindingUsesExpectedWorkspaceStateAsCAS(t *testing.T) {
	issuedAt := time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
	binding := PaddleCheckoutBinding{
		ID:                     "binding-1",
		WorkspaceID:            "workspace-1",
		PriceID:                "pri_yearly",
		ExpectedSubscriptionID: "sub_old",
		ExpectedCustomerID:     "ctm_old",
		ExpectedTransactionID:  "txn_old",
		ExpectedStatus:         "canceled",
		SubscriptionID:         "sub_old",
		CustomerID:             "ctm_old",
		TransactionID:          "txn_old",
		Status:                 "canceled",
		ExpiresAt:              issuedAt.Add(30 * time.Minute),
	}
	update := BillingSubscriptionUpdate{
		SubscriptionID:    "sub_new",
		CustomerID:        "ctm_new",
		TransactionID:     "txn_new",
		CustomWorkspaceID: "workspace-1",
		ProductID:         "pro_appclimb",
		PriceID:           "pri_yearly",
	}
	if bound, reason, apply := evaluateCheckoutBinding(
		binding,
		update,
		"evt_rebind",
		issuedAt.Add(time.Minute),
	); !apply || reason != "apply" || bound.workspaceID != "workspace-1" {
		t.Fatalf("terminal CAS rebind should apply, got bound=%+v apply=%v reason=%s", bound, apply, reason)
	}

	binding.SubscriptionID = "sub_changed_elsewhere"
	if _, reason, apply := evaluateCheckoutBinding(
		binding,
		update,
		"evt_race",
		issuedAt.Add(2*time.Minute),
	); apply || reason != "checkout_binding_state_changed" {
		t.Fatalf("changed workspace binding must fail CAS, got apply=%v reason=%s", apply, reason)
	}
}

func TestEvaluatePaddleBindingRejectsOutOfOrderEvent(t *testing.T) {
	last := time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
	bound := paddleBinding{
		workspaceID:    "workspace-1",
		subscriptionID: "sub_1",
		customerID:     "ctm_1",
		productID:      "pro_appclimb",
		lastOccurredAt: &last,
	}
	update := BillingSubscriptionUpdate{
		SubscriptionID:    "sub_1",
		CustomerID:        "ctm_1",
		CustomWorkspaceID: "workspace-1",
		ProductID:         "pro_appclimb",
	}
	for _, occurredAt := range []time.Time{last.Add(-time.Second), last} {
		if _, reason, apply := evaluatePaddleBinding(
			[]paddleBinding{bound},
			update,
			occurredAt,
		); apply || reason != "stale_event" {
			t.Fatalf("occurredAt=%s: want stale_event, got apply=%v reason=%s", occurredAt, apply, reason)
		}
	}
}

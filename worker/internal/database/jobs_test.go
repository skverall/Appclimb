package database

import (
	"strings"
	"testing"
)

func TestQueueIntegrityMigrationEnforcesOneOutstandingSync(t *testing.T) {
	migration, err := migrationFS.ReadFile(
		"migrations/004_entitlements_billing_queue.sql",
	)
	if err != nil {
		t.Fatal(err)
	}
	sql := string(migration)
	for _, required := range []string{
		"deduplicated_by_004",
		"create unique index sync_jobs_one_outstanding_per_connection_idx",
		"create unique index diagnosis_runs_one_outstanding_per_app_idx",
		"create index sync_jobs_running_lease_idx",
		"create index diagnosis_runs_running_lease_idx",
		"where status in ('queued', 'running', 'retrying')",
		"create table paddle_checkout_bindings",
		"token_hash bytea not null unique",
		"consumed_by_event_id",
		"expected_subscription_id",
		"processing_status",
		"reconciliation_required",
		"paddle_checkout_bindings_one_pending_idx",
		"'range_count'",
		"'range_ratio'",
	} {
		if !strings.Contains(sql, required) {
			t.Fatalf("queue migration is missing %q", required)
		}
	}
}

func TestSyncConnectionOutcomeDoesNotClaimZeroRowsAreConnected(t *testing.T) {
	status, code := syncConnectionOutcome(0)
	if status != "needs-attention" ||
		code == nil ||
		*code != "no_data_in_window" {
		t.Fatalf("zero-row import must stay visible, got status=%s code=%v", status, code)
	}
	status, code = syncConnectionOutcome(1)
	if status != "connected" || code != nil {
		t.Fatalf("non-empty import should connect cleanly, got status=%s code=%v", status, code)
	}
}

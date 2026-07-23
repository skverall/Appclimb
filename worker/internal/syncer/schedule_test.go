package syncer

import (
	"testing"
	"time"
)

func TestUTCWindowIsBoundedToNinetyDays(t *testing.T) {
	now := time.Date(2026, 7, 23, 18, 42, 0, 0, time.FixedZone("UZT", 5*3600))
	from, to := UTCWindow(now, 200)

	if to.Location() != time.UTC || from.Location() != time.UTC {
		t.Fatal("window must be UTC")
	}
	if to.Sub(from) != 90*24*time.Hour {
		t.Fatalf("expected 90 days, got %s", to.Sub(from))
	}
}

func TestNextSyncUsesSixHourDefault(t *testing.T) {
	last := time.Date(2026, 7, 23, 0, 0, 0, 0, time.UTC)
	now := last.Add(time.Hour)
	if got := NextSync(last, now, 0); !got.Equal(last.Add(6 * time.Hour)) {
		t.Fatalf("unexpected next sync: %s", got)
	}
}

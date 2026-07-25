package diagnoser

import (
	"testing"
	"time"
)

func TestAssessDataState_EmptyMetricsIsModeEmpty(t *testing.T) {
	state := AssessDataState(nil, time.Now())
	if state.Mode != ModeEmpty {
		t.Fatalf("empty metrics: want mode %q, got %q", ModeEmpty, state.Mode)
	}
	if state.Stale || state.LowVolume {
		t.Fatalf("empty metrics must not set stale/lowVolume")
	}
	if state.Reason == "" {
		t.Fatal("empty metrics must carry a human-readable reason")
	}
}

func TestAssessDataState_RecentSufficientDataIsModeLive(t *testing.T) {
	now := time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC)
	metrics := []Metric{
		{
			Provider:   "app-store-connect",
			Key:        FunnelTopMetricKey,
			OccurredAt: now.Add(-2 * time.Hour), // recent
			Value:      50000,                   // well above threshold
		},
	}
	state := AssessDataState(metrics, now)
	if state.Mode != ModeLive {
		t.Fatalf("recent sufficient data: want mode %q, got %q (reason: %s)", ModeLive, state.Mode, state.Reason)
	}
	if state.Stale || state.LowVolume {
		t.Fatalf("live data must not set stale/lowVolume")
	}
}

func TestAssessDataState_OldDataIsStalePartial(t *testing.T) {
	now := time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC)
	metrics := []Metric{
		{
			Provider:   "app-store-connect",
			Key:        FunnelTopMetricKey,
			OccurredAt: now.Add(-72 * time.Hour), // 3 days old > 48h threshold
			Value:      50000,
		},
	}
	state := AssessDataState(metrics, now)
	if state.Mode != ModePartial {
		t.Fatalf("stale data: want mode %q, got %q", ModePartial, state.Mode)
	}
	if !state.Stale {
		t.Fatal("stale data must set Stale=true")
	}
	if state.LowVolume {
		t.Fatal("high-volume stale data must not set LowVolume")
	}
	if state.Reason == "" {
		t.Fatal("stale data must carry a reason")
	}
}

func TestAssessDataState_LowVolumeIsPartial(t *testing.T) {
	now := time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC)
	metrics := []Metric{
		{
			Provider:   "app-store-connect",
			Key:        FunnelTopMetricKey,
			OccurredAt: now.Add(-2 * time.Hour), // recent
			Value:      30,                      // below LowVolumeThreshold (50)
		},
	}
	state := AssessDataState(metrics, now)
	if state.Mode != ModePartial {
		t.Fatalf("low volume: want mode %q, got %q", ModePartial, state.Mode)
	}
	if !state.LowVolume {
		t.Fatal("low volume must set LowVolume=true")
	}
	if state.Stale {
		t.Fatal("recent low-volume data must not set Stale")
	}
}

func TestAssessDataState_StaleAndLowVolumeReasonMentionsBoth(t *testing.T) {
	now := time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC)
	metrics := []Metric{
		{
			Provider:   "app-store-connect",
			Key:        FunnelTopMetricKey,
			OccurredAt: now.Add(-72 * time.Hour),
			Value:      10,
		},
	}
	state := AssessDataState(metrics, now)
	if !state.Stale || !state.LowVolume {
		t.Fatalf("want stale AND lowVolume, got stale=%v lowVolume=%v", state.Stale, state.LowVolume)
	}
	if state.Reason == "" {
		t.Fatal("combined state must carry a reason")
	}
}

func TestAssessDataState_StaleThresholdIsStrictlyGreaterThan48Hours(t *testing.T) {
	now := time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC)
	// Exactly 48h old is NOT stale; strictly older is.
	recent := []Metric{{Key: FunnelTopMetricKey, OccurredAt: now.Add(-48 * time.Hour), Value: 10000}}
	if AssessDataState(recent, now).Stale {
		t.Fatal("exactly 48h should not be stale")
	}
	stale := []Metric{{Key: FunnelTopMetricKey, OccurredAt: now.Add(-(48*time.Hour + time.Second)), Value: 10000}}
	if !AssessDataState(stale, now).Stale {
		t.Fatal("just over 48h should be stale")
	}
}

func TestAssessDataState_LowVolumeBoundaryIsStrictlyBelowThreshold(t *testing.T) {
	now := time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC)
	// Exactly at threshold (50) is NOT low-volume; strictly below is.
	atThreshold := []Metric{{Key: FunnelTopMetricKey, OccurredAt: now.Add(-1 * time.Hour), Value: 50}}
	if AssessDataState(atThreshold, now).LowVolume {
		t.Fatal("volume == threshold should not be low-volume")
	}
	below := []Metric{{Key: FunnelTopMetricKey, OccurredAt: now.Add(-1 * time.Hour), Value: 49.9}}
	if !AssessDataState(below, now).LowVolume {
		t.Fatal("volume just below threshold should be low-volume")
	}
}

func TestAssessDataState_FunnelTopSumsAcrossDays(t *testing.T) {
	now := time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC)
	// Two days of impressions: 25 + 20 = 45 < 50 → low-volume.
	metrics := []Metric{
		{Key: FunnelTopMetricKey, OccurredAt: now.Add(-1 * time.Hour), Value: 25},
		{Key: FunnelTopMetricKey, OccurredAt: now.Add(-2 * 24 * time.Hour), Value: 20},
	}
	state := AssessDataState(metrics, now)
	if !state.LowVolume {
		t.Fatalf("summed volume 45 should be low-volume; got funnelTop=%v", state.FunnelTopVolume)
	}
	if state.FunnelTopVolume != 45 {
		t.Fatalf("funnelTop: want 45, got %v", state.FunnelTopVolume)
	}
}

func TestAssessDataState_NonFunnelTopMetricsDoNotAffectLowVolume(t *testing.T) {
	now := time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC)
	// Plenty of trials_new but zero impressions → still low-volume.
	metrics := []Metric{
		{Key: "trials_new", OccurredAt: now.Add(-1 * time.Hour), Value: 1000},
	}
	state := AssessDataState(metrics, now)
	if !state.LowVolume {
		t.Fatal("missing funnel-top volume should be low-volume")
	}
}

func TestAssessDataState_UsesMostRecentMetricForStaleness(t *testing.T) {
	now := time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC)
	// One stale point and one recent point → NOT stale (recent wins).
	metrics := []Metric{
		{Key: FunnelTopMetricKey, OccurredAt: now.Add(-72 * time.Hour), Value: 10000},
		{Key: "downloads", OccurredAt: now.Add(-2 * time.Hour), Value: 5000},
	}
	state := AssessDataState(metrics, now)
	if state.Stale {
		t.Fatal("most recent metric is fresh; workspace should not be stale")
	}
}

func TestAssessDataState_DisabledThresholdsAreSkipped(t *testing.T) {
	now := time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC)
	metrics := []Metric{
		{Key: FunnelTopMetricKey, OccurredAt: now.Add(-30 * 24 * time.Hour), Value: 5},
	}
	// Both thresholds disabled → live regardless of age/volume.
	state := AssessDataStateWithThresholds(metrics, now, 0, 0)
	if state.Mode != ModeLive {
		t.Fatalf("disabled thresholds: want live, got %q", state.Mode)
	}
	if state.Stale || state.LowVolume {
		t.Fatal("disabled thresholds must not flag stale/lowVolume")
	}
}

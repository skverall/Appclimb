package diagnoser

import (
	"fmt"
	"time"
)

// Data-state thresholds. These are initial defaults; they can be promoted to
// config once tuning is needed. Apple's real reporting lag is ~48h, so 48h is
// the honest point at which generic data should be flagged stale.
const (
	// DefaultStaleThreshold is how old the most recent metric point may be
	// before the workspace is considered stale. 48h covers Apple's reporting
	// lag and any sync outage up to ~2 days.
	DefaultStaleThreshold = 48 * time.Hour
	// DefaultLowVolumeThreshold is the minimum funnel-top (impressions) volume
	// below which stage rates become directional rather than decisive. Mirrors
	// the per-stage LowVolumeThreshold used for the Renew hypothesis.
	DefaultLowVolumeThreshold = 50.0
	// FunnelTopMetricKey is the metric whose summed volume measures the overall
	// funnel size (the top of the River Atlas).
	FunnelTopMetricKey = "impressions"
)

// DataStateMode is the honest workspace-level data condition. The frontend
// renders a distinct banner for each non-"live" mode.
const (
	ModeEmpty   = "empty"
	ModePartial = "partial"
	ModeLive    = "live"
)

// DataState describes whether the workspace's data is trustworthy enough to
// render the River Atlas as-is, and why it might not be.
type DataState struct {
	Mode            string  // empty | partial | live
	Stale           bool    // most recent data is older than the stale threshold
	LowVolume       bool    // overall funnel volume is below the low-volume threshold
	StalenessHours  float64 // age of the most recent metric point, in hours (0 if no metrics)
	FunnelTopVolume float64 // summed volume of the funnel-top metric
	Reason          string  // human-readable explanation for the banner
}

// AssessDataState computes the honest workspace data condition from the metric
// points feeding a growth-map window. It uses read-time staleness
// (now − OccurredAt) rather than the frozen freshness_hours column so a source
// that stopped syncing is correctly flagged stale.
//
// Priority: empty > partial(stale/low-volume) > live.
func AssessDataState(metrics []Metric, now time.Time) DataState {
	return AssessDataStateWithThresholds(
		metrics,
		now,
		DefaultStaleThreshold,
		DefaultLowVolumeThreshold,
	)
}

// AssessDataStateWithThresholds is the testable form of AssessDataState that
// takes explicit thresholds. staleThreshold <= 0 disables the stale check;
// lowVolumeThreshold <= 0 disables the low-volume check.
func AssessDataStateWithThresholds(
	metrics []Metric,
	now time.Time,
	staleThreshold time.Duration,
	lowVolumeThreshold float64,
) DataState {
	if len(metrics) == 0 {
		return DataState{
			Mode:   ModeEmpty,
			Reason: "No sources have synced data yet. Connect a source to see your growth river.",
		}
	}

	// Read-time staleness: age of the most recent metric point. This replaces
	// the frozen freshness_hours column, which only reflects import time.
	var latestOccurredAt time.Time
	for _, m := range metrics {
		if m.OccurredAt.After(latestOccurredAt) {
			latestOccurredAt = m.OccurredAt
		}
	}
	staleness := now.UTC().Sub(latestOccurredAt.UTC())
	if staleness < 0 {
		staleness = 0
	}
	stale := staleThreshold > 0 && staleness > staleThreshold

	// Funnel-top volume: sum of the impressions metric across the window.
	var funnelTop float64
	for _, m := range metrics {
		if m.Key == FunnelTopMetricKey {
			funnelTop += m.Value
		}
	}
	lowVolume := lowVolumeThreshold > 0 && funnelTop < lowVolumeThreshold

	state := DataState{
		Stale:           stale,
		LowVolume:       lowVolume,
		StalenessHours:  staleness.Hours(),
		FunnelTopVolume: funnelTop,
	}

	switch {
	case stale && lowVolume:
		state.Mode = ModePartial
		state.Reason = fmt.Sprintf(
			"Data is delayed (%.0f days old) and volume is low (%.0f). Findings are directional, not decisive.",
			staleness.Hours()/24, funnelTop,
		)
	case stale:
		state.Mode = ModePartial
		state.Reason = fmt.Sprintf(
			"Data may be delayed — most recent sync was %.0f days ago. Confidence reflects this lag.",
			staleness.Hours()/24,
		)
	case lowVolume:
		state.Mode = ModePartial
		state.Reason = fmt.Sprintf(
			"Volume is low (%.0f total). Findings are directional; wait for more data before acting.",
			funnelTop,
		)
	default:
		state.Mode = ModeLive
		state.Reason = ""
	}
	return state
}

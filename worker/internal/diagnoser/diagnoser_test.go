package diagnoser

import (
	"testing"
	"time"
)

// metric is a small builder for legible fixtures.
func metric(provider, key string, value float64) Metric {
	return Metric{
		Provider:     provider,
		Key:          key,
		OccurredAt:   time.Date(2026, 7, 23, 0, 0, 0, 0, time.UTC),
		Value:        value,
		Unit:         "count",
		Freshness:    2,
		Completeness: 0.98,
	}
}

func TestComputeConfidence_MirrorsTypeScriptFixtures(t *testing.T) {
	// diagnosis.test.ts: {completeness 0.98, freshness 2} -> {98, high}.
	got := ComputeConfidence([]Metric{metric("posthog", "activation_24h", 0.31)})
	if got.Score != 98 || got.Level != ConfidenceHigh {
		t.Fatalf("expected {98, high}, got {%d, %s}", got.Score, got.Level)
	}
	if got := ComputeConfidence(nil); got.Score != 0 || got.Level != ConfidenceLow {
		t.Fatalf("empty input expected {0, low}, got {%d, %s}", got.Score, got.Level)
	}
}

func TestComputeConfidence_LevelThresholds(t *testing.T) {
	// score = round((completeness*0.72 + (1-freshness/72)*0.28)*100). With
	// freshness=0 the freshness factor is 1.0, so solve completeness for an
	// exact target score, then assert the level flips at 80/55.
	scoreFor := func(target int, freshness float64) float64 {
		return (float64(target)/100 - (1 - freshness/72)*0.28) / 0.72
	}
	cases := []struct {
		name        string
		score       int
		freshness   float64
		wantLevel   string
	}{
		{"high boundary (80)", 80, 0, ConfidenceHigh},
		{"medium boundary (55)", 55, 0, ConfidenceMedium},
		{"just below medium (54)", 54, 0, ConfidenceLow},
		{"stale decays confidence", 72, 72, ConfidenceMedium},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			m := Metric{Completeness: scoreFor(c.score, c.freshness), Freshness: c.freshness}
			got := ComputeConfidence([]Metric{m})
			if got.Score != c.score {
				t.Fatalf("score: want %d got %d", c.score, got.Score)
			}
			if got.Level != c.wantLevel {
				t.Fatalf("level: want %s got %s", c.wantLevel, got.Level)
			}
		})
	}
}

func TestClassifyStages_CriticalThresholdIsStrictlyLessThan75Percent(t *testing.T) {
	// store benchmark 0.52 -> critical cutoff 0.75*0.52 = 0.39. rate < 0.39 is
	// critical; rate in [0.39, 0.52) is watch; rate >= 0.52 is healthy.
	previous := 1000.0
	at := func(rate float64) string {
		sums := map[string]float64{
			"impressions":        previous,
			"product_page_views": previous * rate,
		}
		stages := ClassifyStages(sums)
		return stages[1].Health // store is index 1
	}
	if h := at(0.385); h != "critical" {
		t.Fatalf("rate below 0.75x: want critical, got %s", h)
	}
	if h := at(0.40); h != "watch" {
		t.Fatalf("rate between 0.75x and benchmark: want watch, got %s", h)
	}
	if h := at(0.55); h != "healthy" {
		t.Fatalf("rate at/above benchmark: want healthy, got %s", h)
	}
}

func TestClassifyStages_UnknownWhenVolumeZero(t *testing.T) {
	stages := ClassifyStages(map[string]float64{})
	for _, s := range stages {
		if s.Health != "unknown" {
			t.Fatalf("stage %s with no volume: want unknown, got %s", s.Definition.ID, s.Health)
		}
	}
}

// fullFunnel builds a healthy funnel then lets a test degrade one stage.
func fullFunnel(degraded map[StageID]float64) []Metric {
	volumes := map[StageID]float64{
		StageDiscover: 100000,
		StageStore:    52000,
		StageInstall:  26000,
		StageActivate: 20000,
		StagePaywall:  14000,
		StageTrial:    7000,
		StagePaid:     3000,
		StageRenew:    2000,
	}
	for stage, v := range degraded {
		volumes[stage] = v
	}
	keys := map[StageID]string{}
	for _, s := range Stages() {
		keys[s.ID] = s.MetricKey
	}
	src := map[StageID]string{}
	for _, s := range Stages() {
		src[s.ID] = s.Source
	}
	out := make([]Metric, 0, len(volumes))
	for _, s := range Stages() {
		out = append(out, Metric{
			Provider:     src[s.ID],
			Key:          keys[s.ID],
			OccurredAt:   time.Date(2026, 7, 23, 0, 0, 0, 0, time.UTC),
			Value:        volumes[s.ID],
			Unit:         "count",
			Freshness:    2,
			Completeness: 0.95,
		})
	}
	return out
}

func TestGenerate_Rank1IsEarliestConstraint(t *testing.T) {
	// Degrade activation below its 0.75*0.41 = 0.3075 benchmark threshold.
	diag := Generate(Input{
		Metrics: fullFunnel(map[StageID]float64{
			StageActivate: 5500, // 5500/26000 = 0.21 < 0.3075 -> critical
		}),
		Now: time.Date(2026, 7, 24, 12, 0, 0, 0, time.UTC),
	})
	if len(diag.Insights) == 0 {
		t.Fatal("expected at least one insight")
	}
	rank1 := diag.Insights[0]
	if rank1.Rank != 1 {
		t.Fatalf("rank1.Rank: want 1, got %d", rank1.Rank)
	}
	if rank1.Kind != KindDerived {
		t.Fatalf("rank1.Kind: want %s, got %s", KindDerived, rank1.Kind)
	}
	if rank1.StageID != StageActivate {
		t.Fatalf("rank1.StageID: want %s, got %s", StageActivate, rank1.StageID)
	}
	if rank1.Impact != "high" {
		t.Fatalf("rank1.Impact: want high, got %s", rank1.Impact)
	}
}

func TestGenerate_RanksAtMostThree(t *testing.T) {
	diag := Generate(Input{Metrics: fullFunnel(nil), Now: time.Now()})
	if len(diag.Insights) > 3 {
		t.Fatalf("insights must not exceed 3 (DB CHECK), got %d", len(diag.Insights))
	}
	for _, ins := range diag.Insights {
		if ins.Rank < 1 || ins.Rank > 3 {
			t.Fatalf("rank out of [1,3]: %d", ins.Rank)
		}
		if ins.Kind != KindObserved && ins.Kind != KindDerived && ins.Kind != KindHypothesis {
			t.Fatalf("invalid kind: %s", ins.Kind)
		}
	}
}

func TestGenerate_EmptyMetricsYieldsNoInsightsWithoutPanicking(t *testing.T) {
	diag := Generate(Input{Metrics: nil, Now: time.Now()})
	if len(diag.Insights) != 0 {
		t.Fatalf("empty metrics: want 0 insights, got %d", len(diag.Insights))
	}
	if len(diag.Evidence) != 0 {
		t.Fatalf("empty metrics: want 0 evidence, got %d", len(diag.Evidence))
	}
	if diag.Confidence.Level != ConfidenceLow {
		t.Fatalf("empty metrics: want low confidence, got %s", diag.Confidence.Level)
	}
}

func TestGenerate_EveryInsightHasEvidenceAndAction(t *testing.T) {
	diag := Generate(Input{
		Metrics: fullFunnel(map[StageID]float64{
			StageActivate: 5500,
			StageStore:    35000, // watch
		}),
		Now: time.Now(),
	})
	if len(diag.Insights) == 0 {
		t.Fatal("expected insights")
	}
	if len(diag.Insights) != len(diag.Actions) {
		t.Fatalf("actions must match insights 1:1: %d vs %d", len(diag.Insights), len(diag.Actions))
	}
	for _, ins := range diag.Insights {
		if len(ins.EvidenceIdx) == 0 {
			t.Fatalf("insight %q has no evidence", ins.Title)
		}
	}
	for _, a := range diag.Actions {
		if a.InsightIdx < 0 || a.InsightIdx >= len(diag.Insights) {
			t.Fatalf("action points to non-existent insight %d", a.InsightIdx)
		}
	}
}

func TestGenerate_WindowIsTrailing30DaysUTCDayAligned(t *testing.T) {
	diag := Generate(Input{
		Metrics: fullFunnel(nil),
		Now:     time.Date(2026, 7, 24, 23, 59, 0, 0, time.UTC),
	})
	wantFrom := time.Date(2026, 6, 24, 0, 0, 0, 0, time.UTC)
	wantTo := time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC)
	if !diag.Window.From.Equal(wantFrom) {
		t.Fatalf("window.from: want %v got %v", wantFrom, diag.Window.From)
	}
	if !diag.Window.To.Equal(wantTo) {
		t.Fatalf("window.to: want %v got %v", wantTo, diag.Window.To)
	}
}

func TestGenerate_HealthyFunnelProducesNoConstraint(t *testing.T) {
	diag := Generate(Input{Metrics: fullFunnel(nil), Now: time.Now()})
	for _, ins := range diag.Insights {
		if ins.Kind == KindDerived {
			t.Fatalf("a healthy funnel must not produce a Derived constraint, got %q", ins.Title)
		}
	}
}

func TestInputHash_StableForSameMetricsAndSensitiveToValueChange(t *testing.T) {
	base := fullFunnel(nil)
	a := InputHash(base)
	b := InputHash(base)
	if a == "" {
		t.Fatal("hash must be non-empty")
	}
	if a != b {
		t.Fatal("identical inputs must hash identically")
	}
	changed := append([]Metric(nil), base...)
	changed[0].Value += 1
	if InputHash(changed) == a {
		t.Fatal("hash must change when a value changes")
	}
}

func TestInputHash_OrderIndependent(t *testing.T) {
	base := fullFunnel(nil)
	reversed := make([]Metric, len(base))
	for i := range base {
		reversed[len(base)-1-i] = base[i]
	}
	if InputHash(base) != InputHash(reversed) {
		t.Fatal("hash must be order-independent (canonical sort)")
	}
}

func TestStages_CanonicalOrderMatchesContracts(t *testing.T) {
	stages := Stages()
	want := []StageID{StageDiscover, StageStore, StageInstall, StageActivate, StagePaywall, StageTrial, StagePaid, StageRenew}
	if len(stages) != len(want) {
		t.Fatalf("want %d stages, got %d", len(want), len(stages))
	}
	for i, s := range stages {
		if s.ID != want[i] {
			t.Fatalf("stage %d: want %s, got %s", i, want[i], s.ID)
		}
	}
	if stages[0].Benchmark != 0 {
		t.Fatal("discover must have no benchmark")
	}
}

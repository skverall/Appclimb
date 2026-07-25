// Package diagnoser is the single deterministic source of truth for turning
// synced metric_points into River Atlas stages, evidence, insights and action
// proposals.
//
// The logic here previously lived in two parallel places — the TypeScript
// src/lib/diagnosis.ts (used only by tests) and the inline growthSnapshot
// function in worker/internal/httpapi/server.go. Both now delegate here so the
// thresholds, source ownership and confidence weights cannot drift. AI explanation
// may sit on top of this output later (PRODUCT_DIRECTION §7: deterministic
// calculations and evidence lineage come before AI explanation), but this
// package never calls a model: every output is reproducible from its inputs.
package diagnoser

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Version is the schema version of the generator output. It is persisted in
// evidence.calculation_version and insights.diagnosis_version so stale rows
// can be invalidated when the algorithm changes.
const Version = "2026.07.3"

// DiagnosisWindowDays is the trailing window every diagnosis covers, matching
// the growth-map window (server.go growthMap handler: AddDate(0,0,-30)).
const DiagnosisWindowDays = 30

// Health thresholds. When a workspace has an explicitly supplied, defensible
// benchmark, a stage is "critical" once its conversion rate falls below 75%
// of that benchmark and "watch" between 75% and 100%. Production never falls
// back to the illustrative demo rates.
const (
	criticalFactor = 0.75
	// Confidence weights mirror src/lib/diagnosis.ts assessConfidence.
	weightCompleteness = 0.72
	weightFreshness    = 0.28
	freshnessSpanHours = 72.0
	confidenceHigh     = 80
	confidenceMedium   = 55
)

// StageID enumerates the iOS growth journey. The string values are fixed by
// the insights.stage_id CHECK constraint (001_foundation.sql:194).
type StageID string

const (
	StageDiscover StageID = "discover"
	StageStore    StageID = "store"
	StageInstall  StageID = "install"
	StageActivate StageID = "activate"
	StagePaywall  StageID = "paywall"
	StageTrial    StageID = "trial"
	StagePaid     StageID = "paid"
	StageRenew    StageID = "renew"
)

// InsightKind enumerates the insight_kind enum (001_foundation.sql:15).
const (
	KindObserved   = "Observed"
	KindDerived    = "Derived"
	KindHypothesis = "Hypothesis"
)

// Confidence levels match the insight_confidence enum (001_foundation.sql:16).
const (
	ConfidenceHigh   = "high"
	ConfidenceMedium = "medium"
	ConfidenceLow    = "low"
)

// LowVolumeThreshold is the minimum stage volume (funnel-top-normalised) below
// which a constraint is treated as a Hypothesis rather than a confident
// Derived/Observed insight. Avoids acting on noise (PRODUCT_DIRECTION §14.4).
const LowVolumeThreshold = 50.0

// StageDefinition describes one node of the River Atlas funnel. Benchmark is
// zero in the canonical definitions and is populated only from an explicit
// workspace input during classification.
type StageDefinition struct {
	ID        StageID
	Label     string
	MetricKey string
	Source    string
	Benchmark float64 // 0 means no benchmark (top-of-funnel)
}

// Stages is the single canonical iOS funnel definition. Demo benchmark values
// deliberately live only in src/lib/demo-data.ts.
func Stages() []StageDefinition {
	return []StageDefinition{
		{ID: StageDiscover, Label: "Discover", MetricKey: "impressions", Source: "app-store-connect"},
		{ID: StageStore, Label: "Store", MetricKey: "product_page_views", Source: "app-store-connect"},
		{ID: StageInstall, Label: "Install", MetricKey: "downloads", Source: "app-store-connect"},
		{ID: StageActivate, Label: "Activate", MetricKey: "activated_users", Source: "posthog"},
		{ID: StagePaywall, Label: "Paywall", MetricKey: "paywall_views", Source: "superwall"},
		{ID: StageTrial, Label: "Trial", MetricKey: "trials_new", Source: "revenuecat"},
		{ID: StagePaid, Label: "Paid", MetricKey: "paid_new", Source: "revenuecat"},
		{ID: StageRenew, Label: "Renew", MetricKey: "renewals", Source: "revenuecat"},
	}
}

// Metric is the subset of a metric_points row the generator consumes. It is a
// local type (rather than importing database) so this package stays free of an
// import cycle; callers convert from database.Metric.
type Metric struct {
	Provider   string
	Key        string
	OccurredAt time.Time
	Value      float64
	Unit       string
	// Freshness is retained at the database boundary for backwards
	// compatibility. Diagnosis deliberately derives freshness from OccurredAt
	// and the current clock so an imported point cannot stay "fresh" forever.
	Freshness    float64
	Completeness float64
}

// StageResult is the computed view of one stage: its volume, conversion rate
// from the previous stage, health classification and river width. It mirrors
// the map[string]any emitted by growthSnapshot so the API payload stays
// byte-compatible.
type StageResult struct {
	Definition     StageDefinition
	Value          float64
	ConversionRate *float64
	Health         string // healthy | watch | critical | unknown
	FlowWidth      float64
}

// Confidence is the workspace-level data-trust score, identical to the previous
// inline computation in growthSnapshot and src/lib/diagnosis.ts assessConfidence.
type Confidence struct {
	Score int    // 0..100
	Level string // high | medium | low
}

// ComputeConfidence derives the overall data-trust score from completeness and
// the age of the newest observation in each provider/metric series. Using the
// newest observation avoids penalising a healthy trailing window merely because
// it also contains older history, while deriving age from OccurredAt prevents a
// freshness value frozen at import time from remaining trusted indefinitely.
func ComputeConfidence(metrics []Metric, now time.Time) Confidence {
	if len(metrics) == 0 {
		return Confidence{Score: 0, Level: ConfidenceLow}
	}
	type seriesKey struct {
		provider string
		metric   string
	}
	latestBySeries := make(map[seriesKey]time.Time, len(metrics))
	var completeness float64
	for _, m := range metrics {
		completeness += m.Completeness
		key := seriesKey{provider: m.Provider, metric: m.Key}
		if current, ok := latestBySeries[key]; !ok || m.OccurredAt.After(current) {
			latestBySeries[key] = m.OccurredAt
		}
	}
	avgCompleteness := completeness / float64(len(metrics))
	var freshness float64
	for _, occurredAt := range latestBySeries {
		if occurredAt.IsZero() {
			freshness += freshnessSpanHours
			continue
		}
		age := now.UTC().Sub(occurredAt.UTC()).Hours()
		freshness += math.Max(0, age)
	}
	avgFreshness := freshness / float64(len(latestBySeries))
	freshnessFactor := math.Max(0, 1-avgFreshness/freshnessSpanHours)
	score := int(math.Round(math.Max(0, math.Min(1, avgCompleteness*weightCompleteness+freshnessFactor*weightFreshness)) * 100))
	level := ConfidenceLow
	if score >= confidenceHigh {
		level = ConfidenceHigh
	} else if score >= confidenceMedium {
		level = ConfidenceMedium
	}
	return Confidence{Score: score, Level: level}
}

// AggregateByMetric combines metric points using the stage's canonical owner.
// Additive observations are summed across the window. Provider range snapshots
// (for example Superwall's date-range overview) are non-additive, so only the
// newest snapshot is used; legacy additive rows for that same series are
// ignored once a range snapshot exists.
func AggregateByMetric(metrics []Metric) map[string]float64 {
	owners := make(map[string]string, len(Stages()))
	for _, stage := range Stages() {
		owners[stage.MetricKey] = stage.Source
	}
	type accumulator struct {
		sum              float64
		snapshotValue    float64
		snapshotOccurred time.Time
		hasSnapshot      bool
	}
	aggregates := make(map[string]accumulator, 16)
	for _, m := range metrics {
		if owner, ok := owners[m.Key]; ok && m.Provider != owner {
			continue
		}
		current := aggregates[m.Key]
		if isRangeSnapshotUnit(m.Unit) {
			if !current.hasSnapshot ||
				m.OccurredAt.After(current.snapshotOccurred) ||
				(m.OccurredAt.Equal(current.snapshotOccurred) && m.Value > current.snapshotValue) {
				current.snapshotValue = m.Value
				current.snapshotOccurred = m.OccurredAt
			}
			current.hasSnapshot = true
		} else {
			current.sum += m.Value
		}
		aggregates[m.Key] = current
	}
	sums := make(map[string]float64, len(aggregates))
	for key, aggregate := range aggregates {
		if aggregate.hasSnapshot {
			sums[key] = aggregate.snapshotValue
			continue
		}
		sums[key] = aggregate.sum
	}
	return sums
}

func isRangeSnapshotUnit(unit string) bool {
	return unit == "range_count" || unit == "range_ratio"
}

// ClassifyStages computes the River Atlas stages from aggregated volumes. The
// rules are the canonical health classification:
//
//	unknown  — required owner metric or denominator is absent
//	healthy  — a benchmark is present and the rate is at or above it
//	watch    — rate in [benchmark*0.75, benchmark)
//	critical — rate below benchmark*0.75
//
// Without a benchmark, volume and conversion remain visible but health is
// unknown. Discover has no conversion denominator and therefore stays unknown.
func ClassifyStages(
	sums map[string]float64,
	benchmarkSets ...map[StageID]float64,
) []StageResult {
	stages := Stages()
	if len(benchmarkSets) > 0 {
		for index := range stages {
			if benchmark := benchmarkSets[0][stages[index].ID]; benchmark > 0 &&
				benchmark <= 1 {
				stages[index].Benchmark = benchmark
			}
		}
	}
	results := make([]StageResult, 0, len(stages))
	previous := 0.0
	previousPresent := false
	for index, stage := range stages {
		value, present := sums[stage.MetricKey]
		var conversion *float64
		health := "unknown"
		flowWidth := 30.0
		if value > 0 {
			flowWidth = math.Max(30, 155*math.Sqrt(value/math.Max(sums[stages[0].MetricKey], value)))
		}
		if index > 0 && present && previousPresent && previous > 0 {
			rate := math.Max(0, math.Min(1, value/previous))
			conversion = &rate
			if stage.Benchmark > 0 {
				health = "healthy"
				switch {
				case rate < stage.Benchmark*criticalFactor:
					health = "critical"
				case rate < stage.Benchmark:
					health = "watch"
				}
			}
		}
		results = append(results, StageResult{
			Definition:     stage,
			Value:          value,
			ConversionRate: conversion,
			Health:         health,
			FlowWidth:      math.Round(flowWidth),
		})
		previous = value
		previousPresent = present
	}
	return results
}

// EarliestConstraint returns the first non-discover stage that is critical or
// below the 75% benchmark threshold — the "earliest meaningful constraint"
// invariant from PRODUCT_DIRECTION §14.5. Returns nil when no stage qualifies.
func EarliestConstraint(stages []StageResult) *StageResult {
	for index, stage := range stages {
		if index == 0 || stage.Definition.ID == StageDiscover {
			continue
		}
		if stage.Health == "critical" {
			return &stages[index]
		}
	}
	return nil
}

// Evidence is the generator view of a row destined for the evidence table.
// Before/After are display objects {"label":string,"value":string} matching
// the contracts.ts Evidence shape that growthSnapshot passes through verbatim.
type Evidence struct {
	Provider   string
	Title      string
	Finding    string
	MetricKeys []string
	WindowFrom time.Time
	WindowTo   time.Time
	Confidence string
	Before     map[string]any
	After      map[string]any
}

// Insight is the generator view of a row destined for the insights table.
type Insight struct {
	Title       string
	Summary     string
	Kind        string
	StageID     StageID
	EvidenceIdx []int // indices into Diagnosis.Evidence, resolved to UUIDs at write time
	Confidence  string
	Impact      string
	Effort      string
	Rank        int
}

// ActionProposal is the generator view of a row destined for action_proposals.
// ExternalMutationAllowed is always false (DB CHECK forces it; read-only per
// PRODUCT_DIRECTION §14.6).
type ActionProposal struct {
	InsightIdx         int
	Title              string
	Rationale          string
	ExperimentTemplate string
}

// Diagnosis is the full deterministic output for one app.
type Diagnosis struct {
	Version    string
	Window     struct{ From, To time.Time }
	Stages     []StageResult
	Confidence Confidence
	Evidence   []Evidence
	Insights   []Insight
	Actions    []ActionProposal
	InputHash  string
}

// Input is what Generate needs from the database layer.
type Input struct {
	Metrics    []Metric
	Now        time.Time
	Benchmarks map[StageID]float64
}

// Generate runs the deterministic diagnosis pipeline. It is pure: identical
// inputs always yield identical outputs. Callers persist the result.
//
// The pipeline:
//  1. Aggregate volumes and classify stages.
//  2. Rank-1 Derived insight = the earliest constraint (impact high).
//  3. Rank-2 Observed insight = the next largest benchmark gap.
//  4. Rank-3 Hypothesis = a soft signal held back by low confidence/volume.
//  5. Attach one Evidence and one read-only ActionProposal per insight.
//
// At most three insights are produced (insights.rank CHECK 1..3). Fewer when
// the data does not support more — never fabricated.
func Generate(in Input) Diagnosis {
	stages := ClassifyStages(
		AggregateByMetric(in.Metrics),
		in.Benchmarks,
	)
	conf := ComputeConfidence(in.Metrics, in.Now)
	windowFrom, windowTo := diagnosisWindow(in.Now)

	d := Diagnosis{
		Version:    Version,
		Confidence: conf,
		Stages:     stages,
		InputHash:  InputHash(in.Metrics, in.Now),
	}
	d.Window.From = windowFrom
	d.Window.To = windowTo

	// Rank 1 — earliest constraint.
	if c := EarliestConstraint(stages); c != nil {
		addConstraintInsight(&d, c, conf, 1)
	}

	// Rank 2 — next worst stage that is not the rank-1 constraint.
	if next := nextWatchOrCritical(stages, d.Insights); next != nil {
		addBenchmarkGapInsight(&d, next, conf, 2)
	}

	// Rank 3 — a soft/low-volume renewal signal held as a Hypothesis.
	if soft := softRenewalSignal(stages, conf); soft != nil {
		addHypothesisInsight(&d, soft, 3)
	}

	return d
}

func diagnosisWindow(now time.Time) (time.Time, time.Time) {
	utc := now.UTC()
	to := time.Date(utc.Year(), utc.Month(), utc.Day(), 0, 0, 0, 0, time.UTC)
	from := to.AddDate(0, 0, -DiagnosisWindowDays)
	return from, to
}

func addConstraintInsight(d *Diagnosis, stage *StageResult, conf Confidence, rank int) {
	evIdx := len(d.Evidence)
	rate := ratioOrZero(stage.ConversionRate)
	d.Evidence = append(d.Evidence, Evidence{
		Provider:   stage.Definition.Source,
		Title:      fmt.Sprintf("%s conversion fell below benchmark", stage.Definition.Label),
		Finding:    fmt.Sprintf("%s to %s conversion is %.1f%%, below the %.0f%% benchmark.", previousLabel(stage), stage.Definition.Label, rate*100, stage.Definition.Benchmark*100),
		MetricKeys: []string{stage.Definition.MetricKey, previousMetricKey(stage)},
		WindowFrom: d.Window.From,
		WindowTo:   d.Window.To,
		Confidence: conf.Level,
		Before: map[string]any{
			"label": "Benchmark",
			"value": formatPercent(stage.Definition.Benchmark),
		},
		After: map[string]any{
			"label": "Observed",
			"value": formatPercent(rate),
		},
	})
	d.Insights = append(d.Insights, Insight{
		Title:       fmt.Sprintf("Fix the %s bottleneck", strings.ToLower(stage.Definition.Label)),
		Summary:     fmt.Sprintf("The first confirmed constraint is between %s and %s.", strings.ToLower(previousLabel(stage)), strings.ToLower(stage.Definition.Label)),
		Kind:        KindDerived,
		StageID:     stage.Definition.ID,
		EvidenceIdx: []int{evIdx},
		Confidence:  conf.Level,
		Impact:      "high",
		Effort:      "medium",
		Rank:        rank,
	})
	d.Actions = append(d.Actions, ActionProposal{
		InsightIdx:         len(d.Insights) - 1,
		Title:              fmt.Sprintf("Run a focused %s experiment", strings.ToLower(stage.Definition.Label)),
		Rationale:          fmt.Sprintf("Address the earliest loss before optimising downstream stages; target %s conversion.", strings.ToLower(stage.Definition.Label)),
		ExperimentTemplate: experimentTemplate(stage.Definition.ID),
	})
}

func addBenchmarkGapInsight(d *Diagnosis, stage *StageResult, conf Confidence, rank int) {
	evIdx := len(d.Evidence)
	rate := ratioOrZero(stage.ConversionRate)
	d.Evidence = append(d.Evidence, Evidence{
		Provider:   stage.Definition.Source,
		Title:      fmt.Sprintf("%s trails benchmark", stage.Definition.Label),
		Finding:    fmt.Sprintf("%s conversion is %.1f%% vs the %.0f%% benchmark.", stage.Definition.Label, rate*100, stage.Definition.Benchmark*100),
		MetricKeys: []string{stage.Definition.MetricKey, previousMetricKey(stage)},
		WindowFrom: d.Window.From,
		WindowTo:   d.Window.To,
		Confidence: ConfidenceMedium,
		Before: map[string]any{
			"label": "Benchmark",
			"value": formatPercent(stage.Definition.Benchmark),
		},
		After: map[string]any{
			"label": "Observed",
			"value": formatPercent(rate),
		},
	})
	d.Insights = append(d.Insights, Insight{
		Title:       fmt.Sprintf("Improve %s conversion", strings.ToLower(stage.Definition.Label)),
		Summary:     fmt.Sprintf("%s is %.1f%%, under the %.0f%% benchmark but not yet the primary loss.", stage.Definition.Label, rate*100, stage.Definition.Benchmark*100),
		Kind:        KindObserved,
		StageID:     stage.Definition.ID,
		EvidenceIdx: []int{evIdx},
		Confidence:  ConfidenceMedium,
		Impact:      "medium",
		Effort:      "low",
		Rank:        rank,
	})
	d.Actions = append(d.Actions, ActionProposal{
		InsightIdx:         len(d.Insights) - 1,
		Title:              fmt.Sprintf("Test a %s improvement", strings.ToLower(stage.Definition.Label)),
		Rationale:          fmt.Sprintf("Close the benchmark gap at %s with one focused test.", strings.ToLower(stage.Definition.Label)),
		ExperimentTemplate: experimentTemplate(stage.Definition.ID),
	})
}

func addHypothesisInsight(d *Diagnosis, stage *StageResult, rank int) {
	evIdx := len(d.Evidence)
	rate := ratioOrZero(stage.ConversionRate)
	d.Evidence = append(d.Evidence, Evidence{
		Provider:   stage.Definition.Source,
		Title:      fmt.Sprintf("%s needs more volume", stage.Definition.Label),
		Finding:    fmt.Sprintf("%s conversion is directionally soft (%.1f%% vs %.0f%% benchmark) but the cohort is too small to act on yet.", stage.Definition.Label, rate*100, stage.Definition.Benchmark*100),
		MetricKeys: []string{stage.Definition.MetricKey},
		WindowFrom: d.Window.From,
		WindowTo:   d.Window.To,
		Confidence: ConfidenceLow,
		Before: map[string]any{
			"label": "Benchmark",
			"value": formatPercent(stage.Definition.Benchmark),
		},
		After: map[string]any{
			"label": "Observed",
			"value": formatPercent(rate),
		},
	})
	d.Insights = append(d.Insights, Insight{
		Title:       fmt.Sprintf("Watch the %s cohort", strings.ToLower(stage.Definition.Label)),
		Summary:     fmt.Sprintf("%s is soft, but another cohort is required before acting.", stage.Definition.Label),
		Kind:        KindHypothesis,
		StageID:     stage.Definition.ID,
		EvidenceIdx: []int{evIdx},
		Confidence:  ConfidenceLow,
		Impact:      "medium",
		Effort:      "medium",
		Rank:        rank,
	})
	d.Actions = append(d.Actions, ActionProposal{
		InsightIdx:         len(d.Insights) - 1,
		Title:              fmt.Sprintf("Wait for the next %s cohort", strings.ToLower(stage.Definition.Label)),
		Rationale:          "Avoid optimising against a low-volume cohort with low confidence.",
		ExperimentTemplate: experimentTemplate(stage.Definition.ID),
	})
}

// nextWatchOrCritical returns the worst non-discover stage that is not already
// covered by an existing insight, preferring critical then watch. Used for rank 2.
func nextWatchOrCritical(stages []StageResult, existing []Insight) *StageResult {
	covered := make(map[StageID]bool, len(existing))
	for _, ins := range existing {
		covered[ins.StageID] = true
	}
	var best *StageResult
	for i := range stages {
		s := &stages[i]
		if s.Definition.ID == StageDiscover || covered[s.Definition.ID] {
			continue
		}
		if s.Health != "watch" && s.Health != "critical" {
			continue
		}
		if best == nil || severityRank(s.Health) > severityRank(best.Health) {
			best = s
		}
	}
	return best
}

// softRenewalSignal returns the renewal stage when it is watch/critical but
// overall confidence or volume is too low to act on confidently.
func softRenewalSignal(stages []StageResult, conf Confidence) *StageResult {
	for i := range stages {
		s := &stages[i]
		if s.Definition.ID != StageRenew {
			continue
		}
		if s.Health != "watch" && s.Health != "critical" {
			continue
		}
		if conf.Level == ConfidenceLow || s.Value < LowVolumeThreshold {
			return s
		}
	}
	return nil
}

func severityRank(health string) int {
	switch health {
	case "critical":
		return 2
	case "watch":
		return 1
	default:
		return 0
	}
}

func previousLabel(stage *StageResult) string {
	stages := Stages()
	for i, s := range stages {
		if s.ID == stage.Definition.ID && i > 0 {
			return stages[i-1].Label
		}
	}
	return "Previous"
}

func previousMetricKey(stage *StageResult) string {
	stages := Stages()
	for i, s := range stages {
		if s.ID == stage.Definition.ID && i > 0 {
			return stages[i-1].MetricKey
		}
	}
	return ""
}

func ratioOrZero(r *float64) float64 {
	if r == nil {
		return 0
	}
	return *r
}

func formatPercent(ratio float64) string {
	return strconv.FormatFloat(ratio*100, 'f', 1, 64) + "%"
}

// experimentTemplate returns a stable slug stored on action_proposals. Slugs
// map a stage to the kind of read-only experiment the Lab would prepare.
func experimentTemplate(id StageID) string {
	switch id {
	case StageStore, StageInstall:
		return "store-screenshot"
	case StageActivate:
		return "activation-onboarding"
	case StagePaywall, StageTrial:
		return "paywall-message"
	case StagePaid:
		return "pricing-pack"
	case StageRenew:
		return "renewal-observation"
	default:
		return "generic-conversion"
	}
}

// InputHash returns a stable hex digest of the metric inputs and the current
// freshness hour. Freshness is part of the generated output, so the clock must
// participate in idempotency; otherwise an unchanged source could retain an old
// high-confidence diagnosis forever.
func InputHash(metrics []Metric, now time.Time) string {
	type key struct {
		provider, metricKey string
		day                 string
		value               string
		unit                string
		completeness        string
	}
	keys := make([]key, 0, len(metrics))
	for _, m := range metrics {
		keys = append(keys, key{
			provider:  m.Provider,
			metricKey: m.Key,
			day:       m.OccurredAt.UTC().Format("2006-01-02"),
			value:     strconv.FormatFloat(round3(m.Value), 'f', 3, 64),
			unit:      m.Unit,
			completeness: strconv.FormatFloat(
				round3(m.Completeness),
				'f',
				3,
				64,
			),
		})
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].provider != keys[j].provider {
			return keys[i].provider < keys[j].provider
		}
		if keys[i].metricKey != keys[j].metricKey {
			return keys[i].metricKey < keys[j].metricKey
		}
		if keys[i].day != keys[j].day {
			return keys[i].day < keys[j].day
		}
		if keys[i].unit != keys[j].unit {
			return keys[i].unit < keys[j].unit
		}
		if keys[i].value != keys[j].value {
			return keys[i].value < keys[j].value
		}
		return keys[i].completeness < keys[j].completeness
	})
	h := sha256.New()
	h.Write([]byte(Version))
	h.Write([]byte{0})
	if len(metrics) > 0 {
		h.Write([]byte(now.UTC().Truncate(time.Hour).Format(time.RFC3339)))
		h.Write([]byte{0})
	}
	for _, k := range keys {
		h.Write([]byte(k.provider))
		h.Write([]byte{0})
		h.Write([]byte(k.metricKey))
		h.Write([]byte{0})
		h.Write([]byte(k.day))
		h.Write([]byte{0})
		h.Write([]byte(k.value))
		h.Write([]byte{0})
		h.Write([]byte(k.unit))
		h.Write([]byte{0})
		h.Write([]byte(k.completeness))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))[:32]
}

func round3(v float64) float64 {
	return math.Round(v*1000) / 1000
}

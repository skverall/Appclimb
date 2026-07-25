// Package appleanalytics downloads and parses Apple App Store Connect Analytics
// Reports. Apple exposes analytics as recurring report requests that produce
// gzip-compressed, tab-delimited text segments. This package owns the metric
// column mapping and TSV streaming; the navigation chain lives in client.go.
package appleanalytics

import (
	"bufio"
	"errors"
	"io"
	"sort"
	"strconv"
	"strings"
	"time"
)

// MetricKey is the AppClimb-internal name a metric is normalised to. It matches
// the keys the diagnoser stage definitions expect (impressions,
// product_page_views, downloads).
type MetricKey string

const (
	MetricImpressions  MetricKey = "impressions"
	MetricProductViews MetricKey = "product_page_views"
	MetricDownloads    MetricKey = "downloads"
)

// column maps an Apple Analytics TSV header to the AppClimb metric key. A
// report may expose several aliases (e.g. units vs totalDownloads) — both are
// accepted and collapse to the same key.
var column = map[string]MetricKey{
	"impressionsTotal": MetricImpressions,
	"pageViewCount":    MetricProductViews,
	"units":            MetricDownloads,
	"totalDownloads":   MetricDownloads,
}

// Row is one parsed data row: a single metric value for one day.
type Row struct {
	Metric MetricKey
	Day    time.Time
	Value  float64
}

// Aggregate is the projection the connectors package persists. Mirrors the
// connectors.Aggregate shape without an import cycle.
type Aggregate struct {
	MetricKey       string
	OccurredAt      time.Time
	Value           float64
	Unit            string
	Dimensions      map[string]string
	SourceUpdatedAt time.Time
	Completeness    float64
}

// Parse reads a TSV stream (already gunzipped) and emits one app-level
// Aggregate per recognised metric and day. Apple reports can contain many rows
// for the same day split by Territory, Device and other dimensions; those rows
// are summed deterministically before persistence so the database conflict key
// cannot turn the last dimension row into the apparent app total. Rows outside
// [from, to) are dropped. completeness uses the Apple reporting lag (a day is
// only 1.0-complete once it is older than lagDays from the window end).
func Parse(
	body io.Reader,
	from, to time.Time,
	lagDays int,
	sourceUpdatedAt time.Time,
) ([]Aggregate, error) {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	// First line is the header: locate the Date column and recognised metrics.
	if !scanner.Scan() {
		if err := scanner.Err(); err != nil {
			return nil, err
		}
		return []Aggregate{}, nil
	}
	metricColumns, dateIndex, err := parseHeader(scanner.Text())
	if err != nil {
		return nil, err
	}
	if len(metricColumns) == 0 {
		return []Aggregate{}, nil
	}

	out := []Aggregate{}
	for scanner.Scan() {
		line := strings.TrimRight(scanner.Text(), "\r")
		if line == "" {
			continue
		}
		fields := strings.Split(line, "\t")
		if len(fields) <= dateIndex {
			continue
		}
		day, ok := parseDay(fields[dateIndex])
		if !ok {
			continue
		}
		if day.Before(from) || !day.Before(to) {
			continue
		}
		complete := completeness(to, day, lagDays)
		for colIdx, key := range metricColumns {
			if colIdx >= len(fields) {
				continue
			}
			value, ok := parseFloat(fields[colIdx])
			if !ok {
				continue
			}
			out = append(out, Aggregate{
				MetricKey:       string(key),
				OccurredAt:      day,
				Value:           value,
				Unit:            "count",
				Dimensions:      map[string]string{"category": categoryFor(key)},
				SourceUpdatedAt: sourceUpdatedAt,
				Completeness:    complete,
			})
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return mergeAggregates(out), nil
}

// parseHeader locates the Date column and returns a map of column-index ->
// recognised metric key. Dimension columns (territory, device, etc.) are
// ignored in v1 — AppClimb aggregates per app per day.
func parseHeader(headerLine string) (map[int]MetricKey, int, error) {
	headerLine = strings.TrimRight(headerLine, "\r\n")
	if headerLine == "" {
		return nil, 0, errors.New("apple report header is empty")
	}
	headers := strings.Split(headerLine, "\t")
	metricColumns := map[int]MetricKey{}
	dateIndex := -1
	for i, name := range headers {
		trimmed := strings.TrimSpace(name)
		if trimmed == "Date" || trimmed == "date" {
			dateIndex = i
			continue
		}
		if key, ok := column[trimmed]; ok {
			metricColumns[i] = key
		}
	}
	if dateIndex == -1 {
		return nil, 0, errors.New("apple report missing Date column")
	}
	return metricColumns, dateIndex, nil
}

func parseDay(value string) (time.Time, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, false
	}
	day, err := time.Parse("2006-01-02", value)
	if err != nil {
		return time.Time{}, false
	}
	return day.UTC(), true
}

func parseFloat(value string) (float64, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0, false
	}
	return parsed, true
}

// completeness mirrors connectors.completeness: a day is fully complete (1.0)
// once it is older than lagDays from the window end; the most recent lagDays
// are partial (0.7) because Apple processes analytics with a delay.
func completeness(to, occurredAt time.Time, lagDays int) float64 {
	cutoff := to.UTC().AddDate(0, 0, -lagDays)
	if occurredAt.Before(cutoff) {
		return 1.0
	}
	return 0.7
}

func categoryFor(key MetricKey) string {
	switch key {
	case MetricImpressions, MetricProductViews:
		return "APP_STORE"
	default:
		return "APP_STORE"
	}
}

type aggregateKey struct {
	metricKey string
	occurred  int64
	unit      string
	category  string
}

func keyForAggregate(row Aggregate) aggregateKey {
	return aggregateKey{
		metricKey: row.MetricKey,
		occurred:  row.OccurredAt.UTC().UnixNano(),
		unit:      row.Unit,
		category:  row.Dimensions["category"],
	}
}

// mergeAggregates reconciles dimension rows and segment partitions inside one
// APP_STORE report into one deterministic app/day/metric value.
func mergeAggregates(rows []Aggregate) []Aggregate {
	merged := make(map[aggregateKey]Aggregate, len(rows))
	for _, row := range rows {
		key := keyForAggregate(row)
		current, exists := merged[key]
		if !exists {
			current = row
			current.OccurredAt = row.OccurredAt.UTC()
			current.Dimensions = map[string]string{"category": key.category}
		} else {
			current.Value += row.Value
			if row.SourceUpdatedAt.After(current.SourceUpdatedAt) {
				current.SourceUpdatedAt = row.SourceUpdatedAt
			}
			if row.Completeness < current.Completeness {
				current.Completeness = row.Completeness
			}
		}
		merged[key] = current
	}
	return sortedAggregates(merged)
}

// mergeReportAggregates combines distinct APP_STORE report types. Their metric
// sets are normally disjoint; if Apple exposes the same normalised metric in
// two reports, selecting the largest complete app total is deterministic and
// avoids double-counting the same semantic metric across report schemas.
func mergeReportAggregates(rows []Aggregate) []Aggregate {
	merged := make(map[aggregateKey]Aggregate, len(rows))
	for _, row := range rows {
		key := keyForAggregate(row)
		current, exists := merged[key]
		minCompleteness := row.Completeness
		if exists && current.Completeness < minCompleteness {
			minCompleteness = current.Completeness
		}
		if !exists ||
			row.Value > current.Value ||
			(row.Value == current.Value && row.SourceUpdatedAt.After(current.SourceUpdatedAt)) {
			current = row
			current.OccurredAt = row.OccurredAt.UTC()
			current.Dimensions = map[string]string{"category": key.category}
		}
		current.Completeness = minCompleteness
		merged[key] = current
	}
	return sortedAggregates(merged)
}

func sortedAggregates(merged map[aggregateKey]Aggregate) []Aggregate {
	result := make([]Aggregate, 0, len(merged))
	for _, row := range merged {
		result = append(result, row)
	}
	sort.Slice(result, func(i, j int) bool {
		if !result[i].OccurredAt.Equal(result[j].OccurredAt) {
			return result[i].OccurredAt.Before(result[j].OccurredAt)
		}
		if result[i].MetricKey != result[j].MetricKey {
			return result[i].MetricKey < result[j].MetricKey
		}
		if result[i].Unit != result[j].Unit {
			return result[i].Unit < result[j].Unit
		}
		return result[i].Dimensions["category"] < result[j].Dimensions["category"]
	})
	return result
}

package appleanalytics

import (
	"strings"
	"testing"
	"time"
)

const sampleTSV = "App Name\tDate\timpressionsTotal\tpageViewCount\tunits\tDevice\tTerritory\n" +
	"TestApp\t2026-07-20\t12000\t3400\t890\tiPhone\tUS\n" +
	"TestApp\t2026-07-21\t12500\t3600\t910\tiPhone\tUS\n" +
	"TestApp\t2026-07-22\t13000\t3800\t950\tiPhone\tUS\n" +
	"TestApp\t2026-07-23\t2000\t500\t120\tiPhone\tUS\n"

func TestParse_MapsColumnsToAppClimbMetricKeys(t *testing.T) {
	from := day("2026-07-20")
	to := day("2026-07-24")
	rows, err := Parse(strings.NewReader(sampleTSV), from, to, 2, time.Now())
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	wantKeys := map[string]bool{
		"impressions":         false,
		"product_page_views":  false,
		"downloads":           false,
	}
	for _, r := range rows {
		wantKeys[r.MetricKey] = true
	}
	for key, seen := range wantKeys {
		if !seen {
			t.Errorf("metric %q never produced", key)
		}
	}
}

func TestParse_ProducesOneRowPerMetricPerDay(t *testing.T) {
	from := day("2026-07-20")
	to := day("2026-07-24")
	rows, err := Parse(strings.NewReader(sampleTSV), from, to, 2, time.Now())
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	// 3 data rows (20,21,22 in window; 23 also in window) x 3 metrics = 12.
	if len(rows) != 12 {
		t.Fatalf("expected 12 aggregates (4 days x 3 metrics), got %d", len(rows))
	}
}

func TestParse_PreservesValuesExactly(t *testing.T) {
	from := day("2026-07-20")
	to := day("2026-07-24")
	rows, err := Parse(strings.NewReader(sampleTSV), from, to, 2, time.Now())
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	found := false
	for _, r := range rows {
		if r.MetricKey == "impressions" && r.OccurredAt.Equal(day("2026-07-20")) {
			if r.Value != 12000 {
				t.Fatalf("impressions value: want 12000, got %v", r.Value)
			}
			found = true
		}
	}
	if !found {
		t.Fatal("did not find impressions row for 2026-07-20")
	}
}

func TestParse_CompletenessReflectsAppleLag(t *testing.T) {
	// lagDays=2, window ends at 2026-07-24. Days older than 07-22 are 1.0;
	// 07-22 and 07-23 are within the lag window -> 0.7.
	from := day("2026-07-20")
	to := day("2026-07-24")
	rows, err := Parse(strings.NewReader(sampleTSV), from, to, 2, time.Now())
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	for _, r := range rows {
		switch {
		case r.OccurredAt.Before(day("2026-07-22")):
			if r.Completeness != 1.0 {
				t.Errorf("day %s: want completeness 1.0, got %v", r.OccurredAt.Format("2006-01-02"), r.Completeness)
			}
		default:
			if r.Completeness != 0.7 {
				t.Errorf("day %s: want completeness 0.7 (in lag window), got %v", r.OccurredAt.Format("2006-01-02"), r.Completeness)
			}
		}
	}
}

func TestParse_DropsRowsOutsideWindow(t *testing.T) {
	// Narrow window [07-21, 07-22): only the 07-21 row qualifies.
	from := day("2026-07-21")
	to := day("2026-07-22")
	rows, err := Parse(strings.NewReader(sampleTSV), from, to, 2, time.Now())
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(rows) != 3 { // 1 day x 3 metrics
		t.Fatalf("narrow window: want 3 aggregates, got %d", len(rows))
	}
	for _, r := range rows {
		if !r.OccurredAt.Equal(day("2026-07-21")) {
			t.Fatalf("unexpected day in narrow window: %v", r.OccurredAt)
		}
	}
}

func TestParse_EmptyStreamReturnsNoError(t *testing.T) {
	rows, err := Parse(strings.NewReader(""), day("2026-07-20"), day("2026-07-24"), 2, time.Now())
	if err != nil {
		t.Fatalf("empty stream: unexpected error %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("empty stream: want 0 rows, got %d", len(rows))
	}
}

func TestParse_MissingDateColumnIsAnError(t *testing.T) {
	bad := "App Name\timpressionsTotal\tpageViewCount\nTestApp\t100\t50\n"
	_, err := Parse(strings.NewReader(bad), day("2026-07-20"), day("2026-07-24"), 2, time.Now())
	if err == nil {
		t.Fatal("expected error when Date column is missing")
	}
}

func TestParse_AcceptsTotalDownloadsAliasForUnits(t *testing.T) {
	tsv := "Date\ttotalDownloads\n2026-07-20\t432\n"
	rows, err := Parse(strings.NewReader(tsv), day("2026-07-20"), day("2026-07-21"), 2, time.Now())
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(rows) != 1 || rows[0].MetricKey != "downloads" || rows[0].Value != 432 {
		t.Fatalf("totalDownloads alias: want 1 downloads row value 432, got %+v", rows)
	}
}

func TestParse_DimensionsCarryCategory(t *testing.T) {
	tsv := "Date\timpressionsTotal\n2026-07-20\t100\n"
	rows, err := Parse(strings.NewReader(tsv), day("2026-07-20"), day("2026-07-21"), 2, time.Now())
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("want 1 row, got %d", len(rows))
	}
	if rows[0].Dimensions["category"] != "APP_STORE" {
		t.Fatalf("category dimension: want APP_STORE, got %q", rows[0].Dimensions["category"])
	}
}

func day(value string) time.Time {
	t, err := time.Parse("2006-01-02", value)
	if err != nil {
		panic(err)
	}
	return t.UTC()
}

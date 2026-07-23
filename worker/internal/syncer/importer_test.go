package syncer

import (
	"context"
	"errors"
	"testing"
	"time"
)

type pageFetcher struct {
	pages []Page
	calls int
	err   error
}

func (f *pageFetcher) Provider() Provider { return ProviderRevenueCat }
func (f *pageFetcher) FetchPage(_ Context, _ FetchRequest) (Page, error) {
	if f.err != nil {
		return Page{}, f.err
	}
	page := f.pages[f.calls]
	f.calls++
	return page, nil
}

type memoryReconciler struct {
	points map[string]MetricPoint
}

func (m *memoryReconciler) UpsertMetricPoints(_ Context, points []MetricPoint) error {
	for _, point := range points {
		key := point.AppID + "|" + point.MetricKey + "|" + point.OccurredAt.Format(time.RFC3339)
		m.points[key] = point
	}
	return nil
}

func TestImporterPaginatesHistoricalData(t *testing.T) {
	from := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	point := func(day int, value float64) MetricPoint {
		return MetricPoint{
			AppID:      "app-1",
			Provider:   ProviderRevenueCat,
			MetricKey:  "revenue",
			OccurredAt: from.AddDate(0, 0, day),
			Value:      value,
			Unit:       "currency",
		}
	}
	fetcher := &pageFetcher{pages: []Page{
		{Points: []MetricPoint{point(0, 10)}, NextCursor: "page-2"},
		{Points: []MetricPoint{point(1, 12)}},
	}}
	reconciler := &memoryReconciler{points: map[string]MetricPoint{}}
	importer := Importer{Reconciler: reconciler}

	result, err := importer.Import(context.Background(), fetcher, FetchRequest{
		AppID: "app-1",
		From:  from,
		To:    from.AddDate(0, 0, 3),
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Pages != 2 || result.Points != 2 {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestImporterReconcilesHistoricalCorrections(t *testing.T) {
	from := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	reconciler := &memoryReconciler{points: map[string]MetricPoint{}}
	importer := Importer{Reconciler: reconciler}
	request := FetchRequest{AppID: "app-1", From: from, To: from.AddDate(0, 0, 2)}
	base := MetricPoint{
		AppID: "app-1", Provider: ProviderRevenueCat, MetricKey: "revenue",
		OccurredAt: from, Unit: "currency", Value: 10,
	}
	_, _ = importer.Import(context.Background(), &pageFetcher{pages: []Page{{Points: []MetricPoint{base}}}}, request)
	base.Value = 8
	_, _ = importer.Import(context.Background(), &pageFetcher{pages: []Page{{Points: []MetricPoint{base}}}}, request)

	for _, point := range reconciler.points {
		if point.Value != 8 {
			t.Fatalf("expected corrected value 8, got %v", point.Value)
		}
	}
}

func TestImporterPropagatesRateLimit(t *testing.T) {
	importer := Importer{Reconciler: &memoryReconciler{points: map[string]MetricPoint{}}}
	_, err := importer.Import(context.Background(), &pageFetcher{err: ErrRateLimited}, FetchRequest{})
	if !errors.Is(err, ErrRateLimited) {
		t.Fatalf("expected rate limit error, got %v", err)
	}
}

func TestRetryAndRetentionBoundaries(t *testing.T) {
	if RetryDelay(0) != 15*time.Second {
		t.Fatalf("unexpected first delay: %s", RetryDelay(0))
	}
	if RetryDelay(20) != 30*time.Minute {
		t.Fatalf("retry cap not applied: %s", RetryDelay(20))
	}
	now := time.Date(2026, 7, 23, 15, 0, 0, 0, time.FixedZone("local", 5*3600))
	if !RetentionCutoff(now).Equal(now.UTC().AddDate(0, 0, -90)) {
		t.Fatal("retention cutoff must use UTC")
	}
}

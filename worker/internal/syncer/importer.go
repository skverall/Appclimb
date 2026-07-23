package syncer

import (
	"errors"
	"fmt"
	"math"
	"time"
)

var ErrRateLimited = errors.New("provider rate limited")

type Importer struct {
	Reconciler Reconciler
	MaxPages   int
}

type ImportResult struct {
	Provider Provider
	Pages    int
	Points   int
}

func (i Importer) Import(ctx Context, fetcher Fetcher, request FetchRequest) (ImportResult, error) {
	maxPages := i.MaxPages
	if maxPages <= 0 {
		maxPages = 250
	}

	result := ImportResult{Provider: fetcher.Provider()}
	seenCursors := map[string]struct{}{}

	for result.Pages < maxPages {
		if err := ctx.Err(); err != nil {
			return result, err
		}

		page, err := fetcher.FetchPage(ctx, request)
		if err != nil {
			return result, fmt.Errorf("%s page %d: %w", fetcher.Provider(), result.Pages+1, err)
		}
		if err := validatePage(page, request); err != nil {
			return result, fmt.Errorf("%s page %d: %w", fetcher.Provider(), result.Pages+1, err)
		}
		if len(page.Points) > 0 {
			if err := i.Reconciler.UpsertMetricPoints(ctx, page.Points); err != nil {
				return result, fmt.Errorf("reconcile %s page %d: %w", fetcher.Provider(), result.Pages+1, err)
			}
		}

		result.Pages++
		result.Points += len(page.Points)

		if page.NextCursor == "" {
			return result, nil
		}
		if _, exists := seenCursors[page.NextCursor]; exists {
			return result, errors.New("provider returned a repeated cursor")
		}
		seenCursors[page.NextCursor] = struct{}{}
		request.Cursor = page.NextCursor
	}

	return result, errors.New("provider pagination exceeded safety limit")
}

func validatePage(page Page, request FetchRequest) error {
	for _, point := range page.Points {
		if point.AppID != request.AppID {
			return errors.New("provider returned a point for another app")
		}
		if point.MetricKey == "" || point.Unit == "" {
			return errors.New("metric key and unit are required")
		}
		if math.IsNaN(point.Value) || math.IsInf(point.Value, 0) {
			return errors.New("metric value must be finite")
		}
		if point.OccurredAt.Before(request.From) || !point.OccurredAt.Before(request.To) {
			return errors.New("metric point is outside the requested UTC window")
		}
		if point.OccurredAt.Location() != time.UTC {
			return errors.New("metric point must be normalized to UTC")
		}
	}
	return nil
}

func RetryDelay(attempt int) time.Duration {
	if attempt < 0 {
		attempt = 0
	}
	if attempt > 8 {
		attempt = 8
	}
	delay := time.Duration(math.Pow(2, float64(attempt))) * 15 * time.Second
	if delay > 30*time.Minute {
		return 30 * time.Minute
	}
	return delay
}

func RetentionCutoff(now time.Time) time.Time {
	return now.UTC().AddDate(0, 0, -90)
}

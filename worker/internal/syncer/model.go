package syncer

import "time"

type Provider string

const (
	ProviderApple      Provider = "app-store-connect"
	ProviderRevenueCat Provider = "revenuecat"
	ProviderPostHog    Provider = "posthog"
	ProviderSuperwall  Provider = "superwall"
	ProviderRank       Provider = "appclimb-rank"
)

type MetricPoint struct {
	ExternalID      string
	AppID           string
	Provider        Provider
	MetricKey       string
	OccurredAt      time.Time
	Value           float64
	Unit            string
	Dimensions      map[string]string
	SourceUpdatedAt time.Time
	Completeness    float64
}

type Page struct {
	Points     []MetricPoint
	NextCursor string
}

type FetchRequest struct {
	AppID     string
	From      time.Time
	To        time.Time
	Cursor    string
	PageLimit int
}

type Fetcher interface {
	Provider() Provider
	FetchPage(ctx Context, request FetchRequest) (Page, error)
}

// Context is the subset used by provider clients and keeps the importer easy to test.
type Context interface {
	Done() <-chan struct{}
	Err() error
}

type Reconciler interface {
	UpsertMetricPoints(ctx Context, points []MetricPoint) error
}

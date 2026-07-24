package appleanalytics

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"
)

// Navigator is the subset of *connectors.Client that this package needs. It is
// an interface so the navigation chain can be exercised against an httptest
// server without depending on the concrete client type. Method names are
// exported so types from other packages (the concrete client and its adapter)
// can implement it.
type Navigator interface {
	// GetJSON performs an authenticated GET returning a buffered JSON body.
	GetJSON(ctx context.Context, endpoint, bearerToken string) ([]byte, error)
	// Get performs an authenticated GET returning a streaming body for large
	// payloads (gzip segments). The caller closes the reader.
	Get(ctx context.Context, endpoint, bearerToken string) (io.ReadCloser, error)
	// Post performs an idempotent authenticated POST; 2xx and 409 are success.
	Post(ctx context.Context, endpoint, bearerToken string, payload []byte) error
}

// Fetch downloads Apple App Store Connect analytics for one app over [from,to)
// and returns parsed metric aggregates. It walks the report-request → reports →
// instances → segments chain, gunzipping every matching daily segment in the
// APP_STORE category. baseUrl is the App Store Connect API root (no trailing
// slash).
func Fetch(
	ctx context.Context,
	nav Navigator,
	baseURL, bearerToken, appID string,
	from, to time.Time,
	lagDays int,
	now time.Time,
) ([]Aggregate, error) {
	if err := ensureOngoingRequest(ctx, nav, baseURL, bearerToken, appID); err != nil {
		return nil, err
	}
	requestID, err := findOngoingRequest(ctx, nav, baseURL, bearerToken, appID)
	if err != nil {
		return nil, err
	}
	if requestID == "" {
		// No ONGOING request yet (Apple may take up to 24-48h to create the
		// first report after the request). Return empty rather than failing.
		return []Aggregate{}, nil
	}

	reportID, err := findReport(ctx, nav, baseURL, bearerToken, requestID, "APP_STORE")
	if err != nil {
		return nil, err
	}
	if reportID == "" {
		return []Aggregate{}, nil
	}

	segments, err := dailySegments(ctx, nav, baseURL, bearerToken, reportID, from, to)
	if err != nil {
		return nil, err
	}

	out := []Aggregate{}
	for _, segURL := range segments {
		body, err := nav.Get(ctx, segURL, bearerToken)
		if err != nil {
			return nil, err
		}
		gz, err := gzip.NewReader(body)
		if err != nil {
			body.Close()
			return nil, fmt.Errorf("apple segment gunzip: %w", err)
		}
		rows, err := Parse(gz, from, to, lagDays, now)
		gz.Close()
		body.Close()
		if err != nil {
			return nil, err
		}
		out = append(out, rows...)
	}
	return out, nil
}

// ensureOngoingRequest creates an ONGOING analytics report request for the app
// if one does not exist. Apple deduplicates by app, so a 409 ("already exists")
// is treated as success. This requests the customer's own data and does not
// mutate any external system the user owns.
func ensureOngoingRequest(
	ctx context.Context,
	nav Navigator,
	baseURL, bearerToken, appID string,
) error {
	payload, err := json.Marshal(map[string]any{
		"data": map[string]any{
			"type": "analyticsReportRequests",
			"attributes": map[string]any{
				"accessType": "ONGOING",
			},
			"relationships": map[string]any{
				"app": map[string]any{
					"data": map[string]any{
						"type": "apps",
						"id":   appID,
					},
				},
			},
		},
	})
	if err != nil {
		return err
	}
	endpoint := baseURL + "/v1/analyticsReportRequests"
	return nav.Post(ctx, endpoint, bearerToken, payload)
}

// findOngoingRequest returns the id of the app's ONGOING analytics report
// request, or "" if none exists yet. Apple lists report requests filtered by
// accessType.
func findOngoingRequest(
	ctx context.Context,
	nav Navigator,
	baseURL, bearerToken, appID string,
) (string, error) {
	params := url.Values{}
	params.Set("filter[accessType]", "ONGOING")
	params.Set("filter[app]", appID)
	endpoint := baseURL + "/v1/analyticsReportRequests?" + params.Encode()
	body, err := nav.GetJSON(ctx, endpoint, bearerToken)
	if err != nil {
		return "", err
	}
	var response struct {
		Data []struct {
			ID         string `json:"id"`
			Attributes struct {
				AccessType string `json:"accessType"`
			} `json:"attributes"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return "", fmt.Errorf("apple report request parse: %w", err)
	}
	for _, item := range response.Data {
		if strings.EqualFold(item.Attributes.AccessType, "ONGOING") {
			return item.ID, nil
		}
	}
	return "", nil
}

// findReport returns the id of the first analytics report in the requested
// category for the report request, or "" if none.
func findReport(
	ctx context.Context,
	nav Navigator,
	baseURL, bearerToken, requestID, category string,
) (string, error) {
	params := url.Values{}
	params.Set("filter[category]", category)
	endpoint := fmt.Sprintf(
		"%s/v1/analyticsReportRequests/%s/reports?%s",
		baseURL,
		url.PathEscape(requestID),
		params.Encode(),
	)
	body, err := nav.GetJSON(ctx, endpoint, bearerToken)
	if err != nil {
		return "", err
	}
	var response struct {
		Data []struct {
			ID         string `json:"id"`
			Attributes struct {
				Category string `json:"category"`
			} `json:"attributes"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return "", fmt.Errorf("apple reports parse: %w", err)
	}
	for _, item := range response.Data {
		if strings.EqualFold(item.Attributes.Category, category) {
			return item.ID, nil
		}
	}
	return "", nil
}

// dailySegments returns the download URLs for every DAILY report instance whose
// reporting date falls within [from, to). It paginates the instances endpoint.
func dailySegments(
	ctx context.Context,
	nav Navigator,
	baseURL, bearerToken, reportID string,
	from, to time.Time,
) ([]string, error) {
	endpoint := fmt.Sprintf(
		"%s/v1/analyticsReports/%s/instances?filter[frequency]=DAILY&limit=100",
		baseURL,
		url.PathEscape(reportID),
	)
	segmentURLs := []string{}
	for endpoint != "" {
		body, err := nav.GetJSON(ctx, endpoint, bearerToken)
		if err != nil {
			return nil, err
		}
		var response struct {
			Data []struct {
				ID         string `json:"id"`
				Attributes struct {
					ReportingDate string `json:"reportingDate"`
					Frequency     string `json:"frequency"`
				} `json:"attributes"`
			} `json:"data"`
			Links struct {
				Next string `json:"next"`
			} `json:"links"`
		}
		if err := json.Unmarshal(body, &response); err != nil {
			return nil, fmt.Errorf("apple instances parse: %w", err)
		}
		for _, instance := range response.Data {
			day, ok := parseDay(instance.Attributes.ReportingDate)
			if !ok {
				continue
			}
			if day.Before(from) || !day.Before(to) {
				continue
			}
			urls, err := segmentsForInstance(ctx, nav, baseURL, bearerToken, instance.ID)
			if err != nil {
				return nil, err
			}
			segmentURLs = append(segmentURLs, urls...)
		}
		endpoint = response.Links.Next
	}
	return segmentURLs, nil
}

// segmentsForInstance returns the download URLs for one report instance.
func segmentsForInstance(
	ctx context.Context,
	nav Navigator,
	baseURL, bearerToken, instanceID string,
) ([]string, error) {
	endpoint := fmt.Sprintf(
		"%s/v1/analyticsReportInstances/%s/segments?fields[analyticsReportSegments]=url,checksum,sizeInBytes",
		baseURL,
		url.PathEscape(instanceID),
	)
	body, err := nav.GetJSON(ctx, endpoint, bearerToken)
	if err != nil {
		return nil, err
	}
	var response struct {
		Data []struct {
			Attributes struct {
				URL         string `json:"url"`
				SizeInBytes int64  `json:"sizeInBytes"`
			} `json:"attributes"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("apple segments parse: %w", err)
	}
	urls := make([]string, 0, len(response.Data))
	for _, segment := range response.Data {
		if segment.Attributes.URL != "" {
			urls = append(urls, segment.Attributes.URL)
		}
	}
	return urls, nil
}

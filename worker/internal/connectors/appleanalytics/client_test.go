package appleanalytics

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// serverNav routes every request through the httptest.Server using its client.
// The bearer token is set from the argument (so callers can assert auth).
type serverNav struct{ client *http.Client }

func (n serverNav) do(ctx context.Context, method, endpoint string, body io.Reader) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer test-token")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return n.client.Do(req)
}

func (n serverNav) GetJSON(ctx context.Context, endpoint, _ string) ([]byte, error) {
	resp, err := n.do(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("getJSON: status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func (n serverNav) Get(ctx context.Context, endpoint, _ string) (io.ReadCloser, error) {
	resp, err := n.do(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		resp.Body.Close()
		return nil, fmt.Errorf("get: status %d", resp.StatusCode)
	}
	return resp.Body, nil
}

func (n serverNav) Post(ctx context.Context, endpoint, _ string, payload []byte) error {
	resp, err := n.do(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusConflict || (resp.StatusCode >= 200 && resp.StatusCode < 300) {
		return nil
	}
	return fmt.Errorf("post: status %d", resp.StatusCode)
}

// TestFetch_EndToEnd exercises the full navigation chain against a fake App
// Store Connect API: create ONGOING -> list requests -> reports -> daily
// instances -> segments -> gunzip TSV. Days outside the window are dropped.
func TestFetch_EndToEndThroughNavigationChain(t *testing.T) {
	mux := http.NewServeMux()

	// POST + GET /v1/analyticsReportRequests (create + list ONGOING).
	mux.HandleFunc("/v1/analyticsReportRequests", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			w.WriteHeader(http.StatusCreated)
			fmt.Fprint(w, `{"data":{"id":"req-1"}}`)
			return
		}
		fmt.Fprint(w, `{"data":[{"id":"req-1","attributes":{"accessType":"ONGOING"}}]}`)
	})

	mux.HandleFunc("/v1/analyticsReportRequests/req-1/reports", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"data":[{"id":"rep-1","attributes":{"category":"APP_STORE"}}]}`)
	})

	mux.HandleFunc("/v1/analyticsReports/rep-1/instances", func(w http.ResponseWriter, r *http.Request) {
		out, _ := json.Marshal(map[string]any{
			"data": []map[string]any{
				{"id": "inst-20", "attributes": map[string]any{"reportingDate": "2026-07-20", "frequency": "DAILY"}},
				{"id": "inst-21", "attributes": map[string]any{"reportingDate": "2026-07-21", "frequency": "DAILY"}},
				{"id": "inst-19", "attributes": map[string]any{"reportingDate": "2026-07-19", "frequency": "DAILY"}},
			},
		})
		w.Write(out)
	})

	mux.HandleFunc("/v1/analyticsReportInstances/", func(w http.ResponseWriter, r *http.Request) {
		// Each instance id encodes its day (inst-20 -> 2026-07-20), and its
		// segment download returns a TSV containing only that day's row —
		// mirroring how Apple splits one report instance per reporting date.
		instanceDay := ""
		for _, d := range []string{"20", "21", "19"} {
			if strings.Contains(r.URL.Path, "/inst-"+d) {
				instanceDay = "2026-07-" + d
			}
		}
		switch {
		case strings.HasSuffix(r.URL.Path, "/segments"):
			downloadURL := "http://" + r.Host + strings.TrimSuffix(r.URL.Path, "/segments") + "/download"
			out, _ := json.Marshal(map[string]any{
				"data": []map[string]any{
					{"attributes": map[string]any{"url": downloadURL, "sizeInBytes": 128}},
				},
			})
			w.Write(out)
		case strings.HasSuffix(r.URL.Path, "/download"):
			header := "App Name\tDate\timpressionsTotal\tpageViewCount\tunits\n"
			row := "TestApp\t" + instanceDay + "\t12000\t3400\t890\n"
			w.Header().Set("Content-Type", "application/gzip")
			gw := gzip.NewWriter(w)
			gw.Write([]byte(header + row))
			gw.Close()
		default:
			http.NotFound(w, r)
		}
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	rows, err := Fetch(
		context.Background(),
		serverNav{client: server.Client()},
		server.URL,
		"test-token",
		"app-123",
		day("2026-07-20"),
		day("2026-07-22"),
		2,
		time.Now(),
	)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	// 2 days in window (07-20, 07-21) x 3 metrics = 6; 07-19 dropped.
	if len(rows) != 6 {
		t.Fatalf("expected 6 aggregates, got %d", len(rows))
	}
	for _, r := range rows {
		if r.OccurredAt.Equal(day("2026-07-19")) {
			t.Fatal("out-of-window day 07-19 should have been filtered")
		}
	}
}

// TestFetch_ReturnsEmptyWhenNoOngoingRequestYet covers the 24-48h window where
// Apple has not yet created the first report after the ONGOING request.
func TestFetch_ReturnsEmptyWhenNoOngoingRequestYet(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/analyticsReportRequests", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			w.WriteHeader(http.StatusCreated)
			return
		}
		fmt.Fprint(w, `{"data":[]}`) // no ONGOING request listed yet
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	rows, err := Fetch(
		context.Background(),
		serverNav{client: server.Client()},
		server.URL,
		"test-token",
		"app-123",
		day("2026-07-20"),
		day("2026-07-22"),
		2,
		time.Now(),
	)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("expected 0 rows when no ONGOING request exists, got %d", len(rows))
	}
}

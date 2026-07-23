package httpapi

import (
	"io"
	"log/slog"
	"testing"
)

func TestHandlerRoutesDoNotConflict(t *testing.T) {
	server := &Server{
		Logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		limiter: newIPRateLimiter(1, 1),
	}
	if handler := server.Handler(); handler == nil {
		t.Fatal("handler was not created")
	}
}

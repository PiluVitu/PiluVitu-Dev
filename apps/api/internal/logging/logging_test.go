package logging_test

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/PiluVitu/api/internal/logging"
)

func TestFromContextIncludesRequestID(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))

	var seen string
	h := logging.Middleware(logger)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		logging.FromContext(r.Context()).Info("hello")
		seen = w.Header().Get("X-Request-Id")
	}))

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if seen == "" {
		t.Fatal("expected X-Request-Id header to be set")
	}
	out := buf.String()
	if !strings.Contains(out, "hello") {
		t.Fatalf("log missing message: %s", out)
	}
	var entry map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &entry); err != nil {
		t.Fatalf("log not JSON: %v (%s)", err, out)
	}
	if entry["request_id"] == nil || entry["request_id"] == "" {
		t.Fatalf("log missing request_id: %s", out)
	}
}

func TestFromContextWithoutMiddlewareReturnsDefault(t *testing.T) {
	logging.FromContext(context.Background()).Info("noop")
}

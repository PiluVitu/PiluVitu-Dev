// Package logging provides per-request structured logging via log/slog.
// Middleware attaches a request-scoped logger (enriched with request_id and,
// when available, user_id) to the request context; FromContext retrieves it.
package logging

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"
)

type ctxKey struct{}

// Middleware attaches a logger carrying the chi RequestID to every request.
func Middleware(base *slog.Logger) func(http.Handler) http.Handler {
	if base == nil {
		base = slog.Default()
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			reqID := middleware.GetReqID(r.Context())
			if reqID == "" {
				// Standalone use (no RequestID middleware ahead, e.g. tests).
				reqID = fmt.Sprintf("local-%d", time.Now().UnixNano())
			}
			w.Header().Set(middleware.RequestIDHeader, reqID)
			l := base.With("request_id", reqID)
			ctx := context.WithValue(r.Context(), ctxKey{}, l)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// FromContext returns the request-scoped logger, or slog.Default() if absent.
func FromContext(ctx context.Context) *slog.Logger {
	if l, ok := ctx.Value(ctxKey{}).(*slog.Logger); ok && l != nil {
		return l
	}
	return slog.Default()
}

// With returns a logger derived from the context logger with extra attrs.
func With(ctx context.Context, args ...any) *slog.Logger {
	return FromContext(ctx).With(args...)
}

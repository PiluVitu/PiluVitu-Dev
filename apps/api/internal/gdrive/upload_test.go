package gdrive_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"google.golang.org/api/drive/v3"
	"google.golang.org/api/option"

	"github.com/PiluVitu/api/internal/gdrive"
)

func newFakeDrive(t *testing.T, handler http.HandlerFunc) *gdrive.Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	svc, err := drive.NewService(context.Background(),
		option.WithEndpoint(srv.URL),
		option.WithoutAuthentication(),
	)
	if err != nil {
		t.Fatalf("drive.NewService: %v", err)
	}
	return gdrive.NewClientWithService(svc)
}

func TestUpload_Happy(t *testing.T) {
	var got int32
	c := newFakeDrive(t, func(w http.ResponseWriter, r *http.Request) {
		// Multipart uploads go through /upload/drive/v3/files
		if !strings.Contains(r.URL.Path, "/files") {
			t.Errorf("path = %q", r.URL.Path)
		}
		// Drain the request body so the multipart reader is fully consumed.
		_, _ = io.Copy(io.Discard, r.Body)
		atomic.AddInt32(&got, 1)
		_, _ = w.Write([]byte(`{"id":"abc","size":"42"}`))
	})
	id, size, err := c.Upload(context.Background(), "folder1", "snap.db", strings.NewReader("hello"))
	if err != nil {
		t.Fatal(err)
	}
	if id != "abc" {
		t.Errorf("id = %q", id)
	}
	if size != 42 {
		t.Errorf("size = %d", size)
	}
	if atomic.LoadInt32(&got) == 0 {
		t.Error("server never reached")
	}
}

func TestRotate_NoOpWhenUnderKeep(t *testing.T) {
	c := newFakeDrive(t, func(w http.ResponseWriter, r *http.Request) {
		// Single file present, keep=5 → no delete.
		_, _ = w.Write([]byte(`{"files":[{"id":"f1","createdTime":"2025-01-01T00:00:00Z"}]}`))
	})
	if err := c.Rotate(context.Background(), "folder1", 5); err != nil {
		t.Errorf("expected no-op, got %v", err)
	}
}

func TestRotate_DeletesOldest(t *testing.T) {
	var deletedIDs []string
	c := newFakeDrive(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet:
			// 4 files; keep=2 → delete the 2 oldest.
			_, _ = w.Write([]byte(`{"files":[
				{"id":"new1","createdTime":"2025-05-01T00:00:00Z"},
				{"id":"old1","createdTime":"2025-01-01T00:00:00Z"},
				{"id":"new2","createdTime":"2025-04-01T00:00:00Z"},
				{"id":"old2","createdTime":"2025-02-01T00:00:00Z"}
			]}`))
		case r.Method == http.MethodDelete:
			parts := strings.Split(r.URL.Path, "/")
			id := parts[len(parts)-1]
			deletedIDs = append(deletedIDs, id)
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "unexpected method", 500)
		}
	})
	if err := c.Rotate(context.Background(), "folder1", 2); err != nil {
		t.Fatal(err)
	}
	if len(deletedIDs) != 2 {
		t.Fatalf("deleted = %v", deletedIDs)
	}
	for _, id := range deletedIDs {
		if id != "old1" && id != "old2" {
			t.Errorf("unexpected deletion: %q", id)
		}
	}
}

func TestRotate_KeepZeroIsNoOp(t *testing.T) {
	c := newFakeDrive(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("rotate keep=0 should not hit the server")
	})
	if err := c.Rotate(context.Background(), "folder1", 0); err != nil {
		t.Errorf("got %v", err)
	}
}

// silence unused import
var _ io.Reader = nil

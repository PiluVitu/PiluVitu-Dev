package distribution

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDevToPublish(t *testing.T) {
	var gotKey string
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey = r.Header.Get("api-key")
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"url":"https://dev.to/me/post-123","id":1}`))
	}))
	defer srv.Close()

	a := NewDevTo("KEY")
	a.base = srv.URL
	url, err := a.Publish(context.Background(), Payload{
		Title: "T", BodyMD: "corpo", CanonicalURL: "https://blog/p", Tags: []string{"go", "ai"},
	})
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if url != "https://dev.to/me/post-123" {
		t.Fatalf("url = %q", url)
	}
	if gotKey != "KEY" {
		t.Fatalf("api-key = %q", gotKey)
	}
	art := gotBody["article"].(map[string]any)
	if art["canonical_url"] != "https://blog/p" || art["published"] != true {
		t.Fatalf("article = %+v", art)
	}
}

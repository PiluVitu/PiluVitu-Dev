package distribution

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHashnodePublish(t *testing.T) {
	var gotAuth string
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		_, _ = w.Write([]byte(`{"data":{"publishPost":{"post":{"url":"https://hn.dev/p"}}}}`))
	}))
	defer srv.Close()

	a := NewHashnode("TOK", "PUBID")
	a.base = srv.URL
	url, err := a.Publish(context.Background(), Payload{Title: "T", BodyMD: "corpo", CanonicalURL: "https://blog/p"})
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if url != "https://hn.dev/p" {
		t.Fatalf("url = %q", url)
	}
	if gotAuth != "TOK" {
		t.Fatalf("auth = %q", gotAuth)
	}
	q := gotBody["query"].(string)
	if !strings.Contains(q, "publishPost") {
		t.Fatalf("query sem publishPost: %q", q)
	}
}

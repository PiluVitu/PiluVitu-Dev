package distribution

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMastodonPublish(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer TOK" {
			t.Errorf("auth = %q", r.Header.Get("Authorization"))
		}
		_, _ = w.Write([]byte(`{"url":"https://mast.odon/@me/9","id":"9"}`))
	}))
	defer srv.Close()

	a := NewMastodon(srv.URL, "TOK")
	url, err := a.Publish(context.Background(), Payload{Text: "toot!"})
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if url != "https://mast.odon/@me/9" {
		t.Fatalf("url = %q", url)
	}
}

func TestMastodonRejectsTooLong(t *testing.T) {
	a := NewMastodon("https://x", "t")
	_, err := a.Publish(context.Background(), Payload{Text: strings.Repeat("x", 501)})
	if err == nil {
		t.Fatal("esperava erro de limite de 500 chars")
	}
}

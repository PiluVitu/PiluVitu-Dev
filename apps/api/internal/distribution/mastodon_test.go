package distribution

import (
	"context"
	"encoding/json"
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

func TestMastodonPublishWithCanonicalURL(t *testing.T) {
	var postedStatus string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode body: %v", err)
		}
		postedStatus = body["status"]
		_, _ = w.Write([]byte(`{"url":"https://mast.odon/@me/10","id":"10"}`))
	}))
	defer srv.Close()

	canonicalURL := "https://blog/artigo"
	a := NewMastodon(srv.URL, "TOK")
	hookText := "escrevi sobre algo interessante"
	url, err := a.Publish(context.Background(), Payload{Text: hookText, CanonicalURL: canonicalURL})
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if url != "https://mast.odon/@me/10" {
		t.Fatalf("url = %q", url)
	}
	// The posted status must be hook + "\n\n" + canonicalURL
	expectedStatus := hookText + "\n\n" + canonicalURL
	if postedStatus != expectedStatus {
		t.Fatalf("status = %q, want %q", postedStatus, expectedStatus)
	}
	if !strings.Contains(postedStatus, canonicalURL) {
		t.Fatalf("status missing canonical URL: %q", postedStatus)
	}
}

func TestMastodonRejectsTooLong(t *testing.T) {
	a := NewMastodon("https://x", "t")
	_, err := a.Publish(context.Background(), Payload{Text: strings.Repeat("x", 501)})
	if err == nil {
		t.Fatal("esperava erro de limite de 500 chars")
	}
}

func TestMastodonRejectsTooLongWithURL(t *testing.T) {
	a := NewMastodon("https://x", "t")
	// 490 chars hook + "\n\n" (2) + 10 chars URL = 502 > 500 → must reject
	_, err := a.Publish(context.Background(), Payload{
		Text:         strings.Repeat("x", 490),
		CanonicalURL: strings.Repeat("y", 10),
	})
	if err == nil {
		t.Fatal("esperava erro: status final excede 500 chars após URL")
	}
}

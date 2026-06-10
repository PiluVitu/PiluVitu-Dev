package distribution

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBlueskyPublish(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "createSession"):
			_, _ = w.Write([]byte(`{"accessJwt":"JWT","did":"did:plc:abc"}`))
		case strings.HasSuffix(r.URL.Path, "createRecord"):
			if r.Header.Get("Authorization") != "Bearer JWT" {
				t.Errorf("authorization = %q", r.Header.Get("Authorization"))
			}
			_, _ = w.Write([]byte(`{"uri":"at://did:plc:abc/app.bsky.feed.post/rkey9","cid":"c"}`))
		}
	}))
	defer srv.Close()

	a := NewBluesky("me.bsky.social", "app-pass")
	a.base = srv.URL
	url, err := a.Publish(context.Background(), Payload{Text: "olá mundo"})
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if url != "https://bsky.app/profile/me.bsky.social/post/rkey9" {
		t.Fatalf("url = %q", url)
	}
}

func TestBlueskyRejectsTooLong(t *testing.T) {
	a := NewBluesky("h", "p")
	_, err := a.Publish(context.Background(), Payload{Text: strings.Repeat("x", 301)})
	if err == nil {
		t.Fatal("esperava erro de limite de 300 chars")
	}
}

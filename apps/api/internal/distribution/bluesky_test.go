package distribution

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
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
	// No CanonicalURL → single createRecord call
	url, err := a.Publish(context.Background(), Payload{Text: "olá mundo"})
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if url != "https://bsky.app/profile/me.bsky.social/post/rkey9" {
		t.Fatalf("url = %q", url)
	}
}

func TestBlueskyPublishWithLinkReply(t *testing.T) {
	var createRecordCalls atomic.Int32

	// Responses for the two createRecord calls
	mainURI := "at://did:plc:abc/app.bsky.feed.post/rkey9"
	mainCID := "cid-main"

	var firstRecordBody, secondRecordBody map[string]any

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "createSession"):
			_, _ = w.Write([]byte(`{"accessJwt":"JWT","did":"did:plc:abc"}`))
		case strings.HasSuffix(r.URL.Path, "createRecord"):
			n := int(createRecordCalls.Add(1))
			var req struct {
				Record map[string]any `json:"record"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Errorf("decode createRecord body: %v", err)
			}
			if n == 1 {
				firstRecordBody = req.Record
				_, _ = w.Write([]byte(`{"uri":"` + mainURI + `","cid":"` + mainCID + `"}`))
			} else {
				secondRecordBody = req.Record
				_, _ = w.Write([]byte(`{"uri":"at://did:plc:abc/app.bsky.feed.post/rkey10","cid":"cid-reply"}`))
			}
		}
	}))
	defer srv.Close()

	canonicalURL := "https://blog/x"
	a := NewBluesky("me.bsky.social", "app-pass")
	a.base = srv.URL
	url, err := a.Publish(context.Background(), Payload{Text: "meu hook", CanonicalURL: canonicalURL})
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}

	// Returns the main post URL
	if url != "https://bsky.app/profile/me.bsky.social/post/rkey9" {
		t.Fatalf("url = %q", url)
	}

	// Must have made exactly 2 createRecord calls
	if n := createRecordCalls.Load(); n != 2 {
		t.Fatalf("createRecord calls = %d, want 2", n)
	}

	// First record: hook text, no URL
	if firstRecordBody["text"] != "meu hook" {
		t.Fatalf("first record text = %q, want %q", firstRecordBody["text"], "meu hook")
	}
	if strings.Contains(firstRecordBody["text"].(string), "http") {
		t.Fatalf("first record text must not contain URL: %q", firstRecordBody["text"])
	}

	// Second record: text is the URL
	if secondRecordBody["text"] != canonicalURL {
		t.Fatalf("second record text = %q, want %q", secondRecordBody["text"], canonicalURL)
	}

	// Second record must have facets
	facets, ok := secondRecordBody["facets"].([]any)
	if !ok || len(facets) == 0 {
		t.Fatalf("second record missing facets: %v", secondRecordBody["facets"])
	}

	// Facet must be a #link covering the whole URL (byte offsets), so the
	// reply renders as a clickable link.
	f0, _ := facets[0].(map[string]any)
	idx, _ := f0["index"].(map[string]any)
	if idx == nil || idx["byteStart"].(float64) != 0 ||
		int(idx["byteEnd"].(float64)) != len([]byte(canonicalURL)) {
		t.Fatalf("facet index = %v, want byteStart=0 byteEnd=%d", f0["index"], len([]byte(canonicalURL)))
	}
	feats, _ := f0["features"].([]any)
	if len(feats) == 0 {
		t.Fatalf("facet missing features: %v", f0["features"])
	}
	feat0, _ := feats[0].(map[string]any)
	if feat0["$type"] != "app.bsky.richtext.facet#link" || feat0["uri"] != canonicalURL {
		t.Fatalf("facet feature = %v, want #link com uri %q", feat0, canonicalURL)
	}

	// Second record must have a reply ref with correct uri/cid
	reply, ok := secondRecordBody["reply"].(map[string]any)
	if !ok {
		t.Fatalf("second record missing reply: %v", secondRecordBody["reply"])
	}
	parent, ok := reply["parent"].(map[string]any)
	if !ok {
		t.Fatalf("reply missing parent: %v", reply["parent"])
	}
	root, ok := reply["root"].(map[string]any)
	if !ok {
		t.Fatalf("reply missing root: %v", reply["root"])
	}
	if parent["uri"] != mainURI || parent["cid"] != mainCID {
		t.Fatalf("parent uri/cid = %q/%q, want %q/%q", parent["uri"], parent["cid"], mainURI, mainCID)
	}
	if root["uri"] != mainURI || root["cid"] != mainCID {
		t.Fatalf("root uri/cid = %q/%q, want %q/%q", root["uri"], root["cid"], mainURI, mainCID)
	}
}

func TestBlueskyRejectsTooLong(t *testing.T) {
	a := NewBluesky("h", "p")
	_, err := a.Publish(context.Background(), Payload{Text: strings.Repeat("x", 301)})
	if err == nil {
		t.Fatal("esperava erro de limite de 300 chars")
	}
}

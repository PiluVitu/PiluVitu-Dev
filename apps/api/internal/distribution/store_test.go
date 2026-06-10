package distribution

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s, err := NewStore(db)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	return s
}

func TestUpsertAndList(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	err := s.Upsert(ctx, Target{Slug: "post-1", Platform: "bluesky", Kind: KindSocial, Content: "oi", Status: "pending"})
	if err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	// upsert de novo na mesma (slug,platform) não duplica:
	_ = s.Upsert(ctx, Target{Slug: "post-1", Platform: "bluesky", Kind: KindSocial, Content: "oi v2", Status: "pending"})

	got, err := s.ListBySlug(ctx, "post-1")
	if err != nil {
		t.Fatalf("ListBySlug: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("len = %d, want 1", len(got))
	}
	if got[0].Content != "oi v2" {
		t.Fatalf("content = %q, want atualizado", got[0].Content)
	}
}

func TestMarkPosted(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	_ = s.Upsert(ctx, Target{Slug: "p", Platform: "devto", Kind: KindArticle, Content: "x", Status: "pending"})
	if err := s.MarkPosted(ctx, "p", "devto", "https://dev.to/a"); err != nil {
		t.Fatalf("MarkPosted: %v", err)
	}
	got, err := s.Get(ctx, "p", "devto")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Status != "posted" || got.RemoteURL != "https://dev.to/a" {
		t.Fatalf("got = %+v", got)
	}
}

func TestUpsertPreservesPostedStatus(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	_ = s.Upsert(ctx, Target{Slug: "q", Platform: "bluesky", Kind: KindSocial, Content: "v1", Status: "pending"})
	if err := s.MarkPosted(ctx, "q", "bluesky", "https://bsky.app/x"); err != nil {
		t.Fatalf("MarkPosted: %v", err)
	}
	// re-propose: must NOT demote back to pending, but content may update
	_ = s.Upsert(ctx, Target{Slug: "q", Platform: "bluesky", Kind: KindSocial, Content: "v2", Status: "pending"})
	got, err := s.Get(ctx, "q", "bluesky")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Status != "posted" {
		t.Fatalf("status = %q, want posted (re-upsert must not demote)", got.Status)
	}
}

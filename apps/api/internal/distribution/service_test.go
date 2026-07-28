package distribution

import (
	"context"
	"testing"

	pkgllm "github.com/PiluVitu/api/internal/llm"
)

type fakeHooks struct{}

func (fakeHooks) GenerateHooks(_ context.Context, _ pkgllm.Article, platforms []string) ([]pkgllm.Hook, error) {
	out := make([]pkgllm.Hook, 0, len(platforms))
	for _, p := range platforms {
		out = append(out, pkgllm.Hook{Platform: p, Text: "hook-" + p})
	}
	return out, nil
}

func TestBuildProposals(t *testing.T) {
	s := newTestStore(t)
	// adapters: 1 artigo (devto) + 1 social (bluesky)
	svc := NewService(s, fakeHooks{}, []Publisher{NewDevTo("k"), NewBluesky("h", "p")})

	art := pkgllm.Article{Title: "T", Excerpt: "e", URL: "https://blog/p", Tags: []string{"go"}}
	targets, err := svc.BuildProposals(context.Background(), "p", art, "corpo do artigo")
	if err != nil {
		t.Fatalf("BuildProposals: %v", err)
	}
	if len(targets) != 2 {
		t.Fatalf("len = %d, want 2", len(targets))
	}
	byPlat := map[string]Target{}
	for _, tgt := range targets {
		byPlat[tgt.Platform] = tgt
	}
	if byPlat["devto"].Content != "corpo do artigo" || byPlat["devto"].Kind != KindArticle {
		t.Fatalf("devto = %+v", byPlat["devto"])
	}
	if byPlat["bluesky"].Content != "hook-bluesky" || byPlat["bluesky"].Kind != KindSocial {
		t.Fatalf("bluesky = %+v", byPlat["bluesky"])
	}
	// persistiu?
	stored, _ := s.ListBySlug(context.Background(), "p")
	if len(stored) != 2 {
		t.Fatalf("stored = %d, want 2", len(stored))
	}
}

type fakePub struct {
	platform string
	kind     Kind
	calls    *int
	url      string
}

func (f fakePub) Platform() string { return f.platform }
func (f fakePub) Kind() Kind       { return f.kind }
func (f fakePub) Publish(_ context.Context, _ Payload) (string, error) {
	*f.calls++
	return f.url, nil
}

func TestPublishMarksPostedAndIsIdempotent(t *testing.T) {
	s := newTestStore(t)
	calls := 0
	pub := fakePub{platform: "mastodon", kind: KindSocial, calls: &calls, url: "https://m/1"}
	svc := NewService(s, fakeHooks{}, []Publisher{pub})

	// alvo pré-existente pending
	_ = s.Upsert(context.Background(), Target{Slug: "p", Platform: "mastodon", Kind: KindSocial, Content: "oi", Status: "pending"})

	sel := []Selected{{Platform: "mastodon", Content: "oi editado"}}
	out, err := svc.Publish(context.Background(), "p", sel)
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if calls != 1 {
		t.Fatalf("calls = %d, want 1", calls)
	}
	if got := find(out, "mastodon"); got.Status != "posted" || got.RemoteURL != "https://m/1" {
		t.Fatalf("target = %+v", got)
	}

	// segunda chamada não reposta (idempotência: já está posted)
	_, _ = svc.Publish(context.Background(), "p", sel)
	if calls != 1 {
		t.Fatalf("calls após 2ª = %d, want 1 (idempotente)", calls)
	}
}

func TestPublishRetriesFailedTarget(t *testing.T) {
	s := newTestStore(t)
	calls := 0
	pub := fakePub{platform: "bluesky", kind: KindSocial, calls: &calls, url: "https://bsky.app/retry"}
	svc := NewService(s, fakeHooks{}, []Publisher{pub})

	// seed a pending target, then mark it failed to simulate a previous attempt
	ctx := context.Background()
	_ = s.Upsert(ctx, Target{Slug: "p", Platform: "bluesky", Kind: KindSocial, Content: "draft", Status: "pending"})
	_ = s.MarkFailed(ctx, "p", "bluesky", "boom")

	// confirm it's failed before we retry
	before, _ := s.Get(ctx, "p", "bluesky")
	if before.Status != "failed" {
		t.Fatalf("pre-condition: status = %q, want failed", before.Status)
	}

	// calling Publish should retry the failed target
	sel := []Selected{{Platform: "bluesky", Content: "edited"}}
	out, err := svc.Publish(ctx, "p", sel)
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if calls != 1 {
		t.Fatalf("calls = %d, want 1 (failed target must be retried)", calls)
	}
	got := find(out, "bluesky")
	if got.Status != "posted" || got.RemoteURL != "https://bsky.app/retry" {
		t.Fatalf("target after retry = %+v", got)
	}
}

func find(ts []Target, plat string) Target {
	for _, t := range ts {
		if t.Platform == plat {
			return t
		}
	}
	return Target{}
}

package tmdb_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/PiluVitu/api/internal/tmdb"
)

func newServer(t *testing.T, handler http.HandlerFunc) *tmdb.Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return tmdb.NewClientWithBase(srv.URL, "test-key")
}

func TestSearchPoster_FilmeHappy(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/3/search/movie") {
			t.Errorf("path = %q, want /3/search/movie", r.URL.Path)
		}
		if r.URL.Query().Get("api_key") != "test-key" {
			t.Errorf("api_key missing")
		}
		_, _ = w.Write([]byte(`{"results":[{"id":550,"poster_path":"/abc.jpg"},{"id":777,"poster_path":"/xyz.jpg"}]}`))
	})
	url, id, err := c.SearchPoster(context.Background(), "Fight Club", "filme")
	if err != nil {
		t.Fatal(err)
	}
	if id != 550 {
		t.Errorf("id = %d, want 550 (first result)", id)
	}
	if url != "https://image.tmdb.org/t/p/w500/abc.jpg" {
		t.Errorf("url = %q", url)
	}
}

func TestSearchPoster_SerieHappy(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/3/search/tv") {
			t.Errorf("path = %q, want /3/search/tv for serie type", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"results":[{"id":1396,"poster_path":"/breakingbad.jpg"}]}`))
	})
	url, id, _ := c.SearchPoster(context.Background(), "Breaking Bad", "serie")
	if id != 1396 || !strings.HasSuffix(url, "/breakingbad.jpg") {
		t.Errorf("got url=%q id=%d", url, id)
	}
}

func TestSearchPoster_NoResultsFailSoft(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"results":[]}`))
	})
	url, id, err := c.SearchPoster(context.Background(), "Nope", "filme")
	if err != nil {
		t.Errorf("expected nil error on empty results (fail-soft), got %v", err)
	}
	if url != "" || id != 0 {
		t.Errorf("expected empty url+id, got %q %d", url, id)
	}
}

func TestSearchPoster_NullPosterFailSoft(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"results":[{"id":1,"poster_path":null}]}`))
	})
	url, id, err := c.SearchPoster(context.Background(), "x", "filme")
	if err != nil {
		t.Fatal(err)
	}
	if id != 1 {
		t.Errorf("id should still come back when poster missing, got %d", id)
	}
	if url != "" {
		t.Errorf("url should be empty when poster_path is null, got %q", url)
	}
}

func TestSearchPoster_HTTP500Errors(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})
	_, _, err := c.SearchPoster(context.Background(), "x", "filme")
	if err == nil {
		t.Error("expected error on 500 from TMDb")
	}
}

func TestSearchPoster_404FailSoft(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	url, id, err := c.SearchPoster(context.Background(), "x", "filme")
	if err != nil {
		t.Errorf("404 should be soft, got err=%v", err)
	}
	if url != "" || id != 0 {
		t.Errorf("got %q %d", url, id)
	}
}

func TestSearchPoster_UnknownTypeDefaultsToMovie(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/3/search/movie") {
			t.Errorf("default endpoint should be /3/search/movie, got %q", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"results":[]}`))
	})
	_, _, _ = c.SearchPoster(context.Background(), "x", "anything-else")
}

package votacao_test

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	handlersvotacao "github.com/PiluVitu/api/internal/handlers/votacao"
	"github.com/PiluVitu/api/internal/votacao"
)

type stubSheets struct {
	categories []string
	categErr   error
	movies     []votacao.SheetMovie
	moviesErr  error
}

func (s *stubSheets) GetCategories(ctx context.Context) ([]string, error) {
	return s.categories, s.categErr
}
func (s *stubSheets) ReadMovies(ctx context.Context) ([]votacao.SheetMovie, error) {
	return s.movies, s.moviesErr
}

type stubPosters struct {
	url string
	id  int64
	err error
}

func (s *stubPosters) SearchPoster(ctx context.Context, title, mediaType string) (string, int64, error) {
	return s.url, s.id, s.err
}

func newHandlers(t *testing.T, sheets handlersvotacao.SheetsReader, posters handlersvotacao.PosterSearcher) *handlersvotacao.Handlers {
	t.Helper()
	return handlersvotacao.NewHandlers(handlersvotacao.Deps{
		Sheets:  sheets,
		Posters: posters,
	})
}

func TestCategorias_ReturnsList(t *testing.T) {
	h := newHandlers(t, &stubSheets{categories: []string{"ação", "comédia", "drama"}}, &stubPosters{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/votacao/categorias", nil)
	h.GetCategorias(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var body struct {
		Categories []string `json:"categories"`
	}
	unwrap(t, rec, &body)
	if len(body.Categories) != 3 || body.Categories[0] != "ação" {
		t.Errorf("body = %+v", body)
	}
}

func TestCategorias_SheetsError(t *testing.T) {
	h := newHandlers(t, &stubSheets{categErr: errors.New("boom")}, &stubPosters{})
	rec := httptest.NewRecorder()
	h.GetCategorias(rec, httptest.NewRequest(http.MethodGet, "/votacao/categorias", nil))
	if rec.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", rec.Code)
	}
}

func TestCategorias_SheetsDisabled(t *testing.T) {
	h := handlersvotacao.NewHandlers(handlersvotacao.Deps{})
	rec := httptest.NewRecorder()
	h.GetCategorias(rec, httptest.NewRequest(http.MethodGet, "/votacao/categorias", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", rec.Code)
	}
}

var (
	_ = io.Discard
	_ = strings.TrimSpace
)

package votacao_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/PiluVitu/api/internal/auth"
	handlersvotacao "github.com/PiluVitu/api/internal/handlers/votacao"
	"github.com/PiluVitu/api/internal/votacao"
)

func openTestStore(t *testing.T) *votacao.Store {
	t.Helper()
	s, err := votacao.NewStore(filepath.Join(t.TempDir(), "x.db"))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func makeAdmin(t *testing.T, store *votacao.Store) *votacao.User {
	u, err := store.UpsertUser(context.Background(), "sub", "admin@x.com", "Admin", "", []string{"admin@x.com"})
	if err != nil {
		t.Fatal(err)
	}
	return u
}

func newH(t *testing.T, sheets handlersvotacao.SheetsReader, posters handlersvotacao.PosterSearcher, store *votacao.Store) *handlersvotacao.Handlers {
	return handlersvotacao.NewHandlers(handlersvotacao.Deps{
		Store: store, Sheets: sheets, Posters: posters,
	})
}

func requestWithUser(r *http.Request, u *votacao.User) *http.Request {
	return r.WithContext(auth.WithUserForTests(r.Context(), u))
}

func TestCreateSession_HappyPath(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)

	sheets := &stubSheets{
		movies: []votacao.SheetMovie{
			{Number: 1, Title: "A", Type: "filme", Category: "terror"},
			{Number: 2, Title: "B", Type: "filme", Category: "drama"},
		},
	}
	posters := &stubPosters{url: "http://poster", id: 42}
	h := newH(t, sheets, posters, store)

	body := strings.NewReader(`{"title":"Sexta","types":["filme"],"include_watched":true}`)
	req := httptest.NewRequest(http.MethodPost, "/votacao/sessions", body)
	rec := httptest.NewRecorder()
	h.CreateSession(rec, requestWithUser(req, admin))

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var out struct {
		Session *votacao.VotingSession `json:"session"`
		Movies  []votacao.SessionMovie `json:"movies"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Session == nil || out.Session.Title != "Sexta" {
		t.Errorf("session = %+v", out.Session)
	}
	if len(out.Movies) != 2 {
		t.Fatalf("movies len = %d, want 2", len(out.Movies))
	}
	for _, m := range out.Movies {
		if m.PosterURL != "http://poster" {
			t.Errorf("poster missing: %+v", m)
		}
		if m.TMDbID == nil || *m.TMDbID != 42 {
			t.Errorf("tmdb id missing: %+v", m)
		}
	}
}

func TestCreateSession_NoCandidates_422(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	sheets := &stubSheets{movies: []votacao.SheetMovie{{Title: "x", Type: "filme", Category: "terror", Watched: true}}}
	h := newH(t, sheets, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/votacao/sessions",
		bytes.NewReader([]byte(`{"title":"x","include_watched":false}`)))
	h.CreateSession(rec, requestWithUser(req, admin))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestCreateSession_InvalidJSON_400(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/votacao/sessions", strings.NewReader("not json"))
	h.CreateSession(rec, requestWithUser(req, admin))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestCreateSession_TitleRequired_400(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	h := newH(t, &stubSheets{movies: []votacao.SheetMovie{{Title: "x", Type: "filme", Category: "terror"}}}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/votacao/sessions", strings.NewReader(`{}`))
	h.CreateSession(rec, requestWithUser(req, admin))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestListSessions(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	_, _ = store.CreateVotingSession(context.Background(), "S1", admin.ID, "{}")
	_, _ = store.CreateVotingSession(context.Background(), "S2", admin.ID, "{}")
	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	h.ListSessions(rec, httptest.NewRequest(http.MethodGet, "/votacao/sessions", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var out struct {
		Sessions []votacao.VotingSession `json:"sessions"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if len(out.Sessions) != 2 {
		t.Errorf("got %d", len(out.Sessions))
	}
}

func TestGetSession_HappyPath(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	sess, _ := store.CreateVotingSession(context.Background(), "X", admin.ID, "{}")
	h := newH(t, &stubSheets{}, &stubPosters{}, store)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/votacao/sessions/1", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	h.GetSession(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var out struct {
		Session *votacao.VotingSession `json:"session"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out.Session == nil || out.Session.ID != sess.ID {
		t.Errorf("session mismatch")
	}
}

func TestGetSession_NotFound_404(t *testing.T) {
	store := openTestStore(t)
	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/votacao/sessions/999", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "999")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	h.GetSession(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d", rec.Code)
	}
}

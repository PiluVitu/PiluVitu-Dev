package votacao_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/PiluVitu/api/internal/auth"
	"github.com/PiluVitu/api/internal/votacao"
)

func reqWithID(method, id, body string, user *votacao.User) *http.Request {
	req := httptest.NewRequest(method, "/x", strings.NewReader(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	if user != nil {
		ctx = auth.WithUserForTests(ctx, user)
	}
	return req.WithContext(ctx)
}

func setupSessionWithMovie(t *testing.T, store *votacao.Store, admin *votacao.User) (*votacao.VotingSession, *votacao.SessionMovie) {
	t.Helper()
	sess, err := store.CreateVotingSession(context.Background(), "X", admin.ID, "{}")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.InsertSessionMovies(context.Background(), []votacao.SessionMovie{
		{SessionID: sess.ID, Category: "terror", Title: "M", Type: "filme"},
	}); err != nil {
		t.Fatal(err)
	}
	movies, _ := store.GetSessionMovies(context.Background(), sess.ID)
	return sess, &movies[0]
}

func TestCreateVote_HappyPath(t *testing.T) {
	store := openTestStore(t)
	user := makeAdmin(t, store)
	sess, movie := setupSessionWithMovie(t, store, user)
	h := newH(t, &stubSheets{}, &stubPosters{}, store)

	body := `{"movie_id":` + intStr(movie.ID) + `}`
	rec := httptest.NewRecorder()
	h.CreateVote(rec, reqWithID(http.MethodPost, intStr(sess.ID), body, user))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestCreateVote_DuplicateReturns409(t *testing.T) {
	store := openTestStore(t)
	user := makeAdmin(t, store)
	sess, movie := setupSessionWithMovie(t, store, user)
	h := newH(t, &stubSheets{}, &stubPosters{}, store)

	_ = store.InsertVote(context.Background(), sess.ID, user.ID, movie.ID)
	body := `{"movie_id":` + intStr(movie.ID) + `}`
	rec := httptest.NewRecorder()
	h.CreateVote(rec, reqWithID(http.MethodPost, intStr(sess.ID), body, user))
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d, want 409", rec.Code)
	}
}

func TestCreateVote_NoMovieID_400(t *testing.T) {
	store := openTestStore(t)
	user := makeAdmin(t, store)
	sess, _ := setupSessionWithMovie(t, store, user)
	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	h.CreateVote(rec, reqWithID(http.MethodPost, intStr(sess.ID), `{}`, user))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestCloseSession_ComputesWinner(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	sess, movie := setupSessionWithMovie(t, store, admin)
	_ = store.InsertVote(context.Background(), sess.ID, admin.ID, movie.ID)

	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	h.CloseSession(rec, reqWithID(http.MethodPost, intStr(sess.ID), "", admin))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var out struct {
		Winner *int64 `json:"winner_movie_id"`
	}
	unwrap(t, rec, &out)
	if out.Winner == nil || *out.Winner != movie.ID {
		t.Errorf("winner = %v, want %d", out.Winner, movie.ID)
	}

	got, _ := store.GetVotingSession(context.Background(), sess.ID)
	if got.Status != "closed" {
		t.Errorf("status = %q", got.Status)
	}
}

func TestCloseSession_AlreadyClosed_404(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	sess, _ := setupSessionWithMovie(t, store, admin)
	_ = store.CloseVotingSession(context.Background(), sess.ID, nil)

	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	h.CloseSession(rec, reqWithID(http.MethodPost, intStr(sess.ID), "", admin))
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d", rec.Code)
	}
}

// setupTiedClosedSession builds a closed session where two movies tie 1–1.
func setupTiedClosedSession(t *testing.T, store *votacao.Store, admin *votacao.User) *votacao.VotingSession {
	t.Helper()
	ctx := context.Background()
	user2, _ := store.UpsertUser(ctx, "u2", "u2@x.com", "U2", "", nil)
	sess, err := store.CreateVotingSession(ctx, "Sexta", admin.ID, "{}")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.InsertSessionMovies(ctx, []votacao.SessionMovie{
		{SessionID: sess.ID, Category: "terror", Title: "A", Type: "filme"},
		{SessionID: sess.ID, Category: "drama", Title: "B", Type: "filme"},
	}); err != nil {
		t.Fatal(err)
	}
	movies, _ := store.GetSessionMovies(ctx, sess.ID)
	_ = store.InsertVote(ctx, sess.ID, admin.ID, movies[0].ID)
	_ = store.InsertVote(ctx, sess.ID, user2.ID, movies[1].ID)
	if err := store.CloseVotingSession(ctx, sess.ID, nil); err != nil {
		t.Fatal(err)
	}
	return sess
}

func TestCreateRunoff_TieCreatesNewSessionWithTiedMovies(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	sess := setupTiedClosedSession(t, store, admin)

	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	h.CreateRunoff(rec, reqWithID(http.MethodPost, intStr(sess.ID), "", admin))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var out struct {
		Session *votacao.VotingSession `json:"session"`
		Movies  []votacao.SessionMovie `json:"movies"`
	}
	unwrap(t, rec, &out)
	if out.Session == nil || out.Session.Title != "Desempate — Sexta" {
		t.Errorf("session = %+v", out.Session)
	}
	if out.Session != nil && out.Session.Status != "open" {
		t.Errorf("runoff should be open, got %q", out.Session.Status)
	}
	if len(out.Movies) != 2 {
		t.Errorf("movies = %d, want 2 (the tied ones)", len(out.Movies))
	}
}

func TestCreateRunoff_NoTie_422(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	sess, movie := setupSessionWithMovie(t, store, admin)
	_ = store.InsertVote(context.Background(), sess.ID, admin.ID, movie.ID)
	_ = store.CloseVotingSession(context.Background(), sess.ID, nil)

	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	h.CreateRunoff(rec, reqWithID(http.MethodPost, intStr(sess.ID), "", admin))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("status = %d, want 422", rec.Code)
	}
}

func TestCreateRunoff_OpenSession_409(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	sess, _ := setupSessionWithMovie(t, store, admin)

	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	h.CreateRunoff(rec, reqWithID(http.MethodPost, intStr(sess.ID), "", admin))
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d, want 409", rec.Code)
	}
}

func TestListSessionVotes_AdminSeesWhoVotedWhat(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	sess, movie := setupSessionWithMovie(t, store, admin)
	_ = store.InsertVote(context.Background(), sess.ID, admin.ID, movie.ID)

	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	h.ListSessionVotes(rec, reqWithID(http.MethodGet, intStr(sess.ID), "", admin))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var out struct {
		Votes []struct {
			UserName   string `json:"user_name"`
			MovieTitle string `json:"movie_title"`
		} `json:"votes"`
		Total int `json:"total"`
	}
	unwrap(t, rec, &out)
	if out.Total != 1 || len(out.Votes) != 1 {
		t.Fatalf("votes = %+v, total = %d", out.Votes, out.Total)
	}
	if out.Votes[0].UserName != "Admin" || out.Votes[0].MovieTitle != "M" {
		t.Errorf("detail = %+v", out.Votes[0])
	}
}

func TestGetResults_Tally(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	sess, movie := setupSessionWithMovie(t, store, admin)
	user2, _ := store.UpsertUser(context.Background(), "u2", "u2@x.com", "u2", "", nil)
	_ = store.InsertVote(context.Background(), sess.ID, admin.ID, movie.ID)
	_ = store.InsertVote(context.Background(), sess.ID, user2.ID, movie.ID)

	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	h.GetResults(rec, reqWithID(http.MethodGet, intStr(sess.ID), "", admin))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var out struct {
		Results []struct {
			MovieID int64 `json:"movie_id"`
			Count   int   `json:"count"`
		} `json:"results"`
		TotalVotes int `json:"total_votes"`
	}
	unwrap(t, rec, &out)
	if out.TotalVotes != 2 {
		t.Errorf("total = %d", out.TotalVotes)
	}
	if len(out.Results) != 1 || out.Results[0].Count != 2 {
		t.Errorf("results = %+v", out.Results)
	}
}

func intStr(i int64) string {
	return strconvFormatInt(i)
}

// strconvFormatInt avoids re-importing strconv in this test file when other
// helpers already provide enough — keeps imports tidy.
func strconvFormatInt(i int64) string {
	const digits = "0123456789"
	if i == 0 {
		return "0"
	}
	negative := i < 0
	if negative {
		i = -i
	}
	out := ""
	for i > 0 {
		out = string(digits[i%10]) + out
		i /= 10
	}
	if negative {
		out = "-" + out
	}
	return out
}

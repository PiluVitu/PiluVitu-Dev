package votacao_test

import (
	"context"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTiebreak_PicksAmongTiedAndPersists(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	v2, err := store.UpsertUser(context.Background(), "sub-tb2", "tb2@x.com", "TB2", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	sess, movies := setupSessionWithMovies(t, store, admin, "Ação", "Drama")
	ctx := context.Background()
	_ = store.ReplaceUserVotes(ctx, sess.ID, admin.ID, []int64{movies[0].ID})
	_ = store.ReplaceUserVotes(ctx, sess.ID, v2.ID, []int64{movies[1].ID})
	// Close it first (tie → winner null).
	_ = store.CloseVotingSession(ctx, sess.ID, nil)

	entropy := hex.EncodeToString(make([]byte, 32)) // 64 hex chars
	body := `{"entropy":"` + entropy + `"}`
	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	h.Tiebreak(rec, reqWithID(http.MethodPost, intStr(sess.ID), body, admin))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var out struct {
		WinnerMovieID int64   `json:"winner_movie_id"`
		TiedMovieIDs  []int64 `json:"tied_movie_ids"`
		ServerNonce   string  `json:"server_nonce"`
	}
	unwrap(t, rec, &out)
	if out.WinnerMovieID != movies[0].ID && out.WinnerMovieID != movies[1].ID {
		t.Fatalf("winner must be one of the tied movies, got %d", out.WinnerMovieID)
	}
	if out.ServerNonce == "" {
		t.Fatal("server_nonce must be returned for audit")
	}
	// Winner persisted on the session.
	got, _ := store.GetVotingSession(ctx, sess.ID)
	if got.WinnerMovieID == nil || *got.WinnerMovieID != out.WinnerMovieID {
		t.Fatalf("winner not persisted: %+v", got)
	}
	// Audit row written.
	if _, err := store.GetTiebreakBySession(ctx, sess.ID); err != nil {
		t.Fatalf("tiebreak audit row missing: %v", err)
	}
}

func TestTiebreak_RejectsNoTie(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	sess, movies := setupSessionWithMovies(t, store, admin, "Ação", "Drama")
	ctx := context.Background()
	_ = store.ReplaceUserVotes(ctx, sess.ID, admin.ID, []int64{movies[0].ID}) // clear winner
	_ = store.CloseVotingSession(ctx, sess.ID, &movies[0].ID)

	entropy := hex.EncodeToString(make([]byte, 32))
	body := `{"entropy":"` + entropy + `"}`
	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	h.Tiebreak(rec, reqWithID(http.MethodPost, intStr(sess.ID), body, admin))

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422 no_tie, got %d (%s)", rec.Code, rec.Body.String())
	}
}

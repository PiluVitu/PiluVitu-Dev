package httpx_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/PiluVitu/api/internal/httpx"
)

func decode(t *testing.T, rr *httptest.ResponseRecorder) httpx.Envelope {
	t.Helper()
	if ct := rr.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}
	var env httpx.Envelope
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode body %q: %v", rr.Body.String(), err)
	}
	return env
}

func TestData(t *testing.T) {
	rr := httptest.NewRecorder()
	httpx.Data(rr, http.StatusOK, map[string]any{"hello": "world"})

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d", rr.Code)
	}
	env := decode(t, rr)
	if !env.OK {
		t.Error("ok = false, want true")
	}
	if env.Notifications == nil {
		t.Error("notifications is null, want []")
	}
	if len(env.Notifications) != 0 {
		t.Errorf("notifications = %v, want empty", env.Notifications)
	}
	data, ok := env.Data.(map[string]any)
	if !ok || data["hello"] != "world" {
		t.Errorf("data = %v", env.Data)
	}
}

func TestDataNilStillSerializesNotificationsAsArray(t *testing.T) {
	rr := httptest.NewRecorder()
	httpx.Data(rr, http.StatusCreated, nil)

	// Raw assertion: notifications must be [] not null, data must be null.
	if got := rr.Body.String(); got == "" {
		t.Fatal("empty body")
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(rr.Body.Bytes(), &raw); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if string(raw["notifications"]) != "[]" {
		t.Errorf("notifications raw = %s, want []", raw["notifications"])
	}
	if string(raw["data"]) != "null" {
		t.Errorf("data raw = %s, want null", raw["data"])
	}
}

func TestDataMsg(t *testing.T) {
	rr := httptest.NewRecorder()
	httpx.DataMsg(rr, http.StatusCreated, nil, httpx.Success("Voto registrado"))

	env := decode(t, rr)
	if !env.OK {
		t.Error("ok = false")
	}
	if len(env.Notifications) != 1 {
		t.Fatalf("notifications len = %d", len(env.Notifications))
	}
	n := env.Notifications[0]
	if n.Type != httpx.NotifySuccess || n.Message != "Voto registrado" {
		t.Errorf("notification = %+v", n)
	}
}

func TestError(t *testing.T) {
	rr := httptest.NewRecorder()
	httpx.Error(rr, http.StatusConflict, "already_voted", "Você já votou nesta sessão")

	if rr.Code != http.StatusConflict {
		t.Fatalf("status = %d", rr.Code)
	}
	env := decode(t, rr)
	if env.OK {
		t.Error("ok = true, want false")
	}
	if env.Data != nil {
		t.Errorf("data = %v, want nil", env.Data)
	}
	if len(env.Notifications) != 1 {
		t.Fatalf("notifications len = %d", len(env.Notifications))
	}
	n := env.Notifications[0]
	if n.Type != httpx.NotifyError {
		t.Errorf("type = %q, want error", n.Type)
	}
	if n.Code != "already_voted" {
		t.Errorf("code = %q", n.Code)
	}
	if n.Message != "Você já votou nesta sessão" {
		t.Errorf("message = %q", n.Message)
	}
}

func TestErrors(t *testing.T) {
	rr := httptest.NewRecorder()
	httpx.Errors(rr, http.StatusBadRequest,
		httpx.Notification{Type: httpx.NotifyError, Code: "title_required", Message: "Informe o título", Field: "title"},
		httpx.Notification{Type: httpx.NotifyError, Code: "type_required", Message: "Selecione um tipo", Field: "types"},
	)

	env := decode(t, rr)
	if env.OK {
		t.Error("ok = true, want false")
	}
	if len(env.Notifications) != 2 {
		t.Fatalf("notifications len = %d", len(env.Notifications))
	}
	if env.Notifications[0].Field != "title" || env.Notifications[1].Field != "types" {
		t.Errorf("fields = %q, %q", env.Notifications[0].Field, env.Notifications[1].Field)
	}
}

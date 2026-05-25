package votacao_test

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

// unwrap decodes the standard {ok,data,notifications} envelope and unmarshals
// the `data` field into target. Centralizes the envelope shape so individual
// tests keep asserting on their own payload structs.
func unwrap(t *testing.T, rec *httptest.ResponseRecorder, target any) {
	t.Helper()
	var env struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode envelope: %v (body=%s)", err, rec.Body.String())
	}
	if target == nil {
		return
	}
	if err := json.Unmarshal(env.Data, target); err != nil {
		t.Fatalf("decode data: %v (data=%s)", err, env.Data)
	}
}

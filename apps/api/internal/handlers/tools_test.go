package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/PiluVitu/api/internal/handlers"
)

type apiResp struct {
	OK     bool            `json:"ok"`
	Result json.RawMessage `json:"result"`
	Error  string          `json:"error"`
}

func TestValidateCPFHandler(t *testing.T) {
	body := `{"value":"529.982.247-25"}`
	req := httptest.NewRequest(http.MethodPost, "/tools/cpf/validate", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	handlers.ValidateCPF(w, req)
	var resp apiResp
	json.NewDecoder(w.Body).Decode(&resp)
	if !resp.OK {
		t.Fatalf("esperado ok=true")
	}
	var result bool
	json.Unmarshal(resp.Result, &result)
	if !result {
		t.Error("CPF válido retornou false")
	}
}

func TestValidateCPFHandlerInvalid(t *testing.T) {
	body := `{"value":"111.111.111-11"}`
	req := httptest.NewRequest(http.MethodPost, "/tools/cpf/validate", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	handlers.ValidateCPF(w, req)
	var resp apiResp
	json.NewDecoder(w.Body).Decode(&resp)
	if !resp.OK {
		t.Fatalf("handler deve retornar ok=true mesmo para CPF inválido (ok indica sucesso da request)")
	}
	var result bool
	json.Unmarshal(resp.Result, &result)
	if result {
		t.Error("CPF inválido retornou true")
	}
}

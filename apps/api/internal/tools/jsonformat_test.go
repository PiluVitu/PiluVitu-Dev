package tools_test

import (
	"testing"

	"github.com/PiluVitu/api/internal/tools"
)

func TestFormatJSON(t *testing.T) {
	result := tools.FormatJSON(`{"b":2,"a":1}`, 2)
	if !result.OK {
		t.Fatalf("FormatJSON: esperado ok=true, got error=%q", result.Error)
	}
	if result.Value == "" {
		t.Error("FormatJSON: valor vazio")
	}
}

func TestFormatJSONInvalid(t *testing.T) {
	result := tools.FormatJSON(`{invalid}`, 2)
	if result.OK {
		t.Error("FormatJSON: esperado ok=false para JSON inválido")
	}
	if result.Error == "" {
		t.Error("FormatJSON: esperado mensagem de erro")
	}
}

func TestMinifyJSON(t *testing.T) {
	result := tools.MinifyJSON(`{ "a" : 1 , "b" : 2 }`)
	if !result.OK || result.Value != `{"a":1,"b":2}` {
		t.Errorf("MinifyJSON: got %+v", result)
	}
}

func TestValidateJSON(t *testing.T) {
	if ok, _ := tools.ValidateJSON(`{"a":1}`); !ok {
		t.Error("ValidateJSON: JSON válido retornou false")
	}
	if ok, msg := tools.ValidateJSON(`{bad}`); ok || msg == "" {
		t.Error("ValidateJSON: JSON inválido retornou true ou sem mensagem")
	}
}

package tools_test

import (
	"strings"
	"testing"

	"github.com/PiluVitu/api/internal/tools"
)

func TestValidarCNPJ(t *testing.T) {
	tests := []struct {
		input string
		want  bool
	}{
		{"11.222.333/0001-81", true},
		{"11.222.333/0001-82", false},
		{"11.111.111/1111-11", false},
		{"abc", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := tools.ValidarCNPJ(tt.input); got != tt.want {
			t.Errorf("ValidarCNPJ(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestGerarCNPJ(t *testing.T) {
	for i := 0; i < 20; i++ {
		cnpj := tools.GerarCNPJ()
		if !tools.ValidarCNPJ(cnpj) {
			t.Errorf("GerarCNPJ() = %q: não é válido", cnpj)
		}
		if !strings.Contains(cnpj, "/") {
			t.Errorf("GerarCNPJ() = %q: formato esperado XX.XXX.XXX/XXXX-XX", cnpj)
		}
	}
}

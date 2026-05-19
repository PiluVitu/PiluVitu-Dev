package tools_test

import (
	"strings"
	"testing"

	"github.com/PiluVitu/api/internal/tools"
)

func TestValidarCPF(t *testing.T) {
	tests := []struct {
		input string
		want  bool
	}{
		{"529.982.247-25", true},
		{"529.982.247-26", false},
		{"111.111.111-11", false},
		{"abc", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := tools.ValidarCPF(tt.input); got != tt.want {
			t.Errorf("ValidarCPF(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestGerarCPF(t *testing.T) {
	for i := 0; i < 20; i++ {
		cpf := tools.GerarCPF()
		if !tools.ValidarCPF(cpf) {
			t.Errorf("GerarCPF() = %q: não é válido", cpf)
		}
		if !strings.Contains(cpf, ".") || !strings.Contains(cpf, "-") {
			t.Errorf("GerarCPF() = %q: formato esperado XXX.XXX.XXX-XX", cpf)
		}
	}
}

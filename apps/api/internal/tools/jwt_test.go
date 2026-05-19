package tools_test

import (
	"testing"

	"github.com/PiluVitu/api/internal/tools"
)

const validToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"

func TestDecodeJWT(t *testing.T) {
	parts, err := tools.DecodeJWT(validToken)
	if err != nil {
		t.Fatalf("DecodeJWT error: %v", err)
	}
	if parts.Header["alg"] != "HS256" {
		t.Errorf("header.alg = %v, want HS256", parts.Header["alg"])
	}
	if parts.Payload["sub"] != "1234567890" {
		t.Errorf("payload.sub = %v, want 1234567890", parts.Payload["sub"])
	}
	if parts.Signature == "" {
		t.Error("signature vazia")
	}
}

func TestDecodeJWTInvalid(t *testing.T) {
	_, err := tools.DecodeJWT("apenas.duas")
	if err == nil {
		t.Error("esperado erro para token inválido")
	}
}

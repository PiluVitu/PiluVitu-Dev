package tools_test

import (
	"testing"

	"github.com/PiluVitu/api/internal/tools"
)

func TestBase64RoundTrip(t *testing.T) {
	inputs := []string{"hello", "PiluVitu Dev", "abc123!@#", ""}
	for _, input := range inputs {
		encoded := tools.EncodeBase64(input)
		decoded, err := tools.DecodeBase64(encoded)
		if err != nil {
			t.Errorf("DecodeBase64(%q) error: %v", encoded, err)
		}
		if decoded != input {
			t.Errorf("round-trip %q → %q → %q", input, encoded, decoded)
		}
	}
}

func TestDecodeBase64Invalid(t *testing.T) {
	_, err := tools.DecodeBase64("not-valid-base64!!!")
	if err == nil {
		t.Error("expected error for invalid base64, got nil")
	}
}

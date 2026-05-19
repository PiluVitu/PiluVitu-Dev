package tools_test

import (
	"testing"

	"github.com/PiluVitu/api/internal/tools"
)

func TestDecodeQRFromBytes(t *testing.T) {
	// Generate a QR then decode it to verify round-trip
	text := "https://piluvitu.dev"
	png, err := tools.EncodeQR(text, 256)
	if err != nil {
		t.Fatalf("EncodeQR error: %v", err)
	}
	decoded, err := tools.DecodeQRFromBytes(png)
	if err != nil {
		t.Fatalf("DecodeQRFromBytes error: %v", err)
	}
	if decoded != text {
		t.Errorf("round-trip: got %q, want %q", decoded, text)
	}
}

package tools_test

import (
	"bytes"
	"testing"

	"github.com/PiluVitu/api/internal/tools"
)

func TestEncodeQR(t *testing.T) {
	png, err := tools.EncodeQR("https://piluvitu.dev", 256)
	if err != nil {
		t.Fatalf("EncodeQR error: %v", err)
	}
	// PNG magic bytes: 89 50 4E 47
	if !bytes.HasPrefix(png, []byte{0x89, 0x50, 0x4E, 0x47}) {
		t.Errorf("EncodeQR: bytes não correspondem a PNG (got %x...)", png[:4])
	}
}

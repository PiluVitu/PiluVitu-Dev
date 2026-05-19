package tools_test

import (
	"regexp"
	"testing"

	"github.com/PiluVitu/api/internal/tools"
)

func TestGenerateUUID(t *testing.T) {
	re := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		u := tools.GenerateUUID()
		if !re.MatchString(u) {
			t.Errorf("GenerateUUID() = %q: não é UUID v4 válido", u)
		}
		if seen[u] {
			t.Errorf("UUID duplicado: %q", u)
		}
		seen[u] = true
	}
}

package auth_test

import (
	"context"
	"errors"
	"net/http/cookiejar"
	"testing"

	"golang.org/x/oauth2"

	"github.com/PiluVitu/api/internal/auth"
)

func newJar(t *testing.T) *cookiejar.Jar {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookiejar: %v", err)
	}
	return jar
}

type stubExchanger struct {
	authURLFmt string                                            // e.g. "https://accounts.example.com/o?state="
	exchangeFn func(ctx context.Context, code string) (*oauth2.Token, error)
}

func (s *stubExchanger) AuthCodeURL(state string) string {
	if s.authURLFmt == "" {
		return "https://accounts.example.com/o?state=" + state
	}
	return s.authURLFmt + state
}

func (s *stubExchanger) Exchange(ctx context.Context, code string) (*oauth2.Token, error) {
	if s.exchangeFn != nil {
		return s.exchangeFn(ctx, code)
	}
	return nil, errors.New("stubExchanger.Exchange not configured")
}

type stubVerifier struct {
	claims *auth.Claims
	err    error
}

func (s *stubVerifier) Verify(ctx context.Context, idToken, audience string) (*auth.Claims, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.claims, nil
}

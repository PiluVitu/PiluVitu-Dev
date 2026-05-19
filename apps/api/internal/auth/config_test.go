package auth_test

import (
	"errors"
	"testing"

	"github.com/PiluVitu/api/internal/auth"
)

func TestConfigFromEnv_AllSet(t *testing.T) {
	t.Setenv("GOOGLE_OAUTH_CLIENT_ID", "cid")
	t.Setenv("GOOGLE_OAUTH_CLIENT_SECRET", "csecret")
	t.Setenv("GOOGLE_OAUTH_REDIRECT_URL", "http://localhost:8080/auth/google/callback")
	t.Setenv("WEB_REDIRECT_URL", "http://localhost:3333/votacao")
	t.Setenv("ADMIN_EMAILS", "paulo@example.com, OTHER@example.com")

	cfg, err := auth.ConfigFromEnv()
	if err != nil {
		t.Fatalf("ConfigFromEnv: %v", err)
	}
	if cfg.ClientID != "cid" {
		t.Errorf("ClientID = %q", cfg.ClientID)
	}
	if cfg.WebRedirectURL != "http://localhost:3333/votacao" {
		t.Errorf("WebRedirectURL = %q", cfg.WebRedirectURL)
	}
	if len(cfg.AdminEmails) != 2 {
		t.Errorf("AdminEmails len = %d, want 2", len(cfg.AdminEmails))
	}
	if cfg.AdminEmails[1] != "OTHER@example.com" {
		t.Errorf("AdminEmails[1] = %q (trimming only, casing preserved)", cfg.AdminEmails[1])
	}
}

func TestConfigFromEnv_MissingClientID(t *testing.T) {
	t.Setenv("GOOGLE_OAUTH_CLIENT_ID", "")
	t.Setenv("GOOGLE_OAUTH_CLIENT_SECRET", "csecret")
	t.Setenv("GOOGLE_OAUTH_REDIRECT_URL", "http://localhost:8080/auth/google/callback")
	t.Setenv("WEB_REDIRECT_URL", "http://localhost:3333/votacao")

	_, err := auth.ConfigFromEnv()
	if !errors.Is(err, auth.ErrConfigMissing) {
		t.Errorf("err = %v, want ErrConfigMissing", err)
	}
}

func TestConfigFromEnv_AdminEmailsOptional(t *testing.T) {
	t.Setenv("GOOGLE_OAUTH_CLIENT_ID", "cid")
	t.Setenv("GOOGLE_OAUTH_CLIENT_SECRET", "csecret")
	t.Setenv("GOOGLE_OAUTH_REDIRECT_URL", "http://localhost:8080/auth/google/callback")
	t.Setenv("WEB_REDIRECT_URL", "http://localhost:3333/votacao")
	t.Setenv("ADMIN_EMAILS", "")

	cfg, err := auth.ConfigFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.AdminEmails) != 0 {
		t.Errorf("AdminEmails should be empty, got %v", cfg.AdminEmails)
	}
}

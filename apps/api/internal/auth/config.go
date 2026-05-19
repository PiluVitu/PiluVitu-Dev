package auth

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

// ErrConfigMissing is returned by ConfigFromEnv when a required env var is empty.
var ErrConfigMissing = errors.New("auth: required env var missing")

// Config holds OAuth + redirect settings for the Google auth flow.
type Config struct {
	ClientID       string
	ClientSecret   string
	RedirectURL    string   // OAuth callback URL registered at Google.
	WebRedirectURL string   // Where to send the browser after successful login.
	AdminEmails    []string // Case-insensitive allowlist (compared via votacao.UpsertUser).
}

// ConfigFromEnv reads OAuth settings from the environment.
// Required: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
// GOOGLE_OAUTH_REDIRECT_URL, WEB_REDIRECT_URL.
// Optional: ADMIN_EMAILS (comma-separated; whitespace trimmed; casing preserved).
func ConfigFromEnv() (Config, error) {
	cfg := Config{
		ClientID:       os.Getenv("GOOGLE_OAUTH_CLIENT_ID"),
		ClientSecret:   os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET"),
		RedirectURL:    os.Getenv("GOOGLE_OAUTH_REDIRECT_URL"),
		WebRedirectURL: os.Getenv("WEB_REDIRECT_URL"),
	}
	for _, f := range []struct {
		name, value string
	}{
		{"GOOGLE_OAUTH_CLIENT_ID", cfg.ClientID},
		{"GOOGLE_OAUTH_CLIENT_SECRET", cfg.ClientSecret},
		{"GOOGLE_OAUTH_REDIRECT_URL", cfg.RedirectURL},
		{"WEB_REDIRECT_URL", cfg.WebRedirectURL},
	} {
		if strings.TrimSpace(f.value) == "" {
			return Config{}, fmt.Errorf("%w: %s", ErrConfigMissing, f.name)
		}
	}
	if raw := strings.TrimSpace(os.Getenv("ADMIN_EMAILS")); raw != "" {
		parts := strings.Split(raw, ",")
		cfg.AdminEmails = make([]string, 0, len(parts))
		for _, p := range parts {
			if v := strings.TrimSpace(p); v != "" {
				cfg.AdminEmails = append(cfg.AdminEmails, v)
			}
		}
	}
	return cfg, nil
}

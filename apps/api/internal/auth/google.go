package auth

import (
	"context"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/idtoken"
)

// Claims holds the fields we read off the validated Google ID token.
type Claims struct {
	Sub     string
	Email   string
	Name    string
	Picture string
}

// TokenExchanger abstracts the OAuth code-exchange step.
// It is implemented by *oauth2.Config in production and stubbed in tests.
type TokenExchanger interface {
	AuthCodeURL(state string) string
	Exchange(ctx context.Context, code string) (*oauth2.Token, error)
}

// IDTokenVerifier validates a Google-issued ID token and returns the claims.
type IDTokenVerifier interface {
	Verify(ctx context.Context, idToken, audience string) (*Claims, error)
}

// NewGoogleTokenExchanger returns a TokenExchanger using golang.org/x/oauth2
// configured for the Google OIDC endpoint with the openid/email/profile scopes.
//
// We wrap *oauth2.Config in a small adapter because oauth2.Config.AuthCodeURL
// has a variadic signature (state string, opts ...oauth2.AuthCodeOption) that
// does not satisfy our non-variadic interface method (state string) string.
func NewGoogleTokenExchanger(cfg Config) TokenExchanger {
	return &googleTokenExchanger{
		inner: &oauth2.Config{
			ClientID:     cfg.ClientID,
			ClientSecret: cfg.ClientSecret,
			RedirectURL:  cfg.RedirectURL,
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint:     google.Endpoint,
		},
	}
}

type googleTokenExchanger struct {
	inner *oauth2.Config
}

func (g *googleTokenExchanger) AuthCodeURL(state string) string {
	return g.inner.AuthCodeURL(state)
}

func (g *googleTokenExchanger) Exchange(ctx context.Context, code string) (*oauth2.Token, error) {
	return g.inner.Exchange(ctx, code)
}

// NewGoogleIDTokenVerifier returns an IDTokenVerifier backed by
// google.golang.org/api/idtoken.
func NewGoogleIDTokenVerifier() IDTokenVerifier { return googleIDTokenVerifier{} }

type googleIDTokenVerifier struct{}

func (googleIDTokenVerifier) Verify(ctx context.Context, raw, audience string) (*Claims, error) {
	payload, err := idtoken.Validate(ctx, raw, audience)
	if err != nil {
		return nil, err
	}
	claims := &Claims{Sub: payload.Subject}
	if v, ok := payload.Claims["email"].(string); ok {
		claims.Email = v
	}
	if v, ok := payload.Claims["name"].(string); ok {
		claims.Name = v
	}
	if v, ok := payload.Claims["picture"].(string); ok {
		claims.Picture = v
	}
	return claims, nil
}

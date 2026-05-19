package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
)

// ErrStateCookieMissing is returned by ConsumeStateCookie when no state
// cookie is present on the request.
var ErrStateCookieMissing = errors.New("auth: state cookie missing")

const stateCookieName = "piluvitu_oauth_state"

// GenerateState returns a 32-byte hex-encoded random string for use as the
// OAuth state parameter.
func GenerateState() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// SetStateCookie writes a short-lived (10 min) HttpOnly cookie carrying the
// OAuth state value. The cookie is consumed (deleted) on the callback.
func SetStateCookie(w http.ResponseWriter, state string) {
	http.SetCookie(w, &http.Cookie{
		Name:     stateCookieName,
		Value:    state,
		Path:     "/",
		MaxAge:   600,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

// ConsumeStateCookie reads and clears the state cookie. Returns
// ErrStateCookieMissing if the cookie is not present.
func ConsumeStateCookie(w http.ResponseWriter, r *http.Request) (string, error) {
	c, err := r.Cookie(stateCookieName)
	if err != nil {
		return "", ErrStateCookieMissing
	}
	http.SetCookie(w, &http.Cookie{
		Name:     stateCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	return c.Value, nil
}

package auth

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/alexedwards/scs/sqlite3store"
	"github.com/alexedwards/scs/v2"
)

// sessionsSchema is the table layout expected by sqlite3store. The package
// itself does NOT create the table (only SELECT/REPLACE/DELETE on it), so we
// own creation here. Kept out of the votacao schema.sql on purpose: scs is an
// auth concern, not a votacao-domain one (see phase 1 plan).
const sessionsSchema = `
CREATE TABLE IF NOT EXISTS sessions (
	token  TEXT PRIMARY KEY,
	data   BLOB NOT NULL,
	expiry REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expiry);
`

// NewSessionManager returns a SessionManager backed by SQLite. The session
// cookie is HttpOnly + SameSite=Lax + Path=/. Secure must be flipped on in
// production by the caller via env (defaulted off here for local HTTP dev).
//
// The `sessions` table is ensured on first call; it is intentionally kept
// outside of the votacao package's schema.sql.
func NewSessionManager(db *sql.DB) *scs.SessionManager {
	if _, err := db.Exec(sessionsSchema); err != nil {
		// Cannot return an error from this signature without rippling
		// through every caller; panic is acceptable here because a
		// missing sessions table makes every request fail anyway and
		// this only runs once at boot (or in test setup).
		panic("auth: ensure sessions table: " + err.Error())
	}

	sm := scs.New()
	sm.Store = sqlite3store.New(db)
	sm.Lifetime = 7 * 24 * time.Hour
	sm.IdleTimeout = 0
	sm.Cookie.Name = "piluvitu_session"
	sm.Cookie.Path = "/"
	sm.Cookie.HttpOnly = true
	sm.Cookie.SameSite = http.SameSiteLaxMode
	sm.Cookie.Secure = false // promoted to true via env in main.go for prod.
	return sm
}

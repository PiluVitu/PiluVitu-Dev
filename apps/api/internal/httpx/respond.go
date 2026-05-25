// Package httpx is the single source of truth for the JSON response envelope
// used by every route in the API. One shape in, one shape out:
//
//	{
//	  "ok": true|false,
//	  "data": <payload> | null,
//	  "notifications": [ { "type", "code", "message", "field" }, ... ]
//	}
//
// Messages (errors, warnings, confirmations) ALWAYS live in `notifications`,
// so the front-end reads them from the same place regardless of the route.
package httpx

import (
	"encoding/json"
	"net/http"
)

// NotificationType classifies a Notification so the client can route it
// (e.g., pick the toast color).
type NotificationType string

const (
	// NotifyError marks a failure.
	NotifyError NotificationType = "error"
	// NotifyWarning marks a non-fatal caveat.
	NotifyWarning NotificationType = "warning"
	// NotifySuccess marks a confirmation.
	NotifySuccess NotificationType = "success"
	// NotifyInfo marks a neutral message.
	NotifyInfo NotificationType = "info"
)

// Notification is one structured message attached to a response.
type Notification struct {
	Type    NotificationType `json:"type"`
	Code    string           `json:"code,omitempty"`  // machine-readable, e.g. "already_voted"
	Message string           `json:"message"`         // human-readable (pt-BR)
	Field   string           `json:"field,omitempty"` // optional: offending field for validation errors
}

// Envelope is the single response shape for every JSON route.
type Envelope struct {
	OK            bool           `json:"ok"`
	Data          any            `json:"data"`          // null on error
	Notifications []Notification `json:"notifications"` // never null — [] when none
}

// write encodes an envelope with the given HTTP status, guaranteeing
// `notifications` serializes as [] rather than null.
func write(w http.ResponseWriter, status int, env Envelope) {
	if env.Notifications == nil {
		env.Notifications = []Notification{}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(env)
}

// Data writes a success envelope (ok=true) with no notifications.
// Pass nil for data on 200/201 responses that have no payload.
func Data(w http.ResponseWriter, status int, data any) {
	write(w, status, Envelope{OK: true, Data: data})
}

// DataMsg writes a success envelope carrying one or more notifications
// (e.g., a server-side confirmation toast).
func DataMsg(w http.ResponseWriter, status int, data any, notes ...Notification) {
	write(w, status, Envelope{OK: true, Data: data, Notifications: notes})
}

// Error writes an error envelope (ok=false, data=null) with a single error
// notification. code is machine-readable (snake_case); message is pt-BR.
func Error(w http.ResponseWriter, status int, code, message string) {
	write(w, status, Envelope{
		OK:            false,
		Notifications: []Notification{{Type: NotifyError, Code: code, Message: message}},
	})
}

// Errors writes an error envelope with multiple notifications, e.g. a set of
// field validation failures.
func Errors(w http.ResponseWriter, status int, notes ...Notification) {
	write(w, status, Envelope{OK: false, Notifications: notes})
}

// Success builds a success Notification for use with DataMsg.
func Success(message string) Notification {
	return Notification{Type: NotifySuccess, Message: message}
}

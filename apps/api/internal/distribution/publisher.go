package distribution

import "context"

// Payload é o que se envia a um Publisher.
type Payload struct {
	// Artigo (article_crosspost):
	Title        string
	BodyMD       string
	Description  string
	CanonicalURL string
	Tags         []string
	// Social (social_hook):
	Text string
}

// Publisher publica num destino. Implementado por cada adapter.
type Publisher interface {
	Platform() string
	Kind() Kind
	Publish(ctx context.Context, p Payload) (remoteURL string, err error)
}

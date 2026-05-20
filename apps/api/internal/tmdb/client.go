package tmdb

import "net/http"

const (
	defaultBase   = "https://api.themoviedb.org"
	posterCDNBase = "https://image.tmdb.org/t/p/w500"
)

// Client searches TMDb for movie/TV posters.
type Client struct {
	base   string
	apiKey string
	http   *http.Client
}

// NewClient returns a Client targeting the public TMDb endpoint.
func NewClient(apiKey string) *Client {
	return NewClientWithBase(defaultBase, apiKey)
}

// NewClientWithBase lets tests point the client at an httptest.Server.
func NewClientWithBase(base, apiKey string) *Client {
	return &Client{base: base, apiKey: apiKey, http: http.DefaultClient}
}

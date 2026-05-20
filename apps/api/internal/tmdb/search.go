package tmdb

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

type searchResult struct {
	ID         int64   `json:"id"`
	PosterPath *string `json:"poster_path"`
}

type searchResponse struct {
	Results []searchResult `json:"results"`
}

// SearchPoster returns the first matching poster URL and TMDb ID for the given
// title and type ("serie" hits /search/tv; anything else hits /search/movie).
// Fail-soft: 404 or empty results return ("", 0, nil). Only HTTP 5xx or
// parse errors surface as errors.
func (c *Client) SearchPoster(ctx context.Context, title, mediaType string) (string, int64, error) {
	endpoint := "/3/search/movie"
	if mediaType == "serie" {
		endpoint = "/3/search/tv"
	}

	q := url.Values{}
	q.Set("api_key", c.apiKey)
	q.Set("query", title)
	q.Set("include_adult", "false")
	full := c.base + endpoint + "?" + q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, full, nil)
	if err != nil {
		return "", 0, fmt.Errorf("tmdb: build request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return "", 0, fmt.Errorf("tmdb: do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return "", 0, nil
	}
	if resp.StatusCode >= 500 {
		return "", 0, fmt.Errorf("tmdb: status %d", resp.StatusCode)
	}
	if resp.StatusCode >= 400 {
		return "", 0, fmt.Errorf("tmdb: client error %d", resp.StatusCode)
	}

	var body searchResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", 0, fmt.Errorf("tmdb: decode: %w", err)
	}
	if len(body.Results) == 0 {
		return "", 0, nil
	}
	r := body.Results[0]
	if r.PosterPath == nil || *r.PosterPath == "" {
		return "", r.ID, nil
	}
	return posterCDNBase + *r.PosterPath, r.ID, nil
}

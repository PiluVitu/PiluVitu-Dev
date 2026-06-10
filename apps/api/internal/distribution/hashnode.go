package distribution

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Hashnode publica artigos no Hashnode via GraphQL API.
type Hashnode struct {
	base          string
	token         string
	publicationID string
	http          *http.Client
}

// NewHashnode cria um adapter Hashnode com o token e publicationID fornecidos.
func NewHashnode(token, publicationID string) *Hashnode {
	return &Hashnode{
		base:          "https://gql.hashnode.com",
		token:         token,
		publicationID: publicationID,
		http:          &http.Client{Timeout: 30 * time.Second},
	}
}

func (h *Hashnode) Platform() string { return "hashnode" }
func (h *Hashnode) Kind() Kind       { return KindArticle }

const hashnodeMutation = `mutation publishPost($input: PublishPostInput!) {
  publishPost(input: $input) { post { url } }
}`

// Publish cria um artigo no Hashnode. Retorna a URL pública do artigo.
func (h *Hashnode) Publish(ctx context.Context, p Payload) (string, error) {
	vars := map[string]any{
		"input": map[string]any{
			"title":              p.Title,
			"contentMarkdown":    p.BodyMD,
			"publicationId":      h.publicationID,
			"originalArticleURL": p.CanonicalURL,
			"tags":               []any{},
		},
	}
	body, _ := json.Marshal(map[string]any{"query": hashnodeMutation, "variables": vars})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.base+"/", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", h.token)
	res, err := h.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode >= 500 || res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return "", fmt.Errorf("hashnode: status %d: %s", res.StatusCode, bytes.TrimSpace(body))
	}
	var out struct {
		Data struct {
			PublishPost struct {
				Post struct {
					URL string `json:"url"`
				} `json:"post"`
			} `json:"publishPost"`
		} `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return "", err
	}
	if len(out.Errors) > 0 {
		return "", fmt.Errorf("hashnode: %s", out.Errors[0].Message)
	}
	if out.Data.PublishPost.Post.URL == "" {
		return "", fmt.Errorf("hashnode: resposta sem url (status %d)", res.StatusCode)
	}
	return out.Data.PublishPost.Post.URL, nil
}

package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSplitBlocksReassembles(t *testing.T) {
	doc := "## Título\n\nUm parágrafo com txto.\n\n```go\nfunc x() {}\n\n// linha em branco no meio\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n> uma citação informal\n\n<a href=\"x\"><img src=\"y\"/></a>\n\n![alt](http://img)\n\nÚltimo parágrafo.\n"
	var sb strings.Builder
	for _, b := range splitBlocks(doc) {
		sb.WriteString(b.text)
	}
	if sb.String() != doc {
		t.Fatalf("reassembly != original\n got: %q\nwant: %q", sb.String(), doc)
	}
}

func TestSplitBlocksClassifies(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want blockKind
	}{
		{"paragraph", "Um texto comum.", prose},
		{"heading", "## Introdução", prose},
		{"list", "* item um\n* item dois", prose},
		{"code", "```js\nconst a = 1\n```", passthrough},
		{"table", "| a | b |\n| - | - |", passthrough},
		{"html", "<a href=\"x\">link</a>", passthrough},
		{"blockquote", "> citação", passthrough},
		{"image", "![alt](http://x/y.png)", passthrough},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var got *block
			for i, b := range splitBlocks(tc.in) {
				if strings.TrimSpace(b.text) != "" {
					got = &splitBlocks(tc.in)[i]
					break
				}
			}
			if got == nil {
				t.Fatal("nenhum bloco de conteúdo")
			}
			if got.kind != tc.want {
				t.Fatalf("%s: kind=%d want=%d (text=%q)", tc.name, got.kind, tc.want, got.text)
			}
		})
	}
}

func TestProofreadSkipsPassthrough(t *testing.T) {
	var calls int
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var body struct {
			Messages []chatMessage `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		seen = append(seen, body.Messages[len(body.Messages)-1].Content)
		_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]string{"content": "CORRIGIDO"}})
	}))
	defer srv.Close()
	c := NewClient(srv.URL, "m", "m")

	doc := "Parágrafo um.\n\n```go\ncode aqui\n```\n\nParágrafo dois.\n"
	out, err := c.Proofread(context.Background(), doc)
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("chat calls = %d, want 2 (só os 2 parágrafos)", calls)
	}
	for _, s := range seen {
		if strings.Contains(s, "code aqui") {
			t.Fatalf("código foi enviado ao LLM: %q", s)
		}
	}
	if !strings.Contains(out, "```go\ncode aqui\n```") {
		t.Fatalf("bloco de código não preservado: %q", out)
	}
	if strings.Count(out, "CORRIGIDO") != 2 {
		t.Fatalf("prosa não corrigida nos 2 blocos: %q", out)
	}
}

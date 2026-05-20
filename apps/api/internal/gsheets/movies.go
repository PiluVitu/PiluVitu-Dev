package gsheets

import (
	"context"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/PiluVitu/api/internal/votacao"
)

// ReadMovies fetches the configured A1 range and parses each row into a
// votacao.SheetMovie. Rows missing a title or a category are skipped.
func (c *Client) ReadMovies(ctx context.Context) ([]votacao.SheetMovie, error) {
	resp, err := c.svc.Spreadsheets.Values.Get(c.spreadsheetID, c.rangeA1).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("gsheets: read values: %w", err)
	}
	out := make([]votacao.SheetMovie, 0, len(resp.Values))
	for _, row := range resp.Values {
		m, ok := parseRow(row)
		if !ok {
			continue
		}
		out = append(out, m)
	}
	return out, nil
}

// GetCategories returns the deduplicated list of categories present in the
// sheet, in alphabetical order. Empty categories are excluded.
func (c *Client) GetCategories(ctx context.Context) ([]string, error) {
	movies, err := c.ReadMovies(ctx)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	for _, m := range movies {
		seen[m.Category] = true
	}
	out := make([]string, 0, len(seen))
	for k := range seen {
		out = append(out, k)
	}
	slices.Sort(out)
	return out, nil
}

// parseRow extracts a SheetMovie from a single row. Returns ok=false when
// the row is unusable (missing title or category, or column count too small).
//
// Column layout: A=Nº, B=Título, C=Filme/Série, D=Gênero, E=Assistido?, F=Nota.
func parseRow(row []any) (votacao.SheetMovie, bool) {
	if len(row) < 5 {
		return votacao.SheetMovie{}, false
	}
	title := strings.TrimSpace(cellString(row[1]))
	category := strings.ToLower(strings.TrimSpace(cellString(row[3])))
	if title == "" || category == "" {
		return votacao.SheetMovie{}, false
	}
	number, _ := strconv.Atoi(strings.TrimSpace(cellString(row[0])))
	return votacao.SheetMovie{
		Number:   number,
		Title:    title,
		Type:     normalizeType(cellString(row[2])),
		Category: category,
		Watched:  parseYesNo(cellString(row[4])),
	}, true
}

func cellString(v any) string {
	s, _ := v.(string)
	return s
}

func normalizeType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "serie", "série":
		return "serie"
	default:
		return "filme"
	}
}

func parseYesNo(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "sim", "yes", "true", "1":
		return true
	default:
		return false
	}
}

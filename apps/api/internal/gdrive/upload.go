package gdrive

import (
	"context"
	"fmt"
	"io"
	"sort"

	"google.golang.org/api/drive/v3"
)

// Upload creates a new file in the given folder. Returns the new fileID and
// reported size.
func (c *Client) Upload(ctx context.Context, folderID, name string, body io.Reader) (string, int64, error) {
	f := &drive.File{Name: name, Parents: []string{folderID}}
	out, err := c.svc.Files.Create(f).
		Context(ctx).
		Fields("id, size").
		Media(body).
		Do()
	if err != nil {
		return "", 0, fmt.Errorf("gdrive: upload: %w", err)
	}
	return out.Id, out.Size, nil
}

// Rotate keeps the `keep` most recent files in the folder and deletes the rest.
func (c *Client) Rotate(ctx context.Context, folderID string, keep int) error {
	if keep <= 0 {
		return nil
	}
	query := fmt.Sprintf("'%s' in parents and trashed=false", folderID)
	list, err := c.svc.Files.List().
		Q(query).
		Fields("files(id, createdTime)").
		PageSize(1000).
		Context(ctx).
		Do()
	if err != nil {
		return fmt.Errorf("gdrive: list for rotate: %w", err)
	}
	files := list.Files
	if len(files) <= keep {
		return nil
	}
	sort.Slice(files, func(i, j int) bool { return files[i].CreatedTime > files[j].CreatedTime })
	for _, f := range files[keep:] {
		if err := c.svc.Files.Delete(f.Id).Context(ctx).Do(); err != nil {
			return fmt.Errorf("gdrive: delete %s: %w", f.Id, err)
		}
	}
	return nil
}

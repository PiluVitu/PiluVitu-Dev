package distribution

import (
	"context"

	pkgllm "github.com/PiluVitu/api/internal/llm"
)

// HookGenerator é satisfeito por *llm.Client.
type HookGenerator interface {
	GenerateHooks(ctx context.Context, a pkgllm.Article, platforms []string) ([]pkgllm.Hook, error)
}

// Service orquestra geração de propostas e publicação.
type Service struct {
	store *Store
	hooks HookGenerator
	pubs  map[string]Publisher
}

// NewService constrói um Service com os publishers fornecidos.
func NewService(store *Store, hooks HookGenerator, pubs []Publisher) *Service {
	m := make(map[string]Publisher, len(pubs))
	for _, p := range pubs {
		m[p.Platform()] = p
	}
	return &Service{store: store, hooks: hooks, pubs: m}
}

// socialPlatforms devolve as plataformas social_hook ativas.
func (s *Service) socialPlatforms() []string {
	var out []string
	for name, p := range s.pubs {
		if p.Kind() == KindSocial {
			out = append(out, name)
		}
	}
	return out
}

// BuildProposals monta os alvos (artigo = bodyMD; social = hook gerado), persiste e retorna.
func (s *Service) BuildProposals(ctx context.Context, slug string, art pkgllm.Article, bodyMD string) ([]Target, error) {
	var targets []Target

	// 1) artigos (republicação): conteúdo = corpo completo
	for name, p := range s.pubs {
		if p.Kind() == KindArticle {
			targets = append(targets, Target{Slug: slug, Platform: name, Kind: KindArticle, Content: bodyMD, Status: "pending"})
		}
	}

	// 2) sociais: gerar chamadas (uma chamada por plataforma)
	social := s.socialPlatforms()
	if len(social) > 0 && s.hooks != nil {
		hooks, err := s.hooks.GenerateHooks(ctx, art, social)
		if err != nil {
			return nil, err
		}
		for _, hk := range hooks {
			targets = append(targets, Target{Slug: slug, Platform: hk.Platform, Kind: KindSocial, Content: hk.Text, Status: "pending"})
		}
	}

	for _, t := range targets {
		if err := s.store.Upsert(ctx, t); err != nil {
			return nil, err
		}
	}
	return targets, nil
}

// Selected é um alvo escolhido para publicar, com o conteúdo final (editado na UI).
type Selected struct {
	Platform     string   `json:"platform"`
	Content      string   `json:"content"`       // social: texto; artigo: corpo MD
	Title        string   `json:"title"`         // artigo
	CanonicalURL string   `json:"canonical_url"` // artigo
	Description  string   `json:"description"`   // artigo
	Tags         []string `json:"tags"`          // artigo
}

// Publish posta os alvos selecionados (pulando os já 'posted') e devolve o estado atual.
func (s *Service) Publish(ctx context.Context, slug string, selected []Selected) ([]Target, error) {
	for _, sel := range selected {
		pub, ok := s.pubs[sel.Platform]
		if !ok {
			continue
		}
		existing, err := s.store.Get(ctx, slug, sel.Platform)
		if err == nil && existing.Status == "posted" {
			continue // idempotência
		}
		// atualiza o conteúdo final antes de postar
		kind := pub.Kind()
		_ = s.store.Upsert(ctx, Target{Slug: slug, Platform: sel.Platform, Kind: kind, Content: sel.Content, Status: "pending"})

		payload := Payload{
			Text:         sel.Content,
			BodyMD:       sel.Content,
			Title:        sel.Title,
			CanonicalURL: sel.CanonicalURL,
			Description:  sel.Description,
			Tags:         sel.Tags,
		}
		url, perr := pub.Publish(ctx, payload)
		if perr != nil {
			_ = s.store.MarkFailed(ctx, slug, sel.Platform, perr.Error())
			continue
		}
		_ = s.store.MarkPosted(ctx, slug, sel.Platform, url)
	}
	return s.store.ListBySlug(ctx, slug)
}

// List devolve o estado atual dos alvos do slug.
func (s *Service) List(ctx context.Context, slug string) ([]Target, error) {
	return s.store.ListBySlug(ctx, slug)
}

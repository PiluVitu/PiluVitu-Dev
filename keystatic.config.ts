import { collection, config, fields, singleton } from '@keystatic/core'
import { fontawesomeIconSelectField } from './lib/keystatic-fontawesome-icon-select-field'
import { VISIT_CARD_FA_SELECT_OPTIONS } from './lib/visit-card-fontawesome'

/** Repositório GitHub `owner/name` (ex.: PiluVitu/PiluVitu-Dev). Override: KEYSTATIC_GITHUB_REPO */
function githubRepoFromEnv(): { owner: string; name: string } {
  const raw =
    process.env.KEYSTATIC_GITHUB_REPO?.trim() ?? 'PiluVitu/PiluVitu-Dev'
  const [owner, name, ...rest] = raw.split('/').map((s) => s.trim())
  if (!owner || !name || rest.some(Boolean)) {
    throw new Error(
      'KEYSTATIC_GITHUB_REPO must be owner/name (e.g. PiluVitu/PiluVitu-Dev)',
    )
  }
  return { owner, name }
}

/** `owner/name` para APIs que esperam o literal (ex.: `createGitHubReader`). */
export function getGithubRepoSlash(): `${string}/${string}` {
  const { owner, name } = githubRepoFromEnv()
  return `${owner}/${name}` as `${string}/${string}`
}

export default config({
  storage: {
    kind: 'github',
    repo: githubRepoFromEnv(),
  },
  singletons: {
    siteProfile: singleton({
      label: 'Perfil (bio)',
      path: 'content/site/profile/',
      previewUrl: '/preview/start?branch={branch}&to=/',
      schema: {
        displayName: fields.text({ label: 'Nome completo' }),
        avatarSrc: fields.text({
          label: 'Foto (URL ou path)',
          description: 'Ex.: /profile-2.jpg',
        }),
        avatarAlt: fields.text({ label: 'Texto alternativo da foto' }),
        roleHighlight: fields.text({
          label: 'Cargo em destaque',
          description: 'Aparece em destaque antes do link da empresa',
        }),
        companyName: fields.text({ label: 'Nome da empresa' }),
        companyLink: fields.text({
          label: 'Link da empresa',
          description: 'Opcional; deixe vazio para não mostrar link',
        }),
        companyLinkColor: fields.select({
          label: 'Cor do nome da empresa',
          description:
            'Escolhe só pela lista — não precisas de hexadecimal. O valor é aplicado ao link do nome na bio.',
          defaultValue: '#4a65fc',
          options: [
            { label: 'Azul índigo (padrão)', value: '#4a65fc' },
            { label: 'Azul vivo', value: '#3b82f6' },
            { label: 'Azul royal', value: '#2563eb' },
            { label: 'Ciano', value: '#06b6d4' },
            { label: 'Verde água', value: '#14b8a6' },
            { label: 'Verde', value: '#22c55e' },
            { label: 'Verde lima', value: '#84cc16' },
            { label: 'Amarelo ouro', value: '#eab308' },
            { label: 'Laranja', value: '#f97316' },
            { label: 'Vermelho', value: '#ef4444' },
            { label: 'Rosa', value: '#ec4899' },
            { label: 'Roxo', value: '#a855f7' },
            { label: 'Violeta', value: '#8b5cf6' },
            { label: 'Índigo', value: '#6366f1' },
            {
              label: 'Branco suave (destaca no fundo escuro)',
              value: '#f8fafc',
            },
            { label: 'Cinza claro', value: '#94a3b8' },
          ],
        }),
        bio: fields.text({
          label: 'Biografia',
          multiline: true,
        }),
      },
    }),
    visitCard: singleton({
      label: 'Cartão de visita (triplo clique na foto)',
      path: 'content/site/visit-card/',
      previewUrl: '/preview/start?branch={branch}&to=/',
      schema: {
        handle: fields.text({
          label: 'Texto do rodapé do cartão',
          description: 'Ex.: o teu @ ou nome curto.',
        }),
        items: fields.array(
          fields.object({
            ariaLabel: fields.text({
              label: 'Acessibilidade (aria-label do botão)',
            }),
            linkType: fields.select({
              label: 'Destino do link',
              defaultValue: 'manual',
              options: [
                { label: 'URL fixa (manual)', value: 'manual' },
                {
                  label: 'Último artigo publicado (dev.to, utilizador em .env)',
                  value: 'latestDevArticle',
                },
                {
                  label: 'Formulário de email (reCAPTCHA do site)',
                  value: 'emailContact',
                },
              ],
            }),
            url: fields.text({
              label: 'URL',
              description:
                'Obrigatório se o destino for URL fixa. Para dev.to ou email, deixa vazio.',
            }),
            iconMode: fields.select({
              label: 'Tipo de ícone',
              description:
                'Plataformas: Font Awesome. Logos de projeto/empresa: imagem em public/.',
              defaultValue: 'fontawesome',
              options: [
                {
                  label: 'Font Awesome (ícone vectorial)',
                  value: 'fontawesome',
                },
                { label: 'Imagem (ficheiro em /public)', value: 'image' },
              ],
            }),
            fontawesomeIcon: fontawesomeIconSelectField({
              label: 'Ícone Font Awesome',
              description:
                'Pré-visualização ao vivo: abre /keystatic/icon-preview no mesmo site. Documentação: https://docs.fontawesome.com/web/use-with/react/',
              defaultValue: 'brands__github',
              options: VISIT_CARD_FA_SELECT_OPTIONS,
            }),
            image: fields.text({
              label: 'Imagem (path em public/)',
              description: 'Se o tipo de ícone for Imagem, ex.: /github.png',
            }),
          }),
          {
            label: 'Células (até 8, ordem = posição na grelha)',
            itemLabel: (props) => {
              const o = props as {
                fields: { ariaLabel: { value: string } }
              }
              return o.fields.ariaLabel.value?.trim() || 'Célula'
            },
            validation: { length: { max: 8 } },
          },
        ),
      },
    }),
  },
  collections: {
    socials: collection({
      label: 'Redes sociais',
      slugField: 'key',
      path: 'content/socials/*/',
      previewUrl: '/preview/start?branch={branch}&to=/',
      schema: {
        key: fields.slug({ name: { label: 'Identificador' } }),
        order: fields.integer({ label: 'Ordem (menor primeiro)' }),
        socialDescription: fields.text({ label: 'Descrição / CTA' }),
        socialLink: fields.text({ label: 'URL' }),
        iconMode: fields.select({
          label: 'Tipo de ícone',
          defaultValue: 'fontawesome',
          options: [
            { label: 'Font Awesome', value: 'fontawesome' },
            { label: 'Imagem (path em /public)', value: 'image' },
          ],
        }),
        fontawesomeIcon: fontawesomeIconSelectField({
          label: 'Ícone Font Awesome',
          description:
            'Se o tipo for Font Awesome. Pré-visualização: /keystatic/icon-preview',
          defaultValue: 'brands__github',
          options: VISIT_CARD_FA_SELECT_OPTIONS,
        }),
        image: fields.text({
          label: 'Ícone (path em public/)',
          description: 'Se o tipo for Imagem, ex.: /github.png',
        }),
        altImage: fields.text({ label: 'Abreviatura / alt' }),
      },
    }),
    carreiras: collection({
      label: 'Carreira',
      slugField: 'orgSlug',
      path: 'content/carreiras/*/',
      previewUrl: '/preview/start?branch={branch}&to=/',
      schema: {
        orgSlug: fields.slug({
          name: { label: 'Slug da organização' },
        }),
        order: fields.integer({ label: 'Ordem (menor primeiro)' }),
        orgName: fields.text({ label: 'Organização' }),
        orgDescription: fields.text({
          label: 'Descrição',
          multiline: true,
        }),
        orgLink: fields.text({ label: 'Site / link' }),
        image: fields.text({
          label: 'Logo (URL)',
          description: 'Opcional',
        }),
        altImage: fields.text({ label: 'Iniciais / alt curto' }),
        title: fields.text({ label: 'Título do cargo' }),
        role: fields.text({ label: 'Papel (ex.: Front-End)' }),
        location: fields.text({ label: 'Localização' }),
        date: fields.text({
          label: 'Período',
          description: 'Ex.: Dez, 2024 - Atualmente',
        }),
        atribuitions: fields.array(fields.text({ label: 'Atribuição' }), {
          label: 'Atribuições',
        }),
      },
    }),
    projects: collection({
      label: 'Projetos',
      slugField: 'projectSlug',
      path: 'content/projects/*/',
      previewUrl: '/preview/start?branch={branch}&to=/',
      schema: {
        projectSlug: fields.slug({ name: { label: 'Slug do projeto' } }),
        order: fields.integer({ label: 'Ordem (menor primeiro)' }),
        projectName: fields.text({ label: 'Nome' }),
        projectLogo: fields.text({
          label: 'Logo (path ou URL)',
        }),
        description: fields.text({
          label: 'Descrição',
          multiline: true,
        }),
        tags: fields.array(fields.text({ label: 'Tag' }), {
          label: 'Tags',
        }),
        deployLink: fields.text({ label: 'URL demo (opcional)' }),
        repoLink: fields.text({ label: 'URL repositório (opcional)' }),
        image: fields.text({
          label: 'Imagem de capa (path em public/)',
        }),
        altImage: fields.text({ label: 'Abrev. / alt' }),
      },
    }),
  },
})

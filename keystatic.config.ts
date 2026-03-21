import { collection, config, fields, singleton } from '@keystatic/core'

export default config({
  storage: {
    kind: 'local',
  },
  singletons: {
    siteProfile: singleton({
      label: 'Perfil (bio)',
      path: 'content/site/profile/',
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
        bio: fields.text({
          label: 'Biografia',
          multiline: true,
        }),
      },
    }),
  },
  collections: {
    socials: collection({
      label: 'Redes sociais',
      slugField: 'key',
      path: 'content/socials/*/',
      schema: {
        key: fields.slug({ name: { label: 'Identificador' } }),
        order: fields.integer({ label: 'Ordem (menor primeiro)' }),
        socialDescription: fields.text({ label: 'Descrição / CTA' }),
        socialLink: fields.text({ label: 'URL' }),
        image: fields.text({
          label: 'Ícone (path em public/)',
          description: 'Opcional, ex.: /github.png',
        }),
        altImage: fields.text({ label: 'Abreviatura / alt' }),
      },
    }),
    carreiras: collection({
      label: 'Carreira',
      slugField: 'orgSlug',
      path: 'content/carreiras/*/',
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

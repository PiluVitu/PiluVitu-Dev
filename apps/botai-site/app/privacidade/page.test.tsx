import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import PrivacidadePage from './page'

const BOTAI = join(__dirname, '..', '..', '..', 'botai')
const ler = (arquivo: string) => readFileSync(join(BOTAI, arquivo), 'utf8')

describe('/privacidade', () => {
  beforeEach(() => {
    render(<PrivacidadePage />)
  })

  it('o título e a data de vigência', () => {
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Política de privacidade do Botaí',
    )
    const data = screen.getByText('2 de outubro de 2026')
    expect(data.tagName).toBe('TIME')
    expect(data).toHaveAttribute('dateTime', '2026-10-02')
  })

  it('as seções da política, na ordem', () => {
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      'Quem é o responsável',
      'O que o Botaí acessa, e quando',
      'O que fica guardado',
      'O que é enviado',
      'Sites que ele abre, só quando você clica',
      'Dados fictícios e pessoas reais',
      'Permissões',
      'Como apagar os dados',
      'Este site',
      'Quando você escreve para o suporte',
      'Cada dado, para quê e por quanto tempo',
      'Segurança',
      'Seus direitos',
      'Crianças e adolescentes',
      'Mudanças nesta política',
    ])
  })

  it('cada dado com finalidade, base legal, compartilhamento e prazo', () => {
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual([
      'A pessoa fictícia gerada',
      'Os campos e o endereço da aba',
      'A escolha de tema claro ou escuro',
      'Os registros de acesso a este site',
      'O que você manda ao suporte por e-mail',
    ])
    const listas = document.querySelectorAll('dl')
    expect(listas).toHaveLength(5)
    for (const lista of listas)
      expect(
        [...lista.querySelectorAll('dt')].map((dt) => dt.textContent),
      ).toEqual(['Para quê', 'Base legal', 'Com quem', 'Por quanto tempo'])
    expect(listas[3]).toHaveTextContent('art. 7º, IX')
    expect(listas[3]).toHaveTextContent('Vercel')
    expect(listas[4]).toHaveTextContent('art. 7º, II')
    expect(listas[4]).toHaveTextContent('Gmail')
  })

  it('os direitos do art. 18, o prazo e a ANPD', () => {
    expect(document.body).toHaveTextContent('em até 15 dias')
    expect(document.body).toHaveTextContent('art. 18')
    expect(
      screen.getByRole('link', {
        name: 'Autoridade Nacional de Proteção de Dados (ANPD)',
      }),
    ).toHaveAttribute('href', 'https://www.gov.br/anpd/pt-br')
  })

  // A tabela é a lista justificada em loja/textos.md, que o manifesto.e2e.ts do Botaí amarra ao manifesto.
  it('as permissões da tabela são as justificadas nos textos das lojas', () => {
    const justificadas = [
      ...ler('loja/textos.md').matchAll(/^## Justificativa: (.+)$/gm),
    ].map((m) => m[1])
    const linhas = screen.getAllByRole('row').slice(1)
    expect(
      linhas.map((linha) => linha.querySelector('th')?.textContent),
    ).toEqual(justificadas)
    expect(linhas.at(-1)).toHaveTextContent('Só no Firefox')
  })

  // O menu real (criarMenus) tem também "Nova pessoa" e "Abrir caixa de entrada",
  // e este abre um site de terceiro: a permissão precisa dizer isso.
  it('a linha do contextMenus cita cada item do menu do botão direito', () => {
    const itens = [
      ...ler('src/lib/menus.ts').matchAll(/title: '([^']+)'/g),
    ].map((m) => m[1])
    expect(itens).toEqual([
      'Preencher esta página',
      'Inserir',
      'Nova pessoa',
      'Abrir caixa de entrada',
    ])
    const linha = screen.getByRole('row', { name: /^contextMenus\b/ })
    for (const item of itens) expect(linha).toHaveTextContent(item)
    expect(linha).toHaveTextContent('site de terceiro')
  })

  // O script injetado fica na página: guarda o registro dos campos e o último
  // resultado (api.ts, para o "Mostrar" do popup) e regrava 1 s depois
  // (segunda-passada.ts). Nada disso é gravado em disco nem enviado.
  it('o que a extensão lê da página fica na memória dela até recarregar', () => {
    const campos = document.querySelectorAll('dl')[1]
    expect(campos).toHaveTextContent(
      'Na memória da página, até ela ser recarregada, trocada por outra ou fechada. Nada é gravado nem enviado.',
    )
    const scripting = screen.getByRole('row', { name: /^scripting\b/ })
    expect(scripting).not.toHaveTextContent('só nesse momento')
    expect(scripting).toHaveTextContent(
      'fica na página até ela ser recarregada, trocada por outra ou fechada',
    )
  })

  it('"Dados fictícios e pessoas reais" cita os documentos, o celular e o endereço', () => {
    const paragrafo = screen.getByRole('heading', {
      level: 2,
      name: 'Dados fictícios e pessoas reais',
    }).nextElementSibling
    for (const dado of [
      'CPF',
      'CNPJ',
      'RG',
      'PIS/NIS',
      'título de eleitor',
      'celular',
      'endereço',
    ])
      expect(paragrafo).toHaveTextContent(dado)
  })

  it('"no Firefox o pacote declara que não coleta dados" é o que o wxt.config.ts diz', () => {
    expect(ler('wxt.config.ts')).toContain(
      "data_collection_permissions: { required: ['none'] }",
    )
    expect(document.body).toHaveTextContent(
      'No Firefox, o próprio pacote declara que não coleta dados.',
    )
  })

  // Review Focus 1: o Botaí ainda está "Em breve", e ele lê a URL da aba ativa.
  it('não afirma o que o código não sustenta', () => {
    expect(document.body).not.toHaveTextContent(
      /dispon[ií]vel|publicad[oa] nas lojas|Na Firefox Add-ons/i,
    )
    expect(document.body).toHaveTextContent(
      'não lê o histórico, outras abas, favoritos nem cookies',
    )
  })

  it('contato, termos e histórico', () => {
    for (const link of screen.getAllByRole('link', {
      name: 'pilutechinformatica@gmail.com',
    }))
      expect(link).toHaveAttribute(
        'href',
        'mailto:pilutechinformatica@gmail.com?subject=%5BBota%C3%AD%5D%20Privacidade',
      )
    expect(screen.getByRole('link', { name: 'termos de uso' })).toHaveAttribute(
      'href',
      '/termos',
    )
    expect(
      screen.getByRole('link', { name: 'histórico do código-fonte do site' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/PiluVitu/PiluVitu-Dev/commits/main/apps/botai-site/app/privacidade/page.tsx',
    )
  })

  it('o voltar leva à landing', () => {
    expect(screen.getByRole('link', { name: 'Botaí' })).toHaveAttribute(
      'href',
      '/',
    )
  })
})

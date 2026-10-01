# Extensão de dados de teste: contrato de interfaces entre as fases

**Spec:** `docs/superpowers/specs/2026-10-01-extensao-dados-teste-design.md`.

**Planos:**

- `2026-10-01-extensao-fase1-tools.md`
- `2026-10-01-extensao-fase2-extensao.md`
- `2026-10-01-extensao-fase3-retorno.md`

Este arquivo é a **fonte única dos nomes e tipos que cruzam as fases**. Nenhum plano pode renomear o que está aqui. Se algo precisar mudar, muda primeiro aqui.

**Pesquisa** (código de partida, "portar, não reescrever"): `docs/superpowers/research/2026-10-01-extensao-dados-teste/` (abreviado `R/` abaixo).

---

## Fase 1 → `packages/tools` (`@piluvitu/tools/<subpath>`, sem barrel)

Cada arquivo é exportado por subpath com o mesmo nome do arquivo: `"./rg": "./src/rg.ts"`. Nada novo entra em `src/index.ts`.

| Subpath           | Exporta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Origem em `R/`                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `aleatorio`       | `type Rng = Pick<Prng,'int'>`, `rngPadrao`, `escolher`, `embaralhar`, `digitosAleatorios`, `somenteDigitos`                                                                                                                                                                                                                                                                                                                                                                                           | `geradores/aleatorio.ts`                                                                            |
| `uf`              | `UFS`, `type UF`, `CODIGO_UF_TITULO`, `REGIAO_FISCAL_CPF`, **`UF_NOME: Record<UF,string>`** (vindo de `deteccao/formatar.ts`)                                                                                                                                                                                                                                                                                                                                                                         | `geradores/uf.ts`                                                                                   |
| `cpf`             | `gerarCPF(rng: Rng = rngPadrao, uf?: UF): string`, `validarCPF(v): boolean`                                                                                                                                                                                                                                                                                                                                                                                                                           | `geradores/cpf.ts`                                                                                  |
| `cnpj`            | `gerarCNPJ(rng: Rng = rngPadrao): string`, `validarCNPJ(v): boolean`. **Não** porta `validarCNPJAlfanumerico`, que está fora do escopo                                                                                                                                                                                                                                                                                                                                                                | `geradores/cnpj.ts`                                                                                 |
| `rg`              | `gerarRG(rng?, {permitirX?}): string` (formatado `NN.NNN.NNN-D`), `validarRG(v)`, `dvRGSP(base)`                                                                                                                                                                                                                                                                                                                                                                                                      | `geradores/rg.ts`                                                                                   |
| `pis`             | `gerarPIS(rng?)`, `validarPIS(v)`, `dvPIS(base)`                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `geradores/pis.ts`                                                                                  |
| `titulo-eleitor`  | `type RegraTitulo`, `gerarTituloEleitor(rng, uf: UF \| 'ZZ')`, `validarTituloEleitor(v, regra)`, `dvsTitulo`                                                                                                                                                                                                                                                                                                                                                                                          | `geradores/titulo-eleitor.ts`                                                                       |
| `celular`         | `interface Celular {ddd, numero, formatado, digitos, e164}`, `gerarCelular(rng?, ddd)`                                                                                                                                                                                                                                                                                                                                                                                                                | `geradores/celular.ts`                                                                              |
| `nascimento`      | `interface DataCivil {ano, mes, dia}`, `interface Nascimento {iso, br, idade}`, `lerDataISO`, `formatarISO`, `formatarBR`, `calcularIdade(nasc: DataCivil, hoje: DataCivil)`, `gerarNascimento(rng, hojeISO, opcoes?)`                                                                                                                                                                                                                                                                                | `geradores/nascimento.ts`                                                                           |
| `senha`           | `gerarSenha(rng: Rng = rngPadrao, tamanho = 12)` (**padrão 12**; o protótipo usa 14), `senhaAtendeRegrasComuns`, `MAIUSCULAS`, `MINUSCULAS`, `DIGITOS`, `SIMBOLOS`                                                                                                                                                                                                                                                                                                                                    | `geradores/senha.ts`                                                                                |
| `nome`            | `type Sexo`, `interface Nome {sexo, prenome, sobrenomes: [string,string], completo, noCartao}`, `interface Email {usuario, endereco, caixaUrl}`, `gerarNome`, `gerarEmail(rng, nome)`, `removerAcentos`, `slugNome`, `nomeNoCartao`, `DOMINIO_EMAIL`                                                                                                                                                                                                                                                  | `geradores/nome.ts`                                                                                 |
| `endereco`        | `interface Numeracao`, `interface LogradouroReal`, `interface Endereco {cep, logradouro, bairro, cidade, uf, ddd, numero, complemento}`, `LOGRADOUROS` (34), `sortearNumero`, `gerarEndereco(rng?, uf?)`                                                                                                                                                                                                                                                                                              | `geradores/endereco.ts`                                                                             |
| `empresa`         | `interface Empresa {razaoSocial, nomeFantasia, cnpj}`, `gerarEmpresa(rng, sobrenomes)`                                                                                                                                                                                                                                                                                                                                                                                                                | `geradores/empresa.ts`                                                                              |
| `cartao`          | `type Bandeira = 'visa' \| 'mastercard'`, `interface Cartao {bandeira, numero, numeroFormatado, titular, validade /*MM/AA*/, mes, ano, cvv}`, `CARTOES_TESTE` (**só Stripe**: Visa `4242424242424242`, MC `5555555555554444`), `luhnValido`, `formatarNumeroCartao`, `gerarCartao(rng, hojeISO, titular): Cartao`                                                                                                                                                                                     | `geradores/cartao.ts`, **simplificado**: sem `Gateway`, sem `OpcoesCartao`, sem `resultadoEsperado` |
| `pessoa`          | `interface Pessoa` (abaixo), `gerarPessoa(rng: Rng, hojeISO: string): Pessoa`                                                                                                                                                                                                                                                                                                                                                                                                                         | `geradores/pessoa.ts`, sem o campo `versao` e sem `opcoes`                                          |
| `campos`          | `type FieldKind` (lista do protótipo **+ `'cidadeUf'`**), `interface FieldDescriptor`, `type Via`, `interface Dicas {semDdd?, incluirNumero?}`, **`interface Classificacao {kind: FieldKind \| 'ignorar'; confianca: number; via: Via; dicas?: Dicas}`** (o protótipo usa `confidence`), `LIMIAR = 0.5`, `normalizar`, `campoAutocomplete`, `classificarCampo(d)`, **`classificarFormulario(ds: FieldDescriptor[], hojeISO: string): (Classificacao \| null)[]`** (o protótipo usa `anoAtual = 2026`) | `deteccao/campos.ts`                                                                                |
| `campos-formatar` | **`valorPara(kind: FieldKind, pessoa: Pessoa, d: FieldDescriptor, dicas?: Dicas): string \| null`**, que recebe a `Pessoa` **aninhada** da fase 1 (o protótipo usa uma pessoa plana), mais `caber`, `escolherOpcao`                                                                                                                                                                                                                                                                                   | `deteccao/formatar.ts`                                                                              |

```ts
// @piluvitu/tools/pessoa
export interface Pessoa {
  nome: Nome // nome.completo, nome.prenome, nome.sobrenomes, nome.sexo, nome.noCartao
  nascimento: Nascimento // iso 'aaaa-mm-dd', br 'dd/mm/aaaa', idade (no dia da geração)
  cpf: string // '000.000.000-00'
  rg: { numero: string; orgaoEmissor: 'SSP'; uf: 'SP' }
  pis: string // '000.00000.00-0'
  tituloEleitor: string // '0000 0000 0000'
  celular: Celular // formatado '(11) 98734-2156'
  email: Email // usuario 'maria.ribeiro.4821', endereco '…@tuamaeaquelaursa.com', caixaUrl
  senha: string // 12 caracteres
  endereco: Endereco // cep '01310-100', logradouro, numero (string), complemento, bairro, cidade, uf, ddd
  empresa: Empresa // razaoSocial, nomeFantasia, cnpj
  cartao: Cartao // numeroFormatado '4242 4242 4242 4242', validade 'MM/AA', cvv
}
```

**Valores dos kinds automáticos em `valorPara`:**

- `primeiroNome` = `nome.prenome`; `sobrenome` = os dois sobrenomes juntos;
- `usuario` = `email.usuario`;
- `enderecoCompleto` = `"{logradouro}, {numero}, {complemento} - {bairro}, {cidade} - {uf}, {cep}"`;
- `cidadeUf` = `"{cidade} / {uf}"`;
- `pais` tenta `BR`, `BRA`, `076`, `Brasil`, `Brazil`;
- `sexo` num `<select>` tenta `Feminino`, `Mulher`, `Female` e **por último** `F` (o masculino: `Masculino`, `Homem`, `Male`, `M`). A sigla vai por último porque num select `h`/`m` (Homem/Mulher) o `m` é Mulher. Fora de select, devolve `nome.sexo` (`'F'`/`'M'`).

**Já feito na fase 1:** o passo `Lint (tools package)` (`pnpm --filter @piluvitu/tools lint`) no job `web` do `ci.yml`, logo antes de `Test (tools package)`, e a menção a esse lint na linha do `ci.yml` do `CLAUDE.md` raiz. A fase 2 **não** adiciona esse passo de novo (seria um passo duplicado, que o YAML aceita em silêncio); ao reescrever a linha do `ci.yml` no `CLAUDE.md` raiz, mantém a menção.

---

## Fase 2 → `apps/extensao` (`@piluvitu/extensao`)

### `src/lib/` (lógica da extensão, testada com Vitest)

```ts
// src/lib/hoje.ts
export function hojeISO(agora?: Date): string // 'aaaa-mm-dd' em America/Sao_Paulo

// src/lib/armazenamento.ts
export const pessoaItem: WxtStorageItem<Pessoa | null, {}> // storage.defineItem('local:pessoa', { fallback: null, version: 1 })
export function gerarPessoaNova(): Promise<Pessoa> // gera com seedFromBytes(cryptoRandomBytes(16)) + hojeISO(), grava e devolve
export function obterOuGerarPessoa(): Promise<Pessoa> // devolve a guardada ou gera uma

// src/lib/paginas.ts
export type SituacaoPagina = 'ok' | 'proibida' | 'arquivo-sem-acesso'
export function situacaoDaUrl(
  url: string | undefined,
  acessoArquivo: boolean,
): SituacaoPagina
export function erroEhPaginaProibida(mensagem: string): boolean // mensagens do executeScript (spec §7)

// src/lib/resultado.ts  (puro)
export interface LinhaCampo {
  documentId: string
  idx: number
  rotulo: string
  seletor: string
}
export interface ResultadoFrame {
  // devolvido por __pv.preencher em cada frame
  preenchidos: Omit<LinhaCampo, 'documentId'>[]
  naoReconhecidos: Omit<LinhaCampo, 'documentId'>[]
  recusados: Omit<LinhaCampo, 'documentId'>[]
  contentType: string // document.contentType
  iframesDeFora: number // só relevante no frame 0
}
export interface ResumoPreenchimento {
  x: number
  y: number
  k: number // spec §6.1 "Contagem"
  naoReconhecidos: LinhaCampo[] // naoReconhecidos + recusados, na ordem do DOM; recusados com rotulo + ' (recusou o valor)'
  contentType: string
  iframesDeFora: number
}
export function somarFrames(
  resultados: {
    documentId: string
    frameId: number
    result: ResultadoFrame | null | undefined
  }[],
): ResumoPreenchimento

// src/lib/textos.ts  (puro: todos os textos com plural do spec §8)
export function tituloPreenchimento(x: number, y: number): string // '12 de 14 campos preenchidos' / '1 de 1 campo preenchido'
export function linhaNaoReconhecidos(k: number): string // '2 não reconhecidos' / '1 não reconhecido'

// src/lib/menus.ts
export const ITENS_INSERIR: readonly {
  kind: FieldKind
  rotulo: string
  grupo: 1 | 2 | 3 | 4 | 5
}[] // os 23 do 1g, na ordem
export function criarMenus(pessoa: Pessoa | null): Promise<void> // removeAll + create (contextos do spec §7)
export function atualizarTitulosMenu(pessoa: Pessoa | null): Promise<void> // 'CPF · …' / 'CEP · …' ou só 'CPF'/'CEP'

// src/lib/mensagens.ts
export type Mensagem =
  | { tipo: 'preencher'; tabId: number }
  | { tipo: 'mostrar'; tabId: number; documentId: string; idx: number }
  | { tipo: 'inserir'; tabId: number; frameId: number; kind: FieldKind } // só aceito no modo e2e
export type RespostaPreencher =
  | { ok: true; resumo: ResumoPreenchimento }
  | { ok: false; motivo: 'proibida' | 'arquivo-sem-acesso' }
export function enviar(m: Mensagem): Promise<unknown> // runtime.sendMessage
```

### Background (`src/entrypoints/background/`)

```ts
export function preencherPagina(tabId: number): Promise<RespostaPreencher> // spec §7 Preencher (modo A)
export function inserirNoCampo(
  tabId: number,
  frameId: number,
  kind: FieldKind,
): Promise<void> // spec §7 Inserir (modo B)
export function mostrarCampo(
  tabId: number,
  documentId: string,
  idx: number,
): Promise<boolean>
// onMessage: sendResponse + `return true` literal (nunca Promise)
```

### Content script (`src/entrypoints/preencher.content/`), registro `runtime`, API em `globalThis.__pv`

```ts
interface ApiPv {
  preencher(pessoa: Pessoa, hojeISO: string): ResultadoFrame
  inserir(
    pessoa: Pessoa,
    kind: FieldKind,
  ): { ok: true } | { ok: false; motivo: 'sem-foco' | 'recusado' }
  mostrar(idx: number): boolean
  aviso(a: { titulo: string; linha2?: string; erro?: boolean }): void // só chamado no frame 0
}
```

O arquivo injetado é `/content-scripts/preencher.js`.

### Popup (`src/entrypoints/popup/` + `src/components/`)

- **Componentes de apresentação** (props in, sem `browser.*`): `PopupShell`, `PilulaHost`, `Rodape`, `PrimeiroUso` (1a), `PessoaPronta` (1b), `LinhaCopiavel`, `FiltroChips`.
- **Fase 3 acrescenta:** `ResultadoPreenchimento` (1c), `NenhumCampo` (1d), `PaginaProibida` (1e).
- **Aba-alvo:** `useAbaAlvo()` usa `tabs.query({active: true, currentWindow: true})`, e só no modo e2e aceita `?aba=<tabId>`.

---

## Fase 3

Usa tudo o que a fase 2 entrega, sem renomear nada. Acrescenta:

- os componentes do 1c, 1d e 1e;
- a mensagem `mostrar` no popup;
- a 2ª passada do CEP dentro de `__pv.preencher` (agendada por `ctx.setTimeout(…, 1000)`);
- os avisos de falha de `inserirNoCampo` e de Y = 0 via `__pv.aviso({erro: true})`;
- o workflow `.github/workflows/extensao-e2e.yml`.

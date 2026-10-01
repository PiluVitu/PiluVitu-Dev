# Extensão de dados de teste, Fase 1: geradores e classificador em `packages/tools` — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pôr em `@piluvitu/tools` toda a lógica pura da extensão de dados de teste: os geradores da pessoa brasileira falsa e coerente (`gerarPessoa`), o classificador de campos de formulário e o `valorPara`, portados da pesquisa, com Jest e o script `lint`, sem tocar em nenhum app.

**Architecture:** Um arquivo por módulo em `packages/tools/src/`, exportado só por subpath com o nome do arquivo (sem barrel). Toda aleatoriedade entra por um `Rng` injetável (`Pick<Prng, 'int'>`), com `rngPadrao` como padrão, então `gerarCPF()`/`gerarCNPJ()` sem argumento continuam iguais para o `apps/web`. O código vem dos protótipos verificados da pesquisa ("portar, não reescrever"): os arquivos que não mudam são copiados com `cp`; os que mudam aparecem inteiros aqui, com a lista do que difere do protótipo.

**Tech Stack:** TypeScript 5.9 (`strict`, `isolatedModules`), Jest 30 + ts-jest 29 (ambiente jsdom, `jest.config.ts` já existente), pnpm 11 workspaces. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-01-extensao-dados-teste-design.md`. Esta fase cobre o §5, o §6.1, o §6.2, a linha `packages/tools` do §11, as duas linhas Jest do §12 e o §14.1.

**Contrato entre as fases (nomes e tipos obrigatórios):** `docs/superpowers/plans/2026-10-01-extensao-interfaces.md`, seção "Fase 1".

**Pesquisa** (abreviada `R/` abaixo): `docs/superpowers/research/2026-10-01-extensao-dados-teste/`. Arquivos usados: `geradores/*.ts`, `deteccao/campos.ts`, `deteccao/formatar.ts`, `deteccao/campos.test.ts`, `relatorios/geradores.md`, `relatorios/deteccao.md`, `relatorios/critic.md`.

## Global Constraints

- **Não toca em nenhum app.** `apps/web/components/tools/cpf-tool.tsx`, `apps/web/components/tools/cnpj-tool.tsx` e `apps/web/app/(site)/tools/tools.e2e.ts` ficam intactos. `gerarCPF()` e `gerarCNPJ()` chamados sem argumento continuam funcionando.
- **Os nomes e tipos do contrato são obrigatórios.** Não renomeie nada. Em especial: `Classificacao.confianca` (o protótipo usa `confidence`), `classificarFormulario(ds: FieldDescriptor[], hojeISO: string)` (o protótipo usa `anoAtual = 2026`) e `valorPara(kind, pessoa, d, dicas?)` com a `Pessoa` **aninhada** (o protótipo usa uma pessoa plana).
- **Exports por subpath com o mesmo nome do arquivo:** `"./rg": "./src/rg.ts"`. **Nada novo em `src/index.ts`.** O `jest.config.ts` do `apps/web` mapeia `^@piluvitu/tools/(.*)$` para `packages/tools/src/$1`, então um subpath diferente do nome do arquivo quebra o Jest do web.
- **Lógica pura:** sem DOM, sem React, sem dependência nova.
- **Cada gerador recebe `rng: Rng = rngPadrao` como primeiro argumento.**
- **Senha: 12 caracteres por padrão** (o protótipo usa 14), garantindo maiúscula, minúscula, dígito e um símbolo de `!@#$%&*`.
- **Cartão: só os números documentados da Stripe**, Visa `4242424242424242` e Mastercard `5555555555554444`. Validade entre hoje + 12 e hoje + 59 meses, CVV de 3 dígitos. Sem `Gateway`, sem `OpcoesCartao`, sem `resultadoEsperado`.
- **Endereço: catálogo de 34 CEPs reais** conferidos no ViaCEP, cobrindo as 27 UFs, com o número dentro da faixa e do lado do CEP.
- **Nascimento: idade de 18 a 65 anos em relação a `hojeISO`**, só calendário, sem fuso.
- **Sem ano fixo no código:** o classificador lê o ano de `hojeISO`.
- **`LIMIAR = 0.5`.**
- **Fora do escopo desta fase:** `validarCNPJAlfanumerico`, o campo `versao` e o parâmetro `opcoes` de `gerarPessoa`.
- **Comentário em código de produção segue a lei do `CLAUDE.md` raiz:** raro, 1 a 3 linhas, só o porquê que o código não mostra. Os comentários que os protótipos copiados trazem foram conferidos e ficam (citam a fonte de uma tabela ou registram um porquê). Nos testes, comentário é livre.
- **Testes colocados** em `packages/tools/src/<modulo>.test.ts`, com Jest. Nunca numa pasta `tests/`.
- **Comandos.** O wrapper `rtk` do shell **falsifica** a saída de git, prettier e vitest. Use git sempre como `/usr/bin/git`; Jest como `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest <arquivos>`; tsc pelo binário (`./node_modules/.bin/tsc`); e **sempre `echo $?`** depois de cada comando cujo resultado decide algo. `pnpm --filter <pacote> <script>` também vale.
- **Commits:** convencionais, em português, no estilo do repo (`feat(tools): …`), com `/usr/bin/git`, na branch atual `feat/extensao-dados-teste`. **Nunca `push`.** O pre-commit (`lint-staged` → `prettier --write`) roda sozinho e pode reformatar o que foi colado; isso é esperado.
- **Regras do dono:** depois de cada implementação, `lint` (tsc) e Jest sem erro; o `packages/tools/CLAUDE.md` é atualizado na mesma tarefa que muda o pacote, e o `CLAUDE.md` raiz na tarefa que muda o CI (Tarefa 1). Esta fase não cria componente visual nem fluxo de UI, então não há story nem `.e2e.ts` novo. O único fluxo crítico já existente que ela toca, o CPF do `/tools`, é conferido com o Playwright do `apps/web` na Tarefa 1.
- **Sem devcontainer:** o repo não tem `.devcontainer` (spec §12). Jest, tsc e Playwright rodam no host, como nos outros workspaces.
- **Fronteira com a fase 2:** esta fase já põe o passo `Lint (tools package)` no job `web` do `ci.yml` e já cita esse lint na linha do `ci.yml` do `CLAUDE.md` raiz (Tarefa 1). A fase 2 não repete nenhum dos dois; quando trocar o job `api` por `extensao` naquela linha, parte do texto que esta fase deixou.

## Review Focus

1. **Telefone fixo chegando por outra fonte que não o label.** Um `<input type="tel">` "Telefone residencial", um `autocomplete="home tel"` ou `"work tel-national"`, ou um label "Fixo" com placeholder `(00) 0000-0000` precisam ficar "não reconhecidos", nunca receber o celular. A spec põe o veto só na regex do celular, mas o `type=tel`, o formato do placeholder e o `autocomplete` trazem o celular de volta. Testes na Tarefa 6 (`telefone fixo nunca recebe o celular`).
2. **UF e número do RG fora do label "UF do RG".** "UF de expedição" passava como `uf`. Um "UF" ou um "Número" soltos dentro de um fieldset "RG" recebiam a UF e o número do **endereço**: o "Número" vira `numeroEndereco` por ter um `uf` como vizinho. Os dois precisam ficar não reconhecidos. Testes na Tarefa 6 (`UF e número do RG nunca recebem o endereço`).
3. **Virada de ano.** Com `hojeISO` em outro ano, os anos das opções de um `<select>` são lidos contra esse ano: 2025..2035 é validade em 2026 e deixa de ser em 2031. Um `hojeISO` inválido lança, em vez de virar `NaN` em silêncio. Testes na Tarefa 6 (`sem ano fixo: o ano vem de hojeISO`).
4. **Senha maior que o `maxLength`.** `valorPara('senha', …)` com `maxLength: 8` devolve a senha inteira, de 12 caracteres. Truncar quebraria o login seguinte; quem escreve no DOM (fase 2) vê o campo recusar e conta como "recusado". Teste na Tarefa 7.
5. **`<select>` sem a opção da pessoa, e o H/M do sexo.** Pessoa do RN num select só com SP e RJ, país sem Brasil, cidade ausente: o resultado é `null`, nunca uma opção errada. E num select `h`/`m` (Homem/Mulher), a ordem da spec (§6.1: `'M'` primeiro) casava o valor `m` = **Mulher** para um homem. Por isso os nomes por extenso vêm primeiro e a sigla por último (o contrato já registra essa ordem). Testes na Tarefa 7 (`sem a opção da pessoa…`, `sexo tenta…`).

---

## Mapa de arquivos

Tudo em `packages/tools/`, menos a linha do CI.

| Arquivo                                                                         | Tarefa | Responsabilidade                                                              | Origem                                                         |
| ------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `package.json`                                                                  | 1–7    | script `lint`; um subpath por módulo novo                                     | —                                                              |
| `src/aleatorio.ts` (+ teste)                                                    | 1      | `Rng`, `rngPadrao`, sorteios                                                  | `cp R/geradores/aleatorio.ts`                                  |
| `src/uf.ts` (+ teste)                                                           | 1      | UFs, código TSE, região fiscal, `UF_NOME`                                     | `cp R/geradores/uf.ts` + `UF_NOME` de `R/deteccao/formatar.ts` |
| `src/rng-teste.ts`                                                              | 1      | `sementes`, `sequencia`, `minimo`, `maximo` para os testes; sem subpath       | novo                                                           |
| `src/cpf.ts`, `src/cnpj.ts` (+ testes existentes)                               | 1      | geradores com `Rng`, compatíveis                                              | `cp R/geradores/cpf.ts`; `cnpj.ts` sem o alfanumérico          |
| `src/rg.ts`, `src/pis.ts`, `src/titulo-eleitor.ts` (+ testes)                   | 2      | documentos                                                                    | `cp`                                                           |
| `src/celular.ts`, `src/nascimento.ts`, `src/senha.ts`, `src/nome.ts` (+ testes) | 3      | dados pessoais                                                                | `cp`; senha 14 → 12                                            |
| `src/endereco.ts`, `src/empresa.ts`, `src/cartao.ts` (+ testes)                 | 4      | endereço real, empresa, cartão Stripe                                         | `cp`; `cartao.ts` simplificado                                 |
| `src/pessoa.ts` (+ teste)                                                       | 5      | `gerarPessoa` coerente e a pessoa dourada                                     | protótipo sem `versao` e sem `opcoes`                          |
| `src/campos.ts` (+ teste)                                                       | 6      | classificador                                                                 | `R/deteccao/campos.ts` com os ajustes                          |
| `src/campos-formatar.ts` (+ teste)                                              | 7      | `valorPara`, `caber`, `escolherOpcao`                                         | `R/deteccao/formatar.ts` sobre a `Pessoa` aninhada             |
| `CLAUDE.md`                                                                     | 1–7    | módulos, subpaths, armadilhas, contagem                                       | —                                                              |
| `.github/workflows/ci.yml` (raiz do repo)                                       | 1      | passo `Lint (tools package)` no job `web`                                     | —                                                              |
| `CLAUDE.md` (raiz do repo)                                                      | 1      | o job `web` da tabela de workflows passa a citar o `lint` do `packages/tools` | —                                                              |

**Contagem do Jest do `packages/tools`** (hoje: 15 suítes, 158 testes, conferido em 2026-10-01): T1 → 17/228 · T2 → 20/274 · T3 → 24/290 · T4 → 27/333 · T5 → 28/336 · T6 → 29/451 · T7 → 30/467. Os números de cada passo abaixo foram medidos rodando este plano inteiro numa cópia do pacote.

**O que é portado da pesquisa.**

- Dos **172 testes dos geradores**, 149 são portados. Quatro deles com ajuste: a pessoa dourada, a senha de 12, o exemplo de CNPJ da Receita (agora no validador numérico) e a validade do cartão (sem Amex). Os 23 que ficam de fora testavam só o que saiu do escopo: 21 checagens de Luhn de números de outros gateways, "gateway com dados fixos" e "sem candidato lança".
- Dos **103 testes do classificador**, os 103 são portados, com os 3 ajustes do §12 da spec: #67 passa a esperar `null`, #77 passa a esperar `cidadeUf`, e F9/F12 conferem as `dicas`. Os 7 testes de formatação mudam só os valores esperados, porque a pessoa de teste agora é a dourada (válida) e não a do protótipo.
- Os testes novos cobrem os módulos que a pesquisa não testava sozinhos (`aleatorio`, `uf`, `empresa`) e as bordas do Review Focus.

---

### Tarefa 1: `aleatorio`, `uf`, CPF/CNPJ com `Rng` e o script `lint`

**Files:**

- Modify: `packages/tools/package.json` (script `lint`; exports `./aleatorio` e `./uf`)
- Create: `packages/tools/src/aleatorio.ts`, `packages/tools/src/aleatorio.test.ts`
- Create: `packages/tools/src/uf.ts`, `packages/tools/src/uf.test.ts`
- Create: `packages/tools/src/rng-teste.ts`
- Modify: `packages/tools/src/cpf.ts`, `packages/tools/src/cpf.test.ts`
- Modify: `packages/tools/src/cnpj.ts`, `packages/tools/src/cnpj.test.ts`
- Modify: `.github/workflows/ci.yml` (job `web`)
- Modify: `packages/tools/CLAUDE.md`
- Modify: `CLAUDE.md` (raiz: linha do `ci.yml` na tabela "Workflows GitHub Actions")

**Interfaces:**

- Consumes: `interface Prng` e `sfc32(a, b, c, d): Prng` de `packages/tools/src/prng.ts` (existente, não muda).
- Produces:

```ts
// @piluvitu/tools/aleatorio
export type Rng = Pick<Prng, 'int'>
export const rngPadrao: Rng
export function escolher<T>(rng: Rng, itens: readonly T[]): T
export function embaralhar<T>(rng: Rng, itens: readonly T[]): T[]
export function digitosAleatorios(rng: Rng, quantidade: number): number[]
export function somenteDigitos(valor: string): string

// @piluvitu/tools/uf
export const UFS: readonly ['AC', 'AL', /* …27 siglas… */ 'TO']
export type UF = (typeof UFS)[number]
export const CODIGO_UF_TITULO: Record<UF | 'ZZ', string>
export const REGIAO_FISCAL_CPF: Record<UF, number>
export const UF_NOME: Record<UF, string>

// @piluvitu/tools/cpf e @piluvitu/tools/cnpj
export function gerarCPF(rng: Rng = rngPadrao, uf?: UF): string
export function validarCPF(value: string): boolean
export function gerarCNPJ(rng: Rng = rngPadrao): string
export function validarCNPJ(value: string): boolean

// src/rng-teste.ts: só para os testes, sem subpath
export const sementes: (n: number) => Prng[]
export const sequencia: (valores: number[]) => Rng
export const minimo: Rng // int() sempre 0
export const maximo: Rng // int(n) sempre n - 1
```

- [ ] **Step 1: Criar o script `lint` e confirmar que passa hoje**

Em `packages/tools/package.json`, troque o bloco `scripts` por:

```json
  "scripts": {
    "lint": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch"
  }
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev && pnpm --filter @piluvitu/tools lint; echo $?`
Expected: nenhum erro do tsc e `0`. O `tsc --noEmit` do pacote já passa hoje; a partir daqui o `pnpm -r lint` deixa de pular o pacote.

- [ ] **Step 2: Escrever os testes que falham**

Crie `packages/tools/src/rng-teste.ts`:

```ts
import type { Rng } from './aleatorio'
import { type Prng, sfc32 } from './prng'

export const sementes = (n: number): Prng[] =>
  Array.from({ length: n }, (_, i) =>
    sfc32(i, i * 31, i * 17 + 3, 0x9e3779b9 ^ i),
  )

export const sequencia = (valores: number[]): Rng => ({
  int: () => valores.shift()!,
})

export const minimo: Rng = { int: () => 0 }
export const maximo: Rng = { int: (n) => n - 1 }
```

Crie `packages/tools/src/aleatorio.test.ts`:

```ts
import { sfc32 } from './prng'
import {
  type Rng,
  rngPadrao,
  escolher,
  embaralhar,
  digitosAleatorios,
  somenteDigitos,
} from './aleatorio'

describe('aleatorio', () => {
  test('o Prng do prng.ts serve como Rng', () => {
    const rng: Rng = sfc32(1, 2, 3, 4)
    const n = rng.int(10)
    expect(n).toBeGreaterThanOrEqual(0)
    expect(n).toBeLessThan(10)
  })

  test('rngPadrao.int fica em [0, n)', () => {
    for (let i = 0; i < 1000; i++) {
      const n = rngPadrao.int(7)
      expect(Number.isInteger(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(7)
    }
  })

  test('escolher devolve o item do índice sorteado', () => {
    expect(escolher({ int: () => 2 }, ['a', 'b', 'c'])).toBe('c')
  })

  test('embaralhar devolve uma permutação sem mudar a entrada', () => {
    const entrada = [1, 2, 3, 4, 5]
    const saida = embaralhar(sfc32(7, 7, 7, 7), entrada)
    expect(entrada).toEqual([1, 2, 3, 4, 5])
    expect([...saida].sort((a, b) => a - b)).toEqual(entrada)
  })

  test('embaralhar é determinístico por semente', () => {
    expect(embaralhar(sfc32(3, 3, 3, 3), [1, 2, 3, 4, 5])).toEqual(
      embaralhar(sfc32(3, 3, 3, 3), [1, 2, 3, 4, 5]),
    )
  })

  test('digitosAleatorios devolve n dígitos de 0 a 9', () => {
    const d = digitosAleatorios(sfc32(1, 1, 1, 1), 50)
    expect(d).toHaveLength(50)
    expect(d.every((x) => Number.isInteger(x) && x >= 0 && x <= 9)).toBe(true)
  })

  test('somenteDigitos tira a máscara', () => {
    expect(somenteDigitos('529.982.247-25')).toBe('52998224725')
    expect(somenteDigitos('(11) 98734-2156')).toBe('11987342156')
  })
})
```

Crie `packages/tools/src/uf.test.ts`:

```ts
import { UFS, UF_NOME, CODIGO_UF_TITULO, REGIAO_FISCAL_CPF } from './uf'

describe('uf', () => {
  test('27 UFs, sem repetição', () => {
    expect(new Set(UFS).size).toBe(27)
  })

  test.each(UFS)('%s tem nome, código TSE e região fiscal', (uf) => {
    expect(UF_NOME[uf]).toMatch(/^[A-Z][a-zà-ú]+( (de|do|da|[A-Z][a-zà-ú]+))*$/)
    expect(CODIGO_UF_TITULO[uf]).toMatch(/^(0[1-9]|1\d|2[0-7])$/)
    expect(REGIAO_FISCAL_CPF[uf]).toBeGreaterThanOrEqual(0)
    expect(REGIAO_FISCAL_CPF[uf]).toBeLessThanOrEqual(9)
  })

  test('códigos TSE únicos, com o exterior (ZZ) em 28', () => {
    expect(new Set(Object.values(CODIGO_UF_TITULO)).size).toBe(28)
    expect(CODIGO_UF_TITULO.ZZ).toBe('28')
  })

  test('UF_NOME traz o nome com acento', () => {
    expect(UF_NOME.SP).toBe('São Paulo')
    expect(UF_NOME.PI).toBe('Piauí')
    expect(UF_NOME.DF).toBe('Distrito Federal')
  })
})
```

Em `packages/tools/src/cpf.test.ts`, troque a 1ª linha (`import { gerarCPF, validarCPF } from './cpf'`) por:

```ts
import { sfc32 } from './prng'
import { gerarCPF, validarCPF } from './cpf'
import { UFS, REGIAO_FISCAL_CPF } from './uf'
import { sementes, sequencia } from './rng-teste'
```

e acrescente ao fim do arquivo (os 6 testes que já existem não mudam):

```ts
describe('CPF com Rng injetado', () => {
  test('é determinístico por semente', () => {
    expect(gerarCPF(sfc32(1, 1, 1, 1))).toBe('855.556.330-50')
    expect(gerarCPF(sfc32(7, 7, 7, 7))).toBe('324.553.270-94')
  })

  test('chamada sem argumento continua funcionando (consumidor de apps/web)', () => {
    expect(validarCPF(gerarCPF())).toBe(true)
  })

  test('descarta base com 9 dígitos iguais e segue a sequência', () => {
    const rng = sequencia([
      3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
    expect(gerarCPF(rng)).toBe('123.456.789-09')
  })

  test.each(UFS)('nono dígito segue a região fiscal de %s', (uf) => {
    const cpf = gerarCPF(sfc32(5, 6, 7, 8), uf)
    expect(Number(cpf[10])).toBe(REGIAO_FISCAL_CPF[uf])
    expect(validarCPF(cpf)).toBe(true)
  })

  test('1000 sementes geram CPFs válidos', () => {
    for (const r of sementes(1000)) expect(validarCPF(gerarCPF(r))).toBe(true)
  })
})
```

Em `packages/tools/src/cnpj.test.ts`, troque a 1ª linha (`import { gerarCNPJ, validarCNPJ } from './cnpj'`) por:

```ts
import { sfc32 } from './prng'
import { gerarCNPJ, validarCNPJ } from './cnpj'
import { sementes } from './rng-teste'
```

e acrescente ao fim do arquivo. O teste do CNPJ alfanumérico da pesquisa vira só a parte numérica dele, no validador que existe:

```ts
describe('CNPJ com Rng injetado', () => {
  test('é determinístico e válido', () => {
    expect(gerarCNPJ(sfc32(1, 1, 1, 1))).toBe('85.555.633/0001-19')
    for (const r of sementes(1000)) expect(validarCNPJ(gerarCNPJ(r))).toBe(true)
  })

  test('aceita o exemplo numérico clássico 11.222.333/0001-81', () => {
    expect(validarCNPJ('11.222.333/0001-81')).toBe(true)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/aleatorio.test.ts src/uf.test.ts src/cpf.test.ts src/cnpj.test.ts; echo $?`
Expected: `1`. `aleatorio.test.ts` falha com `Cannot find module './aleatorio'`; `uf.test.ts` e `cpf.test.ts`, com `Cannot find module './uf'`; em `cnpj.test.ts`, `CNPJ com Rng injetado › é determinístico e válido` falha, porque o `gerarCNPJ` atual ignora o argumento.

- [ ] **Step 4: Portar `aleatorio`, `uf` e `cpf`; reescrever `cnpj`**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev
R=docs/superpowers/research/2026-10-01-extensao-dados-teste/geradores
cp $R/aleatorio.ts $R/uf.ts $R/cpf.ts packages/tools/src/
```

Os três ficam como no protótipo. Acrescente ao fim de `packages/tools/src/uf.ts` (a tabela vem de `R/deteccao/formatar.ts`, agora tipada por `UF`):

```ts
export const UF_NOME: Record<UF, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
}
```

Substitua `packages/tools/src/cnpj.ts` inteiro por este conteúdo. É o protótipo `R/geradores/cnpj.ts` sem `validarCNPJAlfanumerico` e sem o comentário dele (CNPJ alfanumérico está fora do escopo):

```ts
import { type Rng, rngPadrao, digitosAleatorios } from './aleatorio'

const WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

function calcDigit(digits: number[], weights: number[]): number {
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0)
  const rem = sum % 11
  return rem < 2 ? 0 : 11 - rem
}

export function gerarCNPJ(rng: Rng = rngPadrao): string {
  const base = digitosAleatorios(rng, 8)
  const branch = [0, 0, 0, 1]
  const all = [...base, ...branch]
  all.push(calcDigit(all, WEIGHTS_1))
  all.push(calcDigit(all, WEIGHTS_2))
  const s = all.join('')
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`
}

export function validarCNPJ(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 14) return false
  if (/^(\d)\1{13}$/.test(digits)) return false
  const nums = digits.split('').map(Number)
  const d1 = calcDigit(nums.slice(0, 12), WEIGHTS_1)
  const d2 = calcDigit(nums.slice(0, 13), WEIGHTS_2)
  return nums[12] === d1 && nums[13] === d2
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/aleatorio.test.ts src/uf.test.ts src/cpf.test.ts src/cnpj.test.ts; echo $?`
Expected: `Tests: 82 passed, 82 total` e `0`.

- [ ] **Step 6: Exportar os subpaths**

Em `packages/tools/package.json`, dentro de `exports`, troque a última linha `"./import/id": "./src/import/id.ts"` por:

```json
    "./import/id": "./src/import/id.ts",
    "./aleatorio": "./src/aleatorio.ts",
    "./uf": "./src/uf.ts"
```

`src/rng-teste.ts` **não** ganha subpath, e `src/index.ts` não muda.

- [ ] **Step 7: Pacote inteiro e o consumidor `apps/web`**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools
./node_modules/.bin/tsc --noEmit; echo $?
./node_modules/.bin/jest; echo $?
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/web
./node_modules/.bin/tsc --noEmit; echo $?
./node_modules/.bin/jest --passWithNoTests; echo $?
./node_modules/.bin/playwright test tools/tools.e2e.ts --grep "CPF tool"; echo $?
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git status --short apps/
```

Expected, na ordem:

- tsc do tools: `0`;
- Jest do tools: `Test Suites: 17 passed, 17 total`, `Tests: 228 passed, 228 total`, `0`;
- tsc do web: `0`;
- Jest do web: `Test Suites: 21 passed, 21 total`, `Tests: 128 passed, 128 total`, `0` (os mesmos números de antes desta fase);
- Playwright: `3 passed` e `0`. O filtro de arquivo do Playwright é uma **regex**: escrito como `"app/(site)/tools/tools.e2e.ts"`, o `(site)` vira um grupo, não casa com o caminho real e o comando sai `1` com `Error: No tests found` (conferido). Por isso o filtro é `tools/tools.e2e.ts`, sem parênteses. O `webServer` do `playwright.config.ts` sobe o `pnpm dev` na porta 3333 sozinho; se a porta estiver presa, rode `make stop` antes. Não há E2E da tela de CNPJ; o `gerarCNPJ()` sem argumento fica coberto pelos 6 testes antigos de `cnpj.test.ts`, que o chamam assim;
- `git status --short apps/`: nenhuma linha.

- [ ] **Step 8: Passo de lint do tools no CI**

Em `.github/workflows/ci.yml`, no job `web`, logo **antes** do passo

```yaml
- name: Test (tools package)
  run: pnpm --filter @piluvitu/tools test
```

insira (mesma indentação de 6 espaços, seguido de uma linha em branco), ao lado do teste do pacote, como diz a spec §11:

```yaml
- name: Lint (tools package)
  run: pnpm --filter @piluvitu/tools lint
```

Confira que o passo existe uma vez só e que o YAML continua válido:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev
/usr/bin/grep -c 'name: Lint (tools package)' .github/workflows/ci.yml
python3 -c "import yaml; d = yaml.safe_load(open('.github/workflows/ci.yml')); print([s.get('name') for s in d['jobs']['web']['steps']])"; echo $?
```

Expected: `1`; a lista dos passos do `web` com `'Lint (tools package)'` logo antes de `'Test (tools package)'`; `0`.

- [ ] **Step 9: Documentar no `packages/tools/CLAUDE.md`**

Na seção "Propósito", troque a linha

```markdown
- **Rodar:** `pnpm --filter @piluvitu/tools test` ou `pnpm -r test` / `make test` na raiz.
```

por:

```markdown
- **Rodar:** `pnpm --filter @piluvitu/tools test` ou `pnpm -r test` / `make test` na raiz.
- **Tipos:** `pnpm --filter @piluvitu/tools lint` (`tsc --noEmit`), que também roda no job `web` do CI. Até 2026-10 o pacote não tinha `lint`: só era checado pelos apps que o importam, e o `pnpm -r lint` o pulava em silêncio.
```

E insira esta seção logo antes de `## Dependency policy`:

```markdown
## Pessoa de teste e classificador de campos (extensão de dados de teste)

Lógica pura da extensão `apps/extensao` (spec `docs/superpowers/specs/2026-10-01-extensao-dados-teste-design.md`; nomes e tipos fixados em `docs/superpowers/plans/2026-10-01-extensao-interfaces.md`), portada dos protótipos verificados em `docs/superpowers/research/2026-10-01-extensao-dados-teste/`. Cada módulo é exportado **só por subpath**, com o nome do arquivo (`@piluvitu/tools/rg` → `src/rg.ts`). Nada entra no barrel.

### Aleatoriedade injetável

- `aleatorio`: `type Rng = Pick<Prng, 'int'>` (o `Prng` de `prng.ts` serve direto) e `rngPadrao` (`Math.random`). Todo gerador recebe `rng: Rng = rngPadrao` como 1º argumento; a extensão sorteia com `seedFromBytes(cryptoRandomBytes(16))`.
- **`gerarCPF()` e `gerarCNPJ()` sem argumento continuam iguais** para o `apps/web` (`cpf-tool.tsx`, `cnpj-tool.tsx`, `tools.e2e.ts`). Não passe um gerador direto como handler (`onClick={gerarCPF}`): o evento viraria o `rng`.
- Os testes sorteiam com `src/rng-teste.ts` (`sementes(n)`, `sequencia([...])`, `minimo`, `maximo`), que não tem subpath e não é código de produção.

| Subpath     | O que tem                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `aleatorio` | `Rng`, `rngPadrao`, `escolher`, `embaralhar`, `digitosAleatorios`, `somenteDigitos`                                        |
| `uf`        | `UFS`, `UF`, `CODIGO_UF_TITULO` (tabela do TSE; exterior `ZZ` = `28`), `REGIAO_FISCAL_CPF` (folheto da Receita), `UF_NOME` |
| `cpf`       | `gerarCPF(rng?, uf?)`: com `uf`, o 9º dígito é a região fiscal; base com os 9 dígitos iguais é sorteada de novo            |
| `cnpj`      | `gerarCNPJ(rng?)`, filial `0001`, só dígitos. O CNPJ alfanumérico (jul/2026) fica fora: `validarCNPJ` ainda o recusa       |
```

- [ ] **Step 10: Documentar o passo novo do CI no `CLAUDE.md` raiz**

O Step 8 mudou o que o job `web` roda, e a tabela "Workflows GitHub Actions" do `CLAUDE.md` raiz descreve esse job. Na linha do `ci.yml`, troque o trecho

```markdown
web (`lint` + `lint`/`test` de `packages/ui` + `tsc --noEmit` + `jest` + `next build:ci`, gate do `@source` incluso)
```

por

```markdown
web (`lint` + `lint`/`test` de `packages/ui` + `lint` (`tsc --noEmit`) de `packages/tools` + `tsc --noEmit` + `jest` + `next build:ci`, gate do `@source` incluso)
```

Só esse trecho muda. O resto da linha (o job `api` já removido, que a fase 2 troca por `extensao`) fica como está. O pre-commit pode realinhar o preenchimento da tabela inteira; isso é esperado.

- [ ] **Step 11: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev
/usr/bin/git add packages/tools/package.json packages/tools/CLAUDE.md .github/workflows/ci.yml CLAUDE.md \
  packages/tools/src/aleatorio.ts packages/tools/src/aleatorio.test.ts \
  packages/tools/src/uf.ts packages/tools/src/uf.test.ts packages/tools/src/rng-teste.ts \
  packages/tools/src/cpf.ts packages/tools/src/cpf.test.ts \
  packages/tools/src/cnpj.ts packages/tools/src/cnpj.test.ts
/usr/bin/git commit -m "feat(tools): Rng injetável no CPF/CNPJ, módulos aleatorio e uf, e lint com tsc"; echo $?
/usr/bin/git status --short packages/tools .github CLAUDE.md
```

Expected: `0`, e o `status` sem nenhuma linha.

---

### Tarefa 2: RG, PIS e título de eleitor

**Files:**

- Create: `packages/tools/src/rg.ts`, `packages/tools/src/rg.test.ts`
- Create: `packages/tools/src/pis.ts`, `packages/tools/src/pis.test.ts`
- Create: `packages/tools/src/titulo-eleitor.ts`, `packages/tools/src/titulo-eleitor.test.ts`
- Modify: `packages/tools/package.json` (exports), `packages/tools/CLAUDE.md`

**Interfaces:**

- Consumes (Tarefa 1): `type Rng`, `rngPadrao`, `digitosAleatorios` de `./aleatorio`; `type UF`, `CODIGO_UF_TITULO`, `UFS` de `./uf`; `sementes` de `./rng-teste`; `sfc32` de `./prng`.
- Produces:

```ts
// @piluvitu/tools/rg
export function dvRGSP(base: number[]): string // '0'..'9' ou 'X'
export function formatarRG(base: number[], dv: string): string
export function gerarRG(
  rng: Rng = rngPadrao,
  opcoes?: { permitirX?: boolean },
): string // 'NN.NNN.NNN-D'
export function validarRG(valor: string): boolean
// @piluvitu/tools/pis
export function dvPIS(base: number[]): number
export function gerarPIS(rng: Rng = rngPadrao): string // '000.00000.00-0'
export function validarPIS(valor: string): boolean
// @piluvitu/tools/titulo-eleitor
export type RegraTitulo = 'com-excecao-sp-mg' | 'sem-excecao'
export function dvsTitulo(
  sequencial: number[],
  codigoUf: string,
  regra: RegraTitulo,
): [number, number]
export function gerarTituloEleitor(
  rng: Rng = rngPadrao,
  uf: UF | 'ZZ' = 'SP',
): string // '0000 0000 0000'
export function validarTituloEleitor(
  valor: string,
  regra: RegraTitulo = 'com-excecao-sp-mg',
): boolean
```

- [ ] **Step 1: Escrever os testes que falham**

Crie `packages/tools/src/rg.test.ts`:

```ts
import { gerarRG, validarRG, dvRGSP } from './rg'
import { sementes } from './rng-teste'

describe('RG (modelo SSP-SP)', () => {
  test.each([
    ['56.843.539-4'],
    ['24.678.131-2'],
    ['38.452.917-3'],
    ['10.000.006-X'],
    ['10.000.001-0'],
  ])('aceita %s', (rg) => expect(validarRG(rg)).toBe(true))

  test('rejeita o RG do protótipo do design (DV calculado como o resto, não 11 - resto)', () => {
    expect(validarRG('38.452.917-8')).toBe(false)
    expect(dvRGSP([3, 8, 4, 5, 2, 9, 1, 7])).toBe('3')
  })

  test('por padrão nunca gera DV X; com permitirX gera', () => {
    const gerados = sementes(1000).map((r) => gerarRG(r))
    expect(gerados.every((rg) => validarRG(rg) && !rg.endsWith('X'))).toBe(true)
    const comX = sementes(1000).map((r) => gerarRG(r, { permitirX: true }))
    expect(comX.some((rg) => rg.endsWith('X'))).toBe(true)
    expect(comX.every(validarRG)).toBe(true)
  })

  test('formato NN.NNN.NNN-D', () => {
    for (const r of sementes(200))
      expect(gerarRG(r)).toMatch(/^\d{2}\.\d{3}\.\d{3}-\d$/)
  })
})
```

Crie `packages/tools/src/pis.test.ts`:

```ts
import { gerarPIS, validarPIS, dvPIS } from './pis'
import { sementes } from './rng-teste'

describe('PIS/PASEP/NIS', () => {
  test.each([['120.12345.67-2'], ['170.00000.01-3'], ['123.45678.90-0']])(
    'aceita %s',
    (pis) => expect(validarPIS(pis)).toBe(true),
  )

  test('rejeita DV errado e dígitos repetidos', () => {
    expect(validarPIS('120.12345.67-5')).toBe(false)
    expect(validarPIS('111.11111.11-1')).toBe(false)
  })

  test('resto 0 ou 1 dá DV 0', () => {
    expect(dvPIS([1, 2, 3, 4, 5, 6, 7, 8, 9, 0])).toBe(0)
  })

  test('formato 000.00000.00-0 e 1000 sementes válidas', () => {
    for (const r of sementes(1000)) {
      const pis = gerarPIS(r)
      expect(pis).toMatch(/^\d{3}\.\d{5}\.\d{2}-\d$/)
      expect(validarPIS(pis)).toBe(true)
    }
  })
})
```

Crie `packages/tools/src/titulo-eleitor.test.ts`:

```ts
import { sfc32 } from './prng'
import { gerarTituloEleitor, validarTituloEleitor } from './titulo-eleitor'
import { UFS, CODIGO_UF_TITULO } from './uf'
import { sementes } from './rng-teste'

describe('Título de eleitor', () => {
  test('exemplo da Wikipédia (SC): 0043 5687 0906', () => {
    expect(validarTituloEleitor('0043 5687 0906', 'sem-excecao')).toBe(true)
    expect(validarTituloEleitor('0043 5687 0906', 'com-excecao-sp-mg')).toBe(
      true,
    )
  })

  test('caso SP em que as duas leituras da regra divergem', () => {
    expect(validarTituloEleitor('0000 0014 0108', 'sem-excecao')).toBe(true)
    expect(validarTituloEleitor('0000 0014 0108', 'com-excecao-sp-mg')).toBe(
      false,
    )
    expect(validarTituloEleitor('0000 0014 0116', 'com-excecao-sp-mg')).toBe(
      true,
    )
  })

  test.each([...UFS, 'ZZ' as const])(
    'código da UF %s nas posições 9-10',
    (uf) => {
      const t = gerarTituloEleitor(sfc32(9, 9, 9, 9), uf).replace(/\s/g, '')
      expect(t.slice(8, 10)).toBe(CODIGO_UF_TITULO[uf])
    },
  )

  test('SP e MG: 2000 sementes válidas nas DUAS leituras da regra', () => {
    for (const r of sementes(2000)) {
      for (const uf of ['SP', 'MG'] as const) {
        const t = gerarTituloEleitor(r, uf)
        expect(t).toMatch(/^\d{4} \d{4} \d{4}$/)
        expect(validarTituloEleitor(t, 'sem-excecao')).toBe(true)
        expect(validarTituloEleitor(t, 'com-excecao-sp-mg')).toBe(true)
      }
    }
  })

  test('rejeita código de UF fora de 01..28', () => {
    expect(validarTituloEleitor('0043 5687 2906')).toBe(false)
    expect(validarTituloEleitor('0043 5687 0006')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/rg.test.ts src/pis.test.ts src/titulo-eleitor.test.ts; echo $?`
Expected: `1`, com `Cannot find module './rg'`, `'./pis'` e `'./titulo-eleitor'`.

- [ ] **Step 3: Portar os três geradores**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev
R=docs/superpowers/research/2026-10-01-extensao-dados-teste/geradores
cp $R/rg.ts $R/pis.ts $R/titulo-eleitor.ts packages/tools/src/
```

Ficam como no protótipo. Os dois comentários (`rg.ts`: o RG não tem padrão nacional; `titulo-eleitor.ts`: só gera número válido nas duas leituras da regra) registram porquês e ficam.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/rg.test.ts src/pis.test.ts src/titulo-eleitor.test.ts; echo $?`
Expected: `Tests: 46 passed, 46 total` e `0`.

- [ ] **Step 5: Exportar os subpaths**

Em `packages/tools/package.json`, troque `"./uf": "./src/uf.ts"` (última linha de `exports`) por:

```json
    "./uf": "./src/uf.ts",
    "./rg": "./src/rg.ts",
    "./pis": "./src/pis.ts",
    "./titulo-eleitor": "./src/titulo-eleitor.ts"
```

- [ ] **Step 6: Documentar no `packages/tools/CLAUDE.md`**

Acrescente ao fim da tabela de subpaths da seção "Pessoa de teste e classificador de campos":

```markdown
| `rg` | `gerarRG(rng?, {permitirX?})` no modelo da SSP-SP (`NN.NNN.NNN-D`, pesos 2..9, DV = 11 − resto, 10 → X, 11 → 0), porque o RG não tem padrão nacional. Por padrão não gera X. `validarRG`, `dvRGSP` |
| `pis` | `gerarPIS`, `validarPIS`, `dvPIS` (`000.00000.00-0`) |
| `titulo-eleitor` | `gerarTituloEleitor(rng, uf \| 'ZZ')`, `validarTituloEleitor(v, regra)`. Em SP e MG só sai número válido **com e sem** a exceção disputada (resto 0 → 1), porque os validadores populares divergem nela |
```

- [ ] **Step 7: Lint e Jest do pacote**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools
./node_modules/.bin/tsc --noEmit; echo $?
./node_modules/.bin/jest; echo $?
```

Expected: `0`; `Test Suites: 20 passed, 20 total`, `Tests: 274 passed, 274 total`, `0`.

- [ ] **Step 8: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev
/usr/bin/git add packages/tools/package.json packages/tools/CLAUDE.md \
  packages/tools/src/rg.ts packages/tools/src/rg.test.ts \
  packages/tools/src/pis.ts packages/tools/src/pis.test.ts \
  packages/tools/src/titulo-eleitor.ts packages/tools/src/titulo-eleitor.test.ts
/usr/bin/git commit -m "feat(tools): geradores de RG, PIS e título de eleitor"; echo $?
/usr/bin/git status --short packages/tools
```

Expected: `0`, e o `status` sem nenhuma linha.

---

### Tarefa 3: celular, nascimento, senha e nome

**Files:**

- Create: `packages/tools/src/celular.ts`, `packages/tools/src/celular.test.ts`
- Create: `packages/tools/src/nascimento.ts`, `packages/tools/src/nascimento.test.ts`
- Create: `packages/tools/src/senha.ts`, `packages/tools/src/senha.test.ts`
- Create: `packages/tools/src/nome.ts`, `packages/tools/src/nome.test.ts`
- Modify: `packages/tools/package.json` (exports), `packages/tools/CLAUDE.md`

**Interfaces:**

- Consumes (Tarefa 1): `type Rng`, `rngPadrao`, `escolher`, `embaralhar`, `digitosAleatorios` de `./aleatorio`; `sementes`, `minimo`, `maximo` de `./rng-teste`; `sfc32` de `./prng`.
- Produces:

```ts
// @piluvitu/tools/celular
export interface Celular {
  ddd: string
  numero: string
  formatado: string
  digitos: string
  e164: string
}
export function gerarCelular(rng: Rng = rngPadrao, ddd = '11'): Celular // lança com DDD inválido
// @piluvitu/tools/nascimento
export interface DataCivil {
  ano: number
  mes: number
  dia: number
}
export interface Nascimento {
  iso: string
  br: string
  idade: number
}
export function lerDataISO(iso: string): DataCivil // lança fora de 'aaaa-mm-dd' ou em data inexistente
export function formatarISO(d: DataCivil): string
export function formatarBR(d: DataCivil): string
export function calcularIdade(nasc: DataCivil, hoje: DataCivil): number
export function gerarNascimento(
  rng: Rng = rngPadrao,
  hojeISO: string,
  opcoes?: { idadeMin?: number; idadeMax?: number },
): Nascimento
// @piluvitu/tools/senha
export const MAIUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export const MINUSCULAS = 'abcdefghijkmnpqrstuvwxyz'
export const DIGITOS = '23456789'
export const SIMBOLOS = '!@#$%&*'
export function senhaAtendeRegrasComuns(s: string): boolean
export function gerarSenha(rng: Rng = rngPadrao, tamanho = 12): string // lança fora de 12..16
// @piluvitu/tools/nome
export type Sexo = 'F' | 'M'
export interface Nome {
  sexo: Sexo
  prenome: string
  sobrenomes: [string, string]
  completo: string
  noCartao: string
}
export interface Email {
  usuario: string
  endereco: string
  caixaUrl: string
}
export const DOMINIO_EMAIL = 'tuamaeaquelaursa.com'
export function removerAcentos(s: string): string
export function slugNome(s: string): string
export function nomeNoCartao(
  prenome: string,
  sobrenomes: [string, string],
): string
export function gerarNome(rng: Rng = rngPadrao): Nome
export function gerarEmail(rng: Rng, nome: Nome): Email
```

- [ ] **Step 1: Escrever os testes que falham**

Crie `packages/tools/src/celular.test.ts`:

```ts
import { gerarCelular } from './celular'
import { minimo, sementes } from './rng-teste'

describe('celular', () => {
  test('formato (DD) 9XXXX-XXXX, E.164 e DDD preservado', () => {
    for (const r of sementes(200)) {
      const c = gerarCelular(r, '84')
      expect(c.formatado).toMatch(/^\(84\) 9[6-9]\d{3}-\d{4}$/)
      expect(c.e164).toMatch(/^\+55849[6-9]\d{7}$/)
      expect(c.digitos).toBe(c.e164.slice(3))
      expect(c.formatado).toBe(`(${c.ddd}) ${c.numero}`)
    }
  })

  test('DDD inválido lança', () => {
    expect(() => gerarCelular(minimo, '10')).toThrow()
  })
})
```

Crie `packages/tools/src/nascimento.test.ts`:

```ts
import {
  gerarNascimento,
  calcularIdade,
  lerDataISO,
  formatarISO,
  formatarBR,
} from './nascimento'
import { minimo, maximo, sementes } from './rng-teste'

describe('nascimento', () => {
  test('limites em 2026-10-01: mais novo faz 18 hoje, mais velho tem 65', () => {
    expect(gerarNascimento(maximo, '2026-10-01')).toEqual({
      iso: '2008-10-01',
      br: '01/10/2008',
      idade: 18,
    })
    expect(gerarNascimento(minimo, '2026-10-01')).toEqual({
      iso: '1960-10-02',
      br: '02/10/1960',
      idade: 65,
    })
  })

  test('hoje em 29/02: limites caem em 28/02 e 01/03', () => {
    expect(gerarNascimento(maximo, '2028-02-29').iso).toBe('2010-02-28')
    expect(gerarNascimento(minimo, '2028-02-29').iso).toBe('1962-03-01')
  })

  test('nascido em 29/02 só faz aniversário em 01/03 nos anos não bissextos', () => {
    expect(
      calcularIdade(lerDataISO('2008-02-29'), lerDataISO('2026-02-28')),
    ).toBe(17)
    expect(
      calcularIdade(lerDataISO('2008-02-29'), lerDataISO('2026-03-01')),
    ).toBe(18)
  })

  test('idade em [18, 65] para todo dia de 2024 a 2032', () => {
    const rs = sementes(3)
    for (
      let t = Date.UTC(2024, 0, 1);
      t <= Date.UTC(2032, 11, 31);
      t += 86_400_000
    ) {
      const hoje = new Date(t).toISOString().slice(0, 10)
      for (const r of [minimo, maximo, ...rs]) {
        const n = gerarNascimento(r, hoje)
        expect(n.idade).toBeGreaterThanOrEqual(18)
        expect(n.idade).toBeLessThanOrEqual(65)
        expect(n.iso < hoje).toBe(true)
      }
    }
  })

  test('rejeita data inexistente', () => {
    expect(() => gerarNascimento(minimo, '2026-02-30')).toThrow()
  })

  test('rejeita formato que não é aaaa-mm-dd', () => {
    expect(() => lerDataISO('01/10/2026')).toThrow()
    expect(() => lerDataISO('2026-10-1')).toThrow()
  })

  test('formata ISO e BR com zeros à esquerda', () => {
    const d = { ano: 1993, mes: 5, dia: 9 }
    expect(formatarISO(d)).toBe('1993-05-09')
    expect(formatarBR(d)).toBe('09/05/1993')
  })
})
```

Crie `packages/tools/src/senha.test.ts`. Na pesquisa a senha tinha 14; aqui o teste exige 12:

```ts
import { sfc32 } from './prng'
import { gerarSenha, senhaAtendeRegrasComuns, SIMBOLOS } from './senha'
import { sementes } from './rng-teste'

describe('senha', () => {
  test('1000 sementes: 12 caracteres com maiúscula, minúscula, dígito, símbolo, começando por letra', () => {
    for (const r of sementes(1000)) {
      const s = gerarSenha(r)
      expect(s).toHaveLength(12)
      expect(senhaAtendeRegrasComuns(s)).toBe(true)
      expect(s).not.toMatch(/[0O1lI]/)
    }
  })

  test('respeita os tamanhos 12 e 16 e recusa fora disso', () => {
    expect(gerarSenha(sfc32(1, 1, 1, 1), 12)).toHaveLength(12)
    expect(gerarSenha(sfc32(1, 1, 1, 1), 16)).toHaveLength(16)
    expect(() => gerarSenha(sfc32(1, 1, 1, 1), 8)).toThrow()
    expect(() => gerarSenha(sfc32(1, 1, 1, 1), 17)).toThrow()
  })

  test('símbolos sem tecla morta do ABNT2', () => {
    expect(SIMBOLOS).toBe('!@#$%&*')
    expect(SIMBOLOS).not.toMatch(/[\^~`´'"\\<> -]/)
  })
})
```

Crie `packages/tools/src/nome.test.ts`:

```ts
import { sfc32 } from './prng'
import {
  gerarNome,
  gerarEmail,
  nomeNoCartao,
  removerAcentos,
  slugNome,
  DOMINIO_EMAIL,
} from './nome'
import { sementes } from './rng-teste'

describe('nome', () => {
  test('remove acentos e cedilha', () => {
    expect(removerAcentos('Conceição Araújo Tânia Júlia')).toBe(
      'Conceicao Araujo Tania Julia',
    )
    expect(slugNome('Luíza')).toBe('luiza')
  })

  test('nome impresso: primeiro nome, iniciais do meio, último sobrenome', () => {
    expect(nomeNoCartao('Maria Eduarda', ['Souza', 'Ribeiro'])).toBe(
      'MARIA E S RIBEIRO',
    )
    expect(nomeNoCartao('Beatriz', ['Araújo', 'Conceição'])).toBe(
      'BEATRIZ A CONCEICAO',
    )
  })

  test('2000 sementes: sobrenomes distintos, completo = prenome + S1 + S2, cartão ≤ 26', () => {
    for (const r of sementes(2000)) {
      const n = gerarNome(r)
      expect(n.sobrenomes[0]).not.toBe(n.sobrenomes[1])
      expect(n.completo).toBe(`${n.prenome} ${n.sobrenomes.join(' ')}`)
      expect(n.noCartao.length).toBeLessThanOrEqual(26)
      expect(['F', 'M']).toContain(n.sexo)
    }
  })

  test('e-mail: usuario = 1ª palavra do prenome . S2 . 4 dígitos, na caixa pública', () => {
    const nome = gerarNome(sfc32(1, 2, 3, 4))
    const e = gerarEmail(sfc32(5, 5, 5, 5), nome)
    expect(e.usuario).toMatch(
      new RegExp(
        `^${slugNome(nome.prenome.split(' ')[0])}\\.${slugNome(nome.sobrenomes[1])}\\.\\d{4}$`,
      ),
    )
    expect(e.endereco).toBe(`${e.usuario}@${DOMINIO_EMAIL}`)
    expect(e.caixaUrl).toBe(`https://tuamaeaquelaursa.com/${e.usuario}`)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/celular.test.ts src/nascimento.test.ts src/senha.test.ts src/nome.test.ts; echo $?`
Expected: `1`, com `Cannot find module` para `./celular`, `./nascimento`, `./senha` e `./nome`.

- [ ] **Step 3: Portar os quatro geradores**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev
R=docs/superpowers/research/2026-10-01-extensao-dados-teste/geradores
cp $R/celular.ts $R/nascimento.ts $R/senha.ts $R/nome.ts packages/tools/src/
```

- [ ] **Step 4: Rodar e ver a senha falhar pelo tamanho**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/senha.test.ts; echo $?`
Expected: `1`. O 1º teste falha em `expect(s).toHaveLength(12)` (recebe 14): o protótipo ainda tem o padrão antigo.

- [ ] **Step 5: Senha com 12 caracteres por padrão**

Em `packages/tools/src/senha.ts`, troque

```ts
export function gerarSenha(rng: Rng = rngPadrao, tamanho = 14): string {
```

por

```ts
export function gerarSenha(rng: Rng = rngPadrao, tamanho = 12): string {
```

É a única mudança nos quatro arquivos. O comentário de `SIMBOLOS` (sem tecla morta do ABNT2) registra um porquê e fica.

- [ ] **Step 6: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/celular.test.ts src/nascimento.test.ts src/senha.test.ts src/nome.test.ts; echo $?`
Expected: `Tests: 16 passed, 16 total` e `0`.

- [ ] **Step 7: Exportar os subpaths**

Em `packages/tools/package.json`, troque `"./titulo-eleitor": "./src/titulo-eleitor.ts"` (última linha de `exports`) por:

```json
    "./titulo-eleitor": "./src/titulo-eleitor.ts",
    "./celular": "./src/celular.ts",
    "./nascimento": "./src/nascimento.ts",
    "./senha": "./src/senha.ts",
    "./nome": "./src/nome.ts"
```

- [ ] **Step 8: Documentar no `packages/tools/CLAUDE.md`**

Acrescente ao fim da tabela de subpaths da seção "Pessoa de teste e classificador de campos":

```markdown
| `celular` | `gerarCelular(rng, ddd)` → `{ddd, numero, formatado, digitos, e164}`, no formato `(DD) 9XXXX-XXXX` |
| `nascimento` | `gerarNascimento(rng, hojeISO)`: idade de 18 a 65 no `hojeISO`, só calendário (`Date.UTC`, sem fuso). `lerDataISO` lança em data inexistente |
| `senha` | `gerarSenha(rng, tamanho = 12)`: maiúscula, minúscula, dígito e um de `!@#$%&*`, começa por letra, sem caractere ambíguo nem tecla morta do ABNT2 |
| `nome` | `gerarNome` (prenome + 2 sobrenomes distintos, `sexo`, `noCartao` com até 26 caracteres) e `gerarEmail` (`usuario@tuamaeaquelaursa.com`, caixa **pública**) |
```

- [ ] **Step 9: Lint e Jest do pacote**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools
./node_modules/.bin/tsc --noEmit; echo $?
./node_modules/.bin/jest; echo $?
```

Expected: `0`; `Test Suites: 24 passed, 24 total`, `Tests: 290 passed, 290 total`, `0`.

- [ ] **Step 10: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev
/usr/bin/git add packages/tools/package.json packages/tools/CLAUDE.md \
  packages/tools/src/celular.ts packages/tools/src/celular.test.ts \
  packages/tools/src/nascimento.ts packages/tools/src/nascimento.test.ts \
  packages/tools/src/senha.ts packages/tools/src/senha.test.ts \
  packages/tools/src/nome.ts packages/tools/src/nome.test.ts
/usr/bin/git commit -m "feat(tools): geradores de celular, nascimento, senha e nome"; echo $?
/usr/bin/git status --short packages/tools
```

Expected: `0`, e o `status` sem nenhuma linha.

---

### Tarefa 4: endereço com CEP real, empresa e cartão da Stripe

**Files:**

- Create: `packages/tools/src/endereco.ts`, `packages/tools/src/endereco.test.ts`
- Create: `packages/tools/src/empresa.ts`, `packages/tools/src/empresa.test.ts`
- Create: `packages/tools/src/cartao.ts`, `packages/tools/src/cartao.test.ts`
- Modify: `packages/tools/package.json` (exports), `packages/tools/CLAUDE.md`

**Interfaces:**

- Consumes: `type Rng`, `rngPadrao`, `escolher` (`./aleatorio`); `type UF`, `UFS` (`./uf`); `gerarCNPJ`, `validarCNPJ` (`./cnpj`); `lerDataISO` (`./nascimento`, Tarefa 3); `sementes`, `minimo`, `maximo` (`./rng-teste`).
- Produces:

```ts
// @piluvitu/tools/endereco
export interface Numeracao {
  min: number
  max: number
  lado: 'par' | 'impar' | 'ambos'
}
export interface LogradouroReal {
  cep: string
  logradouro: string
  bairro: string
  cidade: string
  uf: UF
  ddd: string
  numeracao: Numeracao
}
export const LOGRADOUROS: readonly LogradouroReal[] // 34
export interface Endereco {
  cep: string
  logradouro: string
  bairro: string
  cidade: string
  uf: UF
  ddd: string
  numero: string
  complemento: string
}
export function sortearNumero(rng: Rng, n: Numeracao): number
export function gerarEndereco(rng: Rng = rngPadrao, uf?: UF): Endereco
// @piluvitu/tools/empresa
export interface Empresa {
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
}
export function gerarEmpresa(
  rng: Rng = rngPadrao,
  sobrenomes: readonly [string, string] = ['Souza', 'Ribeiro'],
): Empresa
// @piluvitu/tools/cartao
export type Bandeira = 'visa' | 'mastercard'
export const CARTOES_TESTE: readonly { bandeira: Bandeira; numero: string }[]
export interface Cartao {
  bandeira: Bandeira
  numero: string
  numeroFormatado: string
  titular: string
  validade: string /* MM/AA */
  mes: string
  ano: string
  cvv: string
}
export function luhnValido(numero: string): boolean
export function formatarNumeroCartao(numero: string): string
export function gerarCartao(
  rng: Rng = rngPadrao,
  hojeISO: string,
  titular: string,
): Cartao
```

- [ ] **Step 1: Escrever os testes que falham**

Crie `packages/tools/src/endereco.test.ts`:

```ts
import { LOGRADOUROS, sortearNumero, gerarEndereco } from './endereco'
import { UFS } from './uf'
import { minimo, maximo, sementes } from './rng-teste'

describe('catálogo de logradouros', () => {
  test('34 CEPs cobrindo as 27 UFs, CEPs únicos, formatos corretos', () => {
    expect(LOGRADOUROS).toHaveLength(34)
    expect(new Set(LOGRADOUROS.map((l) => l.uf))).toEqual(new Set(UFS))
    expect(new Set(LOGRADOUROS.map((l) => l.cep)).size).toBe(LOGRADOUROS.length)
    for (const l of LOGRADOUROS) {
      expect(l.cep).toMatch(/^\d{5}-\d{3}$/)
      expect(l.ddd).toMatch(/^[1-9][1-9]$/)
      expect(l.numeracao.min).toBeLessThanOrEqual(l.numeracao.max)
    }
  })

  test.each(LOGRADOUROS.map((l) => [l.cep, l.numeracao] as const))(
    'número dentro da faixa do CEP %s',
    (_, faixa) => {
      for (const r of [minimo, maximo, ...sementes(50)]) {
        const n = sortearNumero(r, faixa)
        expect(n).toBeGreaterThanOrEqual(faixa.min)
        expect(n).toBeLessThanOrEqual(faixa.max)
        if (faixa.lado === 'par') expect(n % 2).toBe(0)
        if (faixa.lado === 'impar') expect(n % 2).toBe(1)
      }
    },
  )
})

describe('gerarEndereco', () => {
  test('filtra pela UF pedida e monta o complemento Apto {andar}{unidade}', () => {
    for (const r of sementes(100)) {
      const e = gerarEndereco(r, 'SP')
      expect(e.uf).toBe('SP')
      expect(e.complemento).toMatch(/^Apto ([1-9]|1\d|20)[1-4]$/)
      expect(e).not.toHaveProperty('numeracao')
    }
  })
})
```

Crie `packages/tools/src/empresa.test.ts`:

```ts
import { gerarEmpresa } from './empresa'
import { validarCNPJ } from './cnpj'
import { sementes } from './rng-teste'

describe('empresa', () => {
  test('razão social e fantasia saem dos sobrenomes, CNPJ válido', () => {
    for (const r of sementes(200)) {
      const e = gerarEmpresa(r, ['Souza', 'Ribeiro'])
      expect(e.razaoSocial).toMatch(
        /^Souza & Ribeiro (Tecnologia|Comércio|Serviços Digitais|Soluções|Consultoria|Logística|Engenharia) Ltda$/,
      )
      expect(e.nomeFantasia).toMatch(
        /^Ribeiro (Dev|Labs|Store|Digital|Tech|Hub)$/,
      )
      expect(validarCNPJ(e.cnpj)).toBe(true)
    }
  })
})
```

Crie `packages/tools/src/cartao.test.ts`. Os casos de outros gateways da pesquisa saem; os extremos `minimo`/`maximo` fixam a faixa de validade (hoje + 12 = `10/27`, hoje + 59 = `09/31`):

```ts
import {
  CARTOES_TESTE,
  formatarNumeroCartao,
  gerarCartao,
  luhnValido,
} from './cartao'
import { minimo, maximo, sementes } from './rng-teste'

describe('cartão de teste', () => {
  test('o catálogo tem só os números documentados da Stripe', () => {
    expect(CARTOES_TESTE).toEqual([
      { bandeira: 'visa', numero: '4242424242424242' },
      { bandeira: 'mastercard', numero: '5555555555554444' },
    ])
  })

  test.each(CARTOES_TESTE.map((c) => [c.bandeira, c.numero] as const))(
    '%s %s passa no Luhn',
    (_, numero) => {
      expect(luhnValido(numero)).toBe(true)
    },
  )

  test('Luhn recusa dígito trocado e número curto', () => {
    expect(luhnValido('4242424242424241')).toBe(false)
    expect(luhnValido('42424242')).toBe(false)
  })

  test('formata em grupos de 4', () => {
    expect(formatarNumeroCartao('4242424242424242')).toBe('4242 4242 4242 4242')
  })

  test('validade entre hoje + 12 e hoje + 59 meses, CVV de 3 dígitos', () => {
    expect(gerarCartao(minimo, '2026-10-01', 'MARIA E SOUZA')).toEqual({
      bandeira: 'visa',
      numero: '4242424242424242',
      numeroFormatado: '4242 4242 4242 4242',
      titular: 'MARIA E SOUZA',
      validade: '10/27',
      mes: '10',
      ano: '27',
      cvv: '100',
    })
    expect(gerarCartao(maximo, '2026-10-01', 'MARIA E SOUZA')).toMatchObject({
      bandeira: 'mastercard',
      validade: '09/31',
      cvv: '999',
    })
    for (const r of sementes(300)) {
      const c = gerarCartao(r, '2026-10-01', 'MARIA E SOUZA')
      const [mm, aa] = c.validade.split('/').map(Number)
      expect(2000 + aa > 2026 || (2000 + aa === 2026 && mm >= 10)).toBe(true)
      expect(c.cvv).toMatch(/^\d{3}$/)
      expect(`${c.mes}/${c.ano}`).toBe(c.validade)
    }
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/endereco.test.ts src/empresa.test.ts src/cartao.test.ts; echo $?`
Expected: `1`, com `Cannot find module` para `./endereco`, `./empresa` e `./cartao`.

- [ ] **Step 3: Portar `endereco` e `empresa`**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev
R=docs/superpowers/research/2026-10-01-extensao-dados-teste/geradores
cp $R/endereco.ts $R/empresa.ts packages/tools/src/
```

Ficam como no protótipo. O comentário acima de `LOGRADOUROS` (conferidos no ViaCEP; o CEP só vale para a faixa de numeração) registra um porquê e fica.

- [ ] **Step 4: Escrever o `cartao.ts` simplificado**

Crie `packages/tools/src/cartao.ts` com o conteúdo abaixo. Em relação a `R/geradores/cartao.ts`:

- `CARTOES_TESTE` tem só os dois números da Stripe, e o tipo do item vira `{ bandeira; numero }` (saem `Gateway`, `Resultado`, `CartaoTeste`, `OpcoesCartao`);
- `Bandeira` fica `'visa' | 'mastercard'`;
- `Cartao` perde `gateway` e `resultadoEsperado`;
- `gerarCartao(rng, hojeISO, titular)` perde o 4º parâmetro, e o CVV é sempre de 3 dígitos;
- `formatarNumeroCartao` perde o ramo de 15 dígitos (Amex), que não existe mais no catálogo.

O sorteio consome o `rng` na mesma ordem do protótipo (bandeira, mês, CVV).

Conteúdo completo de `packages/tools/src/cartao.ts`:

```ts
import { type Rng, rngPadrao, escolher } from './aleatorio'
import { lerDataISO } from './nascimento'

export type Bandeira = 'visa' | 'mastercard'

// Números de docs.stripe.com/testing: só eles aprovam em sandbox, e um número
// aleatório que passa no Luhn pode ser o de um cartão real.
export const CARTOES_TESTE: readonly { bandeira: Bandeira; numero: string }[] =
  [
    { bandeira: 'visa', numero: '4242424242424242' },
    { bandeira: 'mastercard', numero: '5555555555554444' },
  ]

export function luhnValido(numero: string): boolean {
  const s = numero.replace(/\D/g, '')
  if (s.length < 12) return false
  let soma = 0
  for (let i = 0; i < s.length; i++) {
    let d = Number(s[s.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    soma += d
  }
  return soma % 10 === 0
}

export function formatarNumeroCartao(numero: string): string {
  return numero.replace(/(\d{4})(?=\d)/g, '$1 ')
}

export interface Cartao {
  bandeira: Bandeira
  numero: string
  numeroFormatado: string
  titular: string
  validade: string
  mes: string
  ano: string
  cvv: string
}

export function gerarCartao(
  rng: Rng = rngPadrao,
  hojeISO: string,
  titular: string,
): Cartao {
  const c = escolher(rng, CARTOES_TESTE)
  const hoje = lerDataISO(hojeISO)
  const meses = hoje.ano * 12 + (hoje.mes - 1) + 12 + rng.int(48)
  const mes = String((meses % 12) + 1).padStart(2, '0')
  const ano = String(Math.floor(meses / 12) % 100).padStart(2, '0')
  return {
    bandeira: c.bandeira,
    numero: c.numero,
    numeroFormatado: formatarNumeroCartao(c.numero),
    titular,
    validade: `${mes}/${ano}`,
    mes,
    ano,
    cvv: String(100 + rng.int(900)),
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/endereco.test.ts src/empresa.test.ts src/cartao.test.ts; echo $?`
Expected: `Tests: 43 passed, 43 total` e `0`.

- [ ] **Step 6: Exportar os subpaths**

Em `packages/tools/package.json`, troque `"./nome": "./src/nome.ts"` (última linha de `exports`) por:

```json
    "./nome": "./src/nome.ts",
    "./endereco": "./src/endereco.ts",
    "./empresa": "./src/empresa.ts",
    "./cartao": "./src/cartao.ts"
```

- [ ] **Step 7: Documentar no `packages/tools/CLAUDE.md`**

Acrescente ao fim da tabela de subpaths da seção "Pessoa de teste e classificador de campos":

```markdown
| `endereco` | `LOGRADOUROS`: 34 CEPs reais conferidos no ViaCEP (as 27 UFs), cada um com a faixa de numeração e o lado. `gerarEndereco(rng, uf?)` só sorteia número dentro dela; complemento `Apto {andar}{unidade}` |
| `empresa` | `gerarEmpresa(rng, sobrenomes)` → razão social `{S1} & {S2} {ramo} Ltda`, fantasia `{S2} {sufixo}` e CNPJ |
| `cartao` | **Só os números de teste da Stripe** (Visa `4242 4242 4242 4242`, Mastercard `5555 5555 5555 4444`); validade entre hoje + 12 e hoje + 59 meses, CVV de 3 dígitos. Número aleatório que passa no Luhn não aprova em sandbox e pode ser de um cartão real |
```

- [ ] **Step 8: Lint e Jest do pacote**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools
./node_modules/.bin/tsc --noEmit; echo $?
./node_modules/.bin/jest; echo $?
```

Expected: `0`; `Test Suites: 27 passed, 27 total`, `Tests: 333 passed, 333 total`, `0`.

- [ ] **Step 9: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev
/usr/bin/git add packages/tools/package.json packages/tools/CLAUDE.md \
  packages/tools/src/endereco.ts packages/tools/src/endereco.test.ts \
  packages/tools/src/empresa.ts packages/tools/src/empresa.test.ts \
  packages/tools/src/cartao.ts packages/tools/src/cartao.test.ts
/usr/bin/git commit -m "feat(tools): endereço com CEP real, empresa e cartão de teste da Stripe"; echo $?
/usr/bin/git status --short packages/tools
```

Expected: `0`, e o `status` sem nenhuma linha.

---

### Tarefa 5: `gerarPessoa` coerente e a pessoa dourada

**Files:**

- Create: `packages/tools/src/pessoa.ts`, `packages/tools/src/pessoa.test.ts`
- Modify: `packages/tools/package.json` (exports), `packages/tools/CLAUDE.md`

**Interfaces:**

- Consumes: todos os geradores das Tarefas 1–4 (`gerarNome`, `gerarEndereco`, `gerarNascimento`, `gerarCPF`, `gerarRG`, `gerarPIS`, `gerarTituloEleitor`, `gerarCelular`, `gerarEmail`, `gerarSenha`, `gerarEmpresa`, `gerarCartao`) e os tipos `Nome`, `Nascimento`, `Celular`, `Email`, `Endereco`, `Empresa`, `Cartao`.
- Produces (o tipo que a fase 2 guarda no `storage` e que o `valorPara` da Tarefa 7 lê):

```ts
// @piluvitu/tools/pessoa
export interface Pessoa {
  nome: Nome
  nascimento: Nascimento
  cpf: string
  rg: { numero: string; orgaoEmissor: 'SSP'; uf: 'SP' }
  pis: string
  tituloEleitor: string
  celular: Celular
  email: Email
  senha: string
  endereco: Endereco
  empresa: Empresa
  cartao: Cartao
}
export function gerarPessoa(rng: Rng, hojeISO: string): Pessoa
```

- [ ] **Step 1: Escrever o teste que falha**

Crie `packages/tools/src/pessoa.test.ts`. A pessoa dourada difere da tabela de `R/relatorios/geradores.md` §5 a partir da senha: com 12 caracteres a senha consome menos do `rng`, e a empresa e o cartão, que vêm depois, mudam. Os valores abaixo foram medidos com o código deste plano.

```ts
import { sfc32 } from './prng'
import { gerarPessoa } from './pessoa'
import { validarCPF } from './cpf'
import { validarCNPJ } from './cnpj'
import { validarRG } from './rg'
import { validarPIS } from './pis'
import { validarTituloEleitor } from './titulo-eleitor'
import { CODIGO_UF_TITULO, REGIAO_FISCAL_CPF } from './uf'
import { senhaAtendeRegrasComuns } from './senha'
import { LOGRADOUROS } from './endereco'
import { luhnValido } from './cartao'
import { slugNome } from './nome'
import { sementes } from './rng-teste'

describe('gerarPessoa', () => {
  // Snapshot de propósito: muda quando um gerador muda, e a mudança tem que ser revista aqui.
  test('pessoa dourada: semente (1,2,3,4) em 2026-10-01', () => {
    expect(gerarPessoa(sfc32(1, 2, 3, 4), '2026-10-01')).toEqual({
      nome: {
        sexo: 'M',
        prenome: 'Vinícius',
        sobrenomes: ['Oliveira', 'Costa'],
        completo: 'Vinícius Oliveira Costa',
        noCartao: 'VINICIUS O COSTA',
      },
      nascimento: { iso: '1993-05-29', br: '29/05/1993', idade: 33 },
      cpf: '647.692.234-39',
      rg: { numero: '25.547.934-7', orgaoEmissor: 'SSP', uf: 'SP' },
      pis: '161.51127.87-1',
      tituloEleitor: '6080 6730 1600',
      celular: {
        ddd: '84',
        numero: '99114-8037',
        formatado: '(84) 99114-8037',
        digitos: '84991148037',
        e164: '+5584991148037',
      },
      email: {
        usuario: 'vinicius.costa.6607',
        endereco: 'vinicius.costa.6607@tuamaeaquelaursa.com',
        caixaUrl: 'https://tuamaeaquelaursa.com/vinicius.costa.6607',
      },
      senha: 's7YZgw&$iLak',
      endereco: {
        cep: '59090-000',
        logradouro: 'Avenida Engenheiro Roberto Freire',
        bairro: 'Ponta Negra',
        cidade: 'Natal',
        uf: 'RN',
        ddd: '84',
        numero: '3360',
        complemento: 'Apto 74',
      },
      empresa: {
        razaoSocial: 'Oliveira & Costa Logística Ltda',
        nomeFantasia: 'Costa Digital',
        cnpj: '35.728.569/0001-52',
      },
      cartao: {
        bandeira: 'mastercard',
        numero: '5555555555554444',
        numeroFormatado: '5555 5555 5555 4444',
        titular: 'VINICIUS O COSTA',
        validade: '08/28',
        mes: '08',
        ano: '28',
        cvv: '430',
      },
    })
  })

  test('mesma semente ⇒ mesma pessoa', () => {
    expect(gerarPessoa(sfc32(9, 8, 7, 6), '2026-10-01')).toEqual(
      gerarPessoa(sfc32(9, 8, 7, 6), '2026-10-01'),
    )
  })

  test('1000 sementes: todo documento válido e todo campo coerente', () => {
    for (const r of sementes(1000)) {
      const p = gerarPessoa(r, '2026-10-01')
      expect(validarCPF(p.cpf)).toBe(true)
      expect(validarRG(p.rg.numero)).toBe(true)
      expect(validarPIS(p.pis)).toBe(true)
      expect(validarCNPJ(p.empresa.cnpj)).toBe(true)
      expect(validarTituloEleitor(p.tituloEleitor, 'sem-excecao')).toBe(true)
      expect(validarTituloEleitor(p.tituloEleitor, 'com-excecao-sp-mg')).toBe(
        true,
      )
      expect(luhnValido(p.cartao.numero)).toBe(true)
      expect(senhaAtendeRegrasComuns(p.senha)).toBe(true)
      expect(p.senha).toHaveLength(12)

      expect(Number(p.cpf[10])).toBe(REGIAO_FISCAL_CPF[p.endereco.uf])
      expect(p.tituloEleitor.replace(/\s/g, '').slice(8, 10)).toBe(
        CODIGO_UF_TITULO[p.endereco.uf],
      )
      expect(p.celular.ddd).toBe(p.endereco.ddd)
      const faixa = LOGRADOUROS.find((l) => l.cep === p.endereco.cep)!.numeracao
      const numero = Number(p.endereco.numero)
      expect(numero >= faixa.min && numero <= faixa.max).toBe(true)
      if (faixa.lado !== 'ambos')
        expect(numero % 2).toBe(faixa.lado === 'par' ? 0 : 1)
      expect(p.email.usuario).toBe(
        `${slugNome(p.nome.prenome.split(' ')[0])}.${slugNome(p.nome.sobrenomes[1])}.${p.email.usuario.slice(-4)}`,
      )
      expect(p.email.usuario).toMatch(/^[a-z]+\.[a-z]+\.\d{4}$/)
      expect(p.email.caixaUrl).toBe(
        `https://tuamaeaquelaursa.com/${p.email.usuario}`,
      )
      expect(p.empresa.razaoSocial).toBe(
        `${p.nome.sobrenomes[0]} & ${p.nome.sobrenomes[1]} ${p.empresa.razaoSocial.split(' ').slice(3, -1).join(' ')} Ltda`,
      )
      expect(p.cartao.titular).toBe(p.nome.noCartao)
      expect(p.nascimento.idade).toBeGreaterThanOrEqual(18)
      expect(p.nascimento.idade).toBeLessThanOrEqual(65)
    }
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/pessoa.test.ts; echo $?`
Expected: `1`, com `Cannot find module './pessoa'`.

- [ ] **Step 3: Escrever o `pessoa.ts`**

Crie `packages/tools/src/pessoa.ts`. Em relação a `R/geradores/pessoa.ts`: sai o campo `versao: 1` (quem versiona a pessoa guardada é a extensão), sai `OpcoesPessoa` e o parâmetro `opcoes`, e `gerarCartao` é chamado sem o 4º argumento. A ordem das chamadas é a do protótipo.

```ts
import type { Rng } from './aleatorio'
import { type Celular, gerarCelular } from './celular'
import { type Cartao, gerarCartao } from './cartao'
import { gerarCPF } from './cpf'
import { type Empresa, gerarEmpresa } from './empresa'
import { type Endereco, gerarEndereco } from './endereco'
import { type Nascimento, gerarNascimento } from './nascimento'
import { type Email, type Nome, gerarEmail, gerarNome } from './nome'
import { gerarPIS } from './pis'
import { gerarRG } from './rg'
import { gerarSenha } from './senha'
import { gerarTituloEleitor } from './titulo-eleitor'

export interface Pessoa {
  nome: Nome
  nascimento: Nascimento
  cpf: string
  rg: { numero: string; orgaoEmissor: 'SSP'; uf: 'SP' }
  pis: string
  tituloEleitor: string
  celular: Celular
  email: Email
  senha: string
  endereco: Endereco
  empresa: Empresa
  cartao: Cartao
}

// A ordem das chamadas a rng é parte do contrato: mudar a ordem muda a pessoa de uma semente.
export function gerarPessoa(rng: Rng, hojeISO: string): Pessoa {
  const nome = gerarNome(rng)
  const endereco = gerarEndereco(rng)
  const nascimento = gerarNascimento(rng, hojeISO)
  return {
    nome,
    nascimento,
    cpf: gerarCPF(rng, endereco.uf),
    rg: { numero: gerarRG(rng), orgaoEmissor: 'SSP', uf: 'SP' },
    pis: gerarPIS(rng),
    tituloEleitor: gerarTituloEleitor(rng, endereco.uf),
    celular: gerarCelular(rng, endereco.ddd),
    email: gerarEmail(rng, nome),
    senha: gerarSenha(rng),
    endereco,
    empresa: gerarEmpresa(rng, nome.sobrenomes),
    cartao: gerarCartao(rng, hojeISO, nome.noCartao),
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/pessoa.test.ts; echo $?`
Expected: `Tests: 3 passed, 3 total` e `0`. Se a pessoa dourada divergir, **não** atualize o snapshot: algum gerador foi copiado ou editado diferente do plano; ache a diferença.

- [ ] **Step 5: Exportar o subpath**

Em `packages/tools/package.json`, troque `"./cartao": "./src/cartao.ts"` (última linha de `exports`) por:

```json
    "./cartao": "./src/cartao.ts",
    "./pessoa": "./src/pessoa.ts"
```

- [ ] **Step 6: Documentar no `packages/tools/CLAUDE.md`**

Na seção "Pessoa de teste e classificador de campos", logo depois da tabela de subpaths, insira:

```markdown
### `gerarPessoa(rng, hojeISO)` (`pessoa`)

- **Coerência:** a região do CPF e o código do título são os da UF do endereço; o DDD do celular é o do CEP; o e-mail sai do nome; a empresa, dos sobrenomes; o nome impresso no cartão, da pessoa. O RG é sempre `SSP/SP`, o modelo do gerador.
- **A ordem das chamadas a `rng` é contrato:** trocá-la muda a pessoa de toda semente.
- **Pessoa dourada** (`sfc32(1,2,3,4)`, `'2026-10-01'`) em `pessoa.test.ts`: é um snapshot de propósito. Quando um gerador muda, ela muda; a mudança é revista e o teste atualizado na mesma tarefa.
- Não tem campo `versao`: quem versiona a pessoa guardada é a extensão (`storage.defineItem(…, { version })`).
```

- [ ] **Step 7: Lint e Jest do pacote**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools
./node_modules/.bin/tsc --noEmit; echo $?
./node_modules/.bin/jest; echo $?
```

Expected: `0`; `Test Suites: 28 passed, 28 total`, `Tests: 336 passed, 336 total`, `0`.

- [ ] **Step 8: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev
/usr/bin/git add packages/tools/package.json packages/tools/CLAUDE.md \
  packages/tools/src/pessoa.ts packages/tools/src/pessoa.test.ts
/usr/bin/git commit -m "feat(tools): gerarPessoa coerente, com a pessoa dourada"; echo $?
/usr/bin/git status --short packages/tools
```

Expected: `0`, e o `status` sem nenhuma linha.

---

### Tarefa 6: classificador de campos (`campos`)

**Files:**

- Create: `packages/tools/src/campos.ts`, `packages/tools/src/campos.test.ts`
- Modify: `packages/tools/package.json` (exports), `packages/tools/CLAUDE.md`

**Interfaces:**

- Consumes: `lerDataISO(iso: string): DataCivil` de `./nascimento` (Tarefa 3).
- Produces (a fase 2 monta o `FieldDescriptor` no DOM e chama `classificarFormulario`):

```ts
// @piluvitu/tools/campos
export type FieldKind =
  | 'nomeCompleto'
  | 'primeiroNome'
  | 'sobrenome'
  | 'nascimento'
  | 'nascimentoDia'
  | 'nascimentoMes'
  | 'nascimentoAno'
  | 'cpf'
  | 'rg'
  | 'sexo'
  | 'celular'
  | 'ddd'
  | 'email'
  | 'emailConfirmacao'
  | 'senha'
  | 'senhaConfirmacao'
  | 'usuario'
  | 'cep'
  | 'logradouro'
  | 'numeroEndereco'
  | 'complemento'
  | 'bairro'
  | 'cidade'
  | 'uf'
  | 'cidadeUf'
  | 'pais'
  | 'enderecoCompleto'
  | 'razaoSocial'
  | 'nomeFantasia'
  | 'cnpj'
  | 'cartaoNumero'
  | 'cartaoNome'
  | 'cartaoValidade'
  | 'cartaoValidadeMes'
  | 'cartaoValidadeAno'
  | 'cartaoCvv'
  | 'pis'
  | 'tituloEleitor'
export interface FieldDescriptor {
  tag: 'input' | 'select' | 'textarea'
  type: string
  name: string
  id: string
  autocomplete: string
  placeholder: string
  label: string
  ariaLabel: string
  maxLength: number | null
  inputMode?: string
  pattern?: string
  options?: { value: string; text: string }[]
  section?: string
}
export type Via =
  | 'autocomplete'
  | 'label'
  | 'ariaLabel'
  | 'name'
  | 'id'
  | 'placeholder'
  | 'formato'
  | 'tipo'
  | 'opcoes'
  | 'contexto'
export interface Dicas {
  semDdd?: boolean
  incluirNumero?: boolean
}
export interface Classificacao {
  kind: FieldKind | 'ignorar'
  confianca: number
  via: Via
  dicas?: Dicas
}
export const LIMIAR = 0.5
export function normalizar(s: string): string
export function campoAutocomplete(raw: string): string | null
export function classificarCampo(d: FieldDescriptor): Classificacao | null
export function classificarFormulario(
  ds: FieldDescriptor[],
  hojeISO: string,
): (Classificacao | null)[]
```

- [ ] **Step 1: Escrever os testes que falham**

Crie `packages/tools/src/campos.test.ts`. É o `R/deteccao/campos.test.ts` passado de `node:test` para Jest (`assert.equal`/`deepEqual` → `expect(...).toBe/toEqual`, o laço `for` → `test.each`, importes sem a extensão `.ts`), sem os testes de formatação (que vão para a Tarefa 7), com:

- os 3 ajustes do §12 da spec: #67 espera `null`, #77 espera `cidadeUf`, e F9/F12 conferem as `dicas` dos dois lados (F2 confere que, com campo de número, o logradouro **não** ganha `incluirNumero`);
- `classificarFormulario(ds, HOJE)` com `HOJE = '2026-10-01'` no lugar do ano fixo;
- os testes novos de confiança e os do Review Focus 1, 2 e 3.

O `// prettier-ignore` mantém a tabela dos 80 casos legível (um caso por linha).

Conteúdo completo de `packages/tools/src/campos.test.ts`:

```ts
import {
  campoAutocomplete,
  classificarCampo,
  classificarFormulario,
  normalizar,
  type FieldDescriptor,
} from './campos'

const HOJE = '2026-10-01'

const f = (p: Partial<FieldDescriptor>): FieldDescriptor => ({
  tag: 'input',
  type: 'text',
  name: '',
  id: '',
  autocomplete: '',
  placeholder: '',
  label: '',
  ariaLabel: '',
  maxLength: null,
  ...p,
})
const opts = (...xs: Array<string | [string, string]>) =>
  xs.map((x) =>
    typeof x === 'string' ? { value: x, text: x } : { value: x[0], text: x[1] },
  )
const range = (a: number, b: number) =>
  Array.from({ length: Math.abs(b - a) + 1 }, (_, i) =>
    String(a < b ? a + i : a - i),
  )
const UFS = opts(
  ['', 'Selecione'],
  ['AC', 'Acre'],
  ['RJ', 'Rio de Janeiro'],
  ['SP', 'São Paulo'],
)

// [id, descriptor, kind esperado | null]
// prettier-ignore
const CASOS: Array<[string, FieldDescriptor, string | null]> = [
  ['01 ac given-name', f({ autocomplete: 'given-name', name: 'fn' }), 'primeiroNome'],
  ['02 ac shipping postal-code', f({ autocomplete: 'shipping postal-code', name: 'x1' }), 'cep'],
  ['03 ac section+billing address-level2', f({ autocomplete: 'section-blue billing address-level2' }), 'cidade'],
  ['04 ac off is ignored, name decides', f({ autocomplete: 'off', name: 'cpf' }), 'cpf'],
  ['05 ac new-password on text field (anti-autofill hack)', f({ autocomplete: 'new-password', name: 'cidade', label: 'Cidade' }), 'cidade'],
  ['06 ac cc-csc on password', f({ type: 'password', autocomplete: 'cc-csc', name: 'sc' }), 'cartaoCvv'],
  ['07 ac bday on date', f({ type: 'date', autocomplete: 'bday' }), 'nascimento'],
  ['08 ac tel-national on tel', f({ type: 'tel', autocomplete: 'tel-national' }), 'celular'],
  ['09 ac one-time-code', f({ autocomplete: 'one-time-code', name: 'code' }), 'ignorar'],
  ['10 name cpf', f({ name: 'cpf', maxLength: 14 }), 'cpf'],
  ['11 label CPF/CNPJ alone', f({ label: 'CPF/CNPJ' }), 'cpf'],
  ['12 label CNPJ da empresa', f({ label: 'CNPJ da empresa' }), 'cnpj'],
  ['13 id camelCase txtRazaoSocial', f({ id: 'txtRazaoSocial' }), 'razaoSocial'],
  ['14 name nome_fantasia', f({ name: 'nome_fantasia' }), 'nomeFantasia'],
  ['15 label Nome completo *', f({ label: 'Nome completo *' }), 'nomeCompleto'],
  ['16 label Nome (alone)', f({ label: 'Nome' }), 'nomeCompleto'],
  ['17 label Nome da mãe', f({ label: 'Nome da mãe' }), null],
  ['18 label Nome social', f({ label: 'Nome social' }), null],
  ['19 label Nome de usuário', f({ label: 'Nome de usuário' }), 'usuario'],
  ['20 label Endereço de e-mail', f({ label: 'Endereço de e-mail' }), 'email'],
  ['21 label Confirme seu e-mail', f({ label: 'Confirme seu e-mail' }), 'emailConfirmacao'],
  ['22 name password_confirmation', f({ type: 'password', name: 'password_confirmation' }), 'senhaConfirmacao'],
  ['23 bare password', f({ type: 'password' }), 'senha'],
  ['24 Senha atual (login with persona)', f({ type: 'password', label: 'Senha atual' }), 'senha'],
  ['25 bare email type', f({ type: 'email' }), 'email'],
  ['26 Celular (com DDD) on tel', f({ type: 'tel', label: 'Celular (com DDD)' }), 'celular'],
  ['27 DDD maxlength 2', f({ label: 'DDD', maxLength: 2 }), 'ddd'],
  ['28 placeholder phone mask', f({ name: 'telefone', placeholder: '(00) 00000-0000' }), 'celular'],
  ['29 type=tel used for CPF keypad', f({ type: 'tel', name: 'documento', label: 'CPF' }), 'cpf'],
  ['30 CEP on tel with inputmode', f({ type: 'tel', label: 'CEP', inputMode: 'numeric' }), 'cep'],
  ['31 placeholder 00000-000 only', f({ placeholder: '00000-000' }), 'cep'],
  ['32 placeholder ___.___.___-__ only', f({ placeholder: '___.___.___-__' }), 'cpf'],
  ['33 label Rua', f({ label: 'Rua' }), 'logradouro'],
  ['34 label Endereço', f({ label: 'Endereço' }), 'logradouro'],
  ['35 label Número, no context', f({ label: 'Número', maxLength: 10 }), null],
  ['36 label Nº maxlength 6', f({ label: 'Nº', maxLength: 6 }), 'numeroEndereco'],
  ['37 label Complemento', f({ label: 'Complemento' }), 'complemento'],
  ['38 label Bairro', f({ label: 'Bairro' }), 'bairro'],
  ['39 label Cidade', f({ label: 'Cidade' }), 'cidade'],
  ['40 select Estado with UFs', f({ tag: 'select', type: 'select-one', label: 'Estado', options: UFS }), 'uf'],
  ['41 select Estado civil', f({ tag: 'select', type: 'select-one', label: 'Estado civil', options: opts('Solteiro(a)', 'Casado(a)') }), null],
  ['42 UF maxlength 2', f({ label: 'UF', maxLength: 2 }), 'uf'],
  ['43 select País', f({ tag: 'select', type: 'select-one', label: 'País', options: opts(['BR', 'Brasil'], ['PT', 'Portugal']) }), 'pais'],
  ['44 Número do cartão', f({ label: 'Número do cartão' }), 'cartaoNumero'],
  ['45 Nome impresso no cartão', f({ label: 'Nome impresso no cartão' }), 'cartaoNome'],
  ['46 Validade (MM/AA)', f({ label: 'Validade (MM/AA)' }), 'cartaoValidade'],
  ['47 CVV', f({ label: 'CVV', maxLength: 4 }), 'cartaoCvv'],
  ['48 Código de segurança', f({ label: 'Código de segurança' }), 'cartaoCvv'],
  ['49 Data de nascimento text', f({ label: 'Data de nascimento', maxLength: 10 }), 'nascimento'],
  ['50 Data de entrega type=date', f({ type: 'date', label: 'Data de entrega' }), null],
  ['51 bare date type labelled Data', f({ type: 'date', label: 'Data' }), 'nascimento'],
  ['52 Melhor dia de vencimento select', f({ tag: 'select', type: 'select-one', label: 'Melhor dia de vencimento', options: opts(...range(1, 31)) }), null],
  ['53 label RG', f({ label: 'RG' }), 'rg'],
  ['54 Órgão emissor do RG', f({ label: 'Órgão emissor do RG' }), null],
  ['55 Data de expedição do RG type=date', f({ type: 'date', label: 'Data de expedição do RG' }), null],
  ['56 PIS/PASEP', f({ label: 'PIS/PASEP' }), 'pis'],
  ['57 Título de eleitor', f({ label: 'Título de eleitor' }), 'tituloEleitor'],
  ['58 Título (job title)', f({ label: 'Título' }), null],
  ['59 type=search', f({ type: 'search', label: 'Buscar' }), 'ignorar'],
  ['60 recaptcha textarea', f({ tag: 'textarea', type: 'textarea', name: 'g-recaptcha-response' }), 'ignorar'],
  ['61 Código de indicação (design 1c)', f({ name: 'ref_code', label: 'Código de indicação' }), null],
  ['62 Como nos conheceu? (design 1c)', f({ tag: 'select', type: 'select-one', id: 'origem', label: 'Como nos conheceu?', options: opts('Google', 'Instagram') }), null],
  ['63 select Sexo', f({ tag: 'select', type: 'select-one', label: 'Sexo', options: opts(['F', 'Feminino'], ['M', 'Masculino']) }), 'sexo'],
  ['64 select Gênero', f({ tag: 'select', type: 'select-one', label: 'Gênero', options: opts('Feminino', 'Masculino', 'Prefiro não dizer') }), 'sexo'],
  ['65 type=number CEP', f({ type: 'number', label: 'CEP' }), 'cep'],
  ['66 type=number Nome (incompatible)', f({ type: 'number', label: 'Nome' }), null],
  ['67 Telefone fixo', f({ label: 'Telefone fixo' }), null],
  ['68 bracketed name street_number', f({ name: 'customer[address][street_number]' }), 'numeroEndereco'],
  ['69 billingAddressLine2', f({ name: 'billingAddressLine2' }), 'complemento'],
  ['70 phone_number', f({ name: 'phone_number' }), 'celular'],
  ['71 Número do documento', f({ label: 'Número do documento' }), 'cpf'],
  ['72 Login', f({ label: 'Login' }), 'usuario'],
  ['73 email placeholder example', f({ label: 'Seu melhor contato', placeholder: 'nome@exemplo.com.br' }), 'email'],
  ['74 Angular Material id + label', f({ id: 'mat-input-3', label: 'CPF' }), 'cpf'],
  ['75 nothing at all', f({ name: 'field_7' }), null],
  ['76 aria-label only', f({ ariaLabel: 'Bairro' }), 'bairro'],
  ['77 Cidade/UF combined label', f({ label: 'Cidade / UF' }), 'cidadeUf'],
  ['78 Data de validade do documento', f({ label: 'Data de validade do documento' }), null],
  ['79 Inscrição estadual', f({ label: 'Inscrição estadual' }), null],
  ['80 E-mail corporativo', f({ label: 'E-mail corporativo', type: 'email' }), 'email'],
]

describe('classificarCampo', () => {
  test.each(CASOS)('campo %s', (_, d, esperado) => {
    const r = classificarCampo(d)
    expect(r ? r.kind : null).toBe(esperado)
  })
})

const kindsOf = (ds: FieldDescriptor[]) =>
  classificarFormulario(ds, HOJE).map((r) => (r ? r.kind : null))

describe('classificarFormulario', () => {
  test('form F1 Nome + Sobrenome → primeiroNome/sobrenome', () => {
    expect(kindsOf([f({ label: 'Nome' }), f({ label: 'Sobrenome' })])).toEqual([
      'primeiroNome',
      'sobrenome',
    ])
  })

  test('form F2 address block resolves bare Número to numeroEndereco, sem dica incluirNumero', () => {
    const r = classificarFormulario(
      [
        f({ label: 'CEP' }),
        f({ label: 'Rua' }),
        f({ label: 'Número' }),
        f({ label: 'Complemento' }),
      ],
      HOJE,
    )
    expect(r.map((x) => x?.kind)).toEqual([
      'cep',
      'logradouro',
      'numeroEndereco',
      'complemento',
    ])
    expect(r[1]?.dicas).toBeUndefined()
  })

  test('form F3 card block: Número/Nome/Validade/CVV', () => {
    expect(
      kindsOf([
        f({ label: 'Número', maxLength: 19, section: 'Pagamento' }),
        f({ label: 'Nome', section: 'Pagamento' }),
        f({ label: 'Validade' }),
        f({ label: 'CVV' }),
      ]),
    ).toEqual(['cartaoNumero', 'cartaoNome', 'cartaoValidade', 'cartaoCvv'])
  })

  test('form F4 two plain e-mail fields → second is confirmation', () => {
    expect(
      kindsOf([
        f({ type: 'email', label: 'E-mail' }),
        f({ type: 'email', label: 'E-mail' }),
      ]),
    ).toEqual(['email', 'emailConfirmacao'])
  })

  test('form F5 two bare passwords → senha + confirmação', () => {
    expect(kindsOf([f({ type: 'password' }), f({ type: 'password' })])).toEqual(
      ['senha', 'senhaConfirmacao'],
    )
  })

  test('form F6 split birth date selects (label only on the first)', () => {
    const ds = [
      f({
        tag: 'select',
        type: 'select-one',
        label: 'Data de nascimento',
        name: 'dia',
        options: opts(['', 'Dia'], ...range(1, 31)),
      }),
      f({
        tag: 'select',
        type: 'select-one',
        name: 'mes',
        options: opts(
          ['', 'Mês'],
          ['1', 'Janeiro'],
          ['2', 'Fevereiro'],
          ['3', 'Março'],
        ),
      }),
      f({
        tag: 'select',
        type: 'select-one',
        name: 'ano',
        options: opts(['', 'Ano'], ...range(2026, 1926)),
      }),
    ]
    expect(kindsOf(ds)).toEqual([
      'nascimentoDia',
      'nascimentoMes',
      'nascimentoAno',
    ])
  })

  test('form F7 card expiry selects named mes/ano inside card section', () => {
    const ds = [
      f({ label: 'Número do cartão' }),
      f({
        tag: 'select',
        type: 'select-one',
        name: 'mes',
        section: 'Cartão de crédito',
        options: opts(...range(1, 12)),
      }),
      f({
        tag: 'select',
        type: 'select-one',
        name: 'ano',
        section: 'Cartão de crédito',
        options: opts(...range(2026, 2036)),
      }),
      f({ label: 'CVV' }),
    ]
    expect(kindsOf(ds)).toEqual([
      'cartaoNumero',
      'cartaoValidadeMes',
      'cartaoValidadeAno',
      'cartaoCvv',
    ])
  })

  test('form F8 exp_month / exp_year names', () => {
    const ds = [
      f({
        tag: 'select',
        type: 'select-one',
        name: 'exp_month',
        options: opts(...range(1, 12)),
      }),
      f({
        tag: 'select',
        type: 'select-one',
        name: 'exp_year',
        options: opts(...range(2026, 2036)),
      }),
    ]
    expect(kindsOf(ds)).toEqual(['cartaoValidadeMes', 'cartaoValidadeAno'])
  })

  test('form F9 DDD + Telefone → celular gets semDdd hint', () => {
    const r = classificarFormulario(
      [
        f({ label: 'DDD', maxLength: 2 }),
        f({ label: 'Telefone', maxLength: 10 }),
      ],
      HOJE,
    )
    expect(r.map((x) => x?.kind)).toEqual(['ddd', 'celular'])
    expect(r[0]?.dicas).toBeUndefined()
    expect(r[1]?.dicas).toEqual({ semDdd: true })
  })

  test('form F10 PJ section: Nome → razaoSocial', () => {
    expect(
      kindsOf([
        f({ label: 'Nome', section: 'Dados da empresa' }),
        f({ label: 'CNPJ', section: 'Dados da empresa' }),
      ]),
    ).toEqual(['razaoSocial', 'cnpj'])
  })

  test('form F11 CPF ou CNPJ in a company-only form → cnpj', () => {
    expect(
      kindsOf([
        f({ label: 'Razão social' }),
        f({ label: 'CPF ou CNPJ', maxLength: 18 }),
      ]),
    ).toEqual(['razaoSocial', 'cnpj'])
  })

  test('form F12 Endereço without número field → incluirNumero hint', () => {
    const r = classificarFormulario(
      [f({ label: 'CEP' }), f({ label: 'Endereço' }), f({ label: 'Cidade' })],
      HOJE,
    )
    expect(r.map((x) => x?.kind)).toEqual(['cep', 'logradouro', 'cidade'])
    expect(r[1]?.dicas).toEqual({ incluirNumero: true })
    expect(r[0]?.dicas).toBeUndefined()
    expect(r[2]?.dicas).toBeUndefined()
  })

  test('form F13 card holder CPF stays cpf, name next to it stays person', () => {
    expect(
      kindsOf([
        f({ label: 'Número do cartão' }),
        f({ label: 'CPF do titular' }),
        f({ label: 'Nome' }),
      ]),
    ).toEqual(['cartaoNumero', 'cpf', 'nomeCompleto'])
  })

  test('form F14 "Número" between Telefone and nothing else stays null', () => {
    expect(
      kindsOf([f({ label: 'E-mail' }), f({ label: 'Número', maxLength: 12 })]),
    ).toEqual(['email', null])
  })
})

describe('auxiliares', () => {
  test('normalizar', () => {
    expect(normalizar('txtRazaoSocial')).toBe('txt razao social')
    expect(normalizar('E-mail*:')).toBe('e mail')
    expect(normalizar('customer[address][line1]')).toBe(
      'customer address line 1',
    )
    expect(normalizar('Nº')).toBe('n')
    expect(normalizar('Número da residência')).toBe('numero da residencia')
  })

  test('campoAutocomplete grammar', () => {
    expect(campoAutocomplete('section-x shipping street-address')).toBe(
      'street-address',
    )
    expect(campoAutocomplete('billing mobile tel')).toBe('tel')
    expect(campoAutocomplete('email webauthn')).toBe('email')
    expect(campoAutocomplete('off')).toBe('off')
    expect(campoAutocomplete('')).toBeNull()
  })
})

describe('confiança e via', () => {
  test('autocomplete vale 1 e diz a via', () => {
    expect(classificarCampo(f({ autocomplete: 'postal-code' }))).toEqual({
      kind: 'cep',
      confianca: 1,
      via: 'autocomplete',
    })
  })

  test('resolvido pelo contexto fica entre 0,75 e 0,85', () => {
    const [nome] = classificarFormulario([f({ label: 'Nome' })], HOJE)
    expect(nome).toEqual({
      kind: 'nomeCompleto',
      confianca: 0.8,
      via: 'contexto',
    })
  })

  test('duas fontes que concordam ganham bônus, com teto 0,99', () => {
    const r = classificarCampo(f({ label: 'CEP', name: 'cep', id: 'cep' }))
    expect(r?.confianca).toBe(0.99)
    expect(r?.via).toBe('label')
  })
})

describe('telefone fixo nunca recebe o celular', () => {
  test.each([
    [
      'label Telefone fixo em type=tel',
      f({ type: 'tel', label: 'Telefone fixo' }),
    ],
    [
      'label Telefone residencial em type=tel',
      f({ type: 'tel', label: 'Telefone residencial' }),
    ],
    ['name tel_comercial', f({ name: 'tel_comercial' })],
    [
      'autocomplete tel com label fixo',
      f({ autocomplete: 'tel', label: 'Telefone fixo' }),
    ],
    ['autocomplete home tel', f({ type: 'tel', autocomplete: 'home tel' })],
    [
      'autocomplete work tel-national',
      f({ type: 'tel', autocomplete: 'work tel-national' }),
    ],
    [
      'placeholder de telefone com label fixo',
      f({ label: 'Fixo', placeholder: '(00) 0000-0000' }),
    ],
  ])('%s → não reconhecido', (_, d) => {
    expect(classificarCampo(d)).toBeNull()
  })

  test('celular e o DDD do fixo continuam reconhecidos', () => {
    expect(
      classificarCampo(f({ type: 'tel', autocomplete: 'mobile tel' }))?.kind,
    ).toBe('celular')
    expect(
      classificarCampo(f({ autocomplete: 'home tel-area-code' }))?.kind,
    ).toBe('ddd')
    expect(classificarCampo(f({ label: 'Endereço comercial' }))?.kind).toBe(
      'logradouro',
    )
  })
})

describe('UF e número do RG nunca recebem o endereço', () => {
  test.each([
    ['UF do RG', f({ label: 'UF do RG', maxLength: 2 })],
    ['UF de expedição', f({ label: 'UF de expedição' })],
    [
      'UF emissora (select)',
      f({
        tag: 'select',
        type: 'select-one',
        label: 'UF emissora',
        options: UFS,
      }),
    ],
    ['Estado emissor', f({ label: 'Estado emissor' })],
  ])('%s → não reconhecido', (_, d) => {
    expect(classificarCampo(d)).toBeNull()
  })

  test('UF e Número soltos dentro de um fieldset RG ficam não reconhecidos', () => {
    const ds = [
      f({ label: 'CEP' }),
      f({ label: 'UF', maxLength: 2 }),
      f({ label: 'RG', section: 'Documento de identidade (RG)' }),
      f({ label: 'Número', section: 'RG' }),
      f({ label: 'Órgão emissor', section: 'RG' }),
      f({
        tag: 'select',
        type: 'select-one',
        label: 'UF',
        section: 'RG',
        options: UFS,
      }),
    ]
    expect(kindsOf(ds)).toEqual(['cep', 'uf', 'rg', null, null, null])
  })
})

describe('sem ano fixo: o ano vem de hojeISO', () => {
  const validade = f({
    tag: 'select',
    type: 'select-one',
    name: 'ano',
    options: opts(...range(2031, 2041)),
  })
  const nascimento = f({
    tag: 'select',
    type: 'select-one',
    name: 'ano',
    options: opts(...range(2013, 1931)),
  })

  test('em janeiro de 2031, anos 2031..2041 são validade e 1931..2013 são nascimento', () => {
    expect(kindsOf2031([validade])).toEqual(['cartaoValidadeAno'])
    expect(kindsOf2031([nascimento])).toEqual(['nascimentoAno'])
  })

  test('anos 2025..2035 são validade em 2026 e deixam de ser em 2031', () => {
    const d = f({
      tag: 'select',
      type: 'select-one',
      name: 'ano',
      options: opts(...range(2025, 2035)),
    })
    expect(kindsOf([d])).toEqual(['cartaoValidadeAno'])
    expect(kindsOf2031([d])).toEqual([null])
  })

  test('hojeISO inválido lança', () => {
    expect(() =>
      classificarFormulario([f({ label: 'CPF' })], '01/10/2026'),
    ).toThrow()
  })

  function kindsOf2031(ds: FieldDescriptor[]) {
    return classificarFormulario(ds, '2031-01-15').map((r) =>
      r ? r.kind : null,
    )
  }
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/campos.test.ts; echo $?`
Expected: `1`, com `Cannot find module './campos'`.

- [ ] **Step 3: Escrever o `campos.ts`**

Crie `packages/tools/src/campos.ts` com o conteúdo abaixo, que parte de `R/deteccao/campos.ts`. As diferenças:

1. **Comentários:** saem o cabeçalho de protótipo, os separadores `// ----`, os doc-comments e o comentário órfão "A specific kind…". Ficam três, em português: o `-1 → null` do `maxLength`, o truque do `new-password` e o porquê das duas regras `*Confirmacao`.
2. **`normalizar`:** os dois caracteres combinantes literais da classe viram `[̀-ͯ]` (mesma faixa, legível).
3. **`FieldKind`** ganha `'cidadeUf'`; a regra `cidadeUf` entra antes da de `cidade` (com o mesmo veto de `natal|naturalidade`), e `'cidadeUf'` entra em `PRECEDENCIA` antes de `'cidade'`.
4. **`Classificacao.confidence` → `confianca`.**
5. **`RULES` e `pontuar` deixam de ser exportados** (o contrato não os tem).
6. **Veto do RG:** o `not` da regra `uf` ganha `expedi`. Na 2ª passada, `ctxRG(i)` (seção com "rg" ou "identidade") faz `uf` e `_numero` devolverem `null`.
7. **Telefone fixo:** `ehTelefoneFixo(d)` (label, aria-label, name, id ou placeholder com `fixo|residencial|comercial` como palavra, ou `autocomplete` com o token `home`, `work`, `fax` ou `pager`) bloqueia o `celular` em todas as fontes: no ramo do `autocomplete` (`return []`) e no `add` (regras, formato do placeholder e o `type=tel`). Isso cumpre o veto do §6.1 da spec ("a regra de celular ganha `not: /fixo|residencial|comercial/`") também nas fontes que não são a regex.
8. **Sem ano fixo:** `classificarFormulario(ds, hojeISO)` chama `resolver(ds, lerDataISO(hojeISO).ano)`, e `classificarCampo(d)` chama `resolver([d], null)`. Sem ano, as pistas `futuro`/`passado` das opções ficam desligadas.
9. **Ordem de declaração:** `DATA_NAO_NASC` sobe para o escopo do módulo; `ctxCartaoRaw` vem antes de `ctxNasc`; `hasCpfNear` vira `const` antes do uso. O comportamento é o mesmo.

Conteúdo completo de `packages/tools/src/campos.ts`:

```ts
import { lerDataISO } from './nascimento'

export type FieldKind =
  | 'nomeCompleto'
  | 'primeiroNome'
  | 'sobrenome'
  | 'nascimento'
  | 'nascimentoDia'
  | 'nascimentoMes'
  | 'nascimentoAno'
  | 'cpf'
  | 'rg'
  | 'sexo'
  | 'celular'
  | 'ddd'
  | 'email'
  | 'emailConfirmacao'
  | 'senha'
  | 'senhaConfirmacao'
  | 'usuario'
  | 'cep'
  | 'logradouro'
  | 'numeroEndereco'
  | 'complemento'
  | 'bairro'
  | 'cidade'
  | 'uf'
  | 'cidadeUf'
  | 'pais'
  | 'enderecoCompleto'
  | 'razaoSocial'
  | 'nomeFantasia'
  | 'cnpj'
  | 'cartaoNumero'
  | 'cartaoNome'
  | 'cartaoValidade'
  | 'cartaoValidadeMes'
  | 'cartaoValidadeAno'
  | 'cartaoCvv'
  | 'pis'
  | 'tituloEleitor'

type Generic = '_nome' | '_numero' | '_dia' | '_mes' | '_ano' | '_documento'
type Kind = FieldKind | Generic | 'ignorar'

export interface FieldDescriptor {
  tag: 'input' | 'select' | 'textarea'
  type: string
  name: string
  id: string
  autocomplete: string
  placeholder: string
  label: string
  ariaLabel: string
  // el.maxLength vale -1 sem o atributo; quem monta o descriptor converte para null.
  maxLength: number | null
  inputMode?: string
  pattern?: string
  options?: { value: string; text: string }[]
  section?: string
}

export type Via =
  | 'autocomplete'
  | 'label'
  | 'ariaLabel'
  | 'name'
  | 'id'
  | 'placeholder'
  | 'formato'
  | 'tipo'
  | 'opcoes'
  | 'contexto'

export interface Dicas {
  semDdd?: boolean
  incluirNumero?: boolean
}

export interface Classificacao {
  kind: FieldKind | 'ignorar'
  confianca: number
  via: Via
  dicas?: Dicas
}

export const LIMIAR = 0.5

export function normalizar(s: string): string {
  return (s || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const AC: Record<string, FieldKind | 'ignorar'> = {
  name: 'nomeCompleto',
  'given-name': 'primeiroNome',
  'family-name': 'sobrenome',
  nickname: 'usuario',
  username: 'usuario',
  email: 'email',
  'new-password': 'senha',
  'current-password': 'senha',
  'one-time-code': 'ignorar',
  organization: 'razaoSocial',
  'street-address': 'enderecoCompleto',
  'address-line1': 'logradouro',
  'address-line2': 'complemento',
  'address-level1': 'uf',
  'address-level2': 'cidade',
  'address-level3': 'bairro',
  country: 'pais',
  'country-name': 'pais',
  'postal-code': 'cep',
  'cc-name': 'cartaoNome',
  'cc-number': 'cartaoNumero',
  'cc-exp': 'cartaoValidade',
  'cc-exp-month': 'cartaoValidadeMes',
  'cc-exp-year': 'cartaoValidadeAno',
  'cc-csc': 'cartaoCvv',
  bday: 'nascimento',
  'bday-day': 'nascimentoDia',
  'bday-month': 'nascimentoMes',
  'bday-year': 'nascimentoAno',
  sex: 'sexo',
  tel: 'celular',
  'tel-national': 'celular',
  'tel-local': 'celular',
  'tel-area-code': 'ddd',
}
const AC_PREFIX = /^(section-.*|shipping|billing|home|work|mobile|fax|pager)$/

export function campoAutocomplete(raw: string): string | null {
  const toks = (raw || '').toLowerCase().trim().split(/\s+/).filter(Boolean)
  const rest = toks.filter((t) => !AC_PREFIX.test(t) && t !== 'webauthn')
  return rest.length === 1 ? rest[0] : null
}

interface Rule {
  kind: Kind
  re: RegExp
  not?: RegExp
  score: number
}
const CONFIRM =
  /\b(confirm\w*|conf|repet\w*|redigit\w*|novamente|again|verif\w*|re ?type|re ?enter|repeat)\b/

const RULES: Rule[] = [
  {
    kind: 'ignorar',
    re: /\b(captcha|recaptcha|hcaptcha|turnstile|search|busca\w*|pesquis\w*|otp|one time code|codigo (de )?verificacao|token)\b|^q$/,
    score: 0.95,
  },

  { kind: 'cnpj', re: /\bcnpj\b|pessoa juridica/, not: /\bcpf\b/, score: 0.97 },
  { kind: 'cpf', re: /\bcpf\b|pessoa fisica/, not: /\bcnpj\b/, score: 0.97 },
  {
    kind: '_documento',
    re: /\bcpf\b.*\bcnpj\b|\bcnpj\b.*\bcpf\b|^(n(umero)? )?(do )?doc(umento)?$/,
    score: 0.85,
  },
  {
    kind: 'rg',
    re: /\brg\b|registro geral|\bidentidade\b|\brne\b/,
    not: /orgao|emissor|expedi|emissao|\buf\b|estado|data|genero|digital/,
    score: 0.93,
  },
  { kind: 'pis', re: /\b(pis|pasep|nis|nit)\b/, score: 0.93 },
  {
    kind: 'tituloEleitor',
    re: /titulo (de )?eleit|titulo eleitoral|\beleitor\b/,
    not: /zona|secao/,
    score: 0.93,
  },

  {
    kind: 'razaoSocial',
    re: /razao social|nome empresarial|nome da empresa|company ?name|\bempresa\b|\bcompany\b|\borganization\b|\borganizacao\b/,
    not: /fantasia|\bcnpj\b|cargo|\bsite\b/,
    score: 0.9,
  },
  { kind: 'nomeFantasia', re: /\bfantasia\b|trade ?name|\bdba\b/, score: 0.95 },

  {
    kind: 'cartaoNome',
    re: /(nome|name).*(impresso|cartao|card)|\btitular\b|card ?holder|cc ?name|holder ?name|name on card/,
    not: /\bcpf\b|nascimento|\bmae\b/,
    score: 0.95,
  },
  {
    kind: 'cartaoNumero',
    re: /(numero|num|n) (do )?cartao|cartao (de credito )?numero|card ?number|cc ?(number|num)|\bpan\b|credit ?card$|^cartao( de credito)?$/,
    not: /nome|validade|cvv|cvc|seguranca|bandeira|parcela/,
    score: 0.95,
  },
  {
    kind: 'cartaoCvv',
    re: /\b(cvv|cvv 2|cvc|csc|cvn|cid)\b|codigo (de )?seguranca|cod seguranca|security ?code|card ?code|codigo verificador/,
    score: 0.96,
  },
  {
    kind: 'cartaoValidadeMes',
    re: /(validade|vencimento|expir\w*|exp|expiry).*(mes|month|mm)\b|(mes|month).*(validade|vencimento|expir\w*|exp)\b|cc ?exp ?month|exp ?month/,
    not: /\bdia\b|fatura|boleto|melhor|\b(aa|yy|ano|year|aaaa|yyyy)\b/,
    score: 0.95,
  },
  {
    kind: 'cartaoValidadeAno',
    re: /(validade|vencimento|expir\w*|exp|expiry).*(ano|year|aa|yy)\b|(ano|year).*(validade|vencimento|expir\w*|exp)\b|cc ?exp ?year|exp ?year/,
    not: /\bdia\b|fatura|boleto|melhor|\b(mm|mes|month)\b/,
    score: 0.95,
  },
  {
    kind: 'cartaoValidade',
    re: /\bvalidade\b|\bvencimento\b|expira\w*|\bexpiry\b|exp ?date|cc ?exp|valid (thru|until)|\bmm ?(aa|yy)\b/,
    not: /\bdia\b|fatura|boleto|melhor|documento|\brg\b|cnh|passaporte/,
    score: 0.9,
  },

  // As duas *Confirmacao só valem quando CONFIRM casa a mesma fonte (ver pontuar).
  {
    kind: 'emailConfirmacao',
    re: /\be ?mail\b|correio eletronico/,
    score: 0.96,
  },
  { kind: 'email', re: /\be ?mail\b|correio eletronico/, score: 0.95 },
  {
    kind: 'senhaConfirmacao',
    re: /\bsenha\b|\bpass ?word\b|\bpasswd\b|\bpwd\b/,
    score: 0.96,
  },
  {
    kind: 'senha',
    re: /\bsenha\b|\bpass ?word\b|\bpasswd\b|\bpwd\b/,
    score: 0.95,
  },
  {
    kind: 'usuario',
    re: /\busuario\b|user ?name|\buser\b|\blogin\b|\bapelido\b|nick ?name|\bnick\b/,
    score: 0.9,
  },

  {
    kind: 'ddd',
    re: /^\(?ddd\)?$|\bddd\b$|area code|codigo de area/,
    not: /\b(cel\w*|tel\w*|fone|phone|whats\w*|numero)\b/,
    score: 0.95,
  },
  {
    kind: 'celular',
    re: /\b(cel|celular|mobile|whats ?app|whats|zap|telefone|tel|fone|phone)\b|telemovel/,
    not: /\bfax\b|\bramal\b|\bddi\b|e ?mail|nome/,
    score: 0.92,
  },
  {
    kind: 'celular',
    re: /\bcontato\b/,
    not: /e ?mail|nome|emergencia/,
    score: 0.6,
  },

  {
    kind: 'cep',
    re: /\bcep\b|codigo postal|\bzip\b|zip ?code|postal ?code|\bpostcode\b/,
    score: 0.97,
  },
  {
    kind: 'numeroEndereco',
    re: /^(n|no|nro|nr)$|numero (da |do )?(casa|residencia|endereco|imovel)|(house|street|address) ?(number|no)|^end(ereco)? (numero|num|n)$/,
    score: 0.93,
  },
  {
    kind: 'complemento',
    re: /\bcomplemento\b|\bcompl\b|\bapto?\b|\bapartamento\b|address ?line ?2|\baddr ?2\b|address ?2\b|\bsuite\b|\bunit\b|\bbloco\b/,
    score: 0.92,
  },
  {
    kind: 'bairro',
    re: /\bbairro\b|neighbou?rhood|\bdistrito\b|\bdistrict\b/,
    score: 0.95,
  },
  {
    kind: 'cidadeUf',
    re: /\b(cidade|municipio)\b.*\b(uf|estado)\b|\b(uf|estado)\b.*\b(cidade|municipio)\b/,
    not: /\bnatal\b|naturalidade/,
    score: 0.96,
  },
  {
    kind: 'cidade',
    re: /\bcidade\b|\bmunicipio\b|\bcity\b|\btown\b|\blocalidade\b/,
    not: /\bnatal\b|naturalidade/,
    score: 0.93,
  },
  {
    kind: 'uf',
    re: /\buf\b|\bestado\b|\bstate\b|\bprovince\b|\bregion\b/,
    not: /\bcivil\b|emissor|expedi|\brg\b|status|inscricao/,
    score: 0.9,
  },
  {
    kind: 'pais',
    re: /\bpais\b|\bcountry\b/,
    not: /codigo|code|\bddi\b/,
    score: 0.92,
  },
  {
    kind: 'logradouro',
    re: /\blogradouro\b|\brua\b|\bavenida\b|\bendereco\b|\baddress\b|\bstreet\b|address ?line ?1|\baddr ?1\b|address ?1\b|\bend\b/,
    not: /e ?mail|\bip\b|\bsite\b|\bweb\b|\bnumero\b|\bnum\b|\bnumber\b|complemento|bairro|cidade|\bcep\b|line ?2|\b2\b/,
    score: 0.9,
  },

  {
    kind: 'sobrenome',
    re: /\bsobrenome\b|last ?name|\blname\b|\bsurname\b|family ?name|ultimo nome/,
    score: 0.95,
  },
  {
    kind: 'primeiroNome',
    re: /primeiro nome|first ?name|\bfname\b|given ?name/,
    score: 0.95,
  },
  {
    kind: 'nomeCompleto',
    re: /nome completo|full ?name|seu nome|your name|nome e sobrenome|customer ?name|nome do (cliente|comprador|usuario|responsavel)/,
    score: 0.96,
  },
  {
    kind: '_nome',
    re: /^(o )?(seu )?(nome|name)$|^nome\b|\bnome$/,
    not: /\bmae\b|\bpai\b|genitor|filiacao|social|usuario|\buser\b|fantasia|empresa|cartao|impresso|contato|emergencia|\bpet\b|\bloja\b|\bfile\b|\barquivo\b|\bdominio\b|\bcampo\b|\bmeio\b/,
    score: 0.75,
  },

  {
    kind: 'nascimento',
    re: /nascimento|\bnasc\b|data nasc|\bdt nasc|\bdn\b|birth ?(date|day)?|\bdob\b|\bbday\b|aniversario/,
    score: 0.95,
  },
  { kind: 'sexo', re: /\bsexo\b|\bgenero\b|\bgender\b|\bsex\b/, score: 0.9 },

  {
    kind: '_numero',
    re: /\b(numero|num|number|nro|n)\b/,
    not: /(cartao|card|tel\w*|cel\w*|fone|phone|whats|document\w*|\brg\b|cpf|cnpj|pis|titulo|pedido|protocolo|parcela|serie|nota|conta|agencia|matricula|inscricao|registro|crm|oab)/,
    score: 0.7,
  },
  {
    kind: '_dia',
    re: /\b(dia|day|dd)\b/,
    not: /vencimento|fatura|boleto|melhor|semana|entrega/,
    score: 0.7,
  },
  {
    kind: '_mes',
    re: /\b(mes|month|mm)\b/,
    not: /fatura|referencia|competencia/,
    score: 0.7,
  },
  {
    kind: '_ano',
    re: /\b(ano|year|yyyy|aaaa|yy|aa)\b/,
    not: /letivo|fabricacao|modelo|referencia|formatura|conclusao/,
    score: 0.7,
  },
]

const PESO: Record<
  'label' | 'ariaLabel' | 'name' | 'id' | 'placeholder',
  number
> = {
  label: 1,
  ariaLabel: 1,
  name: 0.95,
  id: 0.9,
  placeholder: 0.8,
}

function shape(p: string): string {
  return p.trim().replace(/[0-9_#xX9]/g, '0')
}
const FORMATOS: Array<[RegExp, Kind, number]> = [
  [/^000\.000\.000-00$/, 'cpf', 0.92],
  [/^00\.000\.000\/0000-00$/, 'cnpj', 0.92],
  [/^00000-000$/, 'cep', 0.92],
  [/^\(00\) ?0{4,5}-0000$/, 'celular', 0.9],
  [/^0000 ?0000 ?0000 ?0000$/, 'cartaoNumero', 0.9],
  [/^0{3,5}\.0{5}\.0{2}-0$/, 'pis', 0.9],
]
function formatoPlaceholder(raw: string): [Kind, number] | null {
  const s = shape(raw)
  for (const [re, kind, sc] of FORMATOS) if (re.test(s)) return [kind, sc]
  const n = normalizar(raw)
  if (/^dd mm (aaaa|yyyy)$/.test(n)) return ['nascimento', 0.6]
  if (/^mm (aa|yy|aaaa|yyyy)$/.test(n)) return ['cartaoValidade', 0.9]
  if (/^[^\s@]+@[^\s@]+\.[a-z.]+$/i.test(raw.trim())) return ['email', 0.97]
  return null
}

const SELECTABLE = new Set<Kind>([
  'uf',
  'cidade',
  'pais',
  'sexo',
  'nascimentoDia',
  'nascimentoMes',
  'nascimentoAno',
  'cartaoValidadeMes',
  'cartaoValidadeAno',
  'ddd',
  'bairro',
  '_dia',
  '_mes',
  '_ano',
  'ignorar',
])
const NUMERIC = new Set<Kind>([
  'cpf',
  'cnpj',
  'cep',
  'numeroEndereco',
  'celular',
  'ddd',
  'cartaoNumero',
  'cartaoCvv',
  'nascimentoDia',
  'nascimentoMes',
  'nascimentoAno',
  'cartaoValidadeMes',
  'cartaoValidadeAno',
  'rg',
  'pis',
  'tituloEleitor',
  '_numero',
  '_dia',
  '_mes',
  '_ano',
  '_documento',
  'ignorar',
])
const TEXTAREA = new Set<Kind>([
  'enderecoCompleto',
  'logradouro',
  'complemento',
  'ignorar',
])

function compativel(kind: Kind, d: FieldDescriptor): boolean {
  if (d.tag === 'select') return SELECTABLE.has(kind)
  if (d.tag === 'textarea') return TEXTAREA.has(kind)
  switch (d.type) {
    case 'number':
      return NUMERIC.has(kind)
    case 'password':
      return (
        kind === 'senha' ||
        kind === 'senhaConfirmacao' ||
        kind === 'cartaoCvv' ||
        kind === 'cartaoNumero'
      )
    case 'email':
      return (
        kind === 'email' || kind === 'emailConfirmacao' || kind === 'usuario'
      )
    case 'date':
      return kind === 'nascimento'
    case 'month':
      return kind === 'cartaoValidade'
    case 'tel':
      return NUMERIC.has(kind)
    default:
      return true
  }
}

const NAO_PREENCHE = new Set([
  'hidden',
  'checkbox',
  'radio',
  'file',
  'submit',
  'button',
  'reset',
  'image',
  'range',
  'color',
])

const DATA_NAO_NASC =
  /entrega|agend|inicio|fim|termino|evento|reserva|check|\bida\b|volta|partida|chegada|admiss|validade|vencimento|emissao|expedi|pagamento|consulta/
const TELEFONE_FIXO = /\b(fixo|residencial|comercial)\b/
const AC_TELEFONE_FIXO = new Set(['home', 'work', 'fax', 'pager'])

function ehTelefoneFixo(d: FieldDescriptor): boolean {
  const tokens = (d.autocomplete || '').toLowerCase().split(/\s+/)
  return (
    tokens.some((t) => AC_TELEFONE_FIXO.has(t)) ||
    TELEFONE_FIXO.test(
      normalizar(
        `${d.label} ${d.ariaLabel} ${d.name} ${d.id} ${d.placeholder}`,
      ),
    )
  )
}

interface Scored {
  kind: Kind
  score: number
  via: Via
  fontes: number
}

const PRECEDENCIA: Kind[] = [
  'ignorar',
  'cnpj',
  'cpf',
  'rg',
  'pis',
  'tituloEleitor',
  'cartaoCvv',
  'cartaoNumero',
  'cartaoNome',
  'cartaoValidadeMes',
  'cartaoValidadeAno',
  'cartaoValidade',
  'emailConfirmacao',
  'email',
  'senhaConfirmacao',
  'senha',
  'cep',
  'nomeFantasia',
  'razaoSocial',
  'nascimento',
  'sobrenome',
  'primeiroNome',
  'nomeCompleto',
  'numeroEndereco',
  'complemento',
  'bairro',
  'cidadeUf',
  'cidade',
  'uf',
  'pais',
  'ddd',
  'celular',
  'usuario',
  'logradouro',
  'sexo',
  '_documento',
  '_nome',
  '_numero',
  '_dia',
  '_mes',
  '_ano',
]
const ordem = (k: Kind) => {
  const i = PRECEDENCIA.indexOf(k)
  return i === -1 ? 999 : i
}

function pontuar(d: FieldDescriptor): Scored[] {
  if (d.tag === 'input' && NAO_PREENCHE.has(d.type)) return []
  if (d.type === 'search')
    return [{ kind: 'ignorar', score: 1, via: 'tipo', fontes: 1 }]

  const fixo = ehTelefoneFixo(d)
  const ac = campoAutocomplete(d.autocomplete)
  if (ac && AC[ac]) {
    const k = AC[ac]
    if (k === 'celular' && fixo) return []
    // autocomplete="new-password" fora de type=password é truque contra o autofill do Chrome.
    const acOk = !(ac.endsWith('password') && d.type !== 'password')
    if (acOk && compativel(k, d))
      return [{ kind: k, score: 1, via: 'autocomplete', fontes: 1 }]
  }

  const fontes: Array<[keyof typeof PESO, string]> = [
    ['label', normalizar(d.label)],
    ['ariaLabel', normalizar(d.ariaLabel)],
    ['name', normalizar(d.name)],
    ['id', normalizar(d.id)],
    ['placeholder', normalizar(d.placeholder)],
  ]
  const best = new Map<Kind, Scored>()
  const add = (kind: Kind, score: number, via: Via) => {
    if (!compativel(kind, d) || (kind === 'celular' && fixo)) return
    const cur = best.get(kind)
    if (!cur) best.set(kind, { kind, score, via, fontes: 1 })
    else {
      cur.fontes += 1
      if (score > cur.score) {
        cur.score = score
        cur.via = via
      }
    }
  }
  for (const [src, txt] of fontes) {
    if (!txt) continue
    const confirm = CONFIRM.test(txt)
    const matchedHere = new Set<Kind>()
    for (const r of RULES) {
      if (matchedHere.has(r.kind)) continue
      if (!r.re.test(txt) || (r.not && r.not.test(txt))) continue
      if (
        (r.kind === 'emailConfirmacao' || r.kind === 'senhaConfirmacao') !==
          confirm &&
        (r.kind.startsWith('email') || r.kind.startsWith('senha'))
      )
        continue
      matchedHere.add(r.kind)
      add(r.kind, r.score * PESO[src], src)
    }
  }
  const fmt = d.placeholder ? formatoPlaceholder(d.placeholder) : null
  if (fmt) add(fmt[0], fmt[1], 'formato')

  if (best.size === 0) {
    const ctxTxt = normalizar(`${d.label} ${d.ariaLabel} ${d.name} ${d.id}`)
    if (d.type === 'date' && DATA_NAO_NASC.test(ctxTxt)) return []
    if (d.type === 'email') add('email', 0.9, 'tipo')
    else if (d.type === 'password') add('senha', 0.85, 'tipo')
    else if (d.type === 'date') add('nascimento', 0.55, 'tipo')
    else if (d.type === 'month') add('cartaoValidade', 0.55, 'tipo')
    else if (d.type === 'tel') add('celular', 0.55, 'tipo')
  }
  const out = [...best.values()].map((s) => ({
    ...s,
    score: Math.min(0.99, s.score + 0.03 * (s.fontes - 1)),
  }))
  out.sort((a, b) => b.score - a.score || ordem(a.kind) - ordem(b.kind))
  return out
}

function topo(d: FieldDescriptor): Scored | null {
  const s = pontuar(d)
  return s.length ? s[0] : null
}

const CARTAO = new Set<Kind>([
  'cartaoNumero',
  'cartaoNome',
  'cartaoValidade',
  'cartaoValidadeMes',
  'cartaoValidadeAno',
  'cartaoCvv',
])
const ENDERECO = new Set<Kind>([
  'cep',
  'logradouro',
  'complemento',
  'bairro',
  'cidade',
  'uf',
  'numeroEndereco',
])
const EMPRESA = new Set<Kind>(['cnpj', 'razaoSocial', 'nomeFantasia'])

function anosDasOpcoes(d: FieldDescriptor): number[] {
  return (d.options || [])
    .map((o) => Number(o.value || o.text))
    .filter((n) => Number.isInteger(n) && n >= 1900 && n <= 2100)
}

function parteDeData(
  d: FieldDescriptor,
): 'nascimentoDia' | 'nascimentoMes' | 'nascimentoAno' | null {
  const n = normalizar(`${d.name} ${d.id}`)
  if (/\b(dia|day|dd)\b/.test(n)) return 'nascimentoDia'
  if (/\b(mes|month|mm)\b/.test(n)) return 'nascimentoMes'
  if (/\b(ano|year|yyyy|aaaa)\b/.test(n)) return 'nascimentoAno'
  const nums = (d.options || [])
    .map((o) => Number(o.value))
    .filter((x) => Number.isInteger(x))
  if (anosDasOpcoes(d).length >= 10) return 'nascimentoAno'
  const txt = (d.options || []).map((o) => normalizar(o.text)).join(' ')
  if (
    /janeiro|fevereiro|\bjan\b|\bfev\b/.test(txt) ||
    (nums.length >= 12 && nums.length <= 13 && Math.max(...nums) === 12)
  )
    return 'nascimentoMes'
  if (nums.length >= 28 && Math.max(...nums) === 31) return 'nascimentoDia'
  return null
}

export function classificarCampo(d: FieldDescriptor): Classificacao | null {
  return resolver([d], null)[0]
}

export function classificarFormulario(
  ds: FieldDescriptor[],
  hojeISO: string,
): (Classificacao | null)[] {
  return resolver(ds, lerDataISO(hojeISO).ano)
}

function resolver(
  ds: FieldDescriptor[],
  anoAtual: number | null,
): (Classificacao | null)[] {
  const tops = ds.map(topo)
  const kinds = tops.map((t) => t?.kind)
  const has = (set: Set<Kind>) => kinds.some((k) => k && set.has(k))
  const hasCartao = has(CARTAO),
    hasEndereco = has(ENDERECO),
    hasEmpresa = has(EMPRESA)
  const hasSobrenome = kinds.includes('sobrenome'),
    hasCpf = kinds.includes('cpf')
  const secao = (i: number) => normalizar(ds[i].section || '')
  const vizinho = (i: number, set: Set<Kind>, dist = 2) => {
    for (let k = 1; k <= dist; k++) {
      for (const j of [i - k, i + k]) {
        const kk = kinds[j]
        if (kk && set.has(kk)) return true
      }
    }
    return false
  }
  const ctxCartaoRaw = (i: number) =>
    /cartao|card|pagamento|payment|validade|expir/.test(secao(i))
  const ctxCartao = (i: number) =>
    /cartao|card|pagamento|payment/.test(secao(i)) || vizinho(i, CARTAO)
  const ctxNasc = (i: number) =>
    /nascimento|birth|aniversario/.test(secao(i)) ||
    /nascimento|birth|nasc\b/.test(
      normalizar(ds[i].label + ' ' + ds[i].name),
    ) ||
    [i - 1, i - 2, i + 1, i + 2].some(
      (j) =>
        [
          '_dia',
          '_mes',
          '_ano',
          'nascimento',
          'nascimentoDia',
          'nascimentoMes',
          'nascimentoAno',
        ].includes(kinds[j] as string) && !ctxCartaoRaw(j),
    )
  const ctxRG = (i: number) => /\b(rg|identidade)\b/.test(secao(i))
  const hasCpfNear = (i: number) =>
    [i - 1, i + 1].some((j) => kinds[j] === 'cpf' || kinds[j] === 'nascimento')

  let emails = 0,
    senhas = 0
  return tops.map((t, i) => {
    if (!t || t.score < LIMIAR) return null
    const d = ds[i]
    let kind = t.kind,
      conf = t.score,
      via: Via = t.via
    const ctx = (k: Kind, c: number) => {
      kind = k
      conf = c
      via = 'contexto'
    }

    switch (t.kind) {
      case '_nome':
        if (ctxCartao(i) && !hasCpfNear(i)) ctx('cartaoNome', 0.75)
        else if (/empresa|juridica|\bpj\b|company/.test(secao(i)))
          ctx('razaoSocial', 0.75)
        else if (hasSobrenome) ctx('primeiroNome', 0.8)
        else ctx('nomeCompleto', 0.8)
        break
      case '_numero':
        if (ctxRG(i)) return null
        if ((d.maxLength ?? 0) >= 16 || ctxCartao(i)) ctx('cartaoNumero', 0.75)
        else if (
          vizinho(i, ENDERECO) ||
          (hasEndereco && !hasCartao) ||
          (d.maxLength !== null && d.maxLength <= 6)
        )
          ctx('numeroEndereco', 0.75)
        else return null
        break
      case '_documento':
        if ((d.maxLength ?? 0) >= 18 || (hasEmpresa && !hasCpf))
          ctx('cnpj', 0.8)
        else ctx('cpf', 0.8)
        break
      case '_dia':
      case '_mes':
      case '_ano': {
        const anos = anosDasOpcoes(d)
        const menor = anos.length > 0 ? Math.min(...anos) : null
        const futuro =
          menor !== null && anoAtual !== null && menor >= anoAtual - 1
        const passado =
          menor !== null && anoAtual !== null && menor <= anoAtual - 18
        const cartao =
          ctxCartaoRaw(i) || futuro || (vizinho(i, CARTAO) && !ctxNasc(i))
        if (t.kind === '_ano' && passado) ctx('nascimentoAno', 0.8)
        else if (cartao && t.kind !== '_dia')
          ctx(
            t.kind === '_mes' ? 'cartaoValidadeMes' : 'cartaoValidadeAno',
            0.75,
          )
        else if (ctxNasc(i))
          ctx(
            t.kind === '_dia'
              ? 'nascimentoDia'
              : t.kind === '_mes'
                ? 'nascimentoMes'
                : 'nascimentoAno',
            0.75,
          )
        else return null
        break
      }
      case 'uf':
        if (ctxRG(i)) return null
        break
      case 'email':
        if (emails++ > 0) ctx('emailConfirmacao', 0.85)
        break
      case 'emailConfirmacao':
        emails++
        break
      case 'senha':
        if (senhas++ > 0) ctx('senhaConfirmacao', 0.85)
        break
      case 'senhaConfirmacao':
        senhas++
        break
      case 'nascimento':
        if (d.tag === 'select' || (d.maxLength !== null && d.maxLength <= 4)) {
          const parte = parteDeData(d)
          if (parte) ctx(parte, 0.85)
          else return null
        }
        break
    }
    if (!compativel(kind, d)) return null
    const out = {
      kind,
      confianca: Math.round(conf * 100) / 100,
      via,
    } as Classificacao
    if (kind === 'celular' && kinds[i - 1] === 'ddd')
      out.dicas = { semDdd: true }
    if (
      kind === 'logradouro' &&
      !kinds.includes('_numero') &&
      !kinds.includes('numeroEndereco')
    )
      out.dicas = { incluirNumero: true }
    return out
  })
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/campos.test.ts; echo $?`
Expected: `Tests: 115 passed, 115 total` e `0`.

- [ ] **Step 5: Provar que os testes novos prendem o código (mutação)**

Guarde o original:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && cp src/campos.ts src/campos.ts.orig
```

Para cada linha da tabela, aplique a mudança em `src/campos.ts`, rode `./node_modules/.bin/jest src/campos.test.ts 2>&1 | grep '^Tests:'` e restaure com `cp src/campos.ts.orig src/campos.ts` antes da próxima:

| Mutação                                                                                                                      | Esperado   |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------- |
| no `add`, trocar `if (!compativel(kind, d) \|\| (kind === 'celular' && fixo)) return` por `if (!compativel(kind, d)) return` | `5 failed` |
| apagar a linha `if (k === 'celular' && fixo) return []`                                                                      | `3 failed` |
| tirar `expedi\|` do `not` da regra `uf`                                                                                      | `1 failed` |
| apagar o `case 'uf':` inteiro (as 3 linhas, com o `if (ctxRG(i)) return null` e o `break`)                                   | `1 failed` |
| apagar o `if (ctxRG(i)) return null` do `case '_numero'`                                                                     | `1 failed` |
| trocar `resolver(ds, lerDataISO(hojeISO).ano)` por `resolver(ds, 2026)`                                                      | `2 failed` |

Depois da última:

```bash
cmp src/campos.ts src/campos.ts.orig && rm src/campos.ts.orig; echo $?
./node_modules/.bin/jest src/campos.test.ts; echo $?
```

Expected: `0` (o arquivo voltou igual e a cópia foi apagada); `Tests: 115 passed, 115 total` e `0`.

- [ ] **Step 6: Exportar o subpath**

Em `packages/tools/package.json`, troque `"./pessoa": "./src/pessoa.ts"` (última linha de `exports`) por:

```json
    "./pessoa": "./src/pessoa.ts",
    "./campos": "./src/campos.ts"
```

- [ ] **Step 7: Documentar no `packages/tools/CLAUDE.md`**

Na seção "Pessoa de teste e classificador de campos", depois da subseção de `gerarPessoa`, insira:

```markdown
### Classificador (`campos`)

- `classificarFormulario(ds, hojeISO)` faz duas passadas. A 1ª pontua cada campo: token de `autocomplete` (gramática WHATWG) com confiança 1; regras regex pt-BR/en sobre label, aria-label, name, id e placeholder, com pesos 1 / 1 / 0,95 / 0,9 / 0,8 e bônus de 0,03 por fonte que concorda; formato do placeholder; e o `type` só como pista fraca (`type=tel` **não** quer dizer telefone: no Brasil ele abre o teclado numérico em CPF e CEP). A 2ª resolve os genéricos (`_nome`, `_numero`, `_documento`, dia/mês/ano, 2º e-mail, 2ª senha) pela seção, pelos vizinhos (±2), pelo `maxLength` e pelas opções do select. Devolve `{kind, confianca, via, dicas?}`, ou `null` abaixo de `LIMIAR = 0.5`.
- **Sem ano fixo:** os anos das opções de select são lidos contra o ano de `hojeISO`. `classificarCampo(d)` (um campo, sem formulário) roda sem ano, com essas pistas desligadas.
- **`FieldDescriptor`** é montado pela extensão: `label` junta `el.labels`, o `<label>` que envolve o campo (sem o texto das `<option>`) e `aria-labelledby`; `maxLength` vai `null` quando o atributo falta (o DOM dá `-1`); `section` é a `legend` do `fieldset` mais próximo.
- **Nunca dado errado.** O veto de telefone fixo, residencial ou comercial vale para **toda** fonte de celular: a regra, o formato `(00) 0000-0000`, o `type=tel` e o `autocomplete` com `home`, `work`, `fax` ou `pager`. UF ou estado "emissor", "de expedição" ou "do RG" ficam de fora, e também um `UF` ou `Número` soltos numa seção "RG"/"Identidade" (senão o "Número" virava o número do endereço).
- Kind composto `cidadeUf`, para "Cidade / UF".
```

- [ ] **Step 8: Lint e Jest do pacote**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools
./node_modules/.bin/tsc --noEmit; echo $?
./node_modules/.bin/jest; echo $?
```

Expected: `0`; `Test Suites: 29 passed, 29 total`, `Tests: 451 passed, 451 total`, `0`.

- [ ] **Step 9: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev
/usr/bin/git add packages/tools/package.json packages/tools/CLAUDE.md \
  packages/tools/src/campos.ts packages/tools/src/campos.test.ts
/usr/bin/git commit -m "feat(tools): classificador de campos de formulário"; echo $?
/usr/bin/git status --short packages/tools
```

Expected: `0`, e o `status` sem nenhuma linha.

---

### Tarefa 7: `valorPara` (`campos-formatar`) e a verificação final da fase

**Files:**

- Create: `packages/tools/src/campos-formatar.ts`, `packages/tools/src/campos-formatar.test.ts`
- Modify: `packages/tools/package.json` (exports), `packages/tools/CLAUDE.md`

**Interfaces:**

- Consumes: `normalizar`, `type Dicas`, `type FieldDescriptor`, `type FieldKind` (`./campos`, Tarefa 6); `type Pessoa` (`./pessoa`, Tarefa 5); `UF_NOME` (`./uf`, Tarefa 1).
- Produces (a fase 2 chama no content script, para o preenchimento e para o "Inserir"):

```ts
// @piluvitu/tools/campos-formatar
export function caber(
  cands: string[],
  d: Pick<FieldDescriptor, 'maxLength' | 'pattern' | 'type'>,
): string
export function escolherOpcao(
  options: { value: string; text: string }[],
  cands: string[],
): string | null
export function valorPara(
  kind: FieldKind,
  p: Pessoa,
  d: FieldDescriptor,
  dicas: Dicas = {},
): string | null
```

- [ ] **Step 1: Escrever os testes que falham**

Crie `packages/tools/src/campos-formatar.test.ts`. São os 7 testes de formatação de `R/deteccao/campos.test.ts` em Jest, com a pessoa dourada escrita por extenso no lugar da pessoa plana do protótipo (que tinha RG inválido e cartão fora do catálogo). Por isso os valores esperados mudam; a regra testada é a mesma. O teste de `select` foi dividido por assunto, e há testes novos para os kinds automáticos, os documentos e o Review Focus 4 e 5:

```ts
import { type FieldDescriptor } from './campos'
import { caber, escolherOpcao, valorPara } from './campos-formatar'
import type { Pessoa } from './pessoa'

// A pessoa dourada (gerarPessoa(sfc32(1,2,3,4), '2026-10-01')) escrita por extenso:
// os testes de formatação não dependem dos geradores.
const P: Pessoa = {
  nome: {
    sexo: 'M',
    prenome: 'Vinícius',
    sobrenomes: ['Oliveira', 'Costa'],
    completo: 'Vinícius Oliveira Costa',
    noCartao: 'VINICIUS O COSTA',
  },
  nascimento: { iso: '1993-05-29', br: '29/05/1993', idade: 33 },
  cpf: '647.692.234-39',
  rg: { numero: '25.547.934-7', orgaoEmissor: 'SSP', uf: 'SP' },
  pis: '161.51127.87-1',
  tituloEleitor: '6080 6730 1600',
  celular: {
    ddd: '84',
    numero: '99114-8037',
    formatado: '(84) 99114-8037',
    digitos: '84991148037',
    e164: '+5584991148037',
  },
  email: {
    usuario: 'vinicius.costa.6607',
    endereco: 'vinicius.costa.6607@tuamaeaquelaursa.com',
    caixaUrl: 'https://tuamaeaquelaursa.com/vinicius.costa.6607',
  },
  senha: 's7YZgw&$iLak',
  endereco: {
    cep: '59090-000',
    logradouro: 'Avenida Engenheiro Roberto Freire',
    bairro: 'Ponta Negra',
    cidade: 'Natal',
    uf: 'RN',
    ddd: '84',
    numero: '3360',
    complemento: 'Apto 74',
  },
  empresa: {
    razaoSocial: 'Oliveira & Costa Logística Ltda',
    nomeFantasia: 'Costa Digital',
    cnpj: '35.728.569/0001-52',
  },
  cartao: {
    bandeira: 'mastercard',
    numero: '5555555555554444',
    numeroFormatado: '5555 5555 5555 4444',
    titular: 'VINICIUS O COSTA',
    validade: '08/28',
    mes: '08',
    ano: '28',
    cvv: '430',
  },
}

const f = (p: Partial<FieldDescriptor>): FieldDescriptor => ({
  tag: 'input',
  type: 'text',
  name: '',
  id: '',
  autocomplete: '',
  placeholder: '',
  label: '',
  ariaLabel: '',
  maxLength: null,
  ...p,
})
const opts = (...xs: Array<string | [string, string]>) =>
  xs.map((x) =>
    typeof x === 'string' ? { value: x, text: x } : { value: x[0], text: x[1] },
  )
const range = (a: number, b: number) =>
  Array.from({ length: Math.abs(b - a) + 1 }, (_, i) =>
    String(a < b ? a + i : a - i),
  )
const V = (
  kind: Parameters<typeof valorPara>[0],
  d: Partial<FieldDescriptor>,
  dicas = {},
  pessoa: Pessoa = P,
) => valorPara(kind, pessoa, f(d), dicas)
const sel = (options: { value: string; text: string }[]) => ({
  tag: 'select' as const,
  type: 'select-one',
  options,
})

describe('valorPara: formato por maxLength, pattern e type', () => {
  test('cpf', () => {
    expect(V('cpf', {})).toBe('647.692.234-39')
    expect(V('cpf', { maxLength: 14 })).toBe('647.692.234-39')
    expect(V('cpf', { maxLength: 11 })).toBe('64769223439')
    expect(V('cpf', { pattern: '\\d{11}' })).toBe('64769223439')
    expect(V('cpf', { type: 'number' })).toBe('64769223439')
  })

  test('cnpj, cep e cartão', () => {
    expect(V('cnpj', { maxLength: 14 })).toBe('35728569000152')
    expect(V('cnpj', { maxLength: 18 })).toBe('35.728.569/0001-52')
    expect(V('cep', { maxLength: 8 })).toBe('59090000')
    expect(V('cep', { type: 'number' })).toBe('59090000')
    expect(V('cartaoNumero', { maxLength: 16 })).toBe('5555555555554444')
    expect(V('cartaoNumero', { maxLength: 19 })).toBe('5555 5555 5555 4444')
  })

  test('celular e DDD', () => {
    expect(V('celular', {})).toBe('(84) 99114-8037')
    expect(V('celular', { maxLength: 14 })).toBe('(84)99114-8037')
    expect(V('celular', { maxLength: 11 })).toBe('84991148037')
    expect(V('celular', { maxLength: 10 }, { semDdd: true })).toBe('99114-8037')
    expect(V('celular', { maxLength: 9 }, { semDdd: true })).toBe('991148037')
    expect(V('ddd', { maxLength: 2 })).toBe('84')
  })

  test('datas', () => {
    expect(V('nascimento', { type: 'date' })).toBe('1993-05-29')
    expect(V('nascimento', { maxLength: 10 })).toBe('29/05/1993')
    expect(V('nascimento', { maxLength: 8 })).toBe('29051993')
    expect(V('cartaoValidade', {})).toBe('08/28')
    expect(V('cartaoValidade', { placeholder: 'MM/AAAA' })).toBe('08/2028')
    expect(V('cartaoValidade', { type: 'month' })).toBe('2028-08')
    expect(V('cartaoValidade', { maxLength: 4 })).toBe('0828')
    expect(V('cartaoValidadeAno', { maxLength: 2 })).toBe('28')
  })

  test('endereço', () => {
    expect(V('logradouro', {}, { incluirNumero: true })).toBe(
      'Avenida Engenheiro Roberto Freire, 3360',
    )
    expect(V('logradouro', {})).toBe('Avenida Engenheiro Roberto Freire')
    expect(V('uf', { maxLength: 2 })).toBe('RN')
    expect(V('pais', { maxLength: 2 })).toBe('BR')
    expect(V('pais', {})).toBe('Brasil')
  })

  test('kinds automáticos com o valor do contrato', () => {
    expect(V('primeiroNome', {})).toBe('Vinícius')
    expect(V('sobrenome', {})).toBe('Oliveira Costa')
    expect(V('usuario', {})).toBe('vinicius.costa.6607')
    expect(V('enderecoCompleto', {})).toBe(
      'Avenida Engenheiro Roberto Freire, 3360, Apto 74 - Ponta Negra, Natal - RN, 59090-000',
    )
    expect(V('cidadeUf', {})).toBe('Natal / RN')
    expect(V('sexo', {})).toBe('M')
    expect(V('emailConfirmacao', {})).toBe(
      'vinicius.costa.6607@tuamaeaquelaursa.com',
    )
    expect(V('senhaConfirmacao', {})).toBe('s7YZgw&$iLak')
  })

  test('documentos e empresa', () => {
    expect(V('rg', {})).toBe('25.547.934-7')
    expect(V('rg', { maxLength: 9 })).toBe('255479347')
    expect(V('pis', { maxLength: 11 })).toBe('16151127871')
    expect(V('tituloEleitor', {})).toBe('6080 6730 1600')
    expect(V('tituloEleitor', { maxLength: 12 })).toBe('608067301600')
    expect(V('razaoSocial', {})).toBe('Oliveira & Costa Logística Ltda')
    expect(V('nomeFantasia', {})).toBe('Costa Digital')
    expect(V('cartaoNome', {})).toBe('VINICIUS O COSTA')
    expect(V('cartaoCvv', {})).toBe('430')
  })

  test('senha maior que maxLength vai inteira: o campo recusa, nunca truncamos', () => {
    expect(V('senha', { type: 'password', maxLength: 8 })).toBe('s7YZgw&$iLak')
  })
})

describe('valorPara em <select>', () => {
  test('UF por valor, por nome e por token do texto', () => {
    expect(
      V(
        'uf',
        sel(
          opts(
            ['', 'Selecione'],
            ['rn', 'Rio Grande do Norte'],
            ['rj', 'Rio de Janeiro'],
          ),
        ),
      ),
    ).toBe('rn')
    expect(
      V(
        'uf',
        sel(
          opts(
            ['', 'Selecione'],
            ['20', 'Rio Grande do Norte'],
            ['19', 'Rio de Janeiro'],
          ),
        ),
      ),
    ).toBe('20')
    expect(
      V(
        'uf',
        sel(
          opts(['1', 'RJ - Rio de Janeiro'], ['2', 'RN - Rio Grande do Norte']),
        ),
      ),
    ).toBe('2')
  })

  test('país', () => {
    expect(V('pais', sel(opts(['ARG', 'Argentina'], ['BRA', 'Brasil'])))).toBe(
      'BRA',
    )
    expect(V('pais', sel(opts(['32', 'Argentina'], ['076', 'Brazil'])))).toBe(
      '076',
    )
  })

  test('partes da data e da validade', () => {
    expect(
      V(
        'nascimentoMes',
        sel(opts(['', 'Mês'], ['1', 'Janeiro'], ['4', 'Abril'], ['5', 'Maio'])),
      ),
    ).toBe('5')
    expect(
      V(
        'nascimentoMes',
        sel(opts(['abr', 'Abr'], ['mai', 'Mai'], ['jun', 'Jun'])),
      ),
    ).toBe('mai')
    expect(V('nascimentoDia', sel(opts(...range(1, 31))))).toBe('29')
    expect(V('nascimentoAno', sel(opts(...range(2026, 1926))))).toBe('1993')
    expect(V('cartaoValidadeMes', sel(opts(...range(1, 12))))).toBe('8')
    expect(V('cartaoValidadeAno', sel(opts(...range(26, 36))))).toBe('28')
    expect(V('cartaoValidadeAno', sel(opts(...range(2026, 2036))))).toBe('2028')
  })

  test('sexo tenta a sigla, o nome em português e em inglês', () => {
    const feminina: Pessoa = { ...P, nome: { ...P.nome, sexo: 'F' } }
    const s1 = sel(opts(['', '--'], ['1', 'Masculino'], ['2', 'Feminino']))
    expect(V('sexo', s1)).toBe('1')
    expect(V('sexo', s1, {}, feminina)).toBe('2')
    const s2 = sel(opts(['h', 'Homem'], ['m', 'Mulher']))
    expect(V('sexo', s2)).toBe('h')
    expect(V('sexo', s2, {}, feminina)).toBe('m')
    const s3 = sel(opts(['male', 'Male'], ['female', 'Female']))
    expect(V('sexo', s3)).toBe('male')
    expect(V('sexo', s3, {}, feminina)).toBe('female')
  })

  test('sem a opção da pessoa devolve null, nunca uma opção errada', () => {
    expect(
      V(
        'uf',
        sel(
          opts(
            ['', 'Selecione'],
            ['SP', 'São Paulo'],
            ['RJ', 'Rio de Janeiro'],
          ),
        ),
      ),
    ).toBeNull()
    expect(
      V('pais', sel(opts(['AR', 'Argentina'], ['PT', 'Portugal']))),
    ).toBeNull()
    expect(
      V(
        'cidade',
        sel(opts(['', 'Selecione'], ['1', 'Mossoró'], ['2', 'Parnamirim'])),
      ),
    ).toBeNull()
    expect(escolherOpcao(opts('Google', 'Instagram'), ['SP'])).toBeNull()
  })

  test('kind que não cabe em select devolve null', () => {
    expect(V('cpf', sel(opts('1', '2')))).toBeNull()
  })
})

describe('caber', () => {
  test('sem candidato que caiba, devolve o mais curto', () => {
    expect(
      caber(['529.982.247-25', '52998224725'], {
        maxLength: 9,
        pattern: undefined,
        type: 'text',
      }),
    ).toBe('52998224725')
  })

  test('pattern que não compila é ignorado', () => {
    expect(
      caber(['529.982.247-25', '52998224725'], {
        maxLength: null,
        pattern: '[',
        type: 'text',
      }),
    ).toBe('529.982.247-25')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/campos-formatar.test.ts; echo $?`
Expected: `1`, com `Cannot find module './campos-formatar'`.

- [ ] **Step 3: Escrever o `campos-formatar.ts`**

Crie `packages/tools/src/campos-formatar.ts` com o conteúdo abaixo, que parte de `R/deteccao/formatar.ts`. As diferenças:

1. Sai a `interface Pessoa` plana; entra a `Pessoa` aninhada de `./pessoa`. `Dicas` vem de `./campos` (não é redeclarada) e `UF_NOME` vem de `./uf`. O import perde a extensão `.ts`.
2. Cada valor sai do campo aninhado: `nomeCompleto` → `nome.completo`; `primeiroNome` → `nome.prenome`; `sobrenome` → `nome.sobrenomes.join(' ')`; `usuario` → `email.usuario`; `email` → `email.endereco`; `cpf`; `rg` → `rg.numero`; `pis`; `tituloEleitor`; `cnpj`, `razaoSocial`, `nomeFantasia` → `empresa.*`; endereço → `endereco.*`; celular → `celular.formatado`/`numero`/`ddd`/`digitos`; datas → `nascimento.br`/`iso`; cartão → `cartao.numeroFormatado`/`numero`/`titular`/`validade`/`mes`/`ano`/`cvv`; `sexo` → `nome.sexo`.
3. Kind novo `cidadeUf` → `"{cidade} / {uf}"`.
4. `uf` em campo de texto devolve sempre a sigla (o `caber([uf])` do protótipo dava o mesmo).
5. **`sexo` em select:** a sigla vai por último, `['Feminino', 'Mulher', 'Female', 'F']` / `['Masculino', 'Homem', 'Male', 'M']`. A ordem da spec §6.1 (`'M'` primeiro) escolhia "Mulher" para um homem num select `h`/`m` (Review Focus 5); a lista de candidatos é a mesma, só a ordem muda, e é a que o contrato registra.
6. **Comentários:** saem o cabeçalho e o doc-comment de `caber`. Ficam dois: o porquê das flags `v`/`u` em `patternOk` e o da ordem do `sexo`.

Conteúdo completo de `packages/tools/src/campos-formatar.ts`:

```ts
import {
  normalizar,
  type Dicas,
  type FieldDescriptor,
  type FieldKind,
} from './campos'
import type { Pessoa } from './pessoa'
import { UF_NOME } from './uf'

const MESES = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

const so = (s: string) => s.replace(/\D/g, '')

// Tenta a flag v (a que o navegador usa) e depois u; pattern que não compila
// em nenhuma é ignorado, como o navegador faz.
function patternOk(pattern: string | undefined, v: string): boolean {
  if (!pattern) return true
  for (const flags of ['v', 'u']) {
    try {
      return new RegExp(`^(?:${pattern})$`, flags).test(v)
    } catch {
      continue
    }
  }
  return true
}

export function caber(
  cands: string[],
  d: Pick<FieldDescriptor, 'maxLength' | 'pattern' | 'type'>,
): string {
  const uniq = [...new Set(cands)]
  const pool = d.type === 'number' ? uniq.filter((c) => /^\d+$/.test(c)) : uniq
  const ok = pool.find(
    (c) =>
      (d.maxLength === null || c.length <= d.maxLength) &&
      patternOk(d.pattern, c),
  )
  if (ok !== undefined) return ok
  return [...pool].sort((a, b) => a.length - b.length)[0] ?? ''
}

export function escolherOpcao(
  options: { value: string; text: string }[],
  cands: string[],
): string | null {
  const reais = options.filter(
    (o) =>
      !(
        o.value === '' ||
        /^(selecione|escolha|select|choose|--)/.test(normalizar(o.text))
      ),
  )
  const nc = cands.map(normalizar).filter(Boolean)
  for (const c of nc) {
    const hit = reais.find(
      (o) => normalizar(o.value) === c || normalizar(o.text) === c,
    )
    if (hit) return hit.value
  }
  for (const c of nc) {
    if (!/^\d+$/.test(c)) continue
    const hit = reais.find(
      (o) =>
        Number(so(o.value) || NaN) === Number(c) ||
        Number(so(o.text) || NaN) === Number(c),
    )
    if (hit) return hit.value
  }
  for (const c of nc) {
    const hit = reais.find(
      (o) =>
        normalizar(o.text).split(' ').includes(c) ||
        normalizar(o.text).startsWith(c + ' '),
    )
    if (hit) return hit.value
  }
  return null
}

export function valorPara(
  kind: FieldKind,
  p: Pessoa,
  d: FieldDescriptor,
  dicas: Dicas = {},
): string | null {
  const [dd, mm, aaaa] = p.nascimento.br.split('/')
  const { mes: vm, ano: va } = p.cartao
  const cel = p.celular.digitos
  const e = p.endereco
  const sel = (c: string[]) => escolherOpcao(d.options || [], c)
  if (d.tag === 'select') {
    switch (kind) {
      case 'uf':
        return sel([e.uf, UF_NOME[e.uf]])
      case 'cidade':
        return sel([e.cidade])
      case 'bairro':
        return sel([e.bairro])
      case 'pais':
        return sel(['BR', 'BRA', '076', 'Brasil', 'Brazil'])
      case 'sexo':
        // A sigla vai por último: num select H/M, o "m" é Mulher.
        return sel(
          p.nome.sexo === 'F'
            ? ['Feminino', 'Mulher', 'Female', 'F']
            : ['Masculino', 'Homem', 'Male', 'M'],
        )
      case 'nascimentoDia':
        return sel([dd])
      case 'nascimentoMes':
        return sel([
          mm,
          MESES[Number(mm) - 1],
          MESES[Number(mm) - 1].slice(0, 3),
        ])
      case 'nascimentoAno':
        return sel([aaaa])
      case 'cartaoValidadeMes':
        return sel([
          vm,
          MESES[Number(vm) - 1],
          MESES[Number(vm) - 1].slice(0, 3),
        ])
      case 'cartaoValidadeAno':
        return sel(['20' + va, va])
      case 'ddd':
        return sel([p.celular.ddd])
      default:
        return null
    }
  }
  switch (kind) {
    case 'nomeCompleto':
      return p.nome.completo
    case 'primeiroNome':
      return p.nome.prenome
    case 'sobrenome':
      return p.nome.sobrenomes.join(' ')
    case 'nascimento':
      return d.type === 'date'
        ? p.nascimento.iso
        : caber([p.nascimento.br, `${dd}${mm}${aaaa}`], d)
    case 'nascimentoDia':
      return dd
    case 'nascimentoMes':
      return mm
    case 'nascimentoAno':
      return caber([aaaa, aaaa.slice(2)], d)
    case 'cpf':
      return caber([p.cpf, so(p.cpf)], d)
    case 'cnpj':
      return caber([p.empresa.cnpj, so(p.empresa.cnpj)], d)
    case 'rg':
      return caber([p.rg.numero, p.rg.numero.replace(/[.-]/g, '')], d)
    case 'pis':
      return caber([p.pis, so(p.pis)], d)
    case 'tituloEleitor':
      return caber([p.tituloEleitor, so(p.tituloEleitor)], d)
    case 'cep':
      return caber([e.cep, so(e.cep)], d)
    case 'ddd':
      return p.celular.ddd
    case 'celular': {
      const local = cel.slice(2)
      if (dicas.semDdd) return caber([p.celular.numero, local], d)
      return caber(
        [
          p.celular.formatado,
          `(${p.celular.ddd})${p.celular.numero}`,
          `${p.celular.ddd} ${p.celular.numero}`,
          cel,
        ],
        d,
      )
    }
    case 'email':
    case 'emailConfirmacao':
      return p.email.endereco
    case 'senha':
    case 'senhaConfirmacao':
      return p.senha
    case 'usuario':
      return p.email.usuario
    case 'logradouro':
      return dicas.incluirNumero ? `${e.logradouro}, ${e.numero}` : e.logradouro
    case 'numeroEndereco':
      return e.numero
    case 'complemento':
      return e.complemento
    case 'bairro':
      return e.bairro
    case 'cidade':
      return e.cidade
    case 'uf':
      return e.uf
    case 'cidadeUf':
      return `${e.cidade} / ${e.uf}`
    case 'pais':
      return d.maxLength !== null && d.maxLength <= 3 ? 'BR' : 'Brasil'
    case 'enderecoCompleto':
      return `${e.logradouro}, ${e.numero}, ${e.complemento} - ${e.bairro}, ${e.cidade} - ${e.uf}, ${e.cep}`
    case 'razaoSocial':
      return p.empresa.razaoSocial
    case 'nomeFantasia':
      return p.empresa.nomeFantasia
    case 'cartaoNumero':
      return caber([p.cartao.numeroFormatado, p.cartao.numero], d)
    case 'cartaoNome':
      return p.cartao.titular
    case 'cartaoValidade':
      if (d.type === 'month') return `20${va}-${vm}`
      return /a{4}|y{4}/i.test(d.placeholder)
        ? `${vm}/20${va}`
        : caber([p.cartao.validade, `${vm}${va}`, `${vm}/20${va}`], d)
    case 'cartaoValidadeMes':
      return vm
    case 'cartaoValidadeAno':
      return caber(['20' + va, va], d)
    case 'cartaoCvv':
      return p.cartao.cvv
    case 'sexo':
      return p.nome.sexo
  }
  return null
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/campos-formatar.test.ts; echo $?`
Expected: `Tests: 16 passed, 16 total` e `0`.

- [ ] **Step 5: Exportar o subpath**

Em `packages/tools/package.json`, troque `"./campos": "./src/campos.ts"` (última linha de `exports`) por:

```json
    "./campos": "./src/campos.ts",
    "./campos-formatar": "./src/campos-formatar.ts"
```

O bloco `exports` termina assim, com 15 subpaths novos nesta fase:

```json
    "./import/id": "./src/import/id.ts",
    "./aleatorio": "./src/aleatorio.ts",
    "./uf": "./src/uf.ts",
    "./rg": "./src/rg.ts",
    "./pis": "./src/pis.ts",
    "./titulo-eleitor": "./src/titulo-eleitor.ts",
    "./celular": "./src/celular.ts",
    "./nascimento": "./src/nascimento.ts",
    "./senha": "./src/senha.ts",
    "./nome": "./src/nome.ts",
    "./endereco": "./src/endereco.ts",
    "./empresa": "./src/empresa.ts",
    "./cartao": "./src/cartao.ts",
    "./pessoa": "./src/pessoa.ts",
    "./campos": "./src/campos.ts",
    "./campos-formatar": "./src/campos-formatar.ts"
  },
```

- [ ] **Step 6: Documentar no `packages/tools/CLAUDE.md`**

Na seção "Pessoa de teste e classificador de campos", depois da subseção do classificador, insira:

```markdown
### Valor de cada campo (`campos-formatar`)

- `valorPara(kind, pessoa, descriptor, dicas?)` escolhe o valor **antes** de escrever, porque uma escrita por script ignora `maxlength`: a versão com máscara quando cabe em `maxLength` e em `pattern` (flag `v`), senão só os dígitos; `type=date` → `aaaa-mm-dd`, `type=month` → `aaaa-mm`, `type=number` → dígitos.
- **Senha maior que `maxLength` vai inteira:** o campo recusa e a extensão conta como "recusado". Truncar quebraria o login seguinte.
- **`<select>`** (`escolherOpcao`): valor ou texto normalizados, depois igualdade numérica (`03` = `3`), depois token do texto (`SP - São Paulo`). Pula a opção de placeholder, e sem a opção da pessoa devolve `null`. UF tenta a sigla e o nome; país tenta `BR`, `BRA`, `076`, `Brasil`, `Brazil`. No `sexo` a sigla vai **por último**: num select `h`/`m`, o `m` é Mulher.
- **Valores compostos:** `sobrenome` = os dois sobrenomes; `usuario` = `email.usuario`; `cidadeUf` = `"{cidade} / {uf}"`; `enderecoCompleto` = `"{logradouro}, {numero}, {complemento} - {bairro}, {cidade} - {uf}, {cep}"`.

**`packages/tools`: 158 → 467 testes** (149 dos 172 testes dos geradores da pesquisa, os 103 do classificador e os de borda).
```

- [ ] **Step 7: Verificação final da fase**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools
./node_modules/.bin/tsc --noEmit; echo $?
./node_modules/.bin/tsc --noEmit --verbatimModuleSyntax; echo $?
./node_modules/.bin/jest; echo $?
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/web
./node_modules/.bin/tsc --noEmit; echo $?
./node_modules/.bin/jest --passWithNoTests; echo $?
cd /Users/piluvitu/WWW/PiluVitu-Dev
/usr/bin/git diff --quiet main...HEAD -- packages/tools/src/index.ts apps/; echo $?
/usr/bin/git status --short apps/ packages/tools/src/index.ts
```

Expected, na ordem:

- tsc do tools: `0`;
- tsc com `--verbatimModuleSyntax`: `0`. O tsconfig que o WXT gera para a extensão (fase 2) liga essa flag e checa os arquivos do tools que ela importa; isto prova que eles passam;
- Jest do tools: `Test Suites: 30 passed, 30 total`, `Tests: 467 passed, 467 total`, `0`;
- tsc do web: `0`;
- Jest do web: `Test Suites: 21 passed, 21 total`, `Tests: 128 passed, 128 total`, `0`;
- `git diff --quiet main...HEAD -- …`: `0` (nenhum app nem o barrel mudou na branch);
- `git status --short …`: nenhuma linha.

Esta é a condição de pronto do §14.1 da spec: Jest e tsc do tools passam, e Jest e tsc do `apps/web` continuam verdes sem mudar `cpf-tool`/`cnpj-tool`.

- [ ] **Step 8: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev
/usr/bin/git add packages/tools/package.json packages/tools/CLAUDE.md \
  packages/tools/src/campos-formatar.ts packages/tools/src/campos-formatar.test.ts
/usr/bin/git commit -m "feat(tools): valorPara formata o valor de cada campo para a pessoa"; echo $?
/usr/bin/git status --short packages/tools
/usr/bin/git log --oneline -7
```

Expected: `0`; `status` sem nenhuma linha; o `log` mostra os 7 commits desta fase.

---

## Cobertura da spec nesta fase

| Spec                                                                                                 | Onde                                                                                                               |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| §5 aleatoriedade injetável; `gerarCPF()`/`gerarCNPJ()` compatíveis                                   | Tarefa 1 (Steps 2–7, inclusive o Playwright do CPF)                                                                |
| §5 CPF (região fiscal, base repetida), CNPJ (filial 0001)                                            | Tarefa 1                                                                                                           |
| §5 RG SSP-SP sem X, PIS, título SP/MG nas duas regras                                                | Tarefa 2                                                                                                           |
| §5 celular com DDD do endereço, nascimento 18–65 sem fuso, senha 12, nome e e-mail                   | Tarefa 3 (DDD coerente: Tarefa 5)                                                                                  |
| §5 34 CEPs, empresa, cartão Stripe                                                                   | Tarefa 4                                                                                                           |
| §5 coerência, pessoa dourada, mesma semente → mesma pessoa                                           | Tarefa 5                                                                                                           |
| §6.1 sinais, passada de formulário, limiar, vetos, kinds (+ `cidadeUf`), `ignorar`, dicas, `hojeISO` | Tarefa 6                                                                                                           |
| §6.1 contagem (X, Y, k)                                                                              | fase 2 (é do DOM)                                                                                                  |
| §6.2 `valorPara`, `maxLength`/`pattern` (`v`), `date`/`month`/`number`, select, senha não truncada   | Tarefa 7                                                                                                           |
| §11 script `lint` no `packages/tools`; `packages/tools/CLAUDE.md`                                    | Tarefa 1 (script, passo do CI e a linha do `ci.yml` no `CLAUDE.md` raiz); Tarefas 1–7 (`packages/tools/CLAUDE.md`) |
| §12 Jest dos geradores e do classificador, com os 3 ajustes                                          | Tarefas 1–7                                                                                                        |
| §14.1 pronto quando                                                                                  | Tarefa 7, Step 7                                                                                                   |

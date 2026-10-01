# Form field detection (classification) and filling: research report

Date: 2026-10-01. No repo file was modified. All artifacts are under `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/research/`.

**Tags used throughout:** **[V: source]** means I checked it against a live source or by running it here. **[A]** means it is my assumption or judgement and I did not test it.

---

## 0. Summary of decisions

1. **The content script must run in the ISOLATED world (the default). There, a plain `el.value = v` followed by `input` and `change` events works for every framework and mask library tested.** That covers React 19 and 18, react-hook-form, Vue 3, maska, imask, react-imask, @react-input/mask, react-number-format, jQuery Mask Plugin and the legacy react-input-mask. **[V: lab, Chromium 147]**
   - The well-known "native value setter" trick is only needed in the MAIN world. In MAIN, a plain assignment breaks React controlled inputs: React state stays empty and the DOM value reverts to `''`.
   - I still recommend calling the native prototype setter. It costs nothing and keeps the function correct in either world.
2. **Never type character by character.** In the lab, `execCommand('insertText')` one character at a time broke @react-input/mask (it ended at `'5'`) and scrambled jQuery Mask (`529.822.725-49`). **[V: lab]**
   - Setting the whole value plus an `input` event worked with both formatted and digits-only values on every mask.
3. **maxLength and pattern decide the format.** A programmatic set ignores `maxlength`: 14 characters went into a `maxlength=11` field, and `tooLong` stayed `false`. `execCommand` truncates silently instead (it produced `529.982.247`). So the value has to be chosen to fit **before** writing. **[V: lab plus WHATWG spec text]**
4. **The classifier is pure** (`FieldDescriptor → {kind, confidence, via}`) and runs in two passes:
   - per-field scoring, then
   - a form-context pass that resolves the generic cases: `_nome`, `_numero`, `_documento`, `_dia/_mes/_ano`, the second e-mail field and the second password field.
5. **Prototype results:**
   - 103 node:test tests pass, including 80 single-field vectors and 14 form-level vectors.
   - `tsc --strict` exits 0.
   - An end-to-end run on a realistic signup page filled **21 of 23** fields. The 2 left over were exactly the design's 1c examples, `input[name="ref_code"]` and `select#origem`. The honeypot, the checkbox, the hidden input and the search box were all excluded. The run took 74 ms.
6. **Checkboxes and radios are out of scope for v1** (argument in §2.3). Fields of type search, captcha or one-time code are recognized as `ignorar` and are not counted in "X de Y".
7. **Already-filled fields: mode A overwrites, so the page stays coherent with one person.** It skips the write and its events when the value is already equal (this is also what Bitwarden does). It never touches disabled or readonly fields.
8. **iframes:** with host permission only for the top origin, which is what activeTab grants:
   - `executeScript({allFrames:true})` silently skips cross-origin frames.
   - `frameIds:[crossOriginFrame]` throws `Cannot access contents of url …`. **[V: lab]**
9. **Shadow DOM:** open roots are reached through `.shadowRoot`. Closed roots are reached through `chrome.dom.openOrClosedShadowRoot()`, which works from the isolated-world content script. **[V: lab]** Dispatched events must use `composed:true` to leave the shadow root. **[V: lab]**
10. **Mode B (context menu → Inserir):** Chrome gives no target element (`OnClickData` has no `targetElementId`; that is Firefox only). A right-click does focus the field, though, including inside an open shadow root and a cross-origin iframe. So: inject into `OnClickData.frameId` and read the deep `activeElement`. **[V: lab focus test; Chrome docs field list]**

---

## 1. Evidence base

| What                                              | Version / source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser used in the lab                           | Chromium **147.0.7727.15**, headless, through Playwright **1.59.1** (the repo's copy), with a real MV3 test extension loaded via `--load-extension`                                                                                                                                                                                                                                                                                                                                                                           |
| Test extensions                                   | `ext-wide` (`<all_urls>`) and `ext-narrow` (`http://localhost:3101/*` only, which simulates an activeTab grant). Both have permissions `scripting` and `tabs`                                                                                                                                                                                                                                                                                                                                                                 |
| Libraries tested (npm, installed in scratch only) | react/react-dom 19.3.0, react-hook-form 7.89.0, react-imask 7.6.1, imask 7.6.1, @react-input/mask 2.0.4, react-number-format 5.4.5, vue 3.5.43, maska 3.2.2, jquery 3.7.1 + jquery-mask-plugin 1.14.16, react 18.3.1 + react-input-mask 2.0.4                                                                                                                                                                                                                                                                                 |
| npm weekly downloads (2026-09-23..29)             | react-number-format 6.29M, imask 1.88M, react-imask 1.12M, react-input-mask 784k, select2 787k, ngx-mask 573k, maska 383k, cleave.js 376k, @react-input/mask 308k, jquery-mask-plugin 97k **[V: api.npmjs.org]**                                                                                                                                                                                                                                                                                                              |
| Sources fetched                                   | WHATWG HTML (autofill table, pattern "v" flag, tooLong rule); Chromium `legacy_regex_patterns.json` (commit `7c4a2eb`, 2026-08-11); React `inputValueTracking.js` (main); Bitwarden `insert-autofill-content.service.ts`; Fake Filler `element-filler.ts`; Angular `default_value_accessor.ts` and `select_control_value_accessor.ts`; ngx-mask directive; Chrome docs (activeTab, scripting, contextMenus, dom); MDN (checkVisibility, autocomplete-off guide, menus.getTargetElement); select2 docs; a real Mailchimp embed |

---

## 2. Taxonomy

### 2.1 Field kinds

The "Menu label" column uses the design's 1g text. "—" in the Menu column means the kind is filled automatically only and has no menu item.

| kind                    | Menu label (pt-BR)    | Menu | Group      | Value from the person     | Notes                                                                                |
| ----------------------- | --------------------- | ---- | ---------- | ------------------------- | ------------------------------------------------------------------------------------ |
| `nomeCompleto`          | Nome completo         | ✓    | Pessoais   | nome                      |                                                                                      |
| `primeiroNome`          | —                     | —    | Pessoais   | primeiroNome              | The data model must store first and last name separately                             |
| `sobrenome`             | —                     | —    | Pessoais   | sobrenome                 |                                                                                      |
| `nascimento`            | Data de nascimento    | ✓    | Pessoais   | nasc                      | `type=date` takes ISO format                                                         |
| `nascimentoDia/Mes/Ano` | —                     | —    | Pessoais   | parts of nasc             | Split selects or inputs                                                              |
| `cpf`                   | CPF · {cpf}           | ✓    | Pessoais   | cpf                       |                                                                                      |
| `rg`                    | RG                    | ✓    | Pessoais   | rg                        | Not the órgão emissor, UF do RG or expedição fields                                  |
| `celular`               | Celular               | ✓    | Pessoais   | cel                       | Also used for "telefone"; there is a hint for the "without DDD" case                 |
| `ddd`                   | —                     | —    | Pessoais   | first 2 digits of cel     |                                                                                      |
| `email`                 | E-mail                | ✓    | E-mail     | email                     |                                                                                      |
| `emailConfirmacao`      | —                     | —    | E-mail     | email                     |                                                                                      |
| `senha`                 | Senha                 | ✓    | Pessoais   | senha                     | `current-password` maps here too, so the login after signup works                    |
| `senhaConfirmacao`      | —                     | —    | Pessoais   | senha                     |                                                                                      |
| `usuario`               | (optional "Usuário")  | ?    | Pessoais   | user                      | The only kind I would consider adding to the menu                                    |
| `sexo`                  | —                     | —    | Pessoais   | sexo                      | **Needs a `sexo` field in the data model.** The first-name list is already gendered  |
| `cep`                   | CEP · {cep}           | ✓    | Endereço   | cep                       |                                                                                      |
| `logradouro`            | Rua                   | ✓    | Endereço   | rua                       | Hint `incluirNumero` gives "Avenida Paulista, 402" when the form has no número field |
| `numeroEndereco`        | Número                | ✓    | Endereço   | num                       |                                                                                      |
| `complemento`           | Complemento           | ✓    | Endereço   | compl                     |                                                                                      |
| `bairro`                | Bairro                | ✓    | Endereço   | bairro                    |                                                                                      |
| `cidade`                | Cidade                | ✓    | Endereço   | cidade                    |                                                                                      |
| `uf`                    | UF                    | ✓    | Endereço   | uf                        | For a select: match by code, then by state name                                      |
| `pais`                  | —                     | —    | Endereço   | "Brasil" / BR / BRA / 076 |                                                                                      |
| `enderecoCompleto`      | —                     | —    | Endereço   | composed                  | From `autocomplete=street-address`                                                   |
| `razaoSocial`           | Razão social          | ✓    | Empresa    | razao                     |                                                                                      |
| `nomeFantasia`          | Nome fantasia         | ✓    | Empresa    | fantasia                  |                                                                                      |
| `cnpj`                  | CNPJ                  | ✓    | Empresa    | cnpj                      |                                                                                      |
| `cartaoNumero`          | Cartão: número        | ✓    | Cartão     | cartao                    |                                                                                      |
| `cartaoNome`            | Cartão: nome impresso | ✓    | Cartão     | nomeCartao                |                                                                                      |
| `cartaoValidade`        | Cartão: validade      | ✓    | Cartão     | validade                  | MM/AA, or `type=month` as `2029-08`                                                  |
| `cartaoValidadeMes/Ano` | —                     | —    | Cartão     | parts of validade         |                                                                                      |
| `cartaoCvv`             | Cartão: CVV           | ✓    | Cartão     | cvv                       |                                                                                      |
| `pis`                   | PIS/NIS               | ✓    | Documentos | pis                       |                                                                                      |
| `tituloEleitor`         | Título de eleitor     | ✓    | Documentos | titulo                    |                                                                                      |
| `ignorar`               | —                     | —    | —          | —                         | search, captcha, OTP/token. Not counted in Y                                         |

The 21 menu items match the design's 1g exactly. In mode B, each item is formatted with the same `valorPara(kind, pessoa, descriptor)` used for automatic filling, so `maxLength` and `type` of the focused field still apply. For example, "Data de nascimento" inserted into a `type=date` field gives ISO format.

### 2.2 Not filled, and not counted in "X de Y"

- input types `hidden`, `checkbox`, `radio`, `file`, `submit`, `button`, `reset`, `image`, `range`, `color`
- `select[multiple]`
- disabled or readonly fields
- invisible or honeypot fields (§5.4)
- `ignorar` kinds

### 2.3 Checkboxes and radios: out of scope for v1

1. **They don't carry data from the person.** "Aceito os termos", "Quero receber ofertas" and "Lembrar de mim" are consents or preferences, and the right value can't be derived from the person.
2. **Toggling them changes the form.** PF/PJ radios swap whole sections. A "same billing address" checkbox hides or shows fields. Opt-in boxes trigger side effects. Filling would race against DOM mutations caused by our own clicks.
3. **The required "aceite" box is often the thing under test**, for example the validation message shown when it is unchecked. Checking it is one click for the developer.
4. **The count stays honest.** Design 1c's "12 de 14" counts data fields. Adding every checkbox to Y would flood the "Não reconhecidos" list.

Fake Filler has an `agreeTermsFields` option that checks matching checkboxes and randomizes the rest **[V: source]**. A possible v1.1 is an opt-in setting "marcar aceite de termos". It would touch only `required` checkboxes whose label matches `/termo|aceit|concord|privacidade|lgpd/`, plus a `sexo` radio group.

---

## 3. Signals, in priority order

### 3.1 `autocomplete`: decisive, confidence 1.0

The token grammar comes from WHATWG **[V: html.spec.whatwg.org, form-control-infrastructure]**. In order:

- optional `section-*`
- optional `shipping` or `billing`
- then either
  - a field name (`name`, `given-name`, … `cc-csc`, `bday-*`, `sex`, …), or
  - an optional `home|work|mobile|fax|pager` followed by a contact field (`tel*`, `email`, `impp`)
- optional `webauthn`

`on` and `off` are standalone keywords.

The parser drops the prefixes and `webauthn` and accepts the result only if exactly one token is left:

```ts
const AC_PREFIX = /^(section-.*|shipping|billing|home|work|mobile|fax|pager)$/
export function campoAutocomplete(raw: string): string | null {
  const toks = (raw || '').toLowerCase().trim().split(/\s+/).filter(Boolean)
  const rest = toks.filter((t) => !AC_PREFIX.test(t) && t !== 'webauthn')
  return rest.length === 1 ? rest[0] : null
}
```

Mapping from autocomplete token to kind:

| Token(s)                                | kind                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `name`                                  | nomeCompleto                                                                                |
| `given-name`                            | primeiroNome                                                                                |
| `family-name`                           | sobrenome                                                                                   |
| `username`, `nickname`                  | usuario                                                                                     |
| `email`                                 | email                                                                                       |
| `new-password`, `current-password`      | senha                                                                                       |
| `one-time-code`                         | ignorar                                                                                     |
| `organization`                          | razaoSocial                                                                                 |
| `street-address`                        | enderecoCompleto                                                                            |
| `address-line1`                         | logradouro                                                                                  |
| `address-line2`                         | complemento                                                                                 |
| `address-level1`                        | uf                                                                                          |
| `address-level2`                        | cidade                                                                                      |
| `address-level3`                        | bairro **[A: BR convention, not stated in the spec]**                                       |
| `country`, `country-name`               | pais                                                                                        |
| `postal-code`                           | cep                                                                                         |
| `cc-name`                               | cartaoNome                                                                                  |
| `cc-number`                             | cartaoNumero                                                                                |
| `cc-exp`                                | cartaoValidade                                                                              |
| `cc-exp-month`                          | cartaoValidadeMes                                                                           |
| `cc-exp-year`                           | cartaoValidadeAno                                                                           |
| `cc-csc`                                | cartaoCvv                                                                                   |
| `bday`                                  | nascimento                                                                                  |
| `bday-day` / `bday-month` / `bday-year` | nascimentoDia / Mes / Ano                                                                   |
| `sex`                                   | sexo                                                                                        |
| `tel`, `tel-national`, `tel-local`      | celular (`tel-local` should also carry the `semDdd` hint; the prototype doesn't set it yet) |
| `tel-area-code`                         | ddd                                                                                         |

Two pitfalls:

- **`autocomplete="off"` carries no meaning** and is ignored.
- **`autocomplete="new-password"` on a non-password field is a known trick for suppressing Chrome autofill.** MDN documents `new-password` as the way to prevent password autofill **[V: MDN]**. Its misuse on other fields is **[A]**. The parser ignores `*-password` unless `type=password` (test 05).

The autocomplete result is accepted only if it is compatible with the element (see the compatibility rules in §5).

### 3.2 Text sources and their weights

Each text is normalized before matching: camelCase is split, accents are stripped, letter-digit boundaries are split, punctuation becomes spaces, and everything is lowercased. Examples **[V: tests]**:

- `txtRazaoSocial` → `txt razao social`
- `customer[address][line1]` → `customer address line 1`
- `E-mail*:` → `e mail`
- `Nº` → `n`

| Source                                                                                                      | Weight |
| ----------------------------------------------------------------------------------------------------------- | ------ |
| label (`el.labels` covers `for=` and wrapping labels **[V: lab]**, plus `aria-labelledby` resolved by hand) | 1.0    |
| aria-label                                                                                                  | 1.0    |
| name                                                                                                        | 0.95   |
| id                                                                                                          | 0.9    |
| placeholder text                                                                                            | 0.8    |

**Placeholder as a format (shape) rule:** every character in `[0-9_#xX9]` is mapped to `0`, then the shape is compared. So these all become `000.000.000-00`: `___.___.___-__`, `999.999.999-99`, `000.000.000-00`, `123.456.789-00`.

| Shape                     | kind           | Score |
| ------------------------- | -------------- | ----- |
| `000.000.000-00`          | cpf            | 0.92  |
| `00.000.000/0000-00`      | cnpj           | 0.92  |
| `00000-000`               | cep            | 0.92  |
| `(00) 00000-0000`         | celular        | 0.9   |
| `0000 0000 0000 0000`     | cartaoNumero   | 0.9   |
| `000.00000.00-0`          | pis            | 0.9   |
| `MM/AA`, `MM/AAAA`        | cartaoValidade | 0.9   |
| `dd/mm/aaaa`              | nascimento     | 0.6   |
| an example e-mail address | email          | 0.97  |

### 3.3 `type` as a weak prior, used only when no text rule matched

| type     | Prior               |
| -------- | ------------------- |
| email    | email 0.9           |
| password | senha 0.85          |
| tel      | celular 0.55        |
| month    | cartaoValidade 0.55 |
| date     | nascimento 0.55     |

The date prior is skipped when the label or name matches `entrega|agend|inicio|fim|evento|reserva|check|ida|volta|admiss|validade|vencimento|emissao|expedi|pagamento|consulta` (tests 50, 55).

**`type=tel` is NOT treated as a strong phone signal in Brazil.** It is widely used for CPF, CEP and card fields just to get the numeric keypad (tests 29, 30) **[A: common practice]**. `inputmode` is used only for formatting, never for the kind.

### 3.4 Tie-breakers

These are applied in the form pass:

- `maxLength`: ≥16 means card number; ≤6 means address number; 18 means CNPJ in a "documento" field.
- `options`: years in the future mean card expiry year; years 18 or more back mean birth year; 31 day values or month names give the date part.
- `section`: the closest `fieldset > legend`, for example "Cartão de crédito" or "Dados da empresa".
- **neighbors**: the classified fields within ±2 positions in DOM order.

### 3.5 Where the rules came from

The rules were cross-checked against Chromium's own heuristics **[V: `legacy_regex_patterns.json`]**. Chromium uses a 0.9 to 1.4 score scale, and its `pt` patterns include:

| Chromium category        | pt pattern                                                                 |
| ------------------------ | -------------------------------------------------------------------------- |
| ZIP_CODE                 | `codigo\|codpos\|\bcep\b`                                                  |
| ADDRESS_HOME_STREET_NAME | `rua\|avenida\|endere[çc]o\|logradouro` (negative `(do \|de )endere[çc]o`) |
| ADDRESS_LINE_2           | `complemento`                                                              |
| DEPENDENT_LOCALITY       | `bairro`                                                                   |
| CITY                     | `cidade`                                                                   |
| STATE                    | `estado\|provincia`                                                        |
| HOUSE_NUMBER             | `^\*?.?número(.?\*?$\| da residência)`                                     |
| PHONE                    | `telefone\|telemovel`                                                      |
| PHONE_PREFIX             | `ddd`                                                                      |
| PHONE_EXTENSION          | `ramal`                                                                    |
| FIRST_NAME               | `nome`                                                                     |
| LAST_NAME                | `sobrenome`                                                                |
| NAME_ON_CARD             | `nome do titular\|nome impresso no cartão\|titular do cartão`              |
| CREDIT_CARD_EXP_DATE     | `validade`                                                                 |
| CREDIT_CARD_NUMBER       | `(numero\|número\|numéro)` (negative `…(document\|fono\|phone)`)           |
| CVC (`br`)               | `código de segurança`                                                      |
| LANDMARK                 | `ref[êe]r[êe]ncia`                                                         |

Two things to note from that list:

- Chromium itself treats a bare "número" as a card number, gated only by section. That is the same ambiguity I resolve by form context.
- `estado` without a `civil` negative is a trap, covered in §5.

---

## 4. Rule table, as implemented and tested

Matching runs on the normalized text. `score × source weight` gives the per-source score. The best source wins, plus **0.03 for each additional source that agrees**, capped at 0.99. A match on `not` vetoes the rule. The `*Confirmacao` rules apply only when `CONFIRM` matches that same source text.

```ts
const CONFIRM =
  /\b(confirm\w*|conf|repet\w*|redigit\w*|novamente|again|verif\w*|re ?type|re ?enter|repeat)\b/
export const RULES: Rule[] = [
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
    kind: 'cidade',
    re: /\bcidade\b|\bmunicipio\b|\bcity\b|\btown\b|\blocalidade\b/,
    not: /\bnatal\b|naturalidade/,
    score: 0.93,
  },
  {
    kind: 'uf',
    re: /\buf\b|\bestado\b|\bstate\b|\bprovince\b|\bregion\b/,
    not: /\bcivil\b|emissor|\brg\b|status|inscricao/,
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
```

---

## 5. Scoring algorithm

The full code is in `proto/campos.ts`.

**Per field (`pontuar(d)`):**

1. Return `[]` if the input type is one that is never filled (§2.2). `type=search` gives `ignorar` with score 1.
2. If `campoAutocomplete` maps to a kind and that kind is compatible with the element, return it with score 1.0 and `via:'autocomplete'`. Password tokens are accepted only on `type=password`.
3. For each source in [label, ariaLabel, name, id, placeholder]:
   - compute `confirm = CONFIRM.test(text)`;
   - for each rule, if it matches and is not vetoed, record `rule.score × weight` for that kind. Confirmation kinds require `confirm`; plain email and senha require `!confirm`.
4. Add the placeholder shape rule, if one matches.
5. If nothing matched, apply the type prior (§3.3).
6. Add the agreement bonus: `+0.03 × (number of matching sources − 1)`, capped at 0.99.
7. Sort by score descending. Break ties with a fixed **precedence list** that puts more specific kinds first (`cnpj > cpf > rg > … > _ano`). The result is deterministic.

**Element compatibility (a hard filter):**

| Element                    | Allowed kinds                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `select`                   | uf, cidade, pais, sexo, the date and expiry parts, ddd, bairro                                                         |
| `textarea`                 | enderecoCompleto, logradouro, complemento                                                                              |
| `type=number` / `type=tel` | numeric kinds only                                                                                                     |
| `type=password`            | senha, senhaConfirmacao, cartaoCvv, cartaoNumero (Chromium also allows INPUT_PASSWORD for card number and CVC **[V]**) |
| `type=email`               | email, emailConfirmacao, usuario                                                                                       |
| `type=date`                | nascimento                                                                                                             |
| `type=month`               | cartaoValidade                                                                                                         |

**Form pass (`classificarFormulario(ds, anoAtual = 2026)`):** fields are processed in DOM order. Generic kinds resolve as follows.

| Generic                                    | Resolution                                                                                                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_nome`                                    | card section or card neighbor (and no cpf/nascimento right next to it) → `cartaoNome`; company section → `razaoSocial`; the form has a sobrenome field → `primeiroNome`; otherwise → `nomeCompleto` |
| `_numero`                                  | maxLength ≥16 or card context → `cartaoNumero`; address neighbor, or an address-only form, or maxLength ≤6 → `numeroEndereco`; otherwise **null** (shown as não reconhecido, not guessed)           |
| `_documento`                               | maxLength ≥18, or company fields present and no cpf field → `cnpj`; otherwise `cpf`                                                                                                                 |
| `_dia/_mes/_ano`                           | year options going 18+ years back → nascimentoAno; card section or future years or card neighbor → cartaoValidadeMes/Ano; birth context → nascimento parts; otherwise null                          |
| 2nd `email`                                | `emailConfirmacao`                                                                                                                                                                                  |
| 2nd `senha`                                | `senhaConfirmacao`                                                                                                                                                                                  |
| `nascimento` on a select (or maxLength ≤4) | the date part, decided by name/id tokens, then by options (≥10 years → Ano; month names or 12 values → Mes; 31 values → Dia)                                                                        |

Hints added in the form pass:

- `celular` directly after `ddd` gets `dicas.semDdd = true`.
- `logradouro` in a form with no número field gets `dicas.incluirNumero = true`.

**Threshold:** `LIMIAR = 0.5`. Below it, the field is `null` and shows in the "Não reconhecidos" list.

Confidence bands seen in practice:

- autocomplete: 1.0
- strong label match: 0.93 to 0.99
- resolved by context: 0.75 to 0.85
- type prior only: 0.55

---

## 6. Ambiguities and pitfalls

### 6.1 Ambiguous labels and lookalike fields

| Pitfall                                 | Decision                                                                                       | Test             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------- |
| "Número" alone                          | Resolved by context; null if there is none                                                     | 35, F2, F3, F14  |
| "Nome" (person, company or card name)   | Section, then neighbor, then sobrenome rules                                                   | 16, F1, F10, F13 |
| "Documento" / "CPF/CNPJ"                | CPF by default; CNPJ when maxLength ≥18 or the form is company-only                            | 11, 71, F11      |
| Confirmation fields                     | `CONFIRM` regex on the same source; otherwise the 2nd occurrence                               | 21, 22, F4, F5   |
| "Endereço de e-mail"                    | `logradouro` is vetoed by `e ?mail`                                                            | 20               |
| **"Estado civil"**                      | `uf` is vetoed by `civil`                                                                      | 41               |
| "Nome da mãe" / "Nome social"           | Vetoed. The person has no such data, so they stay não reconhecido                              | 17, 18           |
| RG órgão emissor / expedição / UF do RG | Vetoed on `rg`; the date prior is vetoed by `expedi`                                           | 54, 55           |
| "Melhor dia de vencimento"              | Vetoed on card validity and `_dia`                                                             | 52               |
| "Data de entrega" (`type=date`)         | No birth-date prior                                                                            | 50               |
| "Título" (job title, Sr./Sra.)          | Not título de eleitor                                                                          | 58               |
| "Data de validade do documento"         | Not card validity                                                                              | 78               |
| "E-mail ou CPF" (login)                 | Currently classified as `cpf` (0.97 vs 0.95). Both are valid for that person's login           | dump             |
| "Senha atual"                           | → `senha`. The person persists, so the login and change-password flows reuse the same password | 24               |

### 6.2 Hidden fields and honeypots

Measured with `checkVisibility` in Chromium 147 **[V: lab]**:

| Case                                 | `checkVisibility()` | with `{opacityProperty, visibilityProperty, contentVisibilityAuto}` | Rect    | Caught by                             |
| ------------------------------------ | ------------------- | ------------------------------------------------------------------- | ------- | ------------------------------------- |
| `display:none`                       | false               | false                                                               | 0×0     | checkVisibility                       |
| ancestor `display:none`              | false               | false                                                               | 0×0     | checkVisibility                       |
| `visibility:hidden`                  | true                | **false**                                                           | 153×21  | checkVisibility (options)             |
| `opacity:0`                          | true                | **false**                                                           | 153×21  | checkVisibility (options)             |
| ancestor `content-visibility:hidden` | false               | false                                                               | —       | checkVisibility                       |
| `left:-9999px`                       | true                | true                                                                | x=-9999 | **off-document rule**                 |
| `0×0`                                | true                | true                                                                | 0×0     | **size rule**                         |
| `.sr-only` (1×1, clipped)            | true                | true                                                                | 1×1     | **size rule**                         |
| `aria-hidden` + `tabindex=-1`        | true                | true                                                                | 153×21  | **`closest('[aria-hidden="true"]')`** |

The rule set:

```ts
function visivel(el: El): boolean {
  if (
    !el.checkVisibility({
      opacityProperty: true,
      visibilityProperty: true,
      contentVisibilityAuto: true,
    })
  )
    return false
  if (el.closest('[aria-hidden="true"]')) return false
  if (el instanceof HTMLSelectElement) return true // select2 & co. hide the native select 1x1; it still drives the widget via 'change'
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return false
  if (r.right + window.scrollX <= 0 || r.bottom + window.scrollY <= 0)
    return false
  return true
}
```

- A real Mailchimp embed uses `<div aria-hidden="true" style="position: absolute; left: -5000px;"><input name="b_610770d4…" tabindex="-1">` **[V: live embed]**. The lab version of it was skipped.
- Selects are exempt from the size and off-screen rules on purpose. select2's docs say it "will listen for the change event on the `<select>` element" **[V: select2.org]**, so filling the visually hidden native select still updates the widget.
- react-select and other custom comboboxes have no native select. They are out of scope and show as não reconhecido **[A]**.

### 6.3 Value constraints

| Behavior                                                                                                                         | Evidence                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A programmatic `value=` ignores `maxlength`: 14 characters went into `maxlength=11`, `tooLong=false`, `checkValidity()` was true | **[V: lab]**. The spec says tooLong applies only when the value was "last changed by a user edit (as opposed to a change made by a script)" **[V: WHATWG]** |
| `execCommand('insertText')` respects maxlength by truncating silently (`529.982.247`)                                            | **[V: lab]**                                                                                                                                                |
| `pattern` is compiled with the `v` flag and anchored as `^(?:…)$`                                                                | **[V: WHATWG input.html]**. The prototype tests candidates with `v`, falling back to `u`                                                                    |
| `type=number`: `'01310-100'` becomes `''`; `'01310100'` is kept as a string, but `valueAsNumber` = 1310100                       | **[V: lab]**. Use digits for number fields                                                                                                                  |
| `type=date` needs `yyyy-mm-dd`; `'14/03/1991'` becomes `''`                                                                      | **[V: lab]**                                                                                                                                                |
| `type=month` takes `2029-08`                                                                                                     | **[V: lab]**                                                                                                                                                |
| `select.value='SP'` when the option value is `'sp'` gives `''` (case-sensitive)                                                  | **[V: lab]**. Match against options and write the option's exact value                                                                                      |

### 6.4 Other pitfalls

- **Password longer than the field's maxLength:** don't truncate. Truncating would make the stored password differ from what was typed, and the later login would fail. Report the field as `rejeitado` instead **[A: decision]**.
- **A wrapping label contains the select's option text:** for `<label>Estado <select>…</select></label>`, the label's `textContent` includes every option. Clone the label and strip `input,select,textarea,button,option` before reading the text. This is implemented and the lab's wrapped "Sexo" and "Estado" labels classified correctly **[V: lab]**.
- **CEP lookups (ViaCEP and similar):** many Brazilian forms fill rua, bairro, cidade and UF asynchronously after the CEP's `input` or `blur` event. Because the generator's CEP is real and coherent, that async overwrite writes the same values.
  - Build the generator's address table from ViaCEP responses so the strings match exactly **[A]**.
  - Some forms keep the address fields `disabled` until the lookup finishes. Recommendation: run a **second pass about 800 ms later**, only on fields that were disabled or readonly in pass 1 and are now enabled and empty **[A: common pattern, untested]**.
- **Datepicker libraries that make the input readonly:** the field is skipped. Report it as não preenchido with the reason "somente leitura" **[A]**.

---

## 7. Filling in a framework-safe way

### 7.1 Lab matrix

Each cell is the framework state after filling, with formatted values unless noted. ✓ means the framework's state equals the written value. ✗ means the state stayed empty.

| Strategy                                 | React 19 ctrl              | RHF | react-imask | @react-input/mask | react-number-format | Vue v-model | maska | imask | jQuery Mask            | React 18 + react-input-mask |
| ---------------------------------------- | -------------------------- | --- | ----------- | ----------------- | ------------------- | ----------- | ----- | ----- | ---------------------- | --------------------------- |
| value only, no events (ISOLATED)         | ✗                          | ✗   | ✗           | ✗                 | ✗                   | ✗           | ✗     | ✗     | ✗                      | n/t                         |
| `el.value=v` + input + change (ISOLATED) | ✓                          | ✓   | ✓           | ✓                 | ✓                   | ✓           | ✓     | ✓     | ✓                      | ✓                           |
| same, digits only (ISOLATED)             | —                          | —   | ✓           | ✓                 | ✓                   | —           | ✓     | ✓     | ✓                      | ✓                           |
| native setter + events (ISOLATED)        | ✓                          | ✓   | ✓           | ✓                 | ✓                   | ✓           | ✓     | ✓     | ✓                      | n/t                         |
| `el.value=v` + events (**MAIN**)         | **✗** (DOM reverted to '') | ✓   | ✓           | **✗**             | **✗**               | ✓           | ✓     | ✓     | ✓                      | n/t                         |
| native setter + events (MAIN)            | ✓                          | ✓   | ✓           | ✓                 | ✓                   | ✓           | ✓     | ✓     | ✓                      | n/t                         |
| `execCommand` whole value                | ✓                          | ✓   | ✓           | ✓                 | ✓                   | ✓           | ✓     | ✓     | ✓                      | ✓                           |
| `execCommand` char by char               | ✓                          | ✓   | ✓           | **✗ ('5')**       | ✓                   | ✓           | ✓     | ✓     | **✗ digits scrambled** | n/t                         |

("n/t" = not tested.) The React 19 select and `type=date` were also correct in the ISOLATED rows.

**Why MAIN differs from ISOLATED [V: React source + lab].** React's `inputValueTracking.js` puts an own `value` property on each input node, whose setter records `currentValue`. `updateValueIfChanged` fires onChange only when `node.value !== tracker.getValue()`.

- In the MAIN world, `el.value = v` goes through React's instance setter, so the tracker already "knows" the new value and onChange is swallowed.
- In the ISOLATED world, the content script sees its own JS wrapper of the node, without React's own property, so the assignment reaches the native setter directly. React's tracker still holds the old value, and the `input` event, which crosses worlds because the DOM is shared, triggers onChange.

**What other tools do [V: source]:**

- **Bitwarden** (isolated content script): `element.value = value` surrounded by click, focus, keydown/keyup, then `input` and `change` (`new Event(…, {bubbles:true})`). It skips the write when the field already has the value.
- **Fake Filler** (last pushed 2024-05): `element.value = …`, then `input`, `click`, `change`, `blur`.
- **Playwright `fill()`** "focuses the element, fills it and triggers an `input` event". Its docs point to `pressSequentially` only for "fine-grained keyboard events".
- **Brazilian generator extensions** (4devs-style "Gerador de Dados", "Form Filler BR", "Inventor"): **[A]**. I found no public source, so I can't say how they handle masks.

**Angular [V: source]:** `DefaultValueAccessor` host bindings are `(input)` → `_handleInput`, `(blur)` → `onTouched`. `SelectControlValueAccessor` listens to `(change)`. ngx-mask listens to `paste`, `focus`, `input`, `compositionstart/end`, `blur`, `click` and `keydown`. So `input + change + blur` covers Angular too. Angular was not run in the lab.

### 7.2 Recommended write function

```ts
function escrever(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  v: string,
) {
  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
  el.focus({ preventScroll: true }) // no page jumping across 20 fields
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v) // world-agnostic
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true })) // composed: crosses shadow roots [V]
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  el.blur() // on-blur validators, Angular touched, jQuery Validate focusout
}
```

The surrounding rules:

- Skip the write when `el.value === v`. This avoids re-triggering CEP lookups.
- **Read back and verify** after writing: `ok = el.value === v || digits(el.value) === digits(v)`. Masks may reformat digits into the formatted string. A mismatch goes to `rejeitados`. One possible extension is a single retry with digits only **[A]**.
- **Masks:** write the formatted value when it fits maxLength and pattern, otherwise digits. All 7 mask libraries tested accept both.
- **Selects:** use `escolherOpcao`, in this order:
  1. exact normalized match on value or text, over all candidates;
  2. numeric equality (`'03'` matches `'3'`);
  3. whole-token match in the text (`'SP - São Paulo'`).

  Placeholder options are skipped (`value=''`, "Selecione", "--"). UF candidates are `[uf, UF_NOME[uf]]` (27-entry table in `formatar.ts`). País candidates are `BR, BRA, 076, Brasil, Brazil`. Month candidates are the number, the full pt-BR name and its 3-letter abbreviation.

- **Format by constraint** with `caber(candidates, d)`: the first candidate that fits both maxLength and pattern; for `type=number`, only digit candidates; if nothing fits, the shortest.

| kind              | Candidates, in order                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| cpf               | `529.982.247-25`, `52998224725`                                                                               |
| cnpj              | formatted, then 14 digits                                                                                     |
| cep               | `01310-100`, `01310100`                                                                                       |
| celular           | `(11) 98734-2156`, `(11)98734-2156`, `11 98734-2156`, `11987342156`. With `semDdd`: `98734-2156`, `987342156` |
| nascimento        | date → `1991-03-14`; text → `14/03/1991`, `14031991`                                                          |
| cartaoValidade    | `08/29`, `0829`, `08/2029`. Placeholder `MM/AAAA` → `08/2029`. month → `2029-08`                              |
| cartaoNumero      | spaced, then 16 digits                                                                                        |
| rg / pis / título | formatted, then digits                                                                                        |

---

## 8. iframes and shadow DOM

**What was verified [V: lab with a narrow-permission extension, plus docs]:**

- activeTab: "temporarily gets host permissions for the tab's main frame origin". It is triggered by an action click, a context-menu item or a commands shortcut, and is revoked on navigation **[V: Chrome docs]**. The docs don't mention iframes.
- With host permission only for the top origin:
  - `executeScript({target:{tabId, allFrames:true}})` returned results for frame 0 and the **same-origin** iframe and **silently omitted** the cross-origin iframe;
  - `frameIds:[…, crossOriginFrame]` **threw** `Cannot access contents of url "http://127.0.0.1:3102/frame.html". Extension manifest must request permission to access this host.`
- With `<all_urls>`, both frames were filled.
- Frame IDs are not stable across loads (24/25 in one run, 2 in another). Always take them from `InjectionResult.frameId` or `OnClickData.frameId`.

**Recommendations:**

- **Mode A:** inject with `allFrames:true`. In the top frame, count `iframe`s whose origin differs from `location.origin` and that are absent from the results. That count feeds the 1d message ("Formulários dentro de iframe de outro domínio também ficam de fora"). Treat about:blank and srcdoc frames as same-origin **[A]**.
- **v2 option:** `optional_host_permissions` plus `chrome.permissions.request({origins:[thatOrigin]})` from the popup (it needs a user gesture) to unlock one payment iframe on demand **[A: design idea; API not exercised here]**.
- **Hosted card iframes** (Stripe Elements, Pagar.me and similar) are cross-origin by design, so expect them to stay unfilled under activeTab **[A]**.

**Shadow DOM [V: lab]:**

- `host.shadowRoot` works for open roots from the isolated world.
- A closed root gives `null` there, but `chrome.dom.openOrClosedShadowRoot(host)` returned the closed root and found the input inside it (Chrome 88+ per the docs).
- `el.labels` works inside an open root.
- Traverse with a TreeWalker and recurse into roots:

```ts
function* campos(root: Document | ShadowRoot): Generator<El> {
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  for (
    let n = tw.nextNode() as Element | null;
    n;
    n = tw.nextNode() as Element | null
  ) {
    if (
      n instanceof HTMLInputElement ||
      n instanceof HTMLSelectElement ||
      n instanceof HTMLTextAreaElement
    )
      yield n
    if (n instanceof HTMLElement) {
      const sr = n.shadowRoot ?? chrome.dom?.openOrClosedShadowRoot(n) ?? null
      if (sr) yield* campos(sr)
    }
  }
}
```

- An event dispatched with `composed:false` on an input inside a shadow root **did not reach** a `document` listener. With `composed:true` it did. Native `input` events are composed.
- `aria-labelledby` must be resolved through `el.getRootNode().getElementById`.

**Mode B target [V: lab focus test]:**

- After a right-click (a real CDP `mousedown` with button 2):
  - in the top document, `document.activeElement` was the clicked input;
  - inside an open shadow root, the deep chain was `X-OPEN → sh-open`;
  - in a cross-origin iframe, the top's activeElement was the `<iframe>` and that frame's own activeElement was the input.
- Chrome's `OnClickData` has `frameId`, `frameUrl`, `editable`, `pageUrl`, `selectionText` and no element id **[V: Chrome docs]**. `menus.getTargetElement` and `targetElementId` exist in Firefox **[V: MDN]**.
- So in the `onClicked` handler: `executeScript({target:{tabId, frameIds:[info.frameId]}})`, walk `activeElement` through `shadowRoot.activeElement`, build its descriptor, and write `valorPara(kind, …)`.
- Not covered by this test **[A]**:
  - The native menu doesn't render in headless mode, so the full click → `onClicked` → inject chain was not run.
  - For contenteditable targets (the `editable` context includes them), use `execCommand('insertText')`.
  - With activeTab only, a cross-origin frame throws (see above). Catch it and show "não deu para inserir aqui".

---

## 9. "Mostrar na página" (the crosshair in 1c)

- **Registry:** keep it in the isolated world: `globalThis.__pvReg = { refs: Map<number, WeakRef<El>>, seq }`.
  - **[V: lab]** isolated-world globals survive between `executeScript` calls on the same document, are invisible to MAIN, and are cleared on reload.
  - The popup keeps `{frameId, idx}` per row and calls `executeScript({target:{tabId, frameIds:[frameId]}, func: (i) => __pv.mostrar(i), args:[idx]})`. No DOM attributes are written to the page.
- **Display selector:**
  - `tag#id` when the id is unique in its root (`CSS.escape`);
  - otherwise `tag[name="…"]` when unique;
  - otherwise `tag:nth-of-type(n)`;
  - prefixed with `host-tag › ` when inside a shadow root.

  In the lab this produced exactly the design's strings: `input[name="ref_code"]` and `select#origem` **[V: lab]**.

- **Show:**
  - `el.scrollIntoView({block:'center', behavior:'smooth'})`. Called inside a same-origin or cross-origin iframe, it **also scrolled the top document** (top `scrollY` 0 → 1250) **[V: lab]**.
  - Then `el.style.setProperty('outline', '2px dashed #f5b82e', 'important')`, saving and restoring the previous value and priority. The lab confirmed the outline was applied **[V]**.
  - Use the same mechanism for the 1f outlines (cyan solid / amber dashed). Remove them when the toast ends, or on the first `pointerdown`/`focusin` inside a field.

---

## 10. Fill report shape for the popup and toast

```ts
{ total: number,                      // Y = recognized + unrecognized, excluding ignorar/hidden/checkbox/…
  preenchidos: {idx, rotulo, seletor, kind, via, conf, escrito, lido}[],     // X
  naoReconhecidos: {idx, rotulo, seletor, motivo?: 'semOpcao'}[],             // amber list (1c)
  rejeitados: {idx, rotulo, seletor, kind, escrito, lido}[] }                 // wrote but value didn't stick
```

The end-to-end lab run (`lab5.mjs`, `site/cadastro.html` with imask on CPF and CEP) returned: total 23, preenchidos 21, rejeitados 0, naoReconhecidos `[ref_code, select#origem]`. The submitted `FormData` matched the person exactly, including `estado=25` (option text "São Paulo"), `sexo=F`, `mes=08`, `ano=2029`, and an empty honeypot.

---

## 11. Test cases

These are all run in `proto/campos.test.ts`. The descriptor defaults are `tag:'input', type:'text'`, all strings empty and `maxLength:null`.

**Single field (`classificarCampo`):**

| #   | Descriptor                                                    | Expected         |
| --- | ------------------------------------------------------------- | ---------------- |
| 01  | ac `given-name`, name `fn`                                    | primeiroNome     |
| 02  | ac `shipping postal-code`                                     | cep              |
| 03  | ac `section-blue billing address-level2`                      | cidade           |
| 04  | ac `off`, name `cpf`                                          | cpf              |
| 05  | ac `new-password`, name/label Cidade (anti-autofill trick)    | cidade           |
| 06  | password, ac `cc-csc`                                         | cartaoCvv        |
| 07  | date, ac `bday`                                               | nascimento       |
| 08  | tel, ac `tel-national`                                        | celular          |
| 09  | ac `one-time-code`                                            | ignorar          |
| 10  | name `cpf`, maxLength 14                                      | cpf              |
| 11  | label "CPF/CNPJ"                                              | cpf              |
| 12  | label "CNPJ da empresa"                                       | cnpj             |
| 13  | id `txtRazaoSocial`                                           | razaoSocial      |
| 14  | name `nome_fantasia`                                          | nomeFantasia     |
| 15  | label "Nome completo \*"                                      | nomeCompleto     |
| 16  | label "Nome"                                                  | nomeCompleto     |
| 17  | label "Nome da mãe"                                           | null             |
| 18  | label "Nome social"                                           | null             |
| 19  | label "Nome de usuário"                                       | usuario          |
| 20  | label "Endereço de e-mail"                                    | email            |
| 21  | label "Confirme seu e-mail"                                   | emailConfirmacao |
| 22  | password, name `password_confirmation`                        | senhaConfirmacao |
| 23  | bare password                                                 | senha            |
| 24  | password, label "Senha atual"                                 | senha            |
| 25  | bare email type                                               | email            |
| 26  | tel, label "Celular (com DDD)"                                | celular          |
| 27  | label "DDD", maxLength 2                                      | ddd              |
| 28  | name `telefone`, placeholder `(00) 00000-0000`                | celular          |
| 29  | tel, name `documento`, label "CPF"                            | cpf              |
| 30  | tel, label "CEP", inputmode numeric                           | cep              |
| 31  | placeholder `00000-000` only                                  | cep              |
| 32  | placeholder `___.___.___-__` only                             | cpf              |
| 33  | label "Rua"                                                   | logradouro       |
| 34  | label "Endereço"                                              | logradouro       |
| 35  | label "Número", maxLength 10, alone                           | null             |
| 36  | label "Nº", maxLength 6                                       | numeroEndereco   |
| 37  | label "Complemento"                                           | complemento      |
| 38  | label "Bairro"                                                | bairro           |
| 39  | label "Cidade"                                                | cidade           |
| 40  | select "Estado" with UF options                               | uf               |
| 41  | select "Estado civil"                                         | null             |
| 42  | label "UF", maxLength 2                                       | uf               |
| 43  | select "País"                                                 | pais             |
| 44  | label "Número do cartão"                                      | cartaoNumero     |
| 45  | label "Nome impresso no cartão"                               | cartaoNome       |
| 46  | label "Validade (MM/AA)"                                      | cartaoValidade   |
| 47  | label "CVV", maxLength 4                                      | cartaoCvv        |
| 48  | label "Código de segurança"                                   | cartaoCvv        |
| 49  | label "Data de nascimento", maxLength 10                      | nascimento       |
| 50  | date, label "Data de entrega"                                 | null             |
| 51  | date, label "Data"                                            | nascimento       |
| 52  | select "Melhor dia de vencimento" with 1..31                  | null             |
| 53  | label "RG"                                                    | rg               |
| 54  | label "Órgão emissor do RG"                                   | null             |
| 55  | date, label "Data de expedição do RG"                         | null             |
| 56  | label "PIS/PASEP"                                             | pis              |
| 57  | label "Título de eleitor"                                     | tituloEleitor    |
| 58  | label "Título"                                                | null             |
| 59  | search, label "Buscar"                                        | ignorar          |
| 60  | textarea, name `g-recaptcha-response`                         | ignorar          |
| 61  | name `ref_code`, label "Código de indicação"                  | null             |
| 62  | select#origem, label "Como nos conheceu?"                     | null             |
| 63  | select "Sexo" with F/M                                        | sexo             |
| 64  | select "Gênero"                                               | sexo             |
| 65  | number, label "CEP"                                           | cep              |
| 66  | number, label "Nome"                                          | null             |
| 67  | label "Telefone fixo"                                         | celular          |
| 68  | name `customer[address][street_number]`                       | numeroEndereco   |
| 69  | name `billingAddressLine2`                                    | complemento      |
| 70  | name `phone_number`                                           | celular          |
| 71  | label "Número do documento"                                   | cpf              |
| 72  | label "Login"                                                 | usuario          |
| 73  | label "Seu melhor contato", placeholder `nome@exemplo.com.br` | email            |
| 74  | id `mat-input-3`, label "CPF"                                 | cpf              |
| 75  | name `field_7`                                                | null             |
| 76  | aria-label "Bairro"                                           | bairro           |
| 77  | label "Cidade / UF"                                           | cidade           |
| 78  | label "Data de validade do documento"                         | null             |
| 79  | label "Inscrição estadual"                                    | null             |
| 80  | email, label "E-mail corporativo"                             | email            |

**Form level (`classificarFormulario`):**

| #   | Fields                                                                                       | Expected                                                      |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| F1  | Nome, Sobrenome                                                                              | primeiroNome, sobrenome                                       |
| F2  | CEP, Rua, Número, Complemento                                                                | cep, logradouro, numeroEndereco, complemento                  |
| F3  | Número(maxLength 19, section Pagamento), Nome(Pagamento), Validade, CVV                      | cartaoNumero, cartaoNome, cartaoValidade, cartaoCvv           |
| F4  | E-mail, E-mail                                                                               | email, emailConfirmacao                                       |
| F5  | password, password                                                                           | senha, senhaConfirmacao                                       |
| F6  | select dia (labelled "Data de nascimento"), select mes (month names), select ano (2026→1926) | nascimentoDia, nascimentoMes, nascimentoAno                   |
| F7  | Número do cartão, select mes(1..12, section Cartão), select ano(2026..2036), CVV             | cartaoNumero, cartaoValidadeMes, cartaoValidadeAno, cartaoCvv |
| F8  | select exp_month, select exp_year                                                            | cartaoValidadeMes, cartaoValidadeAno                          |
| F9  | DDD(2), Telefone(10)                                                                         | ddd, celular with `{semDdd:true}`                             |
| F10 | Nome and CNPJ in section "Dados da empresa"                                                  | razaoSocial, cnpj                                             |
| F11 | Razão social, "CPF ou CNPJ"(18)                                                              | razaoSocial, cnpj                                             |
| F12 | CEP, Endereço, Cidade                                                                        | logradouro gets `{incluirNumero:true}`                        |
| F13 | Número do cartão, CPF do titular, Nome                                                       | cartaoNumero, cpf, nomeCompleto                               |
| F14 | E-mail, Número(12)                                                                           | email, null                                                   |

**Formatting and select tests** (9 tests): see `caber` and `escolherOpcao` in §7.2.

---

## 12. Where this lands in the repo, and how to test it

- **`packages/tools/src/campos.ts`** (classifier) and **`campos-formatar.ts`** (`valorPara`, `caber`, `escolherOpcao`, `UF_NOME`): pure TypeScript, exported as subpaths `@piluvitu/tools/campos` etc., following the package's pattern.
  - To port the tests to Jest: swap `node:test` for `test`/`expect`, and drop the `.ts` import extensions, because the package's ts-jest uses `moduleResolution: node`.
- **`apps/extensao`:** the DOM layer (`content.ts`: traversal, `visivel`, `descrever`, `seletor`, `escrever`, registry, `mostrar`).
  - jsdom can't test it. jsdom has no layout, so `getBoundingClientRect` returns zeros and `checkVisibility` semantics are missing **[A for jsdom specifics]**.
  - Use **Playwright with the built extension**. This setup is proven here: `chromium.launchPersistentContext(dir, { channel: 'chromium', headless: true, args: ['--disable-extensions-except=…', '--load-extension=…'] })`, plus `ctx.serviceWorkers()[0].evaluate(...)` to drive `chrome.scripting`.
  - Reuse `lab/site/cadastro.html`, `index.html` and `page2.html` as `.e2e.ts` fixtures.
- **The data model** (owned by another researcher) needs:
  - `primeiroNome` and `sobrenome` as separate fields;
  - `sexo`, if that kind is kept;
  - the address table built from ViaCEP responses;
  - ideally a password length of 12 or less, to fit common maxLength limits **[A]**.

---

## 13. Verified vs assumed

**Verified (with source):**

- WHATWG autofill tokens and grammar
- tooLong applies only to user edits
- `pattern` uses the `v` flag
- Chromium pt-BR regexes
- React value-tracker mechanism
- Bitwarden, Fake Filler and Angular/ngx-mask event handling (source code)
- Chrome activeTab scope and triggers
- scripting fields (`allFrames`, `frameIds`, `world`; `func` must be serializable)
- contextMenus `OnClickData` fields; `ACTION_MENU_TOP_LEVEL_LIMIT` 6; automatic grouping under the extension name
- `chrome.dom.openOrClosedShadowRoot` (Chrome 88+)
- MDN checkVisibility conditions
- select2 listens for `change`
- Mailchimp honeypot markup
- npm versions and downloads

**Verified (by running it here, Chromium 147):**

- the full strategy × library matrix
- MAIN world failing vs ISOLATED world working
- char-by-char breaking two mask libraries
- maxlength, number, date and month behavior; select case-sensitivity
- isolated-world globals persisting and being reset on reload
- `allFrames` skipping vs `frameIds` throwing
- right-click focus (top, shadow, cross-origin frame)
- closed shadow root via chrome.dom
- composed events
- `scrollIntoView` propagating from inside frames
- the visibility matrix
- the end-to-end 21/23 fill in 74 ms
- 103 prototype tests passing; `tsc --strict` clean

**Assumed or not tested:**

- how the 4devs-style Brazilian extensions handle masks (no source found)
- Angular not run in a browser (verified from source only)
- `address-level3` meaning bairro
- `type=tel` used for CPF/CEP keypads being common
- disabled-until-CEP and the 800 ms second pass
- readonly datepickers
- react-select out of scope
- about:blank and srcdoc frames inheriting access
- the full menu-click → inject chain (headless has no native menu)
- contenteditable insertion via execCommand
- `optional_host_permissions` as a v2 path
- jsdom's limits for the DOM layer
- the password-length advice

---

## 14. Test and run output

```
$ node --experimental-strip-types --no-warnings --test --test-reporter=spec proto/campos.test.ts
ℹ tests 103
ℹ pass 103
ℹ fail 0

$ tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --allowImportingTsExtensions --lib es2022,dom,dom.iterable campos.ts formatar.ts content.ts
tsc exit 0      (TypeScript 5.9.3 from the repo's pnpm store)

$ node lab/lab5.mjs   (Chromium 147.0.7727.15, real MV3 extension, ISOLATED world)
ms 74 · total 23 · preenchidos 21 · rejeitados 0
naoReconhecidos: input[name="ref_code"] "Código de indicação", select#origem "Como nos conheceu?"
```

These are research prototypes run in the scratchpad, not repo code, so the repo's Jest/devcontainer gates do not apply yet.

---

## 15. Files

Everything is under `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/research/`:

- Prototype:
  - `proto/campos.ts` (classifier)
  - `proto/formatar.ts` (formatting and option matching)
  - `proto/content.ts` (DOM layer)
  - `proto/campos.test.ts` (103 tests)
  - `proto/dump.ts`
- Lab:
  - `lab/run.mjs` (strategy matrix, probes, frames)
  - `lab/lab2.mjs` (maxlength, number, date, select, world persistence)
  - `lab/lab3.mjs` (React 18 + react-input-mask)
  - `lab/lab4.mjs` (scrollIntoView across frames, composed events)
  - `lab/lab5.mjs` (end-to-end fill)
  - `lab/results.json`
  - `lab/site/{index,cadastro,page2,frame,tall,r18}.html`
  - `lab/ext-wide/`, `lab/ext-narrow/`
- Fetched sources in `src/`:
  - `legacy_regex_patterns.json`
  - `inputValueTracking.js`
  - `bw-insert.ts`
  - `ff-element-filler.ts`
  - `ng-dva.ts`, `ng-select-ctrl.ts`
  - `ngx-mask.directive.ts`
  - `whatwg-forms.html`, `whatwg-fci.html`, `whatwg-input.html`

Web sources:

- [WHATWG autofill](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill)
- [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [Chrome contextMenus](https://developer.chrome.com/docs/extensions/reference/api/contextMenus)
- [Chrome dom](https://developer.chrome.com/docs/extensions/reference/api/dom)
- [MDN checkVisibility](https://developer.mozilla.org/en-US/docs/Web/API/Element/checkVisibility)
- [MDN turning off autocompletion](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Turning_off_form_autocompletion)
- [MDN menus.getTargetElement](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/menus/getTargetElement)
- [select2 programmatic control](https://select2.org/programmatic-control/add-select-clear-items)
- [Playwright locator.fill](https://playwright.dev/docs/api/class-locator#locator-fill)
- [Mailchimp embed sample](https://globalaffairs.org/themes/custom/ccga/frontend/static-html/components/detail/partial-forms-mailchimp.html)
- [Chromium regex patterns](https://raw.githubusercontent.com/chromium/chromium/main/components/autofill/core/browser/form_parsing/resources/legacy_regex_patterns.json)
- [React inputValueTracking](https://github.com/facebook/react/blob/main/packages/react-dom-bindings/src/client/inputValueTracking.js)
- [Bitwarden insert service](https://github.com/bitwarden/clients/blob/main/apps/browser/src/autofill/services/insert-autofill-content.service.ts)
- [Fake Filler](https://github.com/FakeFiller/fake-filler-extension)
- [Brazilian generator extensions found by search (closed source)](https://chromeboard.com/extension/gerador-de-dados-danfhkefkmhccgdacmdgopjpadedfgll)

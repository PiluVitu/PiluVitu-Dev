I verified every generator against an independent validator and built a reference implementation of all of them. It passes 172 Jest tests under the repo's own Jest 30 and ts-jest. It is not in the repo yet. The design sketch has five real bugs: the RG check digit, the address number, the password rules, the card and the título SP/MG rule.

# Research report: pure generators for `packages/tools` (fake Brazilian test person)

**What was built:** the reference code is in `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/research/gen/src/`. It follows the proposed layout, type-checks with the repo's `tsc` in `strict`, and was formatted with the repo's prettier settings (single quotes, no semicolons). Nothing in the repo was changed; its Jest, ts-jest, tsc and prettier binaries were only run against the scratch folder.

**Tags:** **[V]** means checked against a source or by running code. **[A]** means assumed or my own judgement.

---

## 0. Decisions

| Topic             | Recommendation                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Random source     | Add `type Rng = Pick<Prng,'int'>` and a `rngPadrao` that uses `Math.random`. Each generator takes `rng: Rng = rngPadrao` as its first argument, so `gerarCPF()` still works for existing callers. |
| CPF               | Keep the algorithm. Add an optional `uf`: the 9th digit becomes that state's tax region. Reject bases where all 9 digits are equal.                                                               |
| RG                | No national standard exists. Use the SSP-SP model: weights 2..9, check digit = 11 − remainder (10 → X, 11 → 0). Don't generate X by default. The sketch's rule is wrong.                          |
| Título de eleitor | Only generate numbers that are valid both with and without the disputed SP/MG exception. Popular validators disagree on that exception.                                                           |
| Address           | Embed 34 real addresses covering all 27 states, each checked on ViaCEP. Store each address code's number range and odd/even side, and only generate numbers inside it.                            |
| Card              | Use a fixed list of documented sandbox numbers per gateway. Random Luhn numbers inside a BIN fail in almost every sandbox.                                                                        |
| Coherence         | One `gerarPessoa(rng, hojeISO)` builds everything. A golden-person test locks in the output for a given seed.                                                                                     |

---

## 1. Repo conventions [V] (from reading `packages/tools`)

- Pure TypeScript, no DOM. Tests sit next to the source as `*.test.ts`, running on Jest 30, ts-jest 29.4.9 and jsdom.
- Domain functions use Portuguese names: `gerarCPF`, `validarCPF`.
- `package.json` exports each module by subpath (`"./cpf": "./src/cpf.ts"`). Per `packages/tools/CLAUDE.md`, newer modules (`import/csv`, `import/id`) stay out of the `index.ts` barrel on purpose. New modules should be subpath-only too.
- `prng.ts` has the `Prng` interface (`nextUint32`, `float`, `int`, `pick`, `shuffle`), `sfc32(a,b,c,d)` and `seedFromBytes`. `entropy.ts` has `cryptoRandomBytes`.
- `cpf.ts` and `cnpj.ts` use `Math.random` directly and take no arguments.
- Production uses, from grep:
  - `apps/web/components/tools/cpf-tool.tsx:18` calls `setGenerated(gerarCPF())`.
  - `apps/web/components/tools/cnpj-tool.tsx:18` calls `setGenerated(gerarCNPJ())`.
  - Both call with no arguments and never pass the function as a callback, so a new optional first parameter is safe.

## 2. Injecting the random source without breaking callers

```ts
// aleatorio.ts (new) — Prng from prng.ts satisfies Rng structurally
export type Rng = Pick<Prng, 'int'>
export const rngPadrao: Rng = { int: (n) => Math.floor(Math.random() * n) }
export function escolher<T>(rng: Rng, itens: readonly T[]): T
export function embaralhar<T>(rng: Rng, itens: readonly T[]): T[] // Fisher–Yates via rng.int
export function digitosAleatorios(rng: Rng, n: number): number[]

// cpf.ts / cnpj.ts — old calls keep working
export function gerarCPF(rng: Rng = rngPadrao, uf?: UF): string
export function gerarCNPJ(rng: Rng = rngPadrao): string
```

- **[V]** The repo's current `cpf.test.ts`, `cnpj.test.ts` and `prng.test.ts` pass unchanged against the new signatures (21 of 21).
- The extension would seed with `seedFromBytes(cryptoRandomBytes(16))`.
- **[A]** Store the whole generated person in `chrome.storage`, not just the seed. Any later edit to a name or address list would turn the same seed into a different person.

---

## 3. Field by field

### CPF [V]

- **Algorithm:** two mod-11 check digits with weights 10..2 and 11..2. Remainder below 2 gives 0, otherwise 11 − remainder. The existing code is correct.
- **9th digit = Receita Federal tax region [V].** Source: Receita's leaflet `gov.br/receitafederal/.../folhetos-orientativos/cadastros-dig.pdf`, which says "O nono dígito do seu CPF corresponde à Região Fiscal…".
  - 0 RS
  - 1 DF, GO, MT, MS, TO
  - 2 PA, AM, AC, AP, RO, RR
  - 3 CE, MA, PI
  - 4 PE, RN, PB, AL
  - 5 BA, SE
  - 6 MG
  - 7 RJ, ES
  - 8 SP
  - 9 PR, SC
- **Repeated-digit bug.** `gerarCPF` today can, with tiny probability, produce `111.111.111-11`, which `validarCPF` rejects. The fix is to redraw when all 9 base digits are equal.
- **Test vectors:**
  - Fixed sequence 3×9 then 1..9 gives `123.456.789-09`.
  - `sfc32(1,1,1,1)` gives `855.556.330-50`.
  - `sfc32(7,7,7,7)` gives `324.553.270-94`.
  - All three are accepted by `validate-docbr` 2.0.0 and `@brazilian-utils/brazilian-utils` 2.4.0.

### CNPJ [V]

- Existing algorithm is correct (weights 5432 98765432 and 6 5432 98765432, branch `0001`).
- **Test vectors:** `sfc32(1,1,1,1)` gives `85.555.633/0001-19`; seed (1,2,3,4) gives `85.697.406/0001-28`. Both pass both libraries.
- **Alphanumeric CNPJ is live since July 2026 [V].** Source: Receita FAQ `cnpj-alfanumerico.pdf`.
  - Positions 1–12 are `[0-9A-Z]`; the two check digits stay numeric.
  - Each character's value is its ASCII code minus 48, then the same mod-11 rule.
  - Official example: `12.ABC.345/01DE-35`. The reference `validarCNPJAlfanumerico` accepts it and rejects `…-36`. `brazilian-utils` (`{version:2}`) and `validate-docbr` agree.
  - Existing numeric CNPJs don't change.
- **Recommendation [A]:** keep generating numeric CNPJs, since many forms still validate digits only. Note that the repo's `validarCNPJ` (and so `/tools/cnpj`) now rejects real new alphanumeric CNPJs. That is a separate follow-up.

### RG [V for the SP model; there is no national rule]

- **No national standard.** Each state's identity agency defines its own number. Since Decreto 10.977/2022 (in force 2022-03-01), the new national ID card uses the **CPF** as the national registration number [V] (camara.leg.br, Decreto 10.977/2022).
- **Format:** `NN.NNN.NNN-D`. Return `rg: { numero, orgaoEmissor: 'SSP', uf: 'SP' }` so that "órgão emissor / UF" fields match the SP algorithm.
- **Algorithm (SSP-SP):** sum the 8 digits with weights 2,3,…,9. Check digit = 11 − (sum mod 11); 10 becomes `X`, 11 becomes `0`.
  - Sources: ngmatematica.com (2014) gives the worked example `56.843.539-4`; the Axon Toolbox gives `24.678.131-2`. Both match this rule.
  - It is equivalent to "weights 9..2, check digit = remainder", which is how bosontreinamentos describes it.
  - No official SSP-SP publication was found [A].
- **Test vectors (all pass):** `56.843.539-4`, `24.678.131-2`, `38.452.917-3`, `10.000.006-X`, `10.000.001-0`.
- **Generator:** redraw if the base is all one digit. By default also redraw if the check digit is X (about 1 in 11), because many forms only accept digits [A]. `gerarRG(rng,{permitirX:true})` allows X.

### PIS / PASEP / NIS [V by two independent libraries]

- **Algorithm:** weights `3,2,9,8,7,6,5,4,3,2`; check digit = 11 − (sum mod 11); 10 or 11 becomes 0.
  - This matches the `validate-docbr` PIS source (`0 if r<2 else 11-r`) and `brazilian-utils` `isValidPis`. Neither is an official Caixa source.
  - The sketch's `mod11` matches this rule.
- **Format:** `000.00000.00-0`.
- **Test vectors (valid in both libraries):** `120.12345.67-2`, `170.00000.01-3`, `123.45678.90-0`, `161.51127.87-1`. Invalid: `120.12345.67-5`.
- **[A]** The generator fixes the first digit at 1 because most PIS numbers look like that. It has no effect on validity.

### Título de eleitor [V for the structure; the SP/MG rule is disputed]

- **Structure [V].** Resolução TSE 23.659/2021, art. 36, read via a Wayback copy because tse.jus.br returns 403. The number has up to 12 digits:
  - 8 sequential digits;
  - 2 digits for the state code;
  - 2 check digits by "Módulo 11", the first over the sequential part, the second over the state code plus the first check digit.
- **State codes [V] (TSE table):**

  | Code | State | Code | State | Code | State | Code | State         |
  | ---- | ----- | ---- | ----- | ---- | ----- | ---- | ------------- |
  | 01   | SP    | 08   | PE    | 15   | PI    | 22   | AM            |
  | 02   | MG    | 09   | SC    | 16   | RN    | 23   | RO            |
  | 03   | RJ    | 10   | GO    | 17   | AL    | 24   | AC            |
  | 04   | RS    | 11   | MA    | 18   | MT    | 25   | AP            |
  | 05   | BA    | 12   | PB    | 19   | MS    | 26   | RR            |
  | 06   | PR    | 13   | PA    | 20   | DF    | 27   | TO            |
  | 07   | CE    | 14   | ES    | 21   | SE    | 28   | Exterior (ZZ) |

- **Weights:** not in the resolution. Source: pt.wikipedia "Título eleitoral".
  - First check digit: sequential digits × 2..9, remainder mod 11; 10 → 0.
  - Second check digit: (code₁×7 + code₂×8 + first check digit×9) mod 11; 10 → 0.
- **The SP/MG exception (remainder 0 → 1) is disputed.**
  - Wikipedia states it.
  - `brazilian-utils` 2.4.0 implements it.
  - `validate-docbr` 2.0.0 doesn't, citing art. 36 (issue #70).
  - Proof that they disagree [V]: `0000 0014 0108` is valid only without the exception; `0000 0014 0116` is valid only with it.
- **Generator:** for SP and MG, redraw whenever either check-digit remainder is 0. About 2 in 11 draws are redrawn. The output is then valid under both readings.
  - Checked over 10,000 SP and MG numbers in both libraries, with zero failures.
- **Test vectors:**
  - Wikipedia SC example `0043 5687 0906` is valid in both.
  - Generated: `1935 7592 0124` (SP), `3550 2284 0221` (MG), `6010 3848 2879` (ZZ), `6080 6730 1600` (RN). All valid in both libraries.
- **Format:** `NNNN NNNN NNNN` (same as the `validate-docbr` mask).
- **Sketch bugs:** see section 4.

### Mobile phone

- **Format:** `(DD) 9XXXX-XXXX`. The function also returns `digitos` (`DD9XXXXXXXX`) and `e164` (`+55DD9XXXXXXXX`).
- **Area code (DDD)** comes from the address entry; ViaCEP's `ddd` field was checked for all 34 entries [V]. All 34 also match the state in `brazilian-utils` `getAreaCodesByState` [V].
- **Validity [V]:** `libphonenumber-js` 1.13.14 (`/max`) classifies `9` + any digit + 7 digits as MOBILE for all 29 catalog area codes. `brazilian-utils isValidMobilePhone` agrees. Invalid area codes (10, 20, 23, …) are rejected.
- **[A]** The digit after the 9 is drawn from 6–9 to look realistic; validators don't require it.
- **Real numbers can't be avoided.** No Brazilian reserved range for fictional numbers was found (search found nothing like the US 555-01xx). Any well-formed number may belong to someone, so flows that send an SMS code will text a stranger. Document this in the extension.

### Date of birth (18+, deterministic)

- **Input:** `hojeISO: 'YYYY-MM-DD'`. Arithmetic is pure calendar maths with `Date.UTC`; there is no timezone-dependent `Date` anywhere.
- **Range:** youngest = today − 18 years; oldest = (today − 66 years) + 1 day. If the date doesn't exist (29 Feb), use the last valid day of that month. Pick a uniform day in between.
- **Age:** `ano − anoNasc − (fezAniversario ? 0 : 1)`. Someone born on 29 Feb has their birthday on 1 Mar in non-leap years, which is consistent with Código Civil art. 132 §3 [A: legal reading].
- **Test vectors [V, run]:**
  - Today 2026-10-01: youngest is `2008-10-01` (age 18), oldest is `1960-10-02` (age 65).
  - Today 2028-02-29: youngest is `2010-02-28`, oldest is `1962-03-01`.
  - Born 2008-02-29: age 17 on 2026-02-28, age 18 on 2026-03-01.
  - Checked for every day from 2024 to 2032 × 5 random sources: age is always in [18, 65].
- **Outputs:** `{ iso: 'yyyy-mm-dd', br: 'dd/mm/aaaa', idade }`.
- **Extension caveat [A]:** compute `hoje` in `America/Sao_Paulo`, e.g. `Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())`. Never use `toISOString().slice(0,10)`, which gives the UTC date and is off after 21h.

### Strong password

- **Character sets:**
  - Upper: `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I, O)
  - Lower: `abcdefghijkmnpqrstuvwxyz` (no l, o)
  - Digits: `23456789` (no 0, 1)
  - Symbols: `!@#$%&*`
- **Why that symbol set [A]:** it's a subset of the common `[!@#$%^&*]` check, and leaves out ^ ~ ` ´ (dead keys on the Brazilian ABNT2 keyboard), quotes, backslash, angle brackets and space.
- **Construction:** the first character is a letter; then one guaranteed character from each set plus random fill, shuffled with `rng`. Redraw if any character repeats three times in a row. Default length 14; 12–16 allowed.
- **Checked [V]:** 1000 seeds all pass `senhaAtendeRegrasComuns`.
- **Test vectors:** seed (1,2,3,4) person gives `qYk7cZwagiS&$L`; `sfc32(1,1,1,1)` gives `VbfG2$#Fhda4n!`.

### Name and e-mail

- **Lists:** 20 female and 20 male first names (some compound), and 30 surnames.
  - [V] The surnames include IBGE Censo 2022's top 10: Silva, Santos, Oliveira, Souza, Pereira, Ferreira, Lima, Alves, Rodrigues, Costa (via press coverage of the IBGE release).
  - The rest of the lists are curated [A]. Accented names (Conceição, Araújo, Tânia) are included on purpose to exercise accent removal.
- **Full name:** `prenome + s1 + s2`, with s1 ≠ s2.
- **E-mail user:** `slug(first word of prenome) . slug(s2) . 4 digits`, matching `^[a-z]+\.[a-z]+\.\d{4}$`. Accent removal is NFD plus stripping `\u0300-\u036f` (this also removes the cedilla).
  - Inbox URL: `https://tuamaeaquelaursa.com/<user>`.
  - [A] The site is a single-page app and documents no naming rules; dots are assumed fine.
- **Name on card:** first name + initials of the middle names + last surname, uppercase, no accents. Examples: `MARIA E S RIBEIRO`, `BEATRIZ A CONCEICAO`.
  - Always ≤ 26 characters, checked over 2000 people.
  - 26 is the ISO 7813 track-1 limit [A].

### Address (34 real entries) [V]

- **How they were checked:** each entry was fetched from `https://viacep.com.br/ws/<cep>/json/` on 2026-10-01 (dump in `research/gen/viacep.json`) and cross-checked on BrasilAPI v1. Street, neighbourhood, city, state and area code match exactly for all 34.
- **Number ranges matter.** Big avenues have several address codes, each covering a range of numbers. ViaCEP's `complemento` field holds that range, e.g. "de 612 a 1510 - lado par". The catalog stores `{min, max, lado}` and generates only numbers inside it.
  - "x/y" ranges mean both sides of the street.
  - An empty `complemento` means a whole-street code; I used 1–999 [A].
- **Avoided:** codes ending in 9xx, which belong to single large buildings or companies.

| CEP       | Street                                     | Neighbourhood      | City / State        | DDD | Numbers                  |
| --------- | ------------------------------------------ | ------------------ | ------------------- | --- | ------------------------ |
| 01310-100 | Avenida Paulista                           | Bela Vista         | São Paulo / SP      | 11  | 612–1510 even            |
| 01452-001 | Avenida Brigadeiro Faria Lima              | Jardim Paulistano  | São Paulo / SP      | 11  | 1503–2127 odd            |
| 01426-002 | Rua Oscar Freire                           | Cerqueira César    | São Paulo / SP      | 11  | 610–1290 even            |
| 01304-001 | Rua Augusta                                | Consolação         | São Paulo / SP      | 11  | 700–1680 even            |
| 13012-000 | Avenida Francisco Glicério                 | Centro             | Campinas / SP       | 19  | 327–1809 odd             |
| 11060-001 | Avenida Ana Costa                          | Gonzaga            | Santos / SP         | 13  | 1–341 odd                |
| 22021-001 | Avenida Atlântica                          | Copacabana         | Rio de Janeiro / RJ | 21  | 1662–2172 even           |
| 22410-000 | Rua Visconde de Pirajá                     | Ipanema            | Rio de Janeiro / RJ | 21  | 2–338 even               |
| 30130-005 | Avenida Afonso Pena                        | Boa Viagem         | Belo Horizonte / MG | 31  | 1352–1800 even           |
| 30160-015 | Rua da Bahia                               | Centro             | Belo Horizonte / MG | 31  | 391–800 both             |
| 90020-007 | Rua dos Andradas                           | Centro Histórico   | Porto Alegre / RS   | 51  | 1000–1190 even           |
| 80060-000 | Rua XV de Novembro                         | Centro             | Curitiba / PR       | 41  | 896–1599 both            |
| 88010-001 | Rua Felipe Schmidt                         | Centro             | Florianópolis / SC  | 48  | 350–980 both             |
| 40170-010 | Avenida Oceânica                           | Ondina             | Salvador / BA       | 71  | whole street (1–999 [A]) |
| 51111-000 | Avenida Boa Viagem                         | Boa Viagem         | Recife / PE         | 81  | 1382–2174 both           |
| 60165-120 | Avenida Beira Mar                          | Meireles           | Fortaleza / CE      | 85  | 941–3499 both            |
| 71936-250 | Avenida das Araucárias                     | Sul (Águas Claras) | Brasília / DF       | 61  | whole street [A]         |
| 74020-200 | Avenida Goiás                              | Setor Central      | Goiânia / GO        | 62  | 550–1118 even            |
| 69010-000 | Avenida Eduardo Ribeiro                    | Centro             | Manaus / AM         | 92  | 301–631 both             |
| 66010-000 | Avenida Presidente Vargas                  | Campina            | Belém / PA          | 91  | 1–380 both               |
| 65071-377 | Avenida Litorânea                          | Calhau             | São Luís / MA       | 98  | whole street [A]         |
| 64000-020 | Avenida Frei Serafim                       | Centro             | Teresina / PI       | 86  | odd side (range [A])     |
| 59090-000 | Avenida Engenheiro Roberto Freire          | Ponta Negra        | Natal / RN          | 84  | 3206–3766 even           |
| 58045-010 | Avenida Cabo Branco                        | Cabo Branco        | João Pessoa / PB    | 83  | whole street [A]         |
| 57030-170 | Avenida Doutor Antônio Gouveia             | Pajuçara           | Maceió / AL         | 82  | whole street [A]         |
| 49037-475 | Avenida Santos Dumont                      | Atalaia            | Aracaju / SE        | 79  | 1–1089 both              |
| 29055-130 | Avenida Nossa Senhora da Penha             | Praia do Canto     | Vitória / ES        | 27  | 710–1212 even            |
| 78005-370 | Avenida Presidente Getúlio Vargas          | Centro-Norte       | Cuiabá / MT         | 65  | whole street [A]         |
| 79002-073 | Avenida Afonso Pena                        | Centro             | Campo Grande / MS   | 67  | 2001–2551 odd            |
| 77020-012 | Quadra ACSE 1 Avenida Juscelino Kubitschek | Plano Diretor Sul  | Palmas / TO         | 63  | whole street [A]         |
| 76801-097 | Avenida Sete de Setembro                   | Centro             | Porto Velho / RO    | 69  | 945–1355 odd             |
| 69905-062 | Avenida Ceará                              | Cerâmica           | Rio Branco / AC     | 68  | 534–954 even             |
| 68900-073 | Avenida FAB                                | Central            | Macapá / AP         | 96  | 1–2270 both              |
| 69301-000 | Avenida Ville Roy                          | Centro             | Boa Vista / RR      | 95  | 5373–6278 both           |

The person's own complement is generated separately as `Apto {floor 1–20}{unit 1–4}`.

### Company

- **Razão social:** `${s1} & ${s2} ${ramo} Ltda`, with `ramo` from Tecnologia / Comércio / Serviços Digitais / Soluções / Consultoria / Logística / Engenharia.
- **Nome fantasia:** `${s2} ${Dev|Labs|Store|Digital|Tech|Hub}`.
- **CNPJ:** `gerarCNPJ(rng)`.
- [A] Including "Ltda" follows Código Civil art. 1.158.
- **Caveat [V, qualitative]:** the Receita FAQ says numeric CNPJs are running out. So a random numeric CNPJ has a real chance of belonging to an existing company. This can't be avoided; the same holds for random CPFs.

### Test card: use a fixed catalog of documented numbers

**Why a fixed catalog** — in sandboxes, only documented numbers work:

| Gateway      | What its docs say                                                                                                                                                                                                                   | Source                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Stripe       | Test mode accepts only its listed numbers. In live mode, a Stripe test number is declined with `testmode_decline` ("Foi usado um número de cartão de teste da Stripe"). That confirms "refused by a real acquirer" for Stripe only. | [V] docs.stripe.com/testing, docs.stripe.com/declines/codes |
| Stripe       | A real card in test mode is declined ("…test mode, but used a non test (live) card").                                                                                                                                               | [V via third-party forum reports only]                      |
| Pagar.me     | "Any other card number" returns unauthorized.                                                                                                                                                                                       | [V] docs.pagar.me                                           |
| Adyen        | "These test card numbers only work with Adyen's test platform". Requires expiry 03/2030 and CVC 737 (Amex 7373).                                                                                                                    | [V]                                                         |
| Mercado Pago | Result depends on the cardholder name (`APRO` approves, `OTHE` declines). Expiry 11/30, CVV 123 (Amex 1234).                                                                                                                        | [V]                                                         |
| PagBank      | Fixed approve/decline numbers, expiry 12/2026, CVV 123.                                                                                                                                                                             | [V]                                                         |
| Cielo        | The only sandbox where any number works: the last digit decides the result (0, 1, 4 = authorized; 2 = declined; …). Its own example `4024 0071 5376 3191` fails Luhn.                                                               | [V]                                                         |

Other reasons [A]:

- There is no acquirer-neutral "sandbox BIN range"; I found no standard reserving one.
- Generating random Luhn-valid numbers in real-looking ranges (like the sketch's `400000…`) can hit real cards, and it is exactly what carding tools do.

**Catalog** — every number passes Luhn and `card-validator` 10.0.4 detects the expected brand [V]:

| Gateway          | Approved                                                                                                                           | Declined                              | Fixed expiry / CVV / name               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------- |
| Stripe (default) | Visa `4242424242424242`, Visa BR `4000000760000002`, MC `5555555555554444`, MC 2-series `2223003122003222`, Amex `378282246310005` | Visa `4000000000000002`               | none — expiry and CVV generated         |
| Adyen            | Visa `4111111111111111`, MC `5555555555554444`, Amex `370000000000002`, Elo `5066991111111118`, Hipercard `6062828888666688`       | —                                     | 03/30, CVV 737 (Amex 7373)              |
| Mercado Pago     | MC `5480832801033311`, Visa `4235647728025682`, Amex `375365153556885`                                                             | same Visa with name `OTHE`            | 11/30, CVV 123 (Amex 1234), name `APRO` |
| Pagar.me         | Visa `4000000000000010`                                                                                                            | Visa `4000000000000028`               | none                                    |
| PagBank          | Visa `4539620659922097`, MC `5240082975622454`, Amex `345817690311361`, Elo `4514161122113757`, Hiper `6062828598919021`           | Visa `4929291898380766` (more listed) | 12/26, CVV 123 (Amex 1234)              |

Notes:

- Mercado Pago's own pages disagree on the Mastercard number. The older `5031 4332 1540 6351` is detected as **maestro** by `card-validator`, so I used `5480…`.
- PagBank's documented expiry is 12/2026. From January 2027 that will be in the past, so its docs need re-checking then.
- When the gateway doesn't fix them:
  - Expiry is today + 12..59 months, formatted `MM/AA`.
  - CVV is 3 digits (4 for Amex), from 100 to 999.
  - The name on the card comes from the person.
- Default is the Stripe gateway, Visa or Mastercard; the gateway is an option.
- **Suggested popup copy change:** the current copy says the number is "recusado por qualquer adquirente real". Only Stripe confirms that. Suggest: "Número de teste documentado ({gateway}). Passa no Luhn; só aprova em sandbox."

---

## 4. Bugs in the design sketch `gen()` / `P0` (measured by running)

1. **RG check digit is wrong.**
   - The sketch uses `DV = sum mod 11`; the SSP-SP rule is 11 − remainder.
   - The sketch's own `P0.rg` `38.452.917-8` is **invalid**; the correct check digit is 3.
   - 91.0% of RGs generated the sketch's way fail the SSP-SP rule.
2. **Título doesn't handle SP/MG.**
   - When the remainder is 0, the sketch writes 0. Example: `000000140108` fails `brazilian-utils` `isValidVoterId`; the version with the exception, `000000140116`, fails `validate-docbr`.
   - State codes are also hard-coded per address (`tit: [0,1]`) instead of coming from the TSE table, so there's no ZZ (exterior).
   - `P0.titulo` `1047 3826 0108` is valid under both rules.
3. **Password doesn't guarantee each character type.**
   - 33.1% of passwords miss one type: 15.6% have no digit, 19.7% no symbol from `!@#$%^&*`.
   - `-` is in the symbol set, which strict symbol whitelists reject.
4. **Address number ignores the address code's range.**
   - `P0` puts number `402` on 01310-100, which covers 612–1510 even.
   - Only 23.7% of the sketch's random numbers (100–1999) fit 01310-100, 8.9% fit 22021-001, and 0% fit 04538-133 (that code covers "de 3253 ao fim - lado ímpar").
5. **The card can't pass a gateway.** The random `400000` + 9 digits + Luhn number isn't in any documented sandbox list (see section 3).
6. **Dates are hard-coded.** Age is computed as `2026 - y - (m > 10 || (m===10 && d>1)…)`, which is only right on 2026-10-01. Expiry years are fixed at 28–31. Days only go 1–28.
7. **Inconsistencies.**
   - `P0.cpf` `384.529.176-19` has 9th digit 6 (MG) but the person lives in SP. The CPF itself is valid.
   - The person's name uses one surname, but the company name uses a second surname that isn't in the person's name.
8. **Still valid in the sketch:** `P0.cnpj` and `P0.pis` pass both libraries. The PIS and CNPJ algorithms are correct.

---

## 5. Coherence: `gerarPessoa(rng, hojeISO, opcoes?)`

The order in which `rng` is consumed is part of the contract (a golden test locks it): name → address → birth date → CPF(address state) → RG → PIS → título(address state) → mobile(address area code) → e-mail(name) → password → company(surnames) → card(name on card).

```ts
interface Pessoa {
  versao: 1
  nome: {
    sexo: 'F' | 'M'
    prenome: string
    sobrenomes: [string, string]
    completo: string
    noCartao: string
  }
  nascimento: { iso: string; br: string; idade: number }
  cpf: string
  rg: { numero: string; orgaoEmissor: 'SSP'; uf: 'SP' }
  pis: string
  tituloEleitor: string
  celular: {
    ddd: string
    numero: string
    formatado: string
    digitos: string
    e164: string
  }
  email: { usuario: string; endereco: string; caixaUrl: string }
  senha: string
  endereco: {
    cep
    logradouro
    bairro
    cidade
    uf: UF
    ddd
    numero
    complemento
  }
  empresa: { razaoSocial; nomeFantasia; cnpj }
  cartao: {
    gateway
    bandeira
    numero
    numeroFormatado
    titular
    validade: 'MM/AA'
    mes
    ano
    cvv
    resultadoEsperado
  }
}
```

**Golden person [V, run]** — `gerarPessoa(sfc32(1,2,3,4),'2026-10-01')`:

| Field    | Value                                                              |
| -------- | ------------------------------------------------------------------ |
| Name     | Vinícius Oliveira Costa                                            |
| Birth    | 29/05/1993, age 33                                                 |
| CPF      | 647.692.234-39 (9th digit 4 = RN)                                  |
| RG       | 25.547.934-7                                                       |
| PIS      | 161.51127.87-1                                                     |
| Título   | 6080 6730 1600 (code 16 = RN)                                      |
| Mobile   | (84) 99114-8037                                                    |
| E-mail   | vinicius.costa.6607@tuamaeaquelaursa.com                           |
| Password | `qYk7cZwagiS&$L`                                                   |
| Address  | Av. Eng. Roberto Freire 3360, Ponta Negra, Natal/RN, 59090-000     |
| Company  | Oliveira & Costa Engenharia Ltda / Costa Tech / 85.697.406/0001-28 |
| Card     | Stripe Visa 4242 4242 4242 4242, VINICIUS O COSTA, 07/30, CVV 345  |

**Independent cross-check [V, run]** over 2000 people across all 5 gateways:

- `brazilian-utils`: CPF, CNPJ, PIS, título, mobile, CEP and e-mail all valid.
- `libphonenumber-js`: every mobile is MOBILE.
- `card-validator`: every number, expiry and CVV valid.
- `validate-docbr`: CPF, CNPJ, PIS and título all valid.
- Zero failures. All 27 states appear; ages range 18–65.

---

## 6. Proposed module layout

One file per document, matching `cpf.ts` / `cnpj.ts`, rather than a single `docs.ts`. Each exports subpath-only, not through the barrel.

| File                | Contents                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `aleatorio.ts`      | `Rng`, `rngPadrao`, `escolher`, `embaralhar`, `digitosAleatorios`, `somenteDigitos`                                          |
| `uf.ts`             | `UFS`, `UF`, `CODIGO_UF_TITULO`, `REGIAO_FISCAL_CPF`                                                                         |
| `cpf.ts` (changed)  | `gerarCPF(rng?, uf?)`, `validarCPF`                                                                                          |
| `cnpj.ts` (changed) | `gerarCNPJ(rng?)`, `validarCNPJ`, `validarCNPJAlfanumerico`                                                                  |
| `rg.ts`             | `gerarRG`, `validarRG`, `dvRGSP`                                                                                             |
| `pis.ts`            | `gerarPIS`, `validarPIS`, `dvPIS`                                                                                            |
| `titulo-eleitor.ts` | `gerarTituloEleitor(rng, uf)`, `validarTituloEleitor(v, regra)`, `dvsTitulo`                                                 |
| `celular.ts`        | `gerarCelular(rng, ddd)`                                                                                                     |
| `nascimento.ts`     | `lerDataISO`, `calcularIdade`, `gerarNascimento(rng, hojeISO, {idadeMin, idadeMax})`, `formatarISO`, `formatarBR`            |
| `senha.ts`          | `gerarSenha(rng, tamanho)`, `senhaAtendeRegrasComuns`                                                                        |
| `nome.ts`           | name lists, `gerarNome`, `gerarEmail`, `removerAcentos`, `slugNome`, `nomeNoCartao`, `DOMINIO_EMAIL`                         |
| `endereco.ts`       | `LOGRADOUROS`, `sortearNumero`, `gerarEndereco(rng, uf?)`                                                                    |
| `empresa.ts`        | `gerarEmpresa(rng, sobrenomes)`                                                                                              |
| `cartao.ts`         | `CARTOES_TESTE`, `luhnValido`, `formatarNumeroCartao`, `gerarCartao(rng, hojeISO, titular, {gateway, resultado, bandeiras})` |
| `pessoa.ts`         | `Pessoa`, `gerarPessoa`                                                                                                      |

Add matching `"./<file>": "./src/<file>.ts"` entries in `package.json` `exports`.

---

## 7. Tests (scratch `src/docs.test.ts`, `src/pessoa.test.ts`, plus the repo's three existing tests)

**What they cover:**

- Each document:
  - fixed vectors, including the Wikipedia título and the ngmatematica RG;
  - the official alphanumeric CNPJ example;
  - the case where the two título rules diverge;
  - edge cases: repeated digits, X, 0;
  - 1000 seeds all valid.
- SP and MG títulos: 2000 seeds valid under both rules.
- Every state for the CPF region digit and the título code.
- Birth date:
  - every day 2024–2032 stays in [18, 65];
  - stub sources at both extremes;
  - 29 Feb cases;
  - an invalid date throws.
- Password: 1000 seeds, lengths 12 and 16, length 8 throws.
- Mobile: format and E.164; invalid area code throws.
- Address catalog: all 27 states, unique codes, number inside range and on the right side for every entry.
- Card:
  - Luhn for every catalog number;
  - expiry always in the future;
  - Amex CVV has 4 digits;
  - fixed values respected (Mercado Pago gives `APRO` / 11/30 / 123);
  - no matching card throws.
- `gerarPessoa`:
  - the golden person;
  - same seed gives the same person;
  - 1000 seeds × (every document valid under both título rules, plus coherence: CPF region = state, título code = state, mobile area code = address area code, number inside the range, e-mail built from the name, company from the surnames, name on card = person).

**Mutation checks** — each test was confirmed to fail when its rule is broken:

| Mutation                     | Tests that fail |
| ---------------------------- | --------------- |
| RG check digit = remainder   | 6               |
| SP/MG guard removed          | 2               |
| Address number ignores range | 2               |
| Sketch-style password        | 2               |
| CPF ignores state            | 27              |

**Final output (scratch folder, using the repo's Jest 30.4.2 and ts-jest 29.4.9; `tsc --strict` OK):**

```
Test Suites: 5 passed, 5 total
Tests:       172 passed, 172 total
Time:        1.421 s
```

To re-run: `/Users/piluvitu/WWW/PiluVitu-Dev/packages/tools/node_modules/.bin/jest --config jest.config.cjs` from the scratch `gen/` folder.

---

## 8. Assumptions and follow-ups

**Assumed [A]:**

- No official SSP-SP publication for the RG rule (several secondary sources agree).
- The SP/MG título exception is disputed; the generator avoids the question.
- PIS first digit fixed at 1.
- Mobile digit after the 9 drawn from 6–9.
- Number ranges for whole-street address codes (1–999).
- tuamaeaquelaursa.com accepts dots in the inbox name.
- "Refused by any real acquirer" is only confirmed for Stripe.
- No Brazilian fictional-phone range exists.

**Follow-ups:**

- Update `packages/tools/CLAUDE.md` with a test-person module section, the new exports and the test count.
- Decide whether `/tools` `validarCNPJ` should accept alphanumeric CNPJs.
- Re-check PagBank's 12/2026 expiry in January 2027.
- The extension computes `hoje` in America/Sao_Paulo and stores the whole `Pessoa` (`versao: 1`) in `chrome.storage`.

Files are in `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/research/gen/`:

- `src/*.ts` — 15 modules
- `src/docs.test.ts`
- `src/pessoa.test.ts`
- `viacep.json` — the address checks
- `crossval.mjs`
- `sketchbugs.mjs`
- `jest.config.cjs`

# ramielle + promeia — arquitetura de dois serviços

**Data:** 2026-07-28
**Antecedente:** `docs/superpowers/specs/2026-07-27-financas-roadmap.md` §A/§B, que registrou a intenção. Este spec substitui aquele adendo.

## 0. Fatos medidos (2026-07-28)

Levantados contra o código, não de memória.

**A superfície do Go são 29 rotas**, em `apps/api/internal/router`:

| Grupo           | Rotas                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Auth            | `/google/login`, `/google/callback`, `/me`, `/logout`                                                                |
| Votação         | `/sessions` (GET/POST), `/sessions/{id}`, `/{id}/results`, `/{id}/votes` (GET/POST), `/{id}/close`, `/{id}/tiebreak` |
| Admin           | `/users`, `/backups`, `POST /backup`                                                                                 |
| Outros          | `/categorias`, `/health`                                                                                             |
| **Ferramentas** | `/cpf/*`, `/cnpj/*`, `/uuid`, `/base64/*`, `/json/*`, `/jwt/decode`, `/qr/*` — **13 rotas**                          |

⚠️ **As 13 rotas de ferramentas são código morto.** Medido: o `apps/web` importa `@piluvitu/tools` **direto** (`components/tools/base64-tool.tsx` → `@piluvitu/tools/base64`, e assim por diante). Nenhum arquivo do web chama esses endpoints. Elas duplicam em Go lógica que já existe em TS puro.

**Não migrar: apagar.** Isso tira 13 das 29 rotas do escopo.

**Tabelas do Go:** `users`, `sessions` (auth), `voting_sessions`, `session_movies`, `votes`, `tiebreaks`, `backups`.

**Pacotes internos:** `auth`, `backup`, `gdrive`, `gsheets`, `handlers`, `httpx`, `logging`, `router`, `tmdb`, `tools`, `votacao`.

**Ollama:** aparece só no `.env`. **Não existe cliente Ollama em Go** — menos coisa para migrar do que o roadmap supunha.

## 1. A arquitetura

Três serviços, com uma regra de corte clara.

| Serviço      | Onde                                                  | O que carrega                                              |
| ------------ | ----------------------------------------------------- | ---------------------------------------------------------- |
| **ramielle** | Worker                                                | Toda a API e o CRUD. A verdade vive no D1.                 |
| **promeia**  | MacBook, exposto por Cloudflare Tunnel                | Processamento caro: AI, transcrição, PDF, OCR. **Python.** |
| Frontends    | Vercel (`apps/web`) e Static Assets (SPA do finanças) | UI                                                         |

**A regra de corte:** vai para promeia o que exige GPU, modelo local ou acesso a arquivo. Todo o resto fica em ramielle.

⚠️ **promeia não é onde a verdade mora.** Ele processa e **empurra** o resultado para ramielle, que grava no D1. Isso é o que faz o app não depender do Mac estar ligado — o padrão já provado com o insight.

## 2. Por que Python no promeia

Decisão do dono, com transcrição confirmada como caso real.

Whisper (`faster-whisper`), OCR e extração de tabela de PDF (`pdfplumber` — e fatura _é_ tabela) são Python de referência. Escolher Node significaria brigar com o ecossistema em cada adição.

**Go foi descartado** e o motivo não é desempenho — o gargalo é a inferência, não a camada HTTP. É que o dono está removendo Go do projeto, e o ecossistema de PDF/áudio/ML em Go é o mais fraco dos três: reintroduzir a linguagem que sai, no domínio onde ela é mais fraca.

**Custo aceito:** segunda linguagem no monorepo — segundo toolchain, segundo runner de teste, segundo job de CI, segunda política de dependência.

## 3. Segurança — a parte que não é opcional

⚠️ **`promeia.piluvitu.com.br` no túnel é alcançável pela internet inteira.** Sem autenticação, isso é **GPU grátis publicada**: alguém acha o hostname e roda inferência no MacBook do dono. Zero Trust está fora (o cartão não verifica).

Duas decisões:

**1. O navegador nunca fala com promeia.** O fluxo é **navegador → ramielle → promeia**. O Worker guarda o token do promeia como secret; o navegador nunca o vê. Chamar direto do navegador exigiria o token no cliente — ou seja, público.

**2. Token próprio (`PROMEIA_TOKEN`), checado em toda rota**, mesmo padrão do `INGEST_TOKEN` já em produção.

## 4. Trabalho longo não cabe em requisição

Transcrever áudio leva minutos. Nem o navegador nem o Worker seguram isso.

**Modelo de job:**

1. Navegador pede a ramielle "transcreva X"
2. ramielle dispara em promeia e devolve **na hora** um id de job
3. promeia processa e **empurra** o resultado para ramielle (`INGEST_TOKEN`)
4. O navegador consulta ramielle pelo resultado

É o padrão do insight, generalizado.

## 5. Degradação: dois casos, duas mensagens

O dono descreveu "se der 500, diz para subir o promeia". Mas são situações distintas:

- **Não alcançou** (DNS, conexão recusada, timeout) ⇒ _"Suba o promeia no Mac para usar este recurso"_
- **Alcançou e falhou** (500, 401, modelo ausente) ⇒ dizer **isso** — mandar subir algo que já está de pé faz perder tempo no lugar errado

⚠️ É a mesma distinção já exigida nos CLIs deste projeto: `ECONNREFUSED` e "a API me recusou" nunca podem virar a mesma frase.

## 6. O split de hostname

O dono pediu explicitamente e aceitou o custo.

Hoje app e API compartilham `financas.piluvitu.com.br` **de propósito** — mesma origem elimina CORS e cookie cross-site de uma vez.

Separar mantém _same-site_ (mesmo domínio registrável `piluvitu.com.br`), então **o cookie de sessão sobrevive**. O que passa a ser necessário é **CORS**, que hoje não existe.

⚠️ **A quebra do CORS só aparece em produção.** Local, tudo é `localhost`. É a mesma classe de armadilha do Custom Domain e do `@source` — precisa de verificação em produção, não em dev.

## 7. Allowlist

| Área         | Acesso                                                    |
| ------------ | --------------------------------------------------------- |
| **Finanças** | Só `paulo.tspi@gmail.com` — já implementado, duas camadas |
| **Admin**    | Só `paulo.tspi@gmail.com` — **a implementar**             |
| **Votação**  | Livre por enquanto — decisão do dono                      |

O finanças já tem o padrão pronto e provado: allowlist no hook de criação de usuário (camada 1) e no guard de sessão (camada 2). A segunda camada existe porque o Better Auth **não tem noção de allowlist fora da criação** — sessão que já existe para e-mail desautorizado é validada normalmente.

**A migração reusa esse padrão**, não inventa outro.

## 7.1 A regra de corte — a parte que evita rediscussão

O dono pediu explicitamente: documentar o que fica em cada API, para feature nova não virar debate.

**A pergunta única:** _este trabalho precisa de GPU, modelo local ou acesso a arquivo no disco?_

- **Sim ⇒ promeia.** Inferência, transcrição, OCR, leitura de PDF.
- **Não ⇒ ramielle.** Tudo o mais: CRUD, integração com API externa, orquestração, agendamento, autenticação.

⚠️ **"Tem a ver com AI" NÃO é o critério.** É a armadilha fácil, e a distribuição de artigos mostra por quê: gerar a revisão exige modelo local (promeia), mas **publicar no dev.to, Hashnode, Bluesky e Mastodon é chamada HTTP para API externa** — nenhuma GPU envolvida, e portanto ramielle. Um fluxo pode atravessar os dois; a fronteira é por operação, não por assunto.

Aplicando aos casos reais de hoje:

| Operação                                 | Onde         | Por quê                   |
| ---------------------------------------- | ------------ | ------------------------- |
| Revisar artigo (`/llm/proofread`)        | promeia      | Modelo local              |
| Refinar/encurtar chamada (`/llm/refine`) | promeia      | Modelo local              |
| Gerar hooks de rede social               | promeia      | Modelo local              |
| Chunking de texto longo                  | promeia      | Serve só ao modelo        |
| Publicar no dev.to / Hashnode            | **ramielle** | HTTP para API externa     |
| Publicar no Bluesky / Mastodon           | **ramielle** | HTTP para API externa     |
| Guardar estado da distribuição           | **ramielle** | É dado, e dado mora no D1 |
| Insight financeiro                       | promeia      | Modelo local              |
| Extrair PDF de fatura                    | promeia      | Arquivo + modelo          |
| Transcrever áudio                        | promeia      | Whisper local             |
| Votação, contas, dívidas, lançamentos    | **ramielle** | CRUD                      |

## 7.2 O fluxo de artigo, redesenhado

Existe hoje na branch `feat/distribuicao-artigos-llm-local`, **não mergeada**, com cinco rotas que o `main` desconhece: `POST /llm/proofread`, `POST /llm/refine`, `POST /distribution/proposals`, `GET /distribution/{slug}`, `POST /distribution/{slug}/publish`. Os prompts vivem em `internal/llm/prompts.go` (`proofreadSystem`, `hooksSystemTmpl`, `refineSystem`, `shortenSystem`).

**Redesenho:** os prompts e a inferência vão para promeia; o estado e a publicação ficam em ramielle. O botão no admin chama ramielle, que chama promeia — nunca o navegador direto (§3).

⚠️ **Nível de revisão (mais leve / mais pesado) NÃO existe no código atual** — o `proofreadSystem` corrige apenas erros objetivos, sem parâmetro de intensidade. É **feature nova a construir em promeia**, não porte. Registrar como tal evita que alguém procure por algo que nunca existiu.

## 8. Mapa de migração

| Origem (Go)                     | Destino           | Nota                                                                                                                                                        |
| ------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth Google + sessão            | **ramielle**      | Better Auth **já existe e está em produção** no finanças. Reusar, não reescrever.                                                                           |
| Votação (7 rotas)               | **ramielle** + D1 | Tabelas `voting_sessions`, `session_movies`, `votes`, `tiebreaks`                                                                                           |
| Admin (`/users`, `/backups`)    | **ramielle**      | Com allowlist                                                                                                                                               |
| `gsheets`, `tmdb`               | **ramielle**      | APIs HTTP — Worker faz `fetch`                                                                                                                              |
| `gdrive` + backup `VACUUM INTO` | **repensar**      | O D1 não tem `VACUUM INTO`. O finanças já resolveu com `scripts/backup-d1.sh` (export lógico + rotação). Aplicar o mesmo, não portar o mecanismo do SQLite. |
| **13 rotas de ferramentas**     | **apagar**        | Código morto (§0)                                                                                                                                           |
| Insight, PDF, transcrição       | **promeia**       | Os dois CLIs em Node já funcionam — portar para Python                                                                                                      |
| Cliente Ollama                  | —                 | Não existe em Go (§0)                                                                                                                                       |

## 9. Sequência

Cada etapa precisa deixar o sistema funcionando. **Não há big bang.**

1. **promeia mínimo** — serviço Python, `/health`, autenticação, túnel. Portar o insight (o fluxo mais simples, já provado ponta a ponta)
2. **Botão no app** — ramielle chama promeia, com a degradação da §5
3. **PDF e transcrição** em promeia
4. **ramielle**: votação + auth migradas do Go, com CORS e o split de hostname
5. **Allowlist no admin**
6. **Aposentar o Go** — só depois que tudo tiver equivalente rodando

⚠️ O passo 6 é o último **e** condicional. Desligar o Go antes de a votação estar migrada e verificada em produção tira do ar algo que funciona hoje.

## 10. Fora de escopo

- Migrar o `apps/web` para fora da Vercel
- Substituir o D1
- Deixar promeia sempre ligado. Ele é oportunista por natureza; toda tela que dependa dele precisa de comportamento definido para "Mac desligado" (§5)

## 11. Critérios de aceitação

- promeia recusa requisição sem `PROMEIA_TOKEN` — provado por teste
- O navegador **nunca** recebe o token do promeia — provado inspecionando o payload
- Tela cujo recurso depende do promeia **distingue** "não alcancei" de "alcancei e falhou"
- Job longo não bloqueia navegador nem Worker
- Votação migrada responde igual à do Go — comparação lado a lado antes de aposentar
- Admin e finanças só abrem para `paulo.tspi@gmail.com`; votação segue livre
- As 13 rotas de ferramentas somem, e nada quebra — provado por busca de chamador
- CORS verificado **em produção**, não só local

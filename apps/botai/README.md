# Botaí

Gerador de dados fake para formulários (CPF, CNPJ, CEP).

O nome vem de "bota aí", expressão piauiense, e é o que a extensão faz: bota dados nos campos do formulário. É uma extensão de navegador (Manifest V3) para Chrome, Edge, Opera e Firefox, para quem desenvolve e testa formulários brasileiros.

## O que gera

Uma pessoa de teste falsa e coerente, que fica guardada até você pedir outra:

- CPF e CNPJ com os dígitos verificadores corretos, além de RG, PIS/NIS e título de eleitor;
- CEP real, com rua, bairro, cidade e UF que batem com ele;
- nome, data de nascimento, celular, e-mail e senha;
- empresa (razão social, nome fantasia e CNPJ);
- cartão de teste documentado da Stripe (número, nome impresso, validade e CVV).

## Como instalar

- **Chrome:** [Chrome Web Store](https://chromewebstore.google.com/detail/bota%C3%AD/mblmjomopainbcdjipkdmioglamdinnc).
- **Edge:** pela mesma página da Chrome Web Store (na primeira vez, o Edge pede para permitir extensões de outras lojas).
- **Firefox e Opera:** em revisão nas lojas. Até lá, a partir do código.

**A partir do código**, na raiz do monorepo:

**Chrome e Edge**

1. Rode `make build-botai`.
2. Em `chrome://extensions` (no Edge, `edge://extensions`), ligue o "Modo do desenvolvedor" e clique em "Carregar sem compactação".
3. Escolha a pasta `apps/botai/.output/chrome-mv3`.

**Opera**

1. Rode `pnpm --filter @pilutech/botai build:opera`.
2. Em `opera://extensions`, ligue o "Modo de desenvolvedor" e carregue a pasta `apps/botai/.output/opera-mv3`.

**Firefox (153 ou mais novo)**

1. Rode `pnpm --filter @pilutech/botai build:firefox`.
2. Em `about:debugging#/runtime/this-firefox`, clique em "Carregar extensão temporária…" e escolha `apps/botai/.output/firefox-mv3/manifest.json`. A extensão some quando o Firefox fecha.

## Como usar

- **A página inteira:** `⌥⇧P` no Mac ou `Ctrl+Shift+Y` no Windows e no Linux (no Firefox para Linux, `Alt+Shift+P`), ou clique no ícone do Botaí e em "Preencher esta página".
- **Um campo só:** botão direito no campo › `Botaí › Inserir › CPF` (ou E-mail, CEP…), para o que a detecção automática errar.
- **Ver e copiar os dados:** o popup mostra a pessoa inteira; "Nova pessoa" gera outra.

## Cuidados

- **A caixa de e-mail é pública.** O e-mail gerado é do `tuamaeaquelaursa.com`, e qualquer um que souber o endereço lê as mensagens. Nunca use para conta real.
- CPF, CNPJ e celular gerados podem pertencer a alguém de verdade. Use só em localhost e staging.
- Os dados são para teste: os [termos de uso](https://botai.pilutech.com.br/termos) dizem o que é proibido fazer com eles.

## Publicação (para quem mantém)

O Botaí sai em quatro lojas pela PiluTech. Como o release funciona está no [`CLAUDE.md`](./CLAUDE.md), seção "Publicação"; o que vai em cada campo das lojas, em [`loja/README.md`](./loja/README.md).

**Uma vez, antes do primeiro envio:**

1. **Domínios na Vercel:** `pilutech.com.br` e `www.pilutech.com.br` (redirecionando para o apex) no projeto `pilutech-site` (Root Directory `apps/pilutech-site`; ver "Deploy" em `apps/pilutech-site/CLAUDE.md`); `botai.pilutech.com.br` no projeto `botai-site` (Root Directory `apps/botai-site`; ver "Deploy" em `apps/botai-site/CLAUDE.md`).
2. **DNS na Cloudflare**, zona `pilutech.com.br`: registros **DNS only** (nuvem cinza) com os valores que a Vercel mostrar (`A @`, `CNAME www`, e o `CNAME botai` com o valor do projeto `botai-site`). Não crie Single Redirect; se houver um de antes, apague. O "Powered by PiluTech" do popup abre `https://pilutech.com.br`, a landing da PiluTech.
3. **Contas:**
   - Chrome Web Store: taxa única de US$ 5, verificação em duas etapas obrigatória e e-mail de login **imutável** (use um dedicado da PiluTech). Declare-se Trader com os dados da PiluTech, depois de confirmar com o contador.
   - Firefox Add-ons: conta Mozilla com 2FA.
   - Edge: conta no Partner Center (grátis).
   - Opera: conta de desenvolvedor em addons.opera.com.
   - Confira se o nome colide na Chrome Web Store e no INPI ("GetBotAI" já existe na AMO).
4. **Environment no GitHub:** Settings → Environments → New environment `lojas-botai`. Em "Required reviewers", só você, **sem** "Prevent self-review"; em "Deployment branches and tags", a `main` e a regra de tag `botai-v*`. Crie antes da primeira tag: um workflow que cita um environment inexistente o cria sem proteção.

**Primeira versão (1.0.0):**

5. Com as fases 1 e 3 na `main`: `git switch main && git pull` e `make release-botai`. A tag `botai-v1.0.0` gera o GitHub Release com os 4 zips; o job `lojas` pede a sua aprovação e, aprovado, sai com `::notice::` (ainda não há secrets).
6. **Primeiro envio à mão** em cada loja, com os zips do Release e o material de `loja/`:
   - Chrome Web Store: `botai-1.0.0-chrome.zip`, com a publicação **adiada** (desmarque a publicação automática);
   - Firefox Add-ons: canal listed, `botai-1.0.0-firefox.zip` + `botai-1.0.0-sources.zip`, licença MIT e a nota AMO de `loja/notas-revisores.md`;
   - Edge: `botai-1.0.0-chrome.zip`;
   - Opera: `botai-1.0.0-opera.zip` e a nota Opera.
7. **Credenciais**, todas no environment `lojas-botai` (secret: `gh secret set NOME --env lojas-botai`; variable: `gh variable set NOME --env lojas-botai --body "valor"`):
   - Chrome: num projeto do Google Cloud, habilite a "Chrome Web Store API", crie uma service account **sem nenhuma role** e uma chave JSON; no painel da Chrome Web Store, em Account, adicione o e-mail da service account. Cadastre `jq -r .private_key chave.json | gh secret set CHROME_SERVICE_ACCOUNT_PRIVATE_KEY --env lojas-botai` e as variables `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `CHROME_PUBLISHER_ID` (Publisher → Settings) e `BOTAI_CHROME_EXTENSION_ID` (o ID do item). Apague a chave JSON local depois.
   - Firefox: gere as chaves em https://addons.mozilla.org/developers/addon/api/key/ e cadastre `FIREFOX_JWT_ISSUER` e `FIREFOX_JWT_SECRET`.
   - Edge: no Partner Center, Publish API → Create API credentials; cadastre `EDGE_CLIENT_ID`, `EDGE_API_KEY` (anote a data de expiração da chave) e a variable `BOTAI_EDGE_PRODUCT_ID`.
8. **Dry-run:** `gh workflow run botai-release.yml --ref main -f lojas=dry-run`, aprove o job `lojas` e confira no log `::notice::dry-run: Chrome Firefox Edge` e o job verde.
9. **Lançamento**, com a Chrome e a AMO aprovadas:
   - publique o item adiado no painel da Chrome Web Store (há 30 dias a partir da aprovação);
   - AMO e Edge ficam públicos assim que aprovam;
   - no `/admin/pilulabs` (item `botai`, que é o `apps/web/content/pilulabs/botai/index.yaml`), as URLs das lojas aprovadas; o Botaí já está listado, e Firefox e Opera entram quando aprovarem; a landing relê o YAML no build e troca o "Em breve" pelos botões das lojas (o Edge não tem "Em breve": o botão dele só aparece com o link);
   - neste README, "Como instalar" ganha os links das lojas.

**Versões seguintes:** `make versao-botai V=x.y.z` (abre o PR), merge, `git switch main && git pull`, `make release-botai` e aprove o job `lojas`. Para publicar adiado na Chrome, rejeite a aprovação da tag e rode `gh workflow run botai-release.yml --ref botai-v<versão> -f lojas=submeter -f adiar_chrome=true`. O Opera é sempre à mão, com o `botai-<versão>-opera.zip` do Release e a nota Opera.

## Privacidade e termos

O Botaí não coleta nem envia dados: ele só lê os formulários da aba em que você o aciona e guarda no navegador a pessoa fictícia que gerou. A [política de privacidade](https://botai.pilutech.com.br/privacidade) e os [termos de uso](https://botai.pilutech.com.br/termos) moram no site do Botaí; o texto deles fica em `apps/botai-site/app/privacidade/page.tsx` e `apps/botai-site/app/termos/page.tsx`.

## Licença

MIT, © PiluTech (veja o [`LICENSE`](./LICENSE)). Vale para o Botaí e para os pacotes que ele empacota (`packages/tools` e `packages/ui`), não para o resto deste repositório.

Detalhes técnicos (arquitetura, testes e o checklist manual) estão no [`CLAUDE.md`](./CLAUDE.md).

---

Powered by [PiluTech](https://pilutech.com.br)

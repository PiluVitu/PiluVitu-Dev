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

As versões das lojas (Chrome Web Store, Firefox Add-ons, Microsoft Edge Add-ons e Opera Add-ons) chegam com a 1.0.0. Até lá, a partir do código, na raiz do monorepo:

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

## Licença

MIT, © PiluTech (veja o [`LICENSE`](./LICENSE)). Vale para o Botaí e para os pacotes que ele empacota (`packages/tools` e `packages/ui`), não para o resto deste repositório.

Detalhes técnicos (arquitetura, testes e o checklist manual) estão no [`CLAUDE.md`](./CLAUDE.md).

---

Powered by [PiluTech](https://pilutech.com.br)

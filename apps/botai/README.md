# Botaí

Gerador de dados fake para formulários (CPF, CNPJ, CEP).

O nome vem de "bota aí", expressão piauiense, e é o que a extensão faz: bota dados nos campos do formulário. É uma extensão do Google Chrome (Manifest V3) para quem desenvolve e testa formulários brasileiros.

## O que gera

Uma pessoa de teste falsa e coerente, que fica guardada até você pedir outra:

- CPF e CNPJ com os dígitos verificadores corretos, além de RG, PIS/NIS e título de eleitor;
- CEP real, com rua, bairro, cidade e UF que batem com ele;
- nome, data de nascimento, celular, e-mail e senha;
- empresa (razão social, nome fantasia e CNPJ);
- cartão de teste documentado da Stripe (número, nome impresso, validade e CVV).

## Como instalar (sem empacotar)

1. Na raiz do monorepo, rode `make build-botai`.
2. Em `chrome://extensions`, ligue o "Modo do desenvolvedor" e clique em "Carregar sem compactação".
3. Escolha a pasta `apps/botai/.output/chrome-mv3`.

## Como usar

- **A página inteira:** `⌥⇧P` no Mac ou `Ctrl+Shift+Y` no Windows e no Linux, ou clique no ícone do Botaí e em "Preencher esta página".
- **Um campo só:** botão direito no campo › `Botaí › Inserir › CPF` (ou E-mail, CEP…), para o que a detecção automática errar.
- **Ver e copiar os dados:** o popup mostra a pessoa inteira; "Nova pessoa" gera outra.

## Cuidados

- **A caixa de e-mail é pública.** O e-mail gerado é do `tuamaeaquelaursa.com`, e qualquer um que souber o endereço lê as mensagens. Nunca use para conta real.
- CPF, CNPJ e celular gerados podem pertencer a alguém de verdade. Use só em localhost e staging.

Detalhes técnicos (arquitetura, testes e o checklist manual) estão no [`CLAUDE.md`](./CLAUDE.md).

---

Powered by [PiluTech](https://pilutech.com.br)

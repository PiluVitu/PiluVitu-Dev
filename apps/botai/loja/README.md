# Material das lojas do Botaí

O que vai em cada campo das quatro lojas. O passo a passo da publicação (contas, credenciais, primeiro envio e lançamento) está na seção "Publicação" do `apps/botai/README.md`; como o release funciona, na do `apps/botai/CLAUDE.md`.

- `textos.md`: os textos da listagem, em pt-BR, uma seção por campo.
- `notas-revisores.md`: as notas para os revisores da AMO e do Opera, em inglês.
- `imagens/`: gerado por `make capturas-botai`; não edite à mão. O ícone vai também para `apps/web/public/pilulabs/botai/` (o card) e, com o ícone de 300 px e as capturas de 1280×800, para `apps/botai-site/` (a landing).
- `icone-1i.svg`: o desenho 1i em vetor, de onde saem o ícone 128 da loja e o logo do Edge. O ícone do manifesto (`public/icon/`) não muda.
- `vitrine.pagina.html`, `quadros.ts`, `pecas.ts` e `capturas.captura.ts`: o gerador das imagens.

Os pacotes vêm do GitHub Release da tag `botai-v<versão>`.

## Chrome Web Store

- Pacote: `botai-<versão>-chrome.zip`, com a publicação adiada no primeiro envio.
- Ícone: `imagens/icone-128.png` (arte de 96 px com margem transparente de 16 px).
- Capturas (até 5): `imagens/capturas/1280x800/` 01, 03 e 05 (escuro) e 02 e 04 (claro).
- Bloco promocional pequeno: `imagens/chrome-tile-440x280.png`.
- Textos: Descrição, Categoria, Propósito único, as quatro Justificativas (activeTab, scripting, contextMenus, storage), Código remoto, Dados e Endereços. O resumo da Chrome é o `description` do manifesto. Os termos de uso não têm campo próprio nessas lojas: vão na Descrição.

## Firefox Add-ons (AMO)

- Pacotes: `botai-<versão>-firefox.zip` e, no campo de código-fonte, `botai-<versão>-sources.zip`. Canal listed.
- Capturas: as 6 de `imagens/capturas/1280x800/`.
- Textos: Resumo, Descrição, Categoria, Licença, Endereços e o texto da política (seção "Política de privacidade" de `textos.md`).
- Contrato de licença (EULA): deixe vazio. A licença do código é a MIT (campo Licença), e os termos de uso não são um contrato a aceitar antes de instalar (o Firefox nem mostra mais esse aceite); o link deles vai na Descrição e em Endereços.
- Notas para o revisor: a seção AMO de `notas-revisores.md`.

## Edge Add-ons

- Pacote: `botai-<versão>-chrome.zip`, o mesmo da Chrome.
- Logo: `imagens/edge-logo-300.png`.
- Capturas (até 6): as 6 de `imagens/capturas/1280x800/`.
- Textos: Descrição (no mínimo 250 caracteres), Categoria, Propósito único, as quatro Justificativas, Código remoto, Dados e Endereços. Os termos de uso não têm campo próprio nessas lojas: vão na Descrição.

## Opera Add-ons

- Pacote: `botai-<versão>-opera.zip`, o build sem minificar. O envio é sempre manual.
- Capturas (ao menos 2, fundo branco): as de `imagens/opera/612x408/`.
- Textos: Resumo, Descrição, Categoria e Endereços.
- Notas para o revisor: a seção Opera de `notas-revisores.md`.

# Notas para os revisores (AMO e Opera)

Em inglês, como o `SOURCE-CODE-REVIEW.md`: é o idioma que os revisores leem. Cada seção vai no campo de notas para o revisor da loja.

## AMO

Botaí fills web forms with fake Brazilian test data (CPF, CNPJ, CEP). It makes no network requests, collects no data (data_collection_permissions: none) and acts only after a user gesture (toolbar button, keyboard shortcut or context menu) on that tab.

Source code: the attached sources zip is a subset of our public monorepo (https://github.com/PiluVitu/PiluVitu-Dev). The build instructions are in apps/botai/SOURCE-CODE-REVIEW.md inside the zip (Ubuntu 24.04, Node 24.14.0, corepack enable, pnpm install --frozen-lockfile, then wxt zip -b firefox). The rebuilt firefox zip is byte-identical to the uploaded package; our CI checks this on every change.

How to test: open any page with a sign-up form, click the Botaí toolbar button, then "Gerar pessoa" and "Preencher esta página". A notice in the corner shows how many fields were filled. Right-click a text field › Botaí › Inserir › CPF fills a single field.

Permissions: activeTab and scripting inject the filler only into the tab the user acted on; contextMenus and menus add the right-click items (menus.getTargetElement finds the clicked field); storage keeps the generated fake person in storage.local.

## Opera

Botaí fills web forms with fake Brazilian test data (CPF, CNPJ, CEP). It makes no network requests, collects no data and acts only after a user gesture on that tab.

Nothing in this package is minified by our build (minification is disabled for the Opera package); third-party libraries are bundled from their published npm builds. Source code and build instructions: the asset botai-<version>-sources.zip of the GitHub Release whose tag matches this package version (https://github.com/PiluVitu/PiluVitu-Dev/releases), described in apps/botai/SOURCE-CODE-REVIEW.md, and the public repository https://github.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai.

How to test: open any page with a sign-up form, click the Botaí toolbar button, then "Gerar pessoa" and "Preencher esta página".

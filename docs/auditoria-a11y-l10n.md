# Auditoria de acessibilidade e localização

- **Data:** 2026-11-13
- **Commit auditado:** `faa66a0` (main), no worktree `.worktrees/auditoria`
- **Critério:** skill `padroes-produto-pilutech` (WCAG 2.2 AA com alvo de 44 px, localização pt-BR/en/es e `llms.txt` nos sites)
- **Situação:** só diagnóstico. Nada foi corrigido. As correções viram PRs pequenos, na ordem que o Pilutech Maestro definir (seção 8).
- **Conferência:** o relatório passou por uma conferência adversarial, que refez no navegador 20 achados (os 11 que eram de severidade alta e 6 de contraste), mediu mais 3 para corrigir severidade ou evidência e corrigiu severidades, critérios e referências. O que mudou está na seção 9.

## 1. Escopo

**Entrou:**

- **`packages/ui` (`@piluvitu/ui`):** os tokens de cor de `src/styles.css` (tema claro em `:root`, escuro em `.dark`) e os componentes exportados (ajuda, aspect-ratio, avatar, badge, button, card, chart, command, dialog, dropdown-menu, form, input, label, separator, sheet, skeleton, textarea, transicao-de-tema). Checkbox, Switch e Select não existem no pacote.
- **`apps/web`, site público:** `/`, `/pilulabs`, `/tools` e as 9 ferramentas, `/tasks`, `/privacidade`, `/feed` e o corpo do post (só pelo CSS, porque o build não tem post).
- **`apps/web`, Votaí:** `/` anônimo e logado, sessão aberta e encerrada, `/anteriores`, `/anteriores/12` e `/anteriores/13` (Halloween).
- **`apps/web`, `/admin`:** login, dashboard, posts, editor, PiluLabs, Carreira, Redes sociais, Perfil, Mídia, Sessões, Transcrição, Passkeys, menu da conta, diálogos e toasts.
- **`apps/financas`:** as 18 rotas da SPA, a tela de login, o painel "Mais", o Pagar fatura e os diálogos. Os textos que o Worker manda para a tela entram em localização.

**Ficou de fora:**

- **`apps/ramielle` e `apps/promeia`:** não têm interface. As mensagens de erro que eles mandam ao usuário entram em localização, mas nenhuma frente desta rodada leu esses textos (ver seção 7).
- **`apps/pilutech-site`:** não está mais no ar. Desde 2026-10-27, o projeto Vercel `pilutech-site` (domínios `pilutech.com.br` e `www`) está ligado ao repositório `pilutech-sites`, com Root Directory `sites/pilutech` (seção "Deploy (Vercel)" do `CLAUDE.md` daquele repositório). A auditoria do site da PiluTech cabe a ele. O `CLAUDE.md` da raiz daqui ainda descreve o `apps/pilutech-site` como a landing em produção.
- **`apps/api`** (Go, aposentada), **`packages/tools`** e **`packages/ia`** (sem interface). O `money.ts` do `packages/tools` aparece no FIN-16.
- **Botaí:** mora em outro repositório e consome o `@piluvitu/ui` pelo npm. Não foi auditado aqui. No checkout local (`133cc89`), ele importa só `avatar`, `button`, `card`, `cn` e `input`, então herda UI-03, UI-04, UI-05 e UI-19, mas não os achados de Command, Chart, Dialog, Sheet ou menu.

## 2. Como foi medido

Quatro frentes mediram em paralelo, cada uma no build de produção (ou num harness com o código-fonte), com a rede de saída bloqueada por proxy e as APIs respondidas por `page.route` com dados fictícios. Nenhuma requisição foi à produção. Todos os servidores locais foram parados no fim.

| Frente        | O que rodou                                                                        | Porta | Como o tema troca                                     | Tamanhos                                                         |
| ------------- | ---------------------------------------------------------------------------------- | ----- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/ui` | harness Vite com `packages/ui/src` e o `styles.css` do pacote, `<html lang=pt-BR>` | 4791  | classe `.dark` no `<html>`                            | 320×256, 375, 1280 (texto a 200%)                                |
| Site e Votaí  | `pnpm --filter @piluvitu/web build:ci`, servido pelo standalone                    | 3401  | next-themes (`attribute=class`), `localStorage.theme` | 1280, 390, 320×800, 640 a 2× (zoom 200%), texto a 200%           |
| `/admin`      | `next build` do web, standalone, com `/auth/me`, `/api/admin/*` e outras mockadas  | 3189  | `localStorage.theme`                                  | 1280, 320, texto a 200%                                          |
| Finanças      | `pnpm build` e `vite preview`, com `/api/**` mockado                               | 4719  | `localStorage['financas-tema']` e `.dark` no `<html>` | 390×844, 1280×800, 320×640, 640, texto a 200% (em 390 e em 1280) |

**Ferramentas e métodos:**

- **Navegador:** Playwright 1.59.1 do monorepo, sem dependência nova. As primeiras rodadas usaram o Chromium do Playwright (Chromium 147 e o headless shell 1217). No meio da auditoria, o cache `~/Library/Caches/ms-playwright` foi apagado por um processo externo. As rodadas seguintes usaram o Google Chrome 157 instalado (canal `chrome`, headless) ou o headless shell 1243. As passadas interrompidas foram refeitas do zero.
- **axe-core 4.11.1:** injetado por `page.addScriptTag`, com as tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` e `wcag22aa`, nos dois temas. Uma passada à parte de `best-practice`.
- **Contraste:** fórmula do WCAG 2.x sobre as cores reais. Os HSL dos tokens viram sRGB com arredondamento de 8 bits (como o Chrome pinta) e as transparências são compostas sobre o fundo. No finanças, os textos reprovados foram conferidos também pelo pixel real atrás do texto (texto escondido, captura de 1×1).
- **Alvos:** caixa (`getBoundingClientRect`) de todo interativo, contando os menores que 44 e os menores que 24 (com a exceção de espaçamento do WCAG 2.5.8). Links dentro de texto corrido contam à parte.
- **Teclado e foco:** até 90 Tabs por página, comparando o estilo com foco e sem foco (outline, box-shadow, borda, fundo), com captura e `elementFromPoint` para foco coberto. Enter, Espaço, setas e Esc nos menus, diálogos, formulários e listas.
- **Nomes acessíveis:** `ariaSnapshot` do Playwright e checagem de `aria-labelledby`/`aria-describedby`.
- **Movimento:** `page.emulateMedia({ reducedMotion: 'reduce' })` contra `no-preference`, lendo `document.getAnimations()` e as transições computadas.
- **Zoom e texto:** largura de 320 CSS px (equivale a 1280 a 400%), `font-size` do `<html>` a 200%, e o espaçamento de texto do WCAG 1.4.12 a 375 px.
- **Localização:** contagem de textos fixos pela AST do TypeScript (web) ou por regex (finanças, aproximada) e busca por `Intl`, `toLocale`, `toFixed`, listas de meses e plural montado à mão.

**Onde estão os scripts, os JSON e as capturas:** na pasta de rascunho da sessão que fez a auditoria (temporária, fora do repositório e não versionada), em `auditoria/`:

```
auditoria/
  ui/           contraste-tokens.mjs, axe.mjs, medidas.mjs, medidas2.mjs, harness/, cap-*.png
  web-publico/  medir.cjs, interacoes.cjs, contraste-tokens.cjs, contar-textos.cjs, resultados/
  web-admin/    lib.mjs, medir-*.mjs, contraste-tokens.mjs, contar-textos.mjs, shots/
  financas/     mocks.mjs, axe-todas.mjs, medidas.mjs, formularios.mjs, pixel.mjs, sonda3.mjs, shots/
```

Nos achados, "Medir de novo" cita esses scripts pelo nome da frente (ex.: `ui/medidas.mjs`) e diz também como medir à mão.

### Termos usados

- **axe:** biblioteca que roda no navegador e aponta violações do WCAG. "Serious" e "critical" são os dois níveis mais graves dela.
- **Alvo:** a área que se clica ou toca num controle.
- **Refluxo:** o conteúdo cabe numa coluna de 320 px sem rolar para o lado.
- **Nome acessível:** o nome que o leitor de tela fala para um controle.
- **Região viva:** área cujo texto novo o leitor de tela lê sozinho. `role=alert` lê na hora e interrompe; `role=status` (ou `aria-live=polite`) espera a pausa.
- **`sr-only`:** texto escondido na tela, mas lido pelo leitor de tela.
- **Token:** variável de cor do design system, como `--primary` ou `--input`.
- **Reduzir movimento:** a preferência do sistema `prefers-reduced-motion`.
- **Severidade:** **alta** barra o uso por teclado ou leitor de tela, ou viola AA em texto principal; **média** viola AA em parte secundária ou uma regra da PiluTech (44 px, localização); **baixa** é melhoria.
- **Esforço:** **P** leva horas; **M**, um a dois dias; **G**, mais que isso.
- **Junta:** o achado reúne outros iguais que as frentes acharam em lugares diferentes. Os ids juntados seguem citados para achar a evidência nos JSON.

## 3. Resumo

As quatro frentes acharam 108 itens. Depois de juntar os repetidos (o mesmo token ou componente do `packages/ui` visto em vários apps, ou o mesmo defeito no site e no admin), ficam **92 achados: 10 de severidade alta, 62 média e 20 baixa** (depois da conferência da seção 9, que rebaixou UI-02, UI-09 e UI-14).

**Por produto:**

| Produto                                 | Alta   | Média  | Baixa  | Total  |
| --------------------------------------- | ------ | ------ | ------ | ------ |
| `packages/ui` (vale para todos os apps) | 1      | 16     | 8      | 25     |
| `apps/web`, transversal (site e admin)  | 1      | 5      | 1      | 7      |
| `apps/web`, site público e Votaí        | 2      | 12     | 2      | 16     |
| `apps/web`, `/admin`                    | 5      | 15     | 4      | 24     |
| `apps/financas`                         | 1      | 14     | 5      | 20     |
| **Total**                               | **10** | **62** | **20** | **92** |

**Por tema:**

| Tema                          | Alta | Média | Baixa | Total |
| ----------------------------- | ---- | ----- | ----- | ----- |
| Contraste                     | 2    | 8     | 0     | 10    |
| Alvo (44 e 24 px)             | 0    | 6     | 0     | 6     |
| Foco visível e ordem          | 1    | 6     | 3     | 10    |
| Teclado                       | 4    | 2     | 2     | 8     |
| Nome acessível                | 1    | 3     | 3     | 7     |
| Semântica e estrutura         | 0    | 6     | 4     | 10    |
| Erros e mensagens de status   | 1    | 5     | 0     | 6     |
| Movimento                     | 0    | 3     | 2     | 5     |
| Zoom e refluxo                | 1    | 6     | 2     | 9     |
| Testes de acessibilidade      | 0    | 3     | 0     | 3     |
| Outros (formulário e fonte)   | 0    | 0     | 2     | 2     |
| Localização: catálogo         | 0    | 6     | 0     | 6     |
| Localização: formatação       | 0    | 4     | 1     | 5     |
| Localização: rotas por idioma | 0    | 1     | 0     | 1     |
| Localização: teste de chaves  | 0    | 3     | 0     | 3     |
| `llms.txt`                    | 0    | 0     | 1     | 1     |
| **Total**                     | 10   | 62    | 20    | 92    |

**Contraste por tema de cor** (razão medida; o mínimo é 4,5 para texto e 3 para borda, foco e gráfico):

| Achado                                  | Mínimo | Claro       | Escuro              | Halloween     |
| --------------------------------------- | ------ | ----------- | ------------------- | ------------- |
| UI-01 item focado do menu               | 3      | 1,19        | 1,14                | 1,19          |
| UI-02 itens do Command                  | 4,5    | 2,31 a 3,46 | 2,65 a 4,35         | não medido    |
| UI-03 borda do campo                    | 3      | 1,27 a 1,34 | 1,37 a 1,46         | 1,40 a 1,48   |
| UI-04 anel de foco contra o botão (\*)  | —      | 1,00 e 1,48 | 1,00 e 1,31         | 1,00 e 1,72   |
| UI-11 séries 1, 2 e 3 do gráfico        | 3      | 1,99 a 2,90 | passa (≥ 5,81)      | não se aplica |
| WEB-01 corpo do post e pré-visualização | 4,5    | 1,05 a 1,39 | passa               | não medido    |
| WEB-05 texto branco nas tags            | 4,5    | 1,52 a 4,17 | igual (cor fixa)    | não medido    |
| WEB-06 selos, aviso do JWT e erro       | 4,5    | 3,18 a 4,41 | passa               | 4,11 a 4,35   |
| ADM-14 diff da revisão da IA            | 4,5    | 3,39 e 3,85 | passa (5,45 e 7,10) | não se aplica |
| ADM-15 switch desligado                 | 3      | 1,07 e 1,13 | 1,07 e 1,14         | não se aplica |
| FIN-01 texto de alerta                  | 4,5    | 3,96 a 4,45 | passa (5,69 a 6,70) | não se aplica |
| FIN-02 chips de status                  | 4,5    | 4,39 e 4,49 | passa (6,05 e 9,05) | não se aplica |

O ADM-05 tem ainda o título do editor em 4,38:1, no tema one-dark do próprio CodeMirror.

(\*) Nenhum critério do WCAG exige 3:1 entre o anel e o próprio botão: o 1.4.11 e o 2.4.13 comparam o pixel com foco e sem foco, e o anel de 1 px fica do lado de fora, sobre o fundo (7,07 no claro, 9,36 no escuro). O número mostra só que o anel se confunde com o botão. O problema do UI-04 é a espessura de 1 px.

**O que mais pesa:**

- **Teclado é o maior bloqueio.** Não dá para abrir um cartão do Kanban (WEB-02), reordenar as listas do admin (ADM-01) nem desconectar o GitHub (ADM-02) sem mouse. O editor de post prende o Tab (ADM-05).
- **O tema claro tem texto ilegível** no corpo dos posts e na pré-visualização do admin (WEB-01, 1,05 a 1,39:1) e alertas do finanças abaixo de 4,5 (FIN-01).
- **O design system concentra correções que valem para os três apps:** o item focado do menu (1,14 a 1,19:1), a borda dos campos (1,27 a 1,46:1), o anel de foco de 1 px colado ao botão e os botões de 36 px.
- **O admin não cabe em tela estreita** (ADM-04): a 320 px, a página rola até 683 px para o lado.
- **A localização não começou em nenhum produto:** não há catálogo, nem en ou es, nem teste de chaves. São pelo menos 520 textos fixos no web (264 no site e pelo menos 256 no admin) e cerca de 845 no finanças. É a trilha G (seção 8).
- **`llms.txt`:** o site cumpre. Falta só o do Votaí (WEB-23).
- **O que já segura** (seção 6): os tokens de texto passam 4,5:1 nos dois temas, o foco aparece na maior parte dos controles, a ordem do Tab segue a ordem visual e as sobreposições respeitam reduzir movimento.

## 4. Achados

### 4.1 `packages/ui` (vale para todos os apps)

#### UI-01 · O item focado do menu e do Command quase não aparece

**Alta · esforço P** · WCAG 2.4.7 Foco visível (AA) e 1.4.11 Contraste não textual (AA, 3:1) · junta WEB-08

- **Onde:** `packages/ui/src/dropdown-menu.tsx:34,91,107,131` (SubTrigger, Item, CheckboxItem e RadioItem com `focus:bg-accent ... outline-hidden`); `packages/ui/src/command.tsx:120` (CommandItem com `aria-selected:bg-accent ... outline-hidden`); tokens `--accent` e `--popover` em `styles.css:143,124` e `:190,182`. Uso: `apps/web/components/mode-toggle.tsx:42` (menu Tema, no site e no admin) e `apps/web/components/admin/account-menu.tsx:57`.
- **Evidência:** o único sinal do item focado é o fundo `--accent`. Medido no Chrome depois de ↓ no menu aberto: fundo do item rgb(229,236,245) contra o menu rgb(255,255,255) dá **1,19:1** no claro; rgb(24,33,47) contra rgb(15,20,31) dá **1,14:1** no escuro. O item ativo tem `outline-style: none` e `box-shadow: none`. O Command mede o mesmo (#e5ecf5 sobre #fff). No escopo `.halloween` do web, 1,19:1. No site, o menu Tema aberto por Enter repete os números.
- **Medir de novo:** abrir o menu, apertar ↓, ler `getComputedStyle` do `[role=menuitem]` focado e do `[role=menu]` e calcular a razão (`ui/medidas.mjs`, seção 3; `web-publico/interacoes.cjs`, passo home-menu-tema). Pelos tokens: `ui/contraste-tokens.mjs`, par accent / popover.
- **Corrigir:** dar ao item focado um indicador de 3:1 ou mais, por exemplo `focus:ring-2 focus:ring-ring focus:ring-inset` (ring sobre popover mede 7,46 no claro e 8,76 no escuro) ou `bg-primary text-primary-foreground` (7,46 e 8,96). Fazer o mesmo no `aria-selected` do CommandItem. Acrescentar o par "indicador de foco do menu / popover" ao `contraste.test.ts`.

#### UI-02 · Command: todos os itens saem desabilitados

**Média · esforço P** · WCAG 1.4.3 (4,5:1), 2.5.x (uso por ponteiro), 1.3.1 e 4.1.2 · rebaixado de alta na conferência: o defeito é real, mas hoje não atinge nenhum produto

- **Onde:** `packages/ui/src/command.tsx:120` (`data-disabled:pointer-events-none data-disabled:opacity-50`) e `:101-110` (CommandSeparator dentro do CommandList, que é `role=listbox`). Nenhum app do monorepo importa `@piluvitu/ui/command`, e o Botaí também não (checkout local `133cc89`: importa só `avatar`, `button`, `card`, `cn` e `input`). Volta a ser alta no dia em que algum produto usar o Command.
- **Evidência:** o cmdk 1.1.1 marca todo item com `data-disabled="false"` (no `dist/index.mjs`, `"data-disabled":!!A`). A variante `data-disabled:` do Tailwind v4 casa só pela presença do atributo. Resultado medido nos 3 itens: opacidade 0,5 e `pointer-events: none`; um clique no centro do item acerta o `[cmdk-list]`, não o item. axe `color-contrast` (serious): 4 nós no claro (item 3,46:1, #878a8f sobre #fff; selecionado 3,18:1; atalho 2,31:1, #a4abb4 sobre #fff) e 2 no escuro (selecionado 4,35:1, #7b8089 sobre #141b27; atalho 2,65:1). axe `aria-required-children` (critical), 1 nó: `[role=separator]` dentro de `[role=listbox]`, nos dois temas. O teclado funciona: na conferência, Enter no campo escolheu o primeiro item (o `onSelect` rodou), por isso o 2.1.1 saiu da lista de critérios.
- **Medir de novo:** cena `?cena=command` do harness; `ui/axe.mjs`; `ui/medidas2.mjs`, seção 3 (opacidade e `pointerEvents` dos `[cmdk-item]` e `elementFromPoint` no centro); `conferencia/command.cjs`.
- **Corrigir:** usar `data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50`, como o shadcn atual faz para o cmdk 1.x. Tirar o separador da árvore do listbox (`aria-hidden` ou `role=none` no CommandSeparator) ou não usá-lo dentro do CommandList. Teste: render e axe da cena command.

#### UI-03 · A borda dos campos não chega a 3:1

**Média · esforço P** · WCAG 1.4.11 Contraste não textual (3:1): o campo tem fundo transparente, então a borda é o único contorno · junta WEB-07, FIN-03 e a parte das bordas de ADM-15

- **Onde:** `packages/ui/src/styles.css:147-148` (claro, `--border` e `--input` em `216 30% 88%`) e `:194-195` (escuro, `205 40% 18%`); `input.tsx:13` e `textarea.tsx:12` (`border-input ... bg-transparent`); `apps/financas/web/src/lib/form-classes.ts:14` (`SELECT_CLASSNAME`, 38 usos); `apps/web/app/globals.css:145` (`.halloween`). O Input aparece em 28 arquivos dos apps (56 usos só no finanças) e o Textarea em 9.
- **Evidência:** borda `--input` contra o fundo: claro **1,27:1** (#d7dfea sobre #f7f9fc) e 1,34:1 sobre card e popover (#fff); escuro **1,46:1** (#1c3140 sobre #090b11) e 1,37:1 sobre card e popover (#0f141f); `.halloween` 1,48 e 1,40. No admin, o fundo `muted/40` do campo dá cerca de 1,05:1 contra o card. O `contraste.test.ts` não mede `--input` nem `--border`, e o axe não tem essa regra.
- **Medir de novo:** `node ui/contraste-tokens.mjs packages/ui/src/styles.css`, pares input / background, card e popover. No navegador, `getComputedStyle(input).borderColor` dá os mesmos hex.
- **Corrigir:** separar `--input` de `--border` e escurecer só `--input`. Valores medidos que passam: claro `--input: 216 20% 58%` (3,09 sobre background, 3,26 sobre card); escuro `--input: 205 25% 38%` (3,20 e 3,00). A alternativa é preencher o campo (`bg-card` ou `bg-muted`) com 3:1. Acrescentar input / background e input / card ≥ 3 ao `contraste.test.ts`. Vale também para o `SELECT_CLASSNAME` do finanças e para o `.halloween`.

#### UI-04 · O anel de foco tem 1 px e fica colado ao botão

**Média · esforço P** · regra PiluTech de foco visível; 2.4.13 (AAA) como referência de espessura. Não reprova o 2.4.7 nem o 1.4.11 em sentido estrito: o anel de 1 px fica sobre o fundo e contrasta 7,07:1 com ele · junta FIN-21

- **Onde:** `packages/ui/src/button.tsx:18` (`focus-visible:ring-1 focus-visible:ring-ring`, sem afastamento), nas variantes default e destructive (`:23,25`); `input.tsx:13` e `textarea.tsx:12` (`ring-1`); `apps/financas/web/src/lib/form-classes.ts:14`.
- **Evidência:** o anel usa `--ring`, que é igual a `--primary`. Contra o próprio Button default dá **1,00:1** nos dois temas (#055b80 sobre #055b80; #3abff8 sobre #3abff8); contra o destructive, 1,48:1 (claro) e 1,31:1 (escuro). Em pixels: Tab sobre o Button default muda 420 pixels num recorte de 140×48, numa faixa de 1 px. O foco aparece só como o botão crescendo 1 px de cada lado (`box-shadow: rgb(5, 91, 128) 0px 0px 0px 1px`). Contra o fundo da página o anel passa (7,07 no claro, 9,36 no escuro), e o finanças o viu em todas as paradas medidas, mas fino.
- **Medir de novo:** `ui/medidas.mjs`, seção 3 (captura antes e depois do foco por teclado e pixels alterados); pares ring / primary e ring / destructive do `contraste-tokens.mjs`.
- **Corrigir:** usar o padrão que o Close do Dialog e o Badge já usam, `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background`, em Button, Input, Textarea e no `SELECT_CLASSNAME` do finanças. Com o afastamento, o anel fica sobre o fundo (7,07 no claro, 9,36 no escuro). Cobrir com teste de classe e, no E2E, com captura do foco.

#### UI-05 · Button e Input ficam abaixo de 44 px

**Média · esforço M** · regra PiluTech de alvo de 44×44 (o WCAG 2.5.8, de 24×24, passa) · junta a parte de Button e Input de WEB-13, ADM-16 e FIN-04

- **Onde:** `packages/ui/src/button.tsx:34-37` (default `h-9`, sm `h-8`, lg `h-10`, icon `h-9 w-9`); `input.tsx:13` (`h-9`). O Button aparece em 77 arquivos dos apps e o Input em 28.
- **Evidência:** medido no Chrome: Button default com 36 px de altura, sm 32, lg 40, icon 36×36; Input 36 (o Textarea tem 60 e passa). Nenhum tamanho padrão chega a 44; todos passam de 24. Efeito nos apps:
  - **site:** 42 interativos com 36 px (Tema 92,8×36 em 20 páginas, Gerar, Validar, Formatar, Decodificar, Entrar com Google, Votar (1), Sair, Mais antigas) e 5 com 32 px (Exportar, Importar, Tags, Adicionar card);
  - **admin:** os botões padrão e `sm` de todas as rotas;
  - **finanças, a 390×844:** inputs de 312×36, Criar dívida 107×36, Criar conta 106×36, Registrar pagamento 173×36, Adicionar item 106×32, Cancelar e Confirmar dos diálogos 340×36.
- **Medir de novo:** `ui/medidas.mjs`, seção 1 (caixa de cada `[data-alvo]`); nos apps, `web-publico/medir.cjs` (alvos1280 e alvos390), `web-admin/medir-paginas.mjs` (alvos44) e `financas/medidas.mjs` (alvos).
- **Corrigir:** subir os tamanhos padrão para `h-11` (icon `size-11`, Input `h-11`). Para manter `sm` e icon compactos, usar a área de toque invisível que o Ajuda já usa (`after:absolute` de 44×44 centrado, provado com `elementFromPoint`). Medir antes o efeito visual nos três apps, porque muda a altura das linhas. No finanças, outra saída é uma variante de toque (`h-11`) só nos formulários.

#### UI-06 · O botão Fechar de Dialog e Sheet tem 16×16

**Média · esforço P** · WCAG 2.5.8 Tamanho do alvo (AA, 24×24) e regra de 44 · junta FIN-05 e a parte do Close de ADM-16

- **Onde:** `packages/ui/src/dialog.tsx:47-50` e `sheet.tsx:80-83` (Close com `absolute top-4 right-4 rounded-sm`, sem padding, ícone `h-4 w-4`); `command.tsx:28-38` (o CommandDialog usa o mesmo DialogContent). No finanças: painel Mais, Pagar fatura e os 7 arquivos com Dialog; no web, os diálogos do site e do admin.
- **Evidência:** Close medido em 16×16 nos três componentes. No harness, Dialog e Sheet passam o 2.5.8 só pela exceção de espaçamento (o alvo mais próximo fica a 84 px e a 72 px do centro). No CommandDialog falha: o X fica sobre o campo de busca (distância 0). No finanças, o axe acusa `target-size` (serious), 1 nó, no painel Mais aberto (`#/` a 390, nos dois temas): 16×16 para um mínimo de 24. Também 16×16 no Pagar fatura, no diálogo de apagar do extrato e nos diálogos do admin.
- **Medir de novo:** `ui/medidas.mjs`, seção 1, e `ui/medidas2.mjs`, seção 5; `financas/axe.json` (rota "#/ (painel Mais aberto)") e `financas/formularios.json`.
- **Corrigir:** dar ao Close uma área de 44×44 (`size-11` com margem negativa, ou o `after:` de 44 do Ajuda), mantendo o ícone de 16. No CommandDialog, reservar espaço à direita do campo (`pr-12`).

#### UI-07 · Itens de menu e de Command têm 32 px de altura

**Média · esforço P** · regra PiluTech de 44 (o 2.5.8 passa)

- **Onde:** `packages/ui/src/dropdown-menu.tsx:34,91,107,131` (`py-1.5 text-sm`) e `command.tsx:120` (`py-1.5`). O CommandDialog já compensa com `[cmdk-item]:py-3` (`:32`).
- **Evidência:** `menuitem`, `menuitemcheckbox` e `menuitemradio` com 128,7×32; `option` do Command com 32 px. No CommandDialog, 44 (passa).
- **Medir de novo:** `ui/medidas.mjs`, seção 1 (alvos.menu, alvos.command e alvos.command-dialog).
- **Corrigir:** `min-h-11` (ou `py-3`) nos itens, como o CommandDialog. Conferir que o menu longo continua cabendo (UI-14).

#### UI-08 · O Fechar do Dialog se chama "Close"

**Média · esforço P** · WCAG 3.1.2 Idioma das partes (AA) e 4.1.2; regra PiluTech de nenhum texto fixo · junta FIN-23 e a parte do Dialog de WEB-19 e ADM-29

- **Onde:** `packages/ui/src/dialog.tsx:49` (`<span className="sr-only">Close</span>`). No mesmo pacote, `sheet.tsx:82` diz "Fechar". Os três apps têm `<html lang="pt-BR">` (`apps/web/app/layout.tsx:100`, `apps/financas/web/index.html:2`, `apps/pilutech-site/app/layout.tsx:30`).
- **Evidência:** o `ariaSnapshot` do Dialog aberto mostra `button "Close"` num documento `lang=pt-BR`, sem `lang=en` no trecho. O leitor de tela lê a palavra inglesa com voz em português. No site, o foco inicial do diálogo da carreira cai nesse botão. No finanças, o diálogo de apagar do `#/extrato` tem o "Close" de 16×16.
- **Medir de novo:** `ui/medidas.mjs`, seção 2; `web-publico/interacoes.cjs`, passo home-dialogo-carreira; `financas/formularios.json` (extrato.dialog.botoes).
- **Corrigir:** o texto vem do catálogo do pacote (UI-16): "Fechar" (pt-BR), "Close" (en), "Cerrar" (es), com uma prop (ex.: `rotuloFechar`) para sobrescrever. Teste: `getByRole('button', { name: 'Fechar' })`, como o `sheet.test.tsx` já faz.

#### UI-10 · Gráfico: foco invisível e sem nome útil

**Média · esforço P** · WCAG 2.4.7 (AA), 4.1.2 e 1.1.1 · junta FIN-09

- **Onde:** `packages/ui/src/chart.tsx:76` (`[&_.recharts-surface]:outline-hidden` no ChartContainer). Uso: `apps/financas/web/src/blocos/GraficoComprometido.tsx` (gráficos em `#/`, `#/comprometido` e `#/fluxo`).
- **Evidência:** o recharts 3 liga o `accessibilityLayer`: o `<svg>` ganha `role=application` e `tabindex=0` e entra no Tab. Focado por teclado: `:focus-visible` verdadeiro, `outline-style: none`, `box-shadow: none`, ou seja, foco invisível. A seta para a direita mostra o tooltip ("Fev Receitas 3.900 Despesas 3.500,25"): o teclado funciona, mas sem indicador. O nome vem dos rótulos do eixo ("application: Jan Fev Mar"). No finanças, 4 SVGs (2 em `#/`, 1 em `#/comprometido`, 1 em `#/fluxo`) têm `<title></title>` vazio e nenhum `aria-label`; o `ariaSnapshot` vira "application: nov dez jan fev mar abr R$ 0,00 R$1.500,00 … 56%a60% …". `#/fluxo` e `#/comprometido` têm tabela com os valores; no bloco Comprometido da Início, os valores mês a mês só existem dentro do SVG.
- **Medir de novo:** `ui/medidas.mjs`, seção 3 (ordemTab, item "svg JanFevMar" sem indicador) e `ui/medidas2.mjs`, seção 4; `financas/formularios.json` (graficos), `financas/medidas.json` (estrutura[*].svgs) e `financas/sonda3.mjs`.
- **Corrigir:** no pacote, trocar o `outline-hidden` por um anel em `:focus-visible` (ex.: `[&_.recharts-surface:focus-visible]:outline-2 outline-ring`) e expor `titulo` e `descricao` no ChartContainer (title e desc do recharts, ou `aria-label`). No finanças, onde o gráfico repete uma tabela, outra saída é `accessibilityLayer={false}` com `role=img` e `aria-label` resumindo o dado. No bloco da Início, oferecer os valores por mês em texto (tabela `sr-only` ou link para `#/comprometido`).

#### UI-11 · As séries 1, 2 e 3 do gráfico ficam abaixo de 3:1 no claro

**Média · esforço M** · WCAG 1.4.11 Contraste não textual (3:1) · junta FIN-24 (o finanças a deu como baixa, porque `#/fluxo` tem tabela e a legenda tem texto)

- **Onde:** `packages/ui/src/styles.css:170-174` (`--chart-1` a `--chart-5` no `:root`). Uso: `apps/financas/web/src/blocos/GraficoComprometido.tsx:461` (área "acumulado" = chart-1), `lib/paleta.ts:15-19` e `blocos/BlocoCategorias.tsx:323` (bolinhas da legenda).
- **Evidência:** no claro, contra background e card: chart-1 **1,99** e 2,10 (#3abff8); chart-3 **2,02** e 2,13 (#f59f0a); chart-2 2,90 sobre background (3,06 sobre card). chart-4 (4,60) e chart-5 (3,99) passam. No escuro, todas ficam em 5,81 ou mais. O próprio `styles.css:162-169` registra a falha, e o `contraste.test.ts` não cobre estes tokens.
- **Medir de novo:** `ui/contraste-tokens.mjs`, pares chart-N / background e card.
- **Corrigir:** decisão de visualização do dono. Ou escurecer chart-1, 2 e 3 no `:root` até 3:1 sobre card (ex.: chart-1 em `198 93% 38%`, a conferir com o script), ou manter as cores e somar um sinal que não seja cor (contorno de 1 px, padrão ou rótulo direto). Depois, pôr chart-N / card e chart-N / background ≥ 3 no gate.

#### UI-12 · O FormMessage aparece sem ser anunciado

**Média · esforço P** · WCAG 4.1.3 Mensagens de status (AA) e 3.3.1; regra PiluTech de erro anunciado perto do campo

- **Onde:** `packages/ui/src/form.tsx:143-163` (FormMessage é um `<p>` sem `role` nem `aria-live`) e `:111-121` (FormControl sempre inclui `formDescriptionId` no `aria-describedby`).
- **Evidência:** no envio vazio, o campo recebe `aria-invalid="true"`, o `aria-describedby` aponta para a mensagem e o react-hook-form leva o foco ao primeiro campo inválido: esse erro é lido. Mas a mensagem não tem `role`, `aria-live` nem ancestral vivo, então um erro que surge no `onChange` ou `onBlur` (digitar e apagar) aparece sem anúncio. Num campo sem FormDescription, o `aria-describedby` aponta para `_r_2_-form-item-description`, que não existe.
- **Medir de novo:** `ui/medidas.mjs`, seção 6 (form e formOnChange).
- **Corrigir:** `role="alert"` no FormMessage (ou um contêiner `aria-live=polite` sempre montado). Incluir `formDescriptionId` só quando houver FormDescription, registrando no contexto do FormItem. Teste RTL: `getByRole('alert')` depois do erro e nenhum id órfão.

#### UI-13 · O Skeleton pulsa mesmo com reduzir movimento

**Média · esforço P** · regra PiluTech de reduzir movimento (WCAG 2.3.3, AAA, como referência; o 2.2.2 isenta indicador de carga)

- **Onde:** `packages/ui/src/skeleton.tsx:9` (`animate-pulse` sem `motion-safe`). Usado em 20 arquivos do `apps/web`.
- **Evidência:** `getAnimations()` no Skeleton dá "pulse", 2000 ms, infinito, opacidade 1 → 0,5 → 1. Igual com `reduce` e com `no-preference`.
- **Medir de novo:** `ui/medidas.mjs`, seção 4.
- **Corrigir:** `motion-safe:animate-pulse` (com reduce, fundo parado). Travar em `apps/web/app/(site)/movimento.e2e.ts` ou num teste de classe.

#### UI-15 · Botão com texto longo não quebra linha

**Média · esforço P** · WCAG 1.4.10 Refluxo; regra PiluTech de texto com espaço para crescer cerca de 35%

- **Onde:** `packages/ui/src/button.tsx:18` (`whitespace-nowrap` na base).
- **Evidência:** em 320 px, um Button com 51 caracteres ("Salvar e continuar para a próxima etapa do cadastro") mede 374,8 px, termina em 390,8 e leva a página a 391 px de largura: rolagem horizontal.
- **Medir de novo:** `ui/medidas.mjs`, seção 5 (botao-longo-320 e galeria-320), cena galeria com `&rotulo=…`.
- **Corrigir:** permitir quebra de linha no Button (`whitespace-normal`, `text-center`, `h-auto` com `min-h` no lugar da altura fixa) ou criar uma variante que quebre. Testar com os textos en e es mais longos.

#### UI-16 · O pacote não tem catálogo de textos

**Média · esforço M** · regra PiluTech de localização (nenhum texto fixo; catálogo pt-BR, en e es)

- **Onde:** `packages/ui/src/dialog.tsx:49` ("Close"), `sheet.tsx:82` ("Fechar"), `ajuda.tsx:25` (``aria-label={`Ajuda sobre ${rotulo}`}``, montado por concatenação) e `command.tsx:59-67` ("Suggestions", padrão do cmdk).
- **Evidência:** não há catálogo, contexto de idioma nem prop de rótulo para esses textos. Os quatro textos que o leitor de tela lê estão fixos e misturam idiomas (inglês no Dialog e no Command, pt-BR no Sheet e no Ajuda). O Botaí herda os mesmos textos pelo npm. O FIN-15 conta esses textos como parte da migração do finanças.
- **Medir de novo:** `grep -nE 'sr-only|aria-label|label=' packages/ui/src/*.tsx` e o `ariaSnapshot` das cenas dialog, sheet, command e ajuda.
- **Corrigir:** criar `packages/ui/src/textos/{pt-BR,en,es}.ts` com chaves estáveis (fechar, ajudaSobre, sugestoes, buscar), um provider ou hook (ex.: `TextosUiProvider` com o idioma, pt-BR como padrão) e props para sobrescrever. "Ajuda sobre {rotulo}" vira um modelo do catálogo, sem concatenação no componente.

#### UI-17 · O tooltip do gráfico formata números com o idioma do navegador

**Média · esforço P** · regra PiluTech: números pelo `Intl.NumberFormat` com o idioma do produto

- **Onde:** `packages/ui/src/chart.tsx:265-267` (`item.value.toLocaleString()` sem locale).
- **Evidência:** mesmo app e mesmo dado: navegador pt-BR mostra "4.200,5" e "3.100"; en-US mostra "4,200.5" e "3,100"; es-ES mostra "4200,5" e "3100".
- **Medir de novo:** `ui/medidas.mjs`, seção 7 (chartLocale): passar o mouse na primeira barra com o contexto em pt-BR, en-US e es-ES.
- **Corrigir:** `Intl.NumberFormat(idiomaDoApp)`, lido do contexto de idioma de UI-16, ou uma prop `formatarValor` no ChartTooltipContent.

#### UI-18 · O pacote não tem teste de chaves

**Média · esforço P** · regra PiluTech: teste que falha se uma chave existe num idioma e falta noutro

- **Onde:** `packages/ui/src`.
- **Evidência:** não há `textos/*` nem teste de paridade. Os testes atuais (`ajuda.test.tsx`, `sheet.test.tsx`) fixam o texto pt-BR no seletor.
- **Medir de novo:** `ls packages/ui/src` e busca por testes de idioma.
- **Corrigir:** junto com UI-16, um `textos.test.ts` que compara as chaves de pt-BR, en e es e falha se alguma faltar ou estiver vazia.

#### UI-19 · O pacote não tem testes de acessibilidade

**Média · esforço M** · regra PiluTech de testes (axe nas páginas principais, teclado e `ariaSnapshot` nos componentes ricos)

- **Onde:** `packages/ui` (testes e lint) e `apps/web/.storybook`.
- **Evidência:** não há teste com axe, teste de teclado de DropdownMenu, Dialog ou Command, nem `ariaSnapshot`. Só `ajuda.test` e `sheet.test` testam Esc. `packages/ui/eslint.config.mjs:58-63` liga 6 regras de jsx-a11y, todas como `warn`. O Storybook do web não tem addon-a11y, e o único story do design system é "Design System/Movimento". O `contraste.test.ts` não cobre `--input`, `--border`, accent / popover, ring / primary nem chart-N: justamente os pares reprovados em UI-01, UI-03, UI-04 e UI-11.
- **Medir de novo:** ler `package.json` (scripts), `eslint.config.mjs` e `src/*.test.*`; `grep -rn addon-a11y apps/web`.
- **Corrigir:** teste de componentes com Playwright (ou stories com `@axe-core/playwright`) que repita o harness desta auditoria: zero violações serious ou critical nos dois temas, roteiro de teclado por componente e `ariaSnapshot`. Ampliar o `contraste.test.ts` com os pares não textuais. Subir o jsx-a11y para `recommended` com `error`.

#### UI-09 · O Command não tem nomes acessíveis

**Baixa · esforço P** · WCAG 4.1.2 Nome, função, valor · rebaixado de média na conferência, pelo mesmo motivo do UI-02

- **Onde:** `packages/ui/src/command.tsx:28-38` (CommandDialog sem DialogTitle nem Description), `:40-55` (CommandInput sem `aria-label`) e `:59-67` (CommandList sem rótulo; o cmdk usa "Suggestions"). Sem uso nos apps do monorepo nem no Botaí hoje.
- **Evidência:** o dialog do CommandDialog tem `aria-labelledby` apontando para um id que não existe (`radix-_r_1_`); o `ariaSnapshot` mostra `dialog:` sem nome; o Radix avisa no console "`DialogContent` requires a `DialogTitle`…" e "Missing `Description`…"; axe best-practice `aria-dialog-name`, 1 nó, nos dois temas. O CommandInput é um combobox com `aria-labelledby` para um `<label cmdk-label>` vazio (`combobox [expanded]` sem nome). O CommandList sai como `listbox "Suggestions"`, em inglês e fixo.
- **Medir de novo:** `ui/medidas.mjs`, seção 2; console capturado em `ui/axe.json` (cena command-dialog).
- **Corrigir:** o CommandDialog recebe `titulo` (e `descricao` opcional) e renderiza um DialogTitle `sr-only`. Command, CommandInput e CommandList recebem rótulos do catálogo. Teste com `ariaSnapshot` da cena.

#### UI-14 · Menu longo corta itens em 320×256

**Baixa · esforço P** · WCAG 1.4.10 Refluxo · rebaixado de média na conferência: como no UI-21, hoje nenhum menu dos apps falha

- **Onde:** `packages/ui/src/dropdown-menu.tsx:72` (DropdownMenuContent com `overflow-hidden` e sem altura máxima) e `:54` (SubContent).
- **Evidência:** menu de 12 itens em 320×256: o conteúdo vai de 84 a 624 px, com `overflow-y: hidden` e `scrollHeight` igual ao `clientHeight` (538). O último item (588 a 619 px) fica fora da tela e a roda do mouse não rola (`scrollTop` 0). A captura `ui/cap-menu-longo-320x256.png` mostra só até "Opção 4". O Radix publica `--radix-dropdown-menu-content-available-height`, que o componente não usa. Os dois menus reais cabem em 320×256 (medido na conferência em `/admin`): o menu da conta vai de 56 a 253 px e o menu Tema, de 56 a 162 px.
- **Medir de novo:** `ui/medidas.mjs`, seção 5, cena `?cena=menu-longo` em 320×256.
- **Corrigir:** `max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto` no Content e no SubContent, como no shadcn atual.

#### UI-21 · Sheet longo sai da tela em 320×256

**Baixa · esforço P** · WCAG 1.4.10 Refluxo

- **Onde:** `packages/ui/src/sheet.tsx:50-65` (`sheetVariants` sem altura máxima nem `overflow-y`).
- **Evidência:** Sheet de 14 itens em 320×256. Do lado direito: `overflow-y: visible`, `scrollHeight` 704 contra `clientHeight` 254; o último item (669 a 705 px) não aparece nem com `scrollIntoView`. Embaixo: o painel começa em -474 px, e título, Close e itens 1 a 9 ficam acima da tela (`ui/cap-sheet-bottom-longo-320x256.png`). Hoje nenhum app falha: os 4 usos (`apps/financas/web/src/App.tsx:436`, `blocos/PagarFatura.tsx:377`, `pages/extrato.tsx:1079`, `pages/metas.tsx:625`) acrescentam `max-h-[85vh] overflow-y-auto` por conta própria.
- **Medir de novo:** `ui/medidas.mjs`, seção 5, e `ui/medidas2.mjs`, seção 2.
- **Corrigir:** pôr no componente `max-h-[85dvh] overflow-y-auto overscroll-contain` (em cima e embaixo) e `overflow-y-auto` (nas laterais), como o DialogContent, e tirar a compensação dos 4 usos.

#### UI-22 · Ícones decorativos sem `aria-hidden`

**Baixa · esforço P** · WCAG 1.1.1; regra PiluTech de esconder ícone decorativo

- **Onde:** `packages/ui/src/dialog.tsx:48` e `sheet.tsx:81` (Cross2Icon), `dropdown-menu.tsx:41` (ChevronRightIcon), `:115` (CheckIcon), `:138` (DotFilledIcon) e `command.tsx:45` (MagnifyingGlassIcon).
- **Evidência:** o `ariaSnapshot` mostra `- img` sem nome dentro do Close do Dialog e do Sheet, dentro dos itens de marcar do menu e solto ao lado do campo do Command. Dentro de botões o efeito é pequeno; no Command, o `img` solto vira uma parada sem nome no modo de leitura.
- **Medir de novo:** `ui/medidas.mjs`, seção 2.
- **Corrigir:** `aria-hidden="true"` (e `focusable="false"`) em todos esses ícones.

#### UI-23 · O campo do Command não mostra foco

**Baixa · esforço P** · WCAG 2.4.7 (o cursor piscando ajuda, mas a regra PiluTech pede indicador)

- **Onde:** `packages/ui/src/command.tsx:44-54` (CommandInput com `outline-hidden`, sem `focus-within` no contêiner).
- **Evidência:** focado, nos dois temas: `:focus-visible` verdadeiro, `outline-style: none`, `box-shadow: none`, borda 0. O único sinal é o cursor de texto.
- **Medir de novo:** `ui/medidas.mjs`, seção 3 (foco do command-input).
- **Corrigir:** `focus-within:ring-2 focus-within:ring-ring` (ou borda na cor do ring) no `[cmdk-input-wrapper]`.

#### UI-24 · O popover do Ajuda não tem nome

**Baixa · esforço P** · WCAG 4.1.2 (`role=dialog` sem nome)

- **Onde:** `packages/ui/src/ajuda.tsx:43-46` (Content sem `aria-label` nem `aria-labelledby`).
- **Evidência:** aberto, sai como "dialog: Agrupa as despesas no orçamento." sem nome; axe best-practice `aria-dialog-name`, 1 nó, nos dois temas. O gatilho tem nome e `aria-expanded` corretos.
- **Medir de novo:** `ui/axe.json` (cena ajuda, boas práticas) e `ui/medidas.mjs`, seção 2.
- **Corrigir:** `aria-label` no Content com o mesmo texto do gatilho ("Ajuda sobre {rotulo}", do catálogo) ou `aria-labelledby` apontando para o gatilho.

#### UI-25 · Com o menu aberto, o gatilho fica focável dentro de `aria-hidden`

**Baixa · esforço P** · WCAG 4.1.2 (axe `aria-hidden-focus`); meta PiluTech de zero violações serious

- **Onde:** `packages/ui/src/dropdown-menu.tsx:13-15` (DropdownMenu é o Root do Radix, modal por padrão).
- **Evidência:** com o menu aberto, axe `aria-hidden-focus` (serious), 1 nó, nos dois temas: o `#root` recebe `aria-hidden=true` com o gatilho ainda alcançável por Tab dentro dele. O Radix prende o Tab no menu, então o efeito prático é baixo, mas a violação vai barrar um gate de axe com zero serious.
- **Medir de novo:** `ui/axe.mjs`, cena menu.
- **Corrigir:** decidir entre `modal={false}` como padrão (o foco volta ao gatilho e nada fica com `aria-hidden`) ou manter e documentar a exceção no futuro teste de axe, com o motivo.

#### UI-26 · Animações contínuas definidas e sem uso

**Baixa · esforço P** · regra PiluTech de reduzir movimento (sem animação contínua)

- **Onde:** `packages/ui/src/styles.css:104-115` (`@keyframes visit-card-3d-wobble` e `--animate-visit-card-3d`, 7 s infinito) e `:81-102` (accordion-down e accordion-up animam a altura).
- **Evidência:** os tokens geram as classes `animate-visit-card-3d` (rotação 3D infinita) e `animate-accordion-*`, sem guarda de reduzir movimento. Nenhum app usa (a busca só acha a definição). É um risco para o futuro.
- **Medir de novo:** `grep -rn 'visit-card-3d\|accordion-' apps packages --include=*.tsx`.
- **Corrigir:** remover os tokens sem uso ou documentar que só valem com o prefixo `motion-safe:`.

### 4.2 `apps/web`, transversal (site e `/admin`)

#### WEB-01 · Corpo do post e pré-visualização ficam ilegíveis no tema claro

**Alta · esforço P** · WCAG 1.4.3 Contraste mínimo (AA), texto principal · junta ADM-03

- **Onde:** `apps/web/app/(site)/posts/[slug]/page.tsx:116` (`prose prose-invert post-prose`) e `apps/web/components/admin/posts/mdx-preview.tsx:19` (mesma classe, abas Pré-visualizar e Dividir do editor em `/admin/posts/novo` e `/admin/posts/[slug]`).
- **Evidência:** o `prose-invert` sem condição faz o tema claro usar as cores do escuro.
  - **Post:** um bloco com as mesmas classes, injetado em `/privacidade` no build de produção, tema claro (fundo #f7f9fc): parágrafos, listas e células em #d1d5dc dão **1,39:1**; h2, h3, negrito e cabeçalho de tabela em #ffffff dão **1,05:1**. axe `color-contrast` em 7 nós no claro e 0 no escuro.
  - **Pré-visualização:** MDX real, serializado com o next-mdx-remote do repo: h1, h2 e negrito #ffffff dão 1,05:1; parágrafos e listas #d1d5dc dão 1,39:1. axe em 6 nós no claro e 0 no escuro.
  - Links, código e citação passam, porque o `.post-prose` os sobrescreve.
- **Medir de novo:** tema Light e axe num post ou na aba Pré-visualizar. Scripts: `web-publico/interacoes.cjs` (passo post-prose-sintetico, captura `interacoes-post-light.png`) e `web-admin/medir-preview.mjs` (`preview-medido.json`, `shots/preview-light.png`). No código: procurar `prose-invert` sem o prefixo `dark:`.
- **Corrigir:** `dark:prose-invert` nos dois lugares, ou ligar as variáveis `--tw-prose-*` aos tokens (foreground e muted-foreground) nos dois temas. E2E com axe no post e na pré-visualização, nos dois temas.

#### WEB-16 · O `apps/web` não tem testes de acessibilidade

**Média · esforço M** · regra PiluTech de testes (`@axe-core/playwright` com zero serious ou critical, teclado e `ariaSnapshot`) · junta ADM-24

- **Onde:** `apps/web/package.json` (sem `@axe-core/playwright`), os `*.e2e.ts` e os testes Jest. O `apps/web/CLAUDE.md:523` registra "sem axe, porque o web não tem o `@axe-core/playwright`".
- **Evidência:** nenhum E2E roda axe e nenhum teste usa Tab, Enter ou Esc no Kanban, nos menus, nos diálogos ou nas listas do admin. O axe-core 4.11.1 só é dependência do `apps/pilutech-site`. Os 10 testes Jest do admin usam `querySelector` (0 `getByRole` ou `getByLabelText`). Por isso WEB-01 a WEB-04, ADM-01, ADM-05 e ADM-12 passaram com o CI verde.
- **Medir de novo:** `grep '@axe-core' apps/web/package.json`, `grep -l axe` nos `*.e2e.ts` e `grep getByRole` nos testes do admin.
- **Corrigir:** adicionar o `@axe-core/playwright` (versão exata, seguindo a política de dependências da raiz) e um E2E com axe nos dois temas em `/`, `/tools/*`, `/tasks`, `/privacidade`, um post, o Votaí e as rotas do admin com a API mockada (o `web-admin/lib.mjs` desta auditoria serve de base). Somar testes de teclado do Kanban, dos menus e das listas do admin (WEB-02, ADM-01, ADM-02, ADM-05, ADM-09). Atualizar a linha do `apps/web/CLAUDE.md`.

#### WEB-17 · Textos de interface fixos no código, sem catálogo

**Média · esforço G** · regra PiluTech: nenhum texto fixo; catálogo por idioma com chaves estáveis · junta ADM-26

- **Onde:** JSX do site e do admin (`app/(site)`, `app/(admin)`, `components/admin`, `components/votacao/admin`); `lib/tools-registry.ts`, `lib/rotas-publicas.ts`, `lib/politica-de-privacidade.ts` e a `metadata` das páginas; mensagens em `lib/admin/content-schemas.ts:43-70`, `lib/admin/post-schema.ts:7-20` e `lib/votacao/api-client.ts`.
- **Evidência:** contagem pela AST do TypeScript, sem testes nem stories (texto de JSX, atributos como `aria-label`, `placeholder`, `alt`, `title`, `label`, e mensagens de toast ou `Error`):
  - **site:** 264 textos fixos (home e comuns 61, ferramentas 67, tasks 30, Votaí público 73, feed 13, posts 10, PiluLabs 8, privacidade 2), mais os 9 títulos e descrições do `TOOLS`, as descrições de `rotas-publicas.ts`, a política inteira e títulos como "Mini Kanban" e "Ferramentas";
  - **admin:** pelo menos 256 em 48 de 61 arquivos (`pilulabs-form.tsx` 20, `admin/page.tsx` 16, `carreira-form.tsx` 13, `profile-form.tsx` 12), sem contar os vetores de rótulos (`GROUPS`, `CRUMB`, `TABS`, `BUTTONS`, `MODOS`, `FILTERS`) nem as mensagens do zod ("Obrigatório", "Slug inválido…").
  - Não há biblioteca de i18n no `package.json` (next-intl, i18next, lingui), nem en, es ou troca de idioma.
- **Medir de novo:** `web-publico/contar-textos.cjs` e `web-admin/contar-textos.mjs`.
- **Corrigir:** criar o catálogo pt-BR (origem) com chaves estáveis (`textos/pt-BR.ts`, `en.ts`, `es.ts`), com o idioma do navegador e troca manual. Migrar por área em PRs pequenos: no site, home → ferramentas → Votaí → tasks → feed → posts; no admin, login → shell → coleções → editor; validação por chave. Revisar en e es como texto de produto, sem traduzir nomes como Votaí e PiluLabs.

#### WEB-19 · Textos em inglês dentro de páginas em pt-BR

**Média · esforço P** · WCAG 3.1.2 Idioma das partes (AA) e regra PiluTech de textos do catálogo · junta ADM-29 (o "Close" do Dialog está em UI-08)

- **Onde:** `components/mode-toggle.tsx:44-50` (Light, Dark, System); `components/ui/sonner.tsx` (sem `containerAriaLabel` nem `closeButtonAriaLabel`); `components/kanban/kanban-board.tsx:130` e `components/admin/content/sortable-list.tsx` (DndContext sem `accessibility.announcements` nem `screenReaderInstructions`); `lib/tools-registry.ts` ("Encode e decode UTF-8"); `components/kanban/tag-manager-dialog.tsx` ("Preview:").
- **Evidência:** medido no navegador, sempre dentro de `lang=pt-BR` e sem `lang="en"`:
  - itens do menu Tema `['Light','Dark','System']`, no site e no admin;
  - região de toasts com `aria-label` "Notifications alt+T" (e o padrão "Close toast");
  - instruções do dnd-kit "To pick up a draggable item, press the space bar…" no Kanban e nas listas do admin;
  - região viva do Kanban: "Draggable item k1 was moved over droppable area k1.".
- **Medir de novo:** `web-publico/interacoes.cjs` (home-menu-tema, tasks-teclado, votai-voto-teclado); `web-admin/medir-login.mjs` e `medir-interacoes.mjs` (reordenarPiluLabs.linhas, toast.regiao).
- **Corrigir:** "Claro", "Escuro" e "Sistema" no menu; `containerAriaLabel="Notificações"` e `closeButtonAriaLabel` no Toaster; `accessibility={{ announcements, screenReaderInstructions }}` em pt-BR nos DndContext. Quando o catálogo existir (WEB-17), esses textos passam a vir dele.

#### WEB-20 · Datas, números e unidades montados à mão

**Média · esforço M** · regra PiluTech: datas e números pelo `Intl` com o idioma ativo, plural pelo `Intl.PluralRules`, fuso explícito quando importa · junta ADM-27

- **Onde, no site:**
  - `lib/home/carreira-log.ts:1-40` (vetor `MESES` e "atualmente" montados à mão, leitura de texto livre);
  - `components/votacao/results-list.tsx:85` e `historico-resultado.tsx:112` (`toFixed(0)` + "%");
  - `lib/votacao/historico.ts:45` e `components/feed/feed-load-more.tsx:23` (plural à mão);
  - `app/(site)/posts/[slug]/page.tsx:60` (`toLocaleDateString('pt-BR')` sem `timeZone`);
  - `components/votacao/session-card.tsx:40` e `app/(site)/votacao/[id]/page.tsx:97` (`toLocaleString('pt-BR')`);
  - `Intl` com "pt-BR" fixo em `components/feed/feed-post-card.tsx:13`, `lib/llms.ts:48` e `lib/votacao/historico.ts:33`.
- **Onde, no admin:**
  - `components/votacao/admin/users-table.tsx:38` (`toLocaleDateString('pt-BR')` sem `timeZone`) e `backups-panel.tsx:45`;
  - `lib/votacao/format-bytes.ts:7-11` (`toFixed`) e `components/admin/media/media-card.tsx:7-9` ("KB" à mão);
  - `components/admin/posts/posts-table.tsx:41` (`publishedAt.slice(0,10)`);
  - `components/admin/passkeys/passkeys-panel.tsx:21-24` ("pt-BR" e `America/Sao_Paulo` fixos);
  - `app/(admin)/admin/page.tsx:134` ("min").
- **Evidência:** nenhum ponto usa o idioma ativo.
  - Carreira: "mar. 2024 – atualmente" sai concatenado.
  - Percentual sai como `${n}%`, mas o es-ES usa "50 %".
  - Post: a data só de dia é lida como UTC e formatada no fuso do processo. A Vercel roda em UTC; um build em UTC−3 mostraria o dia anterior.
  - Admin, medido em `/admin/sessoes` com fuso `America/Sao_Paulo`: o usuário criado em `2026-05-01T00:00:00.000Z` aparece como "30/04/2026" (um dia antes) e o de 02/05 como "01/05/2026".
  - O backup aparece "1.1 MB", com ponto decimal em pt-BR (o `sessoes.e2e.ts` fixa "1.1 MB"). Mídia mostra "117 KB". A lista de posts mostra a data ISO crua ("2025-04-28").
  - Passkeys usa `Intl` ("Criada em 1 de out. de 2026"), mas com idioma e fuso fixos.
- **Medir de novo:** `grep -rnE "toLocale|Intl\.|toFixed|padStart|MESES"` nas áreas citadas; `web-admin/medir-interacoes.mjs` (sessoes.datas e midia.tamanhos).
- **Corrigir:** um módulo de formatação que recebe o idioma (`formatarData`, `formatarPercentual`, plural, unidades com `Intl.NumberFormat` e `style: 'unit'`), com `timeZone: 'America/Fortaleza'` quando a data é de Teresina e UTC para data só de dia. A carreira passa a ter datas estruturadas (ano e mês) no CMS. Atualizar o teste que fixa "1.1 MB".

#### WEB-22 · Não há teste de chaves

**Média · esforço P** · regra PiluTech: teste que falha se uma chave existe num idioma e falta noutro · junta ADM-30

- **Onde:** `apps/web`.
- **Evidência:** não há `textos/*.ts` nem teste de paridade de chaves ou de formatação por idioma.
- **Medir de novo:** procurar por `textos/` e por testes de i18n.
- **Corrigir:** junto com WEB-17, um Jest que compara as chaves de pt-BR, en e es (inclusive as aninhadas e os marcadores de interpolação) e falha se faltar alguma ou se o valor estiver vazio.

#### WEB-25 · Transições que sobram com reduzir movimento

**Baixa · esforço P** · regra PiluTech: com reduzir movimento, transições instantâneas · junta ADM-23

- **Onde:** hover de cor do Button do `packages/ui` (`transition-[color,…] duration-150`) e `transition-colors` em links e cards; `components/admin/content/fields.tsx:105-113` (bolinha do switch com `transition-transform`); `components/admin/transcricao/transcricao-job.tsx:102-104` (largura da barra, 500 ms); `components/mode-toggle.tsx:36-37` (ícones com `transition-all`, rotate e scale).
- **Evidência:** com `reduce`, de 5 a 23 elementos por página do site mantêm transição de 150 ms (home: 23; cor, fundo e borda) e 16 em `/admin/posts`, quase todos de cor. As transições de deslocamento listadas acima não têm `motion-reduce` (leitura de código). A escala do botão pressionado já é `motion-safe`.
- **Medir de novo:** campo movimentoReduzido.comTransicao em `web-publico/resultados/*.json`; `web-admin/medir-paginas.mjs` (reducedPosts).
- **Corrigir:** uma regra global no `packages/ui`, `@media (prefers-reduced-motion: reduce) { *, ::before, ::after { transition-duration: 0.01ms !important } }`, ou `motion-reduce:transition-none` nesses elementos.

### 4.3 `apps/web`, site público e Votaí

#### WEB-02 · O cartão do Kanban não abre pelo teclado

**Alta · esforço M** · WCAG 2.1.1 Teclado (A) e 2.5.7 Movimentos de arrastar (AA)

- **Onde:** `/tasks`: `components/kanban/kanban-card.tsx:47-55` (os listeners do dnd-kit ficam no contêiner e o `onClick` só no Card) e `components/kanban/kanban-board.tsx:46` (KeyboardSensor sem `coordinateGetter`; o DndContext fica na `:130`).
- **Evidência:** o cartão `[data-card-id=k1]` tem `role=button`, `tabindex=0` e `aria-roledescription=sortable`, e nenhum botão ou link focável dentro. Com ele focado, Enter não abre diálogo (0 diálogos) e a região viva anuncia "Draggable item k1 was moved over droppable area k1."; Espaço dá o mesmo. Com clique, abre 1 diálogo. Editar, excluir, links e tags do cartão só funcionam com mouse. Mover um cartão de coluna e reordenar colunas também só existem por arrasto: `MOVE_CARD` e `REORDER_COLUMNS` só são disparados no `handleDragEnd` (`kanban-board.tsx:65`), e o modal do cartão não tem campo de coluna. Sem alternativa de clique simples, falha o 2.5.7 (acrescentado na conferência).
- **Medir de novo:** focar `[data-card-id]`, apertar Enter e Espaço e contar `[role=dialog]` (`web-publico/interacoes.cjs`, passo tasks-teclado; `conferencia/site.cjs`).
- **Corrigir:** um botão "Editar" próprio no cartão, ou uma alça de arrasto separada. `sortableKeyboardCoordinates` no KeyboardSensor. Um campo "Coluna" no modal (ou botões "Mover para…") como alternativa sem arrastar. E2E de teclado: Tab, Enter abre, Esc fecha, setas movem.

#### WEB-03 · O modal do cartão tem controles sem nome

**Alta · esforço P** · WCAG 4.1.2 (A), 1.3.1 e 3.3.2 Rótulos (A), 1.4.1 Uso de cor (A)

- **Onde:** `components/kanban/card-modal.tsx`: `:147-154` (remover link), `:137-145` (campos de link), `:134` e `:168` (rótulos "Links" e "Tags" sem `htmlFor`) e `:172-186` (botões de tag).
- **Evidência:** com o modal aberto num cartão com 1 link, axe `button-name` (critical) em 1 nó: o botão de remover link só tem o ícone. Os dois campos de link não têm `<label>`, `aria-label` nem `aria-labelledby`, só os textos de exemplo "URL (https://...)" e "Texto de exibição (opcional)". No código, os botões de tag não têm `aria-pressed`, e o estado só aparece por `opacity-40` ou `ring-2`.
- **Medir de novo:** abrir um cartão com link, rodar o axe no diálogo e listar os campos sem rótulo (passo tasks-teclado).
- **Corrigir:** `aria-label="Remover link N"` no botão, rótulo visível ou `aria-label` em cada campo, `aria-pressed` nos botões de tag e `fieldset` com `legend` para Links e Tags.

#### WEB-04 · O cabeçalho da coluna é um botão com botões dentro

**Média · esforço P** · WCAG 4.1.2 (A) e 2.5.8 Tamanho do alvo (AA)

- **Onde:** `/tasks`, cada coluna: `components/kanban/kanban-column.tsx:75` (div com os `{...attributes} {...listeners}` do sortable em volta do ColumnHeader).
- **Evidência:** nos dois temas, axe `nested-interactive` (serious) em 2 nós: a div `role=button` contém 2 botões (título e "Deletar coluna"). axe `target-size` (serious) em 4 nós: a alça de arrasto fica com área livre de 246×12 px e o botão do título com 226×20, sem espaçamento. São os únicos 2 alvos do site abaixo de 24 px sem a exceção de espaçamento.
- **Medir de novo:** axe com a tag `wcag22aa` em `/tasks` com pelo menos uma coluna.
- **Corrigir:** tirar o papel de botão do contêiner e criar uma alça própria ("Mover coluna X", 44 px) com `setNodeRef` e `setActivatorNodeRef` do dnd-kit. Título e "Deletar" ficam como irmãos da alça.

#### WEB-05 · Texto branco sobre as cores de tag

**Média · esforço P** · WCAG 1.4.3 (AA)

- **Onde:** `/tasks`: `components/kanban/tag-badge.tsx:13` (`text-white` fixo) com a paleta `TAG_COLORS` de `lib/kanban-schema.ts:76-87`.
- **Evidência:** texto branco de 12 px sobre as 10 cores: amarelo `hsl(55 80% 50%)` 1,52:1, âmbar 2,14, ciano 2,27, verde 2,32, teal 2,53, laranja 2,94 e rosa 4,17. Passam azul (5,50), vermelho (4,80) e roxo (4,54). No build, o axe acusa 2 nós nos dois temas: #ffffff sobre #e6d51a = 1,51 e #ffffff sobre #22c35d = 2,32. 7 das 10 cores reprovam.
- **Medir de novo:** `web-publico/contraste-tokens.cjs` (seção Tags) ou axe em `/tasks` com tags dessas cores.
- **Corrigir:** escolher a cor do texto (quase preto ou branco) pela luminância da tag, ou escurecer a paleta. Um Jest que mede cada cor de `TAG_COLORS`.

#### WEB-06 · Selos, aviso do JWT e erro do Halloween abaixo de 4,5:1

**Média · esforço P** · WCAG 1.4.3 (AA) · junta UI-20 (escopo `.halloween`)

- **Onde:**
  - tema claro: selo "Vencedor" (`text-win` sobre `bg-win/15`) em `components/votacao/results-list.tsx:121` e `:126` e `historico-resultado.tsx:134`; selo "seu voto" (`text-ok` sobre `bg-ok/15`) em `results-list.tsx:136`; aviso do JWT em `components/tools/jwt-tool.tsx:26`;
  - Halloween: `apps/web/app/globals.css:124-191` (o escopo `.halloween` redefine os tokens; `--destructive: 0 78% 52%` na `:142`), usado por `components/votacao/halloween-scope.tsx`.
- **Evidência:**
  - axe no tema claro: em `/anteriores/12` e `/1` encerrada, `.text-win` #7a5cd6 sobre #d4cdf1 dá **3,18:1** (12 px); em `/1` encerrada, o selo `bg-ok/15` dá #1b7957 sobre #c6d2de = 3,48:1; em `/tools/jwt`, #bb4d00 sobre #f8efe3 = 4,41:1 (12 px). No escuro, nenhuma violação nessas páginas.
  - Pelos tokens, reprovam também win sobre muted (4,28) e destructive sobre muted (4,46), no claro.
  - Halloween: o texto destructive (FormMessage, erros) dá 4,35:1 sobre background (#e42525 sobre #0c0712) e 4,11:1 sobre card e popover; o script do site mediu de 3,34 a 4,35 entre as superfícies do escopo. Os outros pares de texto do Halloween passam (foreground 17,18; muted-foreground 8,04 ou mais; primary-foreground sobre primary 7,50). As falhas não textuais do Halloween estão em UI-01, UI-03 e UI-04. Nenhum teste mede esse escopo.
- **Medir de novo:** axe no tema claro nas rotas citadas; `web-publico/contraste-tokens.cjs`; `ui/contraste-halloween.txt` (o bloco `.halloween` medido no lugar do `.dark`).
- **Corrigir:** escurecer `--win` e `--ok` no `:root`, ou subir a opacidade ou trocar o fundo dos selos; `text-amber-800` no aviso do JWT; clarear o `--destructive` do `.halloween` até 4,5 sobre card (ex.: `0 85% 62%`, a conferir). Exportar do pacote `lerTokensPorTema` e `contrasteEntreTokens` para o web rodar o mesmo gate nos escopos dele, e ampliar o `contraste.test.ts` para fundos translúcidos.

#### WEB-09 · As ferramentas mostram erro e resultado sem anunciar

**Média · esforço P** · WCAG 4.1.3 Mensagens de status (AA), 3.3.1 Identificação do erro (A) e 1.3.1 (A)

- **Onde:** `components/tools/cpf-tool.tsx:68-75`, `cnpj-tool.tsx`, `json-tool.tsx` (erro e o "Resultado" na `:103`), `base64-tool.tsx:65`, `jwt-tool.tsx:45`, `qr-reader-tool.tsx:88-97` e `roleta-tool.tsx:68`.
- **Evidência:** com entrada inválida, "CPF inválido ✗", "Unexpected end of JSON input", "Token inválido: não foi possível…", "Erro ao acessar a câmera." e o resultado da roleta "🎉 Pizza" ficam fora de qualquer região viva. O campo de CPF fica sem `aria-invalid` e sem `aria-describedby`. CPF e CNPJ não têm `inputmode`. Com o resultado do JSON na tela, axe `label` (critical) em 1 nó: o textarea de saída tem um `<Label>` sem `htmlFor`. Na área pública, só o banner de pré-visualização tem `role=status`.
- **Medir de novo:** passos tools-erros e roleta-reduzido do `web-publico/interacoes.cjs` (`closest('[aria-live],[role=alert],[role=status]')`).
- **Corrigir:** `role=alert` (erro) ou `role=status` (resultado) num contêiner que já existe na página; `aria-invalid` e `aria-describedby` no campo; `inputmode="numeric"` em CPF e CNPJ; `htmlFor` e `id` no "Resultado".

#### WEB-10 · O filtro do feed muda só de cor

**Média · esforço P** · WCAG 1.4.1 Uso de cor (A) e 4.1.2 (A)

- **Onde:** `/feed`: `components/feed/feed-filters.tsx:31-60`.
- **Evidência:** o botão "devops" passa de fundo rgb(15,20,31) e texto rgb(148,160,179) para fundo rgb(167,172,180) e texto rgb(50,56,65) ao ser escolhido. `aria-pressed` fica nulo antes e depois: o leitor de tela não sabe qual filtro está ativo. A página tem `noindex` e não tem link no site, por isso média.
- **Medir de novo:** passo feed-filtros do `web-publico/interacoes.cjs` (`/api/feeds` mockado).
- **Corrigir:** `aria-pressed` nos botões e uma marca além da cor (ícone de check ou borda).

#### WEB-11 · Animações infinitas sem pausa

**Média · esforço P** · WCAG 2.2.2 Pausar, parar, ocultar (A) e regra PiluTech de conteúdo que troca sozinho ter pausa

- **Onde:** home: `components/home-kubectl.tsx` e `app/globals.css:374-387` (home-pendente e home-rodando, 6 s infinito; home-piscar, 1 s infinito); `/tools` e `/pilulabs`: `app/(site)/tools/page.tsx:26` e `app/(site)/pilulabs/page.tsx:46` (`animate-pulse`); Votaí Halloween: `globals.css:320-336`.
- **Evidência:** sem reduzir movimento, a home tem 11 animações infinitas: 10 do kubectl alternando "Pending" e "Running" a cada 6 s e o cursor piscando a cada 1 s. `/tools` e `/pilulabs` têm um pulse de 2 s infinito. `/anteriores/13` tem 19 animações infinitas (morcegos, asas, fantasmas, névoa). Tudo começa sozinho, dura mais de 5 s, fica ao lado do conteúdo e não tem pausa. A home e o Halloween param com reduzir movimento (seção 6).
- **Medir de novo:** `document.getAnimations()` filtrando `iterations === Infinity` (campo movimentoPadrao em `web-publico/resultados/*.json`).
- **Corrigir:** parar o kubectl e o cursor depois de 1 ou 2 ciclos, ou pôr um botão "pausar animações". No Halloween, limitar a duração ou oferecer pausa.

#### WEB-12 · Cursor e roleta ignoram reduzir movimento

**Média · esforço P** · regra PiluTech de reduzir movimento; WCAG 2.3.3 (AAA) como referência

- **Onde:** cursor de `/tools` e `/pilulabs` (`app/(site)/tools/page.tsx:26` e `pilulabs/page.tsx:46`); roleta em `components/entropy/roulette-wheel.tsx:117-123` (transição inline de 4000 ms), usada em `/tools/roleta`, no desempate e na roleta do Votaí.
- **Evidência:** com `reduce`, `/tools` e `/pilulabs` mantêm 1 animação "pulse" infinita de 2000 ms. Em `/tools/roleta`, depois de "Girar só com aleatório do navegador", roda uma transição `transform` de 4000 ms. No código, o `aria-label` da roda (`roulette-wheel.tsx:111-116`) já diz "vencedor: X" no começo do giro.
- **Medir de novo:** passo roleta-reduzido do `web-publico/interacoes.cjs` e movimentoReduzido em `resultados/tools.json` e `pilulabs.json`.
- **Corrigir:** `motion-safe:animate-pulse`. Na roleta, ler `prefers-reduced-motion` e parar direto (sem transição ou com 200 ms no máximo). Só pôr o vencedor no `aria-label` e na região viva quando a roda parar.

#### WEB-13 · Alvos do site abaixo de 44

**Média · esforço M** · regra PiluTech de 44×44 (o WCAG 2.5.8 só falha no Kanban, WEB-04)

- **Onde:** links de voltar (`components/page-top-bar.tsx`), rodapé da home (`components/home-footer.tsx`), Kanban (`board-header`, `add-card-button` e "Deletar coluna" `h-7 w-7` em `column-header.tsx`) e filtros do feed (`feed-filters.tsx`). O Button do pacote está em UI-05.
- **Evidência:** em 22 estados de página a 1280 px (iguais a 390), 79 de 140 interativos têm menos de 44 px:
  - 42 com 36 px: o Button do pacote (UI-05);
  - 21 com 20 px: "Paulo Victor" 126,3×20, "Ferramentas" 114,4×20, "Votaí" 67,5×20, "Votações anteriores" 185,1×20;
  - 5 com 32 px: Exportar, Importar, Tags, Adicionar card;
  - 4 com 26 px: filtros do feed;
  - 4 com 16 px: `/tools`, `/tasks`, `/pilulabs` e `/privacidade` no rodapé da home;
  - 2 com 28×28: Deletar coluna.
  - À parte, 6 links dentro de texto corrido (exceção do 2.5.8), entre eles "Reapho" 59,5×21, "Votações anteriores" 152,9×21, os dois help@pilutech.com.br e o link da Vercel em `/privacidade` (21 px).
- **Medir de novo:** função `alvos()` do `web-publico/medir.cjs` (campos alvos1280 e alvos390).
- **Corrigir:** depois de UI-05, `min-h-11` com padding nos links do PageTopBar e do rodapé, nos filtros do feed e nas ações do Kanban. Travar com um E2E que mede a caixa.

#### WEB-14 · `/tasks` e `/anteriores` rolam para o lado em 320 px

**Média · esforço P** · WCAG 1.4.10 Refluxo (AA)

- **Onde:** `components/kanban/board-header.tsx:39-70` (título e três botões numa linha só); `app/(site)/votacao/anteriores/page.tsx:59-81` (navegação das páginas).
- **Evidência:** `/tasks`: a página fica com 404 px numa janela de 320, com "Tags" terminando em 404 px. O quadro rola para o lado por ser conteúdo 2D, mas o cabeçalho não deveria. `/anteriores`: 342 px, com "Mais antigas" terminando em 342 (`resultados/capturas/votai-anteriores-320.png`). Os outros 20 estados não rolam em 320.
- **Medir de novo:** janela de 320×800 e `document.documentElement.scrollWidth > clientWidth` (campo reflow320).
- **Corrigir:** `flex-wrap` no cabeçalho do Kanban e na navegação das páginas, ou empilhar abaixo de `sm`. Pôr no E2E a mesma trava de 320 px que já existe no `votacao.e2e.ts` e no `privacidade.e2e.ts`.

#### WEB-15 · A home usa tamanhos em px e corta texto a 200%

**Média · esforço M** · regra PiluTech de texto a 200% sem cortar nem sobrepor (o WCAG 1.4.4 passa pelo zoom)

- **Onde:** `components/bio.tsx:45` (`text-[32px]` e `[@media(max-height:820px)]:text-[28px]`) e `:72` (`text-[13px]`); `components/home-kubectl.tsx:16` (`text-[11.5px]`); `home-bento-layout.tsx:28` e `:101` (`text-[11px]`, `text-[15px]`); `home-cards.tsx:15` e `:112` (`text-[11px]`); `job-card.tsx:31` (`text-[13px]`); a coluna esquerda com `xl:overflow-y-auto` em `app/(site)/page.tsx:58`.
- **Evidência:** com o `font-size` do `<html>` a 200% em 1280 px, 56 de 121 elementos de texto da home não crescem. Há corte e sobreposição (`teste/capturas/home-texto200.png`): nome, cargo, "whoami --role" e bio cortados na coluna esquerda; "detalhes →" por cima do nome da empresa na carreira; 6 status de apps truncados ("teste …", "Somb…"). No feed, 12 títulos e resumos ficam cortados por `line-clamp`. Nas outras 20 páginas, nenhum elemento fixo. Com zoom de 200% (640 CSS px a 2×), não há rolagem para o lado em `/`, `/tools`, `/tasks`, `/privacidade` e `/pilulabs`.
- **Medir de novo:** função `texto200` do `web-publico/medir.cjs` e as capturas `*-texto200.png`.
- **Corrigir:** trocar os `text-[Npx]` por rem (`text-xs`, `text-[0.6875rem]` etc.). Deixar a coluna esquerda crescer em vez de rolar e quebrar o título da carreira em vez de sobrepor o "detalhes →".

#### WEB-18 · Não há rotas por idioma nem `hreflang`

**Média · esforço G** · regra PiluTech: sites com `/`, `/en/` e `/es/`, `hreflang` e `lang` certos, idioma do navegador com troca manual

- **Onde:** `app/layout.tsx` (`<html lang="pt-BR">` e `openGraph.locale: 'pt_BR'` fixos), `app/sitemap.ts`; não existem `/en` nem `/es`.
- **Evidência:** as 22 páginas medidas têm `lang=pt-BR` e 0 `link[hreflang]`. Não há detecção de `Accept-Language` nem de `navigator.language`, nem seletor de idioma. O sitemap lista só as URLs em pt.
- **Medir de novo:** campo `estrutura_*.hreflang` em `web-publico/resultados/*.json`; `curl http://localhost:<porta>/ | grep hreflang`.
- **Corrigir:** segmento `[lang]` (ou next-intl) com pt-BR na raiz e `/en` e `/es`; `alternates.languages` na `metadata` (hreflang e `x-default`); `lang` do `<html>` pelo segmento; sitemap com as alternativas; seletor de idioma ao lado do Tema.

#### WEB-21 · O conteúdo do CMS existe só em pt-BR

**Média · esforço G** · regra PiluTech: todo produto sai em pt-BR, en e es

- **Onde:** `keystatic.config.ts` e `content/` (perfil, carreira, PiluLabs, redes), os posts do repositório piluvitu-blog e `lib/politica-de-privacidade.ts`.
- **Evidência:** bio, cargo, atribuições da carreira, datas em texto livre ("Mar, 2024 - Atualmente"), descrições do PiluLabs, `socialDescription` ("Acesse o meu Github", "Segue no GranGran"), a política e os posts só têm campo em pt-BR. O `llms.txt` e o `llms-full.txt` saem só em pt-BR.
- **Medir de novo:** ler os campos de `keystatic.config.ts` e os `content/*.yaml`.
- **Corrigir:** definir com o Paulo o que precisa sair em en e es (perfil, carreira, PiluLabs e política, sim; posts, talvez não). Criar campos ou coleções por idioma, com pt-BR como reserva.

#### WEB-23 · O Votaí não tem `llms.txt` próprio

**Baixa · esforço P** · regra PiluTech: todo site público serve o próprio `/llms.txt`, gerado no build

- **Onde:** host `votai.piluvitu.com.br` (`lib/votai.ts`, `decidirRota`) e `lib/llms.ts`.
- **Evidência:** no host do Votaí, `/llms.txt` e `/robots.txt` dão 404 no build local (`curl -H 'Host: votai.localhost:3401'`). Em produção, a regra leva os dois em 308 para `piluvitu.com.br` (não exercitado). O `llms.txt` do site não cita o Votaí nem o `/anteriores`, que é indexável. O `llms.txt` do site cumpre o formato (seção 6).
- **Medir de novo:** `curl -H 'Host: votai.localhost:<porta>' http://localhost:<porta>/llms.txt` e `grep -i votai lib/llms.ts`.
- **Corrigir:** dar ao Votaí o próprio `/llms.txt` (o que é e o histórico público, sem dado de quem votou), liberado no `decidirRota`, ou ao menos uma entrada "Votaí" no `llms.txt` do site.

#### WEB-24 · Landmarks, cabeçalhos e títulos de página

**Baixa · esforço P** · WCAG 1.3.1 (A), 2.4.1 (A, atendido pelos cabeçalhos) e 2.4.2 (A); boas práticas do axe

- **Onde:** `app/(site)/votacao/layout.tsx` (devolve os filhos sem `<main>`); `app/(site)/page.tsx:55-73` (`<main id=profile>` só na Bio; apps, carreira e blog num `<aside>`); `app/(site)/tools/layout.tsx:4` (o título "Ferramentas" quebra o modelo); `app/(site)/feed/layout.tsx`.
- **Evidência:** axe best-practice: `landmark-one-main` (1) e `region` (2 a 7) nos 7 estados do Votaí; `heading-order` no `/feed` (h1 para h3) e na sessão do Votaí. Na home, o `<main>` cobre só o perfil. Nenhuma página tem link "pular para o conteúdo". Os títulos das ferramentas são só "CPF", "Base64", "JSON", "JWT" e "UUID", sem o nome do site; o `/feed` usa o título padrão.
- **Medir de novo:** axe com best-practice e o campo `estrutura_*` em `web-publico/resultados/*.json`.
- **Corrigir:** `<main>` no layout do Votaí; os dois lados da home dentro de um `<main>` (o perfil vira `header` ou `section`); link de pular no layout do site; modelo de título no layout de `/tools` e título próprio no `/feed`; níveis de cabeçalho em ordem.

### 4.4 `apps/web`, `/admin`

#### ADM-01 · Reordenar as listas só funciona com mouse

**Alta · esforço M** · WCAG 2.1.1 Teclado (A), 2.5.7 Movimentos de arrastar (AA) e 4.1.2 (A)

- **Onde:** `components/admin/content/sortable-list.tsx:20-43` e `:51-53` (SortableRow e sensores), usada em `pilulabs-list.tsx`, `carreira-list.tsx` e `social-list.tsx` (`/admin/pilulabs`, `/admin/carreira`, `/admin/socials`).
- **Evidência:** só existe `PointerSensor` (linha 51), sem `KeyboardSensor` e sem botões de subir e descer. Em `/admin/pilulabs`, com foco na linha "Botaí" (`div role=button tabindex=0 aria-roledescription=sortable`), Espaço, ↓, Espaço, Enter, ↓ e Enter deixaram a ordem em [Botaí, Sombraí], com 0 chamadas a `/api/admin/content/pilulabs/reorder`. O `aria-describedby` da linha ainda promete, em inglês, "To pick up a draggable item, press the space bar…", o que é falso sem o sensor. axe `nested-interactive` (serious, 2 nós por página: a linha `role=button` contém Editar e Remover) e `target-size` (serious, 4 nós) nas três rotas, nos dois temas.
- **Medir de novo:** `web-admin/medir-interacoes.mjs`, etapa reordenarPiluLabs, e axe em `paginas.json`. À mão: Tab até a linha, Espaço e setas, e conferir que a ordem não muda.
- **Corrigir:** `useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })` e `accessibility.screenReaderInstructions` e `announcements` em pt-BR no DndContext. Melhor ainda: tirar `attributes` e `listeners` da linha inteira e pô-los numa alça (botão "Reordenar <nome>"), com botões "Subir" e "Descer" que tenham `aria-label`, como já faz o `transcricao-form.tsx:91-108`. Assim some o `nested-interactive` e fica uma alternativa sem arrastar.

#### ADM-02 · "Desconectar" e "Conectar GitHub" não são alcançáveis pelo teclado

**Alta · esforço P** · WCAG 2.1.1 Teclado (A)

- **Onde:** `components/admin/account-menu.tsx:96-112` (botão e link soltos dentro do DropdownMenuContent), na barra de topo de todo o `/admin`.
- **Evidência:** no Radix Menu (`@radix-ui/react-menu` 2.1.16, `dist/index.mjs:305`) o Tab dentro do menu é bloqueado e as setas só percorrem os DropdownMenuItem. Com Enter no "Menu da conta", ↓ quatro vezes, ↑ duas e Tab, o foco ficou sempre em "Sair". "Desconectar" (botão de 67×15) e "Conectar GitHub" (link) nunca recebem foco. Para conectar ainda há o banner do dashboard; desconectar o GitHub não tem nenhum caminho pelo teclado.
- **Medir de novo:** `web-admin/medir-interacoes.mjs`, etapas menuContaNaoConectado e menuContaConectado. À mão: Tab até "Menu da conta", Enter, setas e Tab.
- **Corrigir:** `<DropdownMenuItem onSelect={onUnlink}>` e `<DropdownMenuItem asChild><a href="/api/admin/github/login">…</a></DropdownMenuItem>`. Também dá para pôr "Desconectar" no banner do dashboard (o GithubLinkBanner já tem a variante `linked`).

#### ADM-04 · O admin não cabe em 320 px

**Alta · esforço M** · WCAG 1.4.10 Refluxo (AA)

- **Onde:** `app/(admin)/admin/layout.tsx:85-89` (`<main className="flex-1 px-8 py-8">`) e `components/admin/admin-sidebar.tsx:110` (`aside w-64 shrink-0`, sem versão para tela estreita).
- **Evidência:** em 320 CSS px (o mesmo que 1280 a 400%), as 11 rotas rolam para o lado, com largura entre 554 e 683 px (`/admin` 624, `/admin/posts` 604, editor 610, `/admin/transcricao` 683…). A barra lateral de 256 px ocupa a tela, a barra de topo vai até 683 px e o conteúdo fica com cerca de 64 px (`shots/pg_admin_posts_wsl-pt1-320.png`). O login passa (320).
- **Medir de novo:** `web-admin/medir-paginas.mjs`, campo reflow320. À mão: zoom de 400% numa janela de 1280 px, ou DevTools com 320 de largura.
- **Corrigir:** em tela estreita, a barra lateral vira gaveta (o Sheet do pacote, com um botão "Menu" que tenha nome); a barra de topo quebra linha ou esconde a trilha; padding menor no `main` (`px-4 sm:px-8`); as grades das listas viram pilha.

#### ADM-05 · O editor de post prende o Tab e não tem nome

**Alta · esforço P** · WCAG 2.1.2 Sem armadilha de teclado (A), 4.1.2 (A) e 1.4.3 (AA)

- **Onde:** `components/admin/posts/mdx-editor.tsx:14-27` (CodeMirror do `@uiw/react-codemirror` 4.25.10, com `indentWithTab` no padrão, que é `true`, e sem `aria-label`).
- **Evidência:** em `/admin/posts/novo`, o `.cm-content` tem `role=textbox` e `aria-multiline=true`, sem `aria-label` nem `aria-labelledby`; axe `aria-input-field-name` (serious) nos dois temas. Tab dentro do editor insere recuo e o foco fica lá; Shift+Tab também. Só Esc seguido de Tab sai (é o `tabFocusMode` de 2 s do `@codemirror/view` 6.43.14), e o foco vai para o switch "Publicado". A tela não avisa desse atalho, e o 2.1.2 exige o aviso quando a saída não é a padrão. Também medido: o título no tema one-dark do editor, #e06c75 sobre #282c34, dá 4,38:1 (13 px, negrito), axe `color-contrast` serious.
- **Medir de novo:** `web-admin/medir-interacoes.mjs`, etapa editorNovo (cmAttrs, tab1, shiftTab, escTab), e axe de `/admin/posts/wsl-pt1` em `paginas.json`.
- **Corrigir:** `indentWithTab={false}`, ou manter o recuo e mostrar abaixo do editor "Esc e depois Tab sai do editor". Dar nome com `EditorView.contentAttributes.of({ 'aria-label': 'Conteúdo do post (MDX)' })` ou `aria-labelledby` no rótulo "Conteúdo". Escurecer a cor do título no tema do editor ou usar um tema que passe 4,5:1.

#### ADM-06 · Erros de validação não aparecem ou não são anunciados

**Alta · esforço M** · WCAG 3.3.1 Identificação do erro (A) e 4.1.3 Mensagens de status (AA); regra PiluTech de erro perto do campo e anunciado

- **Onde:** `components/admin/posts/post-editor.tsx:51-66` e `:75-81` (`errors.title` nunca é exibido); `components/admin/content/fields.tsx:19-24` (FieldShell sem `aria-invalid`, `aria-describedby` ou anúncio); `pilulabs-form.tsx:60-73`, `carreira-form.tsx`, `social-form.tsx` e `profile-form.tsx` (mesmo padrão).
- **Evidência:** em `/admin/posts/novo`, com o título vazio, "Salvar alterações" mostra só "Slug inválido (use minúsculas, números e hífens)". O "Obrigatório" do título não aparece em lugar nenhum. Ficam 0 `role=alert`, 0 `aria-invalid` e nenhum toast, e o foco continua no botão. No diálogo "Nova experiência" (`/admin/carreira`), Salvar vazio mostra "Obrigatório" e "Slug inválido…" com 0 alert, 0 `aria-invalid` e 0 `aria-describedby`, e o foco fica em "Salvar". Quem usa leitor de tela não fica sabendo que salvar falhou.
- **Medir de novo:** `web-admin/medir-interacoes.mjs`, etapas editorNovo.erroSalvar e dialogoCarreira.erros.
- **Corrigir:** no FieldShell, id no erro e `aria-invalid` e `aria-describedby` no campo. Ao falhar a validação, focar o primeiro campo com erro e mostrar um resumo com `role=alert` ("Corrija 2 campos"). Exibir `errors.title` junto do título no PostEditor.

#### ADM-07 · A busca do topo não mostra foco e não faz nada

**Média · esforço P** · WCAG 2.4.7 Foco visível (AA)

- **Onde:** `components/admin/admin-top-bar.tsx:61-68` (`input type=search` com `outline-none`, sem substituto), em todas as rotas a partir de `md`.
- **Evidência:** o estilo com foco é igual ao sem foco (`outline-style: none`, `box-shadow: none`, borda rgb(28,49,64) e mesmo fundo). Na captura `shots/busca-foco.png` aparece só o cursor. E o campo não faz nada: digitar "teste" e Enter não muda a URL nem filtra. É um controle morto na ordem do Tab.
- **Medir de novo:** `web-admin/medir-interacoes.mjs`, etapas buscaTopo e shellTab.
- **Corrigir:** tirar o campo enquanto a busca não existir. Se ficar, trocar `outline-none` por `focus-visible:ring-2 focus-visible:ring-ring`, como no `account-menu.tsx:50`.

#### ADM-08 · Radios da transcrição e campo de tags sem foco visível

**Média · esforço P** · WCAG 2.4.7 Foco visível (AA)

- **Onde:** `components/admin/transcricao/transcricao-form.tsx:143-165` (radios `sr-only` dentro do rótulo, sem estilo de foco); `components/admin/content/tag-array-input.tsx:40-52` (input com `outline-none` e contêiner sem `focus-within`).
- **Evidência:** em `/admin/transcricao`, um Tab a partir de "Termos que aparecem" leva o foco ao radio do modo, que mede 1×1 px. O cartão fica igual com e sem foco, então não se vê onde está o foco e as setas trocam o modo às cegas. No campo de tags, nenhum indicador (leitura de código).
- **Medir de novo:** `web-admin/medir-interacoes.mjs`, etapa transcricao, e `shots/transcricao-radio-foco.png`. À mão: Tab até o grupo "Modo".
- **Corrigir:** nos cartões, `has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring` (ou `focus-within`). No TagArrayInput, `focus-within:ring-2` no contêiner.

#### ADM-09 · A barra de formatação não funciona pelo teclado

**Média · esforço P** · WCAG 2.1.1 Teclado (A)

- **Onde:** `components/admin/posts/mdx-toolbar.tsx:57-70` (ação só no `onMouseDown`).
- **Evidência:** com texto selecionado e foco em "Negrito", Enter e Espaço não mudam o documento. Com clique, aplica (`**# Novo post…**`). Os 7 botões (H2, B, I, ❝, </>, •, 🔗) recebem foco, mas não funcionam pelo teclado. Dá para contornar digitando Markdown, por isso média.
- **Medir de novo:** `web-admin/medir-interacoes.mjs`, etapas editorNovo.toolbarTeclado e toolbarMouse.
- **Corrigir:** mover a ação para `onClick` e manter `onMouseDown={e => e.preventDefault()}` para não perder a seleção. Opcional: atalhos Mod-b e Mod-i no CodeMirror.

#### ADM-10 · O foco cai no body ao fechar diálogos

**Média · esforço P** · WCAG 2.4.3 Ordem do foco (A)

- **Onde:** diálogos controlados sem DialogTrigger: `app/(admin)/admin/carreira/page.tsx:59`, `pilulabs/page.tsx:59`, `socials/page.tsx:59`, `components/admin/content/delete-confirm-dialog.tsx:21`, `posts/proofread-button.tsx:74` e `media/media-picker-dialog.tsx:42`.
- **Evidência:** o Radix Dialog 1.1.15 só devolve o foco para o gatilho registrado (`dist/index.mjs:148`); sem DialogTrigger, o foco cai no body. Medido: "Nova experiência" aberto com Enter e fechado com Esc, foco no body. "Revisão da IA" aberto com Enter em "Corrigir texto" e fechado com Esc, foco no body, nos dois temas. A entrada e a prisão do foco estão certas (seção 6).
- **Medir de novo:** `web-admin/medir-interacoes.mjs`, etapas `dialogoCarreira.focoVoltou` e `revisao-*.focoVoltou`.
- **Corrigir:** `<DialogTrigger asChild>` nos botões que abrem, ou guardar o elemento de origem e focá-lo em `onCloseAutoFocus`. Vale também para os diálogos de "Editar" e "Remover" de cada linha.

#### ADM-11 · Abas, filtros e item ativo sem estado acessível

**Média · esforço P** · WCAG 4.1.2 (A) e 1.4.1 Uso de cor (A)

- **Onde:** `components/admin/posts/editor-tabs.tsx:17-29`; `components/admin/media/media-grid.tsx:24-33`; `components/admin/admin-sidebar.tsx:128-147` (item ativo); `components/admin/admin-top-bar.tsx:45-57` (trilha); `components/votacao/sessions-manager.tsx:60-66` ("Ver votos").
- **Evidência:** as abas Editar, Dividir e Pré-visualizar não têm `role=tab`, `aria-selected` nem `aria-pressed`; a ativa só ganha `bg-primary` (24 px de altura). Os filtros de Mídia (Todos, PNG…) têm `aria-pressed` nulo e o ativo só muda de cor. Nenhuma rota tem `aria-current` (0 nós); o link ativo "Posts" só ganha `text-primary` e `bg-accent-soft`. A trilha é um `<nav>` sem `aria-label` nem `aria-current`, e o axe best-practice acusa `landmark-unique` nas 11 rotas. "Ver votos" expande sem `aria-expanded`.
- **Medir de novo:** `web-admin/medir-interacoes.mjs`, etapas editorNovo.abas, midia.filtros, sidebar e sessoes; `paginas.json`, campos ariaCurrent e axeBP.
- **Corrigir:** abas com `role=tablist`/`tab` e `aria-selected` (ou `aria-pressed` num grupo de botões); `aria-pressed` nos filtros; `aria-current="page"` na barra lateral mais um sinal que não seja só cor (barra lateral ou negrito); `<nav aria-label="Trilha">` com `aria-current` na última parte; `aria-label="Admin"` no `aside`/`nav`; `aria-expanded` e `aria-controls` em "Ver votos".

#### ADM-12 · Campos sem rótulo ou com o rótulo errado

**Média · esforço P** · WCAG 4.1.2 (A), 1.3.1 (A), 3.3.2 Rótulos (A) e 2.5.3 Rótulo no nome (A)

- **Onde:** `components/admin/posts/distribution-panel.tsx:158-182` (Textarea e Input sem rótulo); `components/admin/content/tag-array-input.tsx:21-53` (o `<label>` do FieldShell envolve os botões "Remover" e o rótulo vai para o primeiro botão); `post-editor.tsx:138-142` (TagArrayInput com `label=""`); `components/admin/content/image-field.tsx:17-49` (o `<label>` envolve o botão "Biblioteca"); `components/admin/posts/cover-image-card.tsx:90-95` (só texto de exemplo).
- **Evidência:** na árvore de acessibilidade do Chromium, o textarea da chamada social em `/admin/posts/wsl-pt1` aparece como `textbox` sem nome; axe `label` (critical) nos dois temas. A instrução só tem nome pelo texto de exemplo ("instrução (ex.: deixa mais informal)"). As tags do editor aparecem como `textbox:` de nome vazio. Nas Disciplinas do Perfil, o nome vira "Adicionar…" em vez de "Disciplinas", porque o rótulo foi para o botão "Remover SRE". O ImageField sai como "Logo (URL) Biblioteca" e "Avatar (path) Biblioteca". A URL da capa se chama "/media/… ou URL".
- **Medir de novo:** `web-admin/medir-interacoes.mjs`, etapas editorNovo.ariaTags e ariaCapa, distribuicao.aria, perfilNomes e dialogoCarreira.ariaForm; axe de `/admin/posts/wsl-pt1`.
- **Corrigir:** FieldShell com `<label htmlFor>` e id no campo (`useId`) em vez de envolver o conteúdo; botão "Biblioteca" fora do rótulo; `aria-label="Chamada para <plataforma>"` no Textarea e "Instrução para a IA (<plataforma>)" no Input; rótulo visível "URL da capa"; tags do editor com rótulo "Tags" (pode ser `sr-only`).

#### ADM-13 · O nome do menu da conta não contém o texto visível

**Média · esforço P** · WCAG 2.5.3 Rótulo no nome (A)

- **Onde:** `components/admin/account-menu.tsx:44-57` (`aria-label="Menu da conta"` sobre o texto visível com as iniciais e o nome).
- **Evidência:** o nome acessível é "Menu da conta" e o texto visível é "PV Paulo Victor" (135×36). Quem usa comando de voz e diz "clicar Paulo Victor" não acha o botão.
- **Medir de novo:** `web-admin/medir-interacoes.mjs`, etapa menuContaNaoConectado (nomeAcessivel e textoVisivel).
- **Corrigir:** tirar o `aria-label` e completar o texto visível com `sr-only` ("Paulo Victor, menu da conta"), ou usar um `aria-label` que comece pelo nome visível.

#### ADM-14 · O diff da revisão da IA fica abaixo de 4,5:1 no claro e depende de cor

**Média · esforço P** · WCAG 1.4.3 (AA) e 1.3.1 (A)

- **Onde:** `components/admin/posts/proofread-button.tsx:163-179` (diff completo com `bg-ok/20 text-ok` e `bg-destructive/20 text-destructive`).
- **Evidência:** axe no diálogo "Revisão da IA", tema claro, depois de "ver texto completo": `color-contrast` em 6 nós. Adição #1b7957 sobre #cbdfdb = 3,85:1; remoção #dd1313 sobre #f2cbcd = 3,39:1 (14 px). No escuro, 7,10 e 5,45. O texto acrescentado só se distingue pela cor (sem `<ins>` nem `<del>`; a remoção tem riscado), então o leitor de tela lê o texto antigo e o novo juntos, sem diferença.
- **Medir de novo:** `web-admin/medir-interacoes.mjs`, etapas revisao-light e revisao-dark.
- **Corrigir:** `<ins>` e `<del>` (com `sr-only` "acrescentado" e "removido") e sublinhado na adição. No claro, escurecer o texto ou clarear o fundo (ex.: fundo `/10` com texto foreground) até 4,5:1.

#### ADM-15 · O switch desligado quase some

**Média · esforço P** · WCAG 1.4.11 Contraste não textual (AA) · a parte das bordas de campo está em UI-03

- **Onde:** `components/admin/content/fields.tsx:96-118` (ToggleField: trilho `bg-muted` e bolinha `bg-background`).
- **Evidência:** pelos tokens, conferido na captura do editor: trilho desligado (muted sobre card) 1,13:1 no claro e 1,07:1 no escuro; bolinha (background sobre muted) 1,07:1 e 1,14:1. O switch "Publicado" desligado quase some (`shots/pg_admin_posts_wsl-pt1-light.png`). Ligado, primary sobre card dá 7,47 e 8,78.
- **Medir de novo:** `node web-admin/contraste-tokens.mjs packages/ui/src/styles.css`.
- **Corrigir:** borda de 3:1 no estado desligado (ex.: `border-muted-foreground`) ou trilho mais escuro.

#### ADM-16 · Alvos do admin abaixo de 44 e alguns abaixo de 24

**Média · esforço M** · regra PiluTech de 44×44; WCAG 2.5.8 Tamanho do alvo (AA) · o Button e o Fechar do pacote estão em UI-05 e UI-06

- **Onde:** links da barra lateral (36 px; os do rodapé, 20 px); ações de lista "Editar", "Remover" e "Apagar" (`text-sm`, 20 px); barra de formatação (24 px); X das tags (15×16); checkboxes nativos (13×13); filtros de Mídia (24 px).
- **Evidência:** abaixo de 44 px, por rota: `/admin` 17 de 17; `/admin/posts` 21 de 21; editor 46 de 52; PiluLabs, Carreira e Redes 21 de 23; Perfil 30 de 31; Mídia 25 de 27; Sessões 25 de 25; Transcrição 19 de 19; Passkeys 20 de 20; login 2 de 2 (188,8×40 e 197,3×42). Abaixo de 24: "Remover wsl" 15×16, "Apagar" em Mídia 40,6×16, "Editar" 38,4×20, "Remover" 59,6×20, Close 16×16, checkbox 13×13. axe `target-size` (serious, 4 nós) em PiluLabs, Carreira e Redes, pelos botões dentro da linha `role=button` (ADM-01). Os outros alvos abaixo de 24 passam pela exceção de espaçamento do 2.5.8, mas falham a regra de 44.
- **Medir de novo:** `web-admin/medir-paginas.mjs`, campos alvos44, alvos24 e alvos24SemEspaco; `medir-interacoes.mjs`, etapa `revisao-*.alvosDialogo`.
- **Corrigir:** depois de UI-05, uma classe de alvo de 44 (padding ou pseudo-elemento) nas ações de lista, nos links da barra lateral, na barra de formatação e no X das tags.

#### ADM-17 · Texto a 200% corta o admin

**Média · esforço M** · WCAG 1.4.4 Redimensionar texto (AA)

- **Onde:** `components/admin/posts/posts-table.tsx:12-24` e `components/admin/content/carreira-list.tsx:14-25` (grade de colunas fixas com `truncate`), `components/admin/media/media-card.tsx:39-46` e a barra de topo.
- **Evidência:** com o `font-size` do `<html>` a 200% e 1280 px, todas as rotas com login rolam para o lado (largura de 1631 a 1976 px). Textos cortados: títulos de posts com 90 px ("Como usar o Husky" precisa de 295), células de Carreira com 28 a 58 px ("Mar 2024" precisa de 136), nome do arquivo em Mídia com 0 px ("capa.png" e "avatar.jpg") e o cabeçalho TÍTULO/STATUS cortado. O login passa. Ao contrário do WEB-15 e do FIN-11, aqui o 1.4.4 falha também pelo zoom (medido na conferência): com 640×450 CSS px (1280 a 200%), o título de post "Como usar o Husky no monorepo" fica com 50 de 252 px em `/admin/posts`, e `/admin/pilulabs` rola 23 px para o lado.
- **Medir de novo:** `web-admin/medir-paginas.mjs`, campo texto200; `conferencia/admin.cjs`, passo `adm17zoom`.
- **Corrigir:** colunas com `minmax` e quebra de linha em vez de `truncate` (com `title` ou dica acessível só como apoio); em tela ou texto grande, a linha vira cartão empilhado; barra lateral recolhível (junto com ADM-04).

#### ADM-18 · Todas as telas do admin têm o mesmo título

**Média · esforço P** · WCAG 2.4.2 Página com título (A)

- **Onde:** `app/(admin)/layout.tsx:6` (`metadata` só com `robots`) e as páginas do admin sem título próprio.
- **Evidência:** `/admin`, `/admin/posts`, `/admin/posts/novo`, `/admin/midia` e `/admin/passkeys` têm o mesmo `<title>` do site público ("Paulo Victor Torres Silva | SRE, DevOps & Cloud & Platform Engineering"). A aba e o leitor de tela não dizem em que tela a pessoa está.
- **Medir de novo:** `web-admin/medir-extra.mjs` (`extra.json`, titulos).
- **Corrigir:** `metadata.title.template` "Admin · %s" no layout do admin e título por segmento ("Posts", "Editar post", "Mídia"…), ou `document.title` a partir do mapa `CRUMB`.

#### ADM-19 · Tabelas feitas de div e botões de linha com o mesmo nome

**Média · esforço P** · WCAG 1.3.1 (A) e 2.4.6 Cabeçalhos e rótulos (AA)

- **Onde:** `components/admin/posts/posts-table.tsx:11-50` e `components/admin/content/carreira-list.tsx:14-20` (tabelas com div); botões "Editar", "Remover" e "Apagar" em `pilulabs-list.tsx:40-51`, `carreira-list.tsx:45-56`, `social-list.tsx:38-49`, `posts-table.tsx:43-48` e `media-card.tsx:48-54`.
- **Evidência:** os cabeçalhos visuais (Título, Status, Leitura, Atualizado; Empresa, Cargo, Período, Status) são `<span>` sem relação com as células, e o leitor de tela lê a linha sem saber a coluna. Em Mídia há dois botões chamados "Apagar" (40,6×16), e o mesmo vale para "Editar" e "Remover" em cada lista. Passkeys já faz certo ("Remover a passkey MacBook").
- **Medir de novo:** leitura de código e `ariaSnapshot` (`web-admin/medir-interacoes.mjs`, etapa midia.apagar).
- **Corrigir:** `<table>` com `<th scope=col>` (ou os papéis de tabela); `aria-label="Apagar <título>"` e "Editar <nome>" nos botões de linha.

#### ADM-20 · Erros de salvar só aparecem num toast que some

**Média · esforço M** · WCAG 3.3.1 (A) e 2.2.1 Tempo ajustável (A); regra PiluTech de erro perto do campo

- **Onde:** `posts/page.tsx`, `carreira/page.tsx`, `pilulabs/page.tsx`, `socials/page.tsx`, `midia/page.tsx`, `cover-image-card.tsx:27-29`, `proofread-button.tsx:38` e `distribution-panel.tsx:66-113`; o erro de publicação só em `title=` (`distribution-panel.tsx:257-262`); `components/ui/sonner.tsx` sem `closeButton`.
- **Evidência:** o Sonner 2.0.7 anuncia numa região `aria-live=polite`, o que é bom. Mas o toast "Correções aplicadas." some antes de 5 s (`TOAST_LIFETIME` 4000), sem botão de fechar e longe do formulário. O detalhe de "❌ falhou" na distribuição só existe em `title="rate limit"`: não chega pelo teclado, pelo toque nem pelo leitor de tela.
- **Medir de novo:** `web-admin/medir-interacoes.mjs`, etapas `revisao-*.toast`, `toastSumiuEm5s` e distribuicao.falhouTitle.
- **Corrigir:** mostrar os erros de salvar e enviar no próprio formulário ou diálogo (`role=alert`), além do toast. Toasts de erro com `duration: Infinity` e `closeButton`. Erro da distribuição como texto visível junto do selo.

#### ADM-28 · Plural e gênero fixos no dashboard e nas sessões

**Média · esforço P** · regra PiluTech: plural e gênero pelo `Intl.PluralRules`

- **Onde:** `app/(admin)/admin/page.tsx:72-112` (dicas fixas "publicados", "rascunho", "atuais", "aberta", "encerrada") e `:48` ("Bem-vindo de volta"); `components/votacao/admin/session-votes-list.tsx:17` ("voto(s)"); `components/admin/posts/proofread-button.tsx:88-89` ("correção/correções", "aceita/aceitas").
- **Evidência:** no dashboard, com 1 publicado, 1 rascunho, 1 atual e 1 aberta: "1 publicados · 1 rascunho", "1 atuais", "1 aberta · 0 encerrada". Em Sessões: "1 voto(s)". "Bem-vindo" supõe o gênero.
- **Medir de novo:** `web-admin/medir-extra.mjs` (dashboardHints) e etapa sessoes.textoVotos.
- **Corrigir:** chaves com as formas `one` e `other`, escolhidas por `Intl.PluralRules(idioma)`; saudação neutra ("Boas-vindas").

#### ADM-21 · Cabeçalhos, grupos, link morto e falta do "pular para o conteúdo" no admin

**Baixa · esforço P** · boas práticas do axe, WCAG 1.3.1 (A), 2.4.6 (AA) e 2.4.1 (A, atendido pelo landmark `main`)

- **Onde:** páginas internas sem h1 (`components/section-header.tsx:24-29` renderiza h2); títulos de grupo da barra lateral em `<p>` (`admin-sidebar.tsx:120-123`); link "Design System" com `href="#"` (`admin-sidebar.tsx:158-163`); contagem "02" sem contexto (`section-header.tsx:31-35`); o "P" do avatar lido como texto (`admin-login-screen.tsx:47-49`, `admin-sidebar.tsx:112-114`); `app/(admin)/admin/layout.tsx:84-91` sem link de pular.
- **Evidência:** axe best-practice `page-has-heading-one` em 10 rotas (todas menos `/admin`) e `landmark-unique` em 11. Os cabeçalhos de `/admin/posts` são só "H2 POSTS"; o editor só tem h3. Em Passkeys, o `ariaSnapshot` mostra `text: "02"` solto. O link "Design System" leva a "#". Acrescentado na conferência: nenhuma rota do admin tem link "pular para o conteúdo", e em `/admin` há 16 interativos antes do `<main>` (12 links da barra lateral, Sair, Buscar conteúdo, Tema e Menu da conta), o mesmo caso do FIN-20 e do site (WEB-24).
- **Medir de novo:** `paginas.json`, campos headings e axeBP; `medir-interacoes.mjs`, etapas sidebar e passkeys; `conferencia/admin.cjs`, passos `debug` e `estruturaAdmin`.
- **Corrigir:** SectionHeader com prop de nível (h1 no título da página); grupos da barra lateral como cabeçalho ou `aria-labelledby` nas listas; remover o link morto; contagem com `sr-only` ("2 itens"); "P" com `aria-hidden`; link "Pular para o conteúdo" antes do `aside`, apontando para o `main`.

#### ADM-22 · O foco cai no body quando o login falha

**Baixa · esforço P** · WCAG 2.4.3 Ordem do foco (A)

- **Onde:** `components/admin/admin-login-screen.tsx:61` e `:71` (`disabled={ocupado}` no botão focado). O mesmo padrão aparece nos "Salvar" do admin.
- **Evidência:** foco em "Entrar com Google", Enter e o POST falha (mock 500). A mensagem aparece certa, com `role=alert` ("Não foi possível iniciar o login com Google. Tente novamente."), mas o foco cai no body, porque o botão focado foi desabilitado.
- **Medir de novo:** `web-admin/medir-extra.mjs` (focoAntes e focoDepois).
- **Corrigir:** `aria-disabled` com bloqueio no handler em vez de `disabled`, ou devolver o foco ao botão depois do erro.

#### ADM-25 · A área de soltar a capa fica fora do Tab

**Baixa · esforço P** · WCAG 2.1.1 Teclado (A)

- **Onde:** `components/admin/posts/cover-image-card.tsx:34-43` (div com `onClick`, sem `role` nem `tabindex`).
- **Evidência:** "Arraste a capa ou clique para enviar" não entra na ordem do Tab (não aparece nos alvos medidos do editor). Há outro caminho pelo teclado (Biblioteca → "Enviar arquivo"), por isso baixa.
- **Medir de novo:** leitura de código e alvos de `/admin/posts/wsl-pt1` em `paginas.json`.
- **Corrigir:** trocar a div por `<button type="button">` com o mesmo texto (mantendo o `onDrop`), ou um botão "Enviar capa" visível.

#### ADM-31 · Campos de data, número e URL como texto livre

**Baixa · esforço P** · regra PiluTech de formatação; boa prática de formulário (`autocomplete` e `inputmode`)

- **Onde:** `components/admin/posts/post-publish-card.tsx:26-32` (campo "Data" `type=text` com exemplo "2025-04-28"); "Leitura (min)"; `components/admin/content/fields.tsx:27-46` (campos de URL).
- **Evidência:** "Data" aceita ISO digitado à mão, enquanto o formulário do PiluLabs usa `type=date` (`pilulabs-form.tsx:159-165`). "Leitura (min)" é texto livre sem `inputmode=numeric`. Site, Link e URL são `type=text`, sem `type=url` nem `inputmode=url`.
- **Medir de novo:** `web-admin/medir-interacoes.mjs`, etapa editorNovo.ariaPublicacao, e leitura de código.
- **Corrigir:** `type="date"` na data, `inputmode="numeric"` na leitura e um TextField com `type="url"` ou `inputmode="url"` nos links.

### 4.5 `apps/financas`

#### FIN-01 · Texto de alerta abaixo de 4,5:1 no tema claro

**Alta · esforço P** · WCAG 1.4.3 Contraste mínimo (AA); regra PiluTech de medir nos dois temas

- **Onde:** `apps/financas/web/src/blocos/KpiCard.tsx:50` e `:67-68` (KPI em alerta: "Comprometido" e "Reserva" em `#/`, `#/comprometido` e `#/orcamento`); `lib/superficie.ts:51` (`FAIXA_ALERTA`, usada em `blocos/BlocoComprometido.tsx:160`, `pages/reserva.tsx:330`, `orcamento.tsx:190` e `:292`, `metas.tsx:169` e `:368`, `alertas-email.tsx:155`).
- **Evidência:** pixel real atrás do texto, tema claro:
  - KPI "acima de 50% da renda fixa em nov/26", #dd1313 sobre #e6e3ea: **3,96:1** (390) e 4,02:1 (1280);
  - "abaixo da meta de 6 meses": 4,10 e 4,13;
  - KPI do `#/comprometido`: 3,98 e 4,13;
  - "1 categoria acima do limite" (`#/orcamento`): 4,20;
  - faixa "No pior cenário…" (`#/reserva`, 14 px, peso 500): 4,22;
  - manchete de alerta do `#/`: 4,45 (axe `color-contrast` serious, #dd1313 sobre #fdeeee = 4,46).
  - Causa: o KPI usa só `bg-destructive/[0.08]`, sem cartão opaco por baixo, e soma o brilho `accent-soft` do body. O `contraste.test.ts` não compõe transparência, por isso não pegou. No escuro passa (5,69 a 6,70).
  - Na conferência, o pixel lido no começo da linha (e não no centro) deu 4,13 e 4,16 para os dois primeiros textos, a 390: o número varia com o brilho do fundo, mas fica abaixo de 4,5 em todo ponto medido. O axe confirmou 4,46 na manchete e 4,39 no chip "1 estourada" (FIN-02).
- **Medir de novo:** `financas/pixel.mjs` com o tema claro no `localStorage['financas-tema']`, ou o axe `color-contrast` em `#/` no tema claro com os dados de `financas/mocks.mjs`.
- **Corrigir:** pôr o tinto destrutivo sobre fundo opaco (`bg-card` mais a camada `destructive/[0.08]`) ou escurecer o texto de alerta no tema claro até 4,5 sobre o pior fundo (#e6e3ea). Estender o `contraste.test.ts` para superfícies translúcidas (destructive a 0,07 e 0,08 sobre card, background e o brilho do body).

#### FIN-02 · Chips de status de 10 px abaixo de 4,5:1 no claro

**Média · esforço P** · WCAG 1.4.3 (AA)

- **Onde:** `pages/orcamento.tsx:98-99`, `blocos/BlocoOrcamento.tsx:138` e `:143`, `pages/metas.tsx:93` ("1 ESTOURADA" em `#/`, "Estourado" e "Atenção" em `#/orcamento`, "Atrasada" em `#/metas`).
- **Evidência:** axe `color-contrast` serious no tema claro: `#/` (1 nó), `#/orcamento` (3) e `#/metas` (1). Texto destructive #dd1313 sobre #fcecec = 4,39:1; texto warn #986206 sobre #f5efe6 = 4,49:1 pelo axe (4,50 pelo pixel). Texto de 10 px, seminegrito. No escuro, 6,05 e 9,05.
- **Medir de novo:** `financas/axe-todas.mjs`, filtrando `color-contrast` no `axe.json`.
- **Corrigir:** texto do chip mais escuro no claro (ou fundo opaco) e os pares chip sobre tinto no `contraste.test.ts`. É a mesma correção de FIN-01.

#### FIN-04 · Alvos dos formulários abaixo de 44

**Média · esforço M** · regra PiluTech de 44×44 (o mínimo do WCAG 2.5.8 é 24) · o Button e o Input do pacote estão em UI-05

- **Onde:** `SELECT_CLASSNAME` (`lib/form-classes.ts:14`, `h-9`); "Editar limite de …" (`pages/orcamento.tsx:148`, `min-h-9`); campos de mês `h-[34px]` (`blocos/BlocoCategorias.tsx:293`, `pages/insight.tsx:140`); campo de arquivo (`pages/importar.tsx:1129`); rótulos de checkbox sem `ALVO_LINHA` (recorrentes "Ativa" e "Varia?", regras "Definir PJ/PF" e "Ativa"); botões do `Gate.tsx`.
- **Evidência:** a 390×844, 91 alvos de 344 interativos ficam abaixo de 44 px, em 15 das 18 rotas (sem contar os 25 botões "?" do Ajuda, que têm 44×44 pelo `::after`). Exemplos: selects de 312×36; "Editar limite de Mercado" 79×36; campo de mês 152×34; campo de arquivo 312×32; rótulo "Ativa" 312×20; "Varia?" 64×20. No desktop (1280), 395 de 560 ficam abaixo de 44 (a barra lateral com `min-h-10` é decisão documentada no `App.tsx`).
- **Medir de novo:** `financas/medidas.json`, chave alvos["390 <rota>"].abaixo44 (caixa do rótulo para checkbox embrulhado).
- **Corrigir:** variante de toque (`h-11`) para select e botões nos formulários; `ALVO_LINHA` (`lib/touch.ts`) nos rótulos de checkbox que ainda não têm; `min-h-11` em "Editar limite" e nos campos de mês.

#### FIN-06 · O foco se perde ao fechar o diálogo e ao editar

**Média · esforço P** · WCAG 2.4.3 Ordem do foco (A); regra PiluTech de não perder o foco

- **Onde:** `#/extrato`: diálogo de "apagar" e botão "editar" da linha (`pages/extrato.tsx:1370`); `#/orcamento`: editor de limite (`pages/orcamento.tsx:248-290`).
- **Evidência:** só com teclado. Em `#/extrato`, apagar → Enter → diálogo (foco em "Cancelar", certo) → Esc deixa o foco no body. "editar" → Enter abre a edição com o foco no body, não no primeiro campo. Em `#/orcamento`, "Editar limite de Mercado" → Enter deixa o foco no botão, e "Cancelar" → Enter leva o foco ao body. Para comparar, o painel Mais e o Pagar fatura devolvem o foco ao gatilho depois do Esc.
- **Medir de novo:** `financas/formularios.mjs` (extrato.focoAposEsc e orcamento.focoAposCancelar) e `financas/sonda3.mjs` (focoAposEditar).
- **Corrigir:** guardar a referência do gatilho e devolver o foco ao fechar (`onCloseAutoFocus` do Dialog controlado, ou `focus()` depois do Cancelar). Ao abrir a edição na linha, focar o primeiro campo.

#### FIN-07 · Título fixo e troca de tela sem anúncio

**Média · esforço P** · WCAG 2.4.2 Página com título (A); anúncio da troca de tela para o leitor de tela

- **Onde:** `apps/financas/web/index.html:15` (`<title>Finanças</title>` fixo); troca de rota no AppShell de `App.tsx` (`useHash` e `resolveRoute`).
- **Evidência:** `document.title` é "Finanças" nas 18 rotas. Depois de Enter nos links "Extrato", "Orçamento" e "Metas", o foco fica no link e nenhuma região viva anuncia a tela nova (0 `aria-live` em `#/extrato` e `#/metas`).
- **Medir de novo:** `financas/formularios.json`, rotas.titulos.
- **Corrigir:** no AppShell, um `useEffect` com `` document.title = `${TITULO_DA_ROTA[route]} · Finanças` `` e foco no h1 (`tabIndex=-1`), ou o título anunciado numa região polite.

#### FIN-08 · Erros longe do campo e recusas do servidor mostradas cruas

**Média · esforço M** · regra PiluTech de erro que diz o que houve e como corrigir, perto do campo e anunciado; WCAG 3.3.1 e 3.3.3

- **Onde:** `#/lancar` (`pages/new-entry.tsx:214-229`, validação, e `:576`, alerta único no fim); Pagar fatura (`blocos/PagarFatura.tsx:505`); editor de limite (`pages/orcamento.tsx:292`); recusas do Worker exibidas como vieram (`apps/financas/web/src/api.ts:71`, `lib/mutar-e-recarregar.ts:19`).
- **Evidência:** em `#/lancar`, enviando vazio pelo Enter, aparece um único `role=alert` "Valor inválido. Use o formato 1.360,00." em y=932, 546 px abaixo do campo Valor (y=350). Nenhum campo recebe `aria-invalid` nem `aria-describedby` (há 0 `aria-invalid` no `src`). No Pagar fatura sem conta, aparece "Escolha a conta de onde o dinheiro sai." sem marcar o select. A recusa do servidor aparece como veio, e o Worker tem mensagens técnicas e sem acento, como "name e obrigatorio" e "kind invalido" (`apps/financas/src/routes/payees.ts:64-66`) e "corpo da requisicao nao e JSON valido". O lado bom: tudo é anunciado (`role=alert`).
- **Medir de novo:** `financas/formularios.json` (lancar.aposEnterVazio, lancar.posicao, pagarFatura.aposPagarSemOrigem e lancarRecusaServidor).
- **Corrigir:** erro por campo, com um `<p id>` logo abaixo, `aria-invalid` e `aria-describedby` e foco no primeiro campo inválido. Usar o `field` que o envelope do Worker já devolve para pendurar a recusa no campo certo e traduzir pelo `code` (FIN-17).

#### FIN-10 · Rolagem para o lado em 320 px

**Média · esforço P** · WCAG 1.4.10 Refluxo (AA)

- **Onde:** `lib/superficie.ts:59` (`GRID_BLOCOS` com `minmax(320px,1fr)`), usado em `pages/home.tsx:28`, `pages/config.tsx:173` e `pages/debt-detail.tsx:557`; `pages/accounts.tsx:225`; `pages/importar.tsx:1552` (`<pre>`) e o botão "Sincronizar todas as contas conectadas".
- **Evidência:** em 320×640, rolagem de 14 px em `#/`, `#/contas`, `#/configuracoes` e `#/dividas/d1` (334 px em 320), com os cartões cortados à direita, onde ficam os valores. Em `#/importar`, 16 px (o código tem 425 px e o botão 336). O h1 "Reserva de emergência" fica truncado (150 de 185 px). Em 640 px, nenhuma rota rola. O `pages/metas.tsx:52` já usa a forma certa: `minmax(min(320px,100%),1fr)`.
- **Medir de novo:** `financas/medidas.json`, reflow320, e as capturas `shots/reflow320-*.png`.
- **Corrigir:** `minmax(min(320px,100%),1fr)` no `GRID_BLOCOS` e no `accounts.tsx:225`; `whitespace-pre-wrap` com `break-all` no `<pre>`; `whitespace-normal` no botão longo.

#### FIN-11 · Tamanhos em px não crescem a 200%

**Média · esforço M** · regra PiluTech de texto a 200% sem cortar nem sobrepor (o WCAG 1.4.4 fica atendido pelo zoom: 640 px sem rolagem)

- **Onde:** `lib/tipografia.ts` (`ROTULO_SECAO`, `OVERLINE` e `META_MONO` com `text-[10px]`), `lib/superficie.ts:45` (`CHIP_MONO`), `App.tsx:621` (barra de abas `text-[10px]`), `App.tsx:540` (menu `text-[13.5px]`), `App.tsx:679` e `:796` (h1 `text-[17px]` e `text-[26px]`), números em `text-[28px]`; o seletor de mês do `#/orcamento` e linhas com `whitespace-nowrap`.
- **Evidência:** com `html { font-size: 200% }`, 51 de 107 nós de texto em `#/` a 390 não crescem (67 de 125 a 1280). A 390, 13 das 18 rotas passam a rolar para o lado: até 657 px em `#/importar` e 526 px em `#/orcamento`, onde o seletor "‹ novembro de 2026 ›" sai da tela. O h1 da barra de topo fica truncado ("Orçame…"), e os rótulos de 10 px e a barra de abas continuam pequenos. A 1280 não há rolagem, mas 7 rótulos são cortados por `truncate` (legenda de categorias, e-mail). A contagem de "não cresceu" só vale para a primeira rota de cada contexto, porque o estilo do `<html>` persiste na troca de hash.
- **Medir de novo:** `financas/medidas.json`, texto200 (a contagem vale só para "390 #/" e "1280 #/"), e a captura `shots/texto200-390-__orcamento.png`.
- **Corrigir:** trocar `text-[Npx]` por rem (ex.: `text-[0.625rem]`) ou por tokens de tipografia; `flex-wrap` no seletor de mês e nas linhas com `nowrap`; um E2E com `html { font-size: 200% }` que procura rolagem para o lado.

#### FIN-12 · O bloco de código do `#/importar` não rola pelo teclado

**Média · esforço P** · WCAG 2.1.1 Teclado (A)

- **Onde:** `pages/importar.tsx:1552` (`<pre class="overflow-x-auto">`).
- **Evidência:** axe `scrollable-region-focusable` serious, 1 nó, nos dois temas a 390. O comando "node apps/financas/scripts/pdf-import.mjs fatura.pdf" ocupa 425 px e não dá para rolar pelo teclado.
- **Medir de novo:** `financas/axe.json` (rota `#/importar`, 390).
- **Corrigir:** `tabIndex=0` com `aria-label` no `<pre>`, ou quebrar a linha (`whitespace-pre-wrap`) para não precisar rolar. Sai junto com FIN-10.

#### FIN-13 · Avisos com `role=alert` disparam sozinhos na carga

**Média · esforço P** · regra PiluTech: conteúdo que troca sozinho não interrompe o leitor de tela; anúncios só quando a pessoa age (WCAG 4.1.3 em espírito)

- **Onde:** `blocos/BlocoComprometido.tsx:158` (manchete de alerta) e `pages/reserva.tsx:328` (alerta de pior cenário). O `src` tem 80 `role="alert"`.
- **Evidência:** na carga de `#/` já aparece um `role=alert` com "acima de 50% — mais da metade da renda fixa já está prometida…", e na de `#/reserva`, "No pior cenário (custo fixo no teto)…". São avisos que interrompem, inseridos depois do fetch, sem ação da pessoa, a cada visita.
- **Medir de novo:** `financas/smoke.mjs` (lista os `[role=alert]` visíveis por rota, sem interação).
- **Corrigir:** mostrar esses avisos como texto normal (com ícone), sem `role=alert`, e guardar o `role=alert` para erro depois de uma ação.

#### FIN-14 · O finanças não tem testes de acessibilidade

**Média · esforço M** · regra PiluTech de testes (`@axe-core/playwright` nas páginas principais, teclado e `ariaSnapshot`)

- **Onde:** `apps/financas/web` (`package.json` e `src/**`).
- **Evidência:** a busca por `axe`, `toHaveNoViolations`, `ariaSnapshot` e `playwright` em `apps/financas/web/src` e no `package.json` acha 0 testes. As stories são CSF puro, sem Storybook instalado (comentário em `blocos/inicio.stories.tsx:6`). Por isso FIN-01, FIN-02 e o Fechar de 16×16 (UI-06) passaram sem alarme.
- **Medir de novo:** `grep -rlnE "axe|ariaSnapshot|@playwright" apps/financas/web`.
- **Corrigir:** E2E com Playwright e `@axe-core/playwright` nas 18 rotas, nos dois temas, com `page.route` e dados fictícios (o `financas/mocks.mjs` desta auditoria serve de base); teste de Tab e Esc nos formulários; `ariaSnapshot` no painel Mais e no Pagar fatura.

#### FIN-15 · A SPA não tem catálogo de textos

**Média · esforço G** · regra PiluTech de localização: pt-BR, en e es; nenhum texto fixo; idioma do navegador com troca nos Ajustes

- **Onde:** `apps/financas/web/src` inteiro (67 arquivos; os maiores são `pages/importar.tsx`, `extrato.tsx`, `regras.tsx` e `recorrentes.tsx`); `App.tsx:279` (`TITULO_DA_ROTA` e `GRUPOS`); `index.html:2` (`lang` fixo); os textos do `packages/ui` (UI-16).
- **Evidência:** não há catálogo nem i18n (nenhum `textos/`, `i18n/` ou `locales/`). São cerca de 845 textos de interface fixos: 435 nós de texto JSX e 410 strings com duas palavras ou mais (`importar.tsx` 89, `extrato.tsx` 62, `regras.tsx` 62, `recorrentes.tsx` 59). A contagem é aproximada (regex). Só existe pt-BR, sem detecção de idioma nem seletor em `#/configuracoes`, e o `<html lang="pt-BR">` é fixo.
- **Medir de novo:** `python3 -I financas/textos.py apps/financas/web/src/`.
- **Corrigir:** `textos/pt-BR.ts`, `en.ts` e `es.ts` com chaves estáveis e uma função `t()`. Idioma pelo `navigator.languages`, com pt-BR como padrão e troca nos Ajustes, e o `lang` do `<html>` atualizado em tempo de execução. Migrar por tela, incluindo os textos do `packages/ui`.

#### FIN-16 · Moeda, datas e plural montados à mão

**Média · esforço M** · regra PiluTech: datas, números e moeda pelo `Intl`, fuso `America/Fortaleza`, plural pelo `Intl.PluralRules`

- **Onde:**
  - `packages/tools/src/money.ts:31` (`formatBRL` manual), `:86` (`formatBRLSemCentavos`) e `:10` (`parseBRL` só no formato BR);
  - listas de mês em `lib/commitments.ts:73`, `lib/recorrencia.ts:28` e `lib/orcamento.ts:53`;
  - datas por `split` em `lib/dates.ts:95`, `blocos/PagamentosFeitos.tsx:32`, `lib/metas.ts:30`, `pages/extrato.tsx:143`, `pages/importar.tsx:273` e `pages/debt-detail.tsx:119`;
  - fuso como deslocamento fixo em `lib/dates.ts:13`;
  - plural à mão em `lib/metas.ts:34`, `pages/orcamento.tsx:41` e 21 "(s)" (ex.: `blocos/FaixaKpiInicio.tsx:138`).
- **Evidência:** a moeda é montada à mão ("R$ " e milhar com "."); um comentário em `money.ts:28` justifica fugir do `Intl` por causa do U+00A0. Há três cópias dos nomes de mês em português, e as datas dd/mm/aaaa saem de `split`. O fuso é UTC−3 fixo (`TERESINA_OFFSET_MS`), não `timeZone: 'America/Fortaleza'`. O plural sai como "1 dívida(s) em aberto" na Início. Só o `Passkeys.tsx:18` usa `Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza' })`. O `localeCompare` é fixo em "pt-BR" (`lib/categories.ts:66`).
- **Medir de novo:** `grep -rnE "Intl\.|toLocale|MESES|split\('-'\)|\(s\)" apps/financas/web/src packages/tools/src/money.ts`.
- **Corrigir:** `Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' })`, `Intl.DateTimeFormat` com `timeZone: 'America/Fortaleza'` e mês `short` ou `long`, e `Intl.PluralRules`. Nos testes, normalizar o U+00A0. A leitura de valor segue o separador decimal do idioma. O `money.ts` é do `packages/tools`; conferir os outros consumidores antes de mudar.

#### FIN-17 · O Worker manda mensagens em pt-BR fixo e a SPA as mostra como vieram

**Média · esforço G** · regra PiluTech de localização (nada fixo; três idiomas), lado do servidor

- **Onde:** Worker: `apps/financas/src/lib/envelope.ts` (`errJson`), com 215 chamadas em 22 arquivos, e `RangeError` com mensagem em `domain/*` (ex.: `domain/categories.ts:90`, `domain/goals.ts:137`). SPA: `api.ts:71` repassa `note.message`; `e.message` aparece em `blocos/*.tsx` (`BlocoSaldos.tsx:53` e outros) e em `lib/mutar-e-recarregar.ts:19`. Insight da Claude em pt-BR (`domain/insight-prompt.ts:46`, `insight-gerar.ts:9`) e e-mail de alertas (`domain/alertas.ts:297`).
- **Evidência:** o Worker devolve o texto final em pt-BR e a SPA o mostra sem traduzir. Há mensagens sem acento e com nome de campo técnico ("corpo da requisicao nao e JSON valido", "name e obrigatorio", "kind invalido" em `routes/payees.ts:64-66`). O `api.ts` também tem textos de reserva fixos: "resposta sem envelope (HTTP …)" e "erro desconhecido". O insight gerado e o e-mail de alertas saem sempre em português.
- **Medir de novo:** `grep -rn "errJson(" apps/financas/src | grep -v test | wc -l` (215) e `grep -rn "e.message" apps/financas/web/src`.
- **Corrigir:** a SPA traduz pelo `code` (e pelo `field`) do envelope, com o catálogo, e o Worker mantém o `message` só para log e reserva. O prompt do insight e o e-mail recebem o idioma da pessoa (guardado em `settings`).

#### FIN-18 · Não há teste de chaves

**Média · esforço P** · regra PiluTech: teste que falha se uma chave existe num idioma e falta noutro

- **Onde:** `apps/financas/web`.
- **Evidência:** não há catálogo (FIN-15) nem teste que compare as chaves entre pt-BR, en e es.
- **Medir de novo:** procurar testes de i18n em `apps/financas/web/src`.
- **Corrigir:** um teste Vitest que compara as chaves (e as formas de plural) de `textos/pt-BR.ts`, `en.ts` e `es.ts`. Entra junto com FIN-15.

#### FIN-19 · Do h1 direto para o h3

**Baixa · esforço P** · WCAG 1.3.1 (boa prática de cabeçalhos em ordem)

- **Onde:** CardTitle (h3) logo abaixo do h1 em 13 das 18 rotas (`#/`, `#/lancar`, `#/lancar/transferir`, `#/dividas`, `#/comprometido`, `#/importar`, `#/contas`, `#/categorias`, `#/recorrentes`, `#/regras`, `#/insight`, `#/reserva`, `#/configuracoes`).
- **Evidência:** a estrutura pula do h1 para o h3 sem h2 (em `#/`: h1 "Início", h3 "COMPROMETIDO", h3 "ORÇAMENTO"…). Todas as rotas têm exatamente 1 h1.
- **Medir de novo:** `financas/medidas.json`, estrutura[*].hs.
- **Corrigir:** renderizar o CardTitle como h2 nessas telas (`asChild` ou prop de nível).

#### FIN-20 · Falta o link "pular para o conteúdo"

**Baixa · esforço P** · WCAG 2.4.1 Saltar blocos (atendido pelos landmarks); melhoria de teclado

- **Onde:** barra lateral do `App.tsx` (desktop, 768 px ou mais).
- **Evidência:** em `#/extrato` a 1280, são 20 paradas de Tab até o primeiro controle dentro do `<main>` (marca, 15 links do menu, Sair, tema). Os landmarks `main` e `nav[aria-label='Navegação principal']` existem.
- **Medir de novo:** `financas/sonda3.mjs` (paradasAteMain = 20).
- **Corrigir:** link "Pular para o conteúdo" escondido (`sr-only`) que aparece no foco por teclado, antes do `aside`, apontando para o `main` (com id e `tabIndex=-1`).

#### FIN-22 · O painel Mais abre com o foco em "Sair"

**Baixa · esforço P** · WCAG 2.4.3 Ordem do foco; prevenção de ação por engano

- **Onde:** painel "Mais" (`App.tsx`, PainelMais e SheetContent; Fechar em `packages/ui/src/sheet.tsx:80`).
- **Evidência:** aberto pelo teclado, o foco vai para "Sair", o primeiro focável: dois Enter encerram a sessão. O "Fechar", no canto de cima, é a última parada (a ordem do Tab termina em "… Configurações, Fechar, Sair"). O Esc devolve o foco a "Mais destinos" (certo).
- **Medir de novo:** `financas/formularios.json`, painelMais.
- **Corrigir:** `onOpenAutoFocus` mirando o primeiro destino (ou o Fechar), e o Fechar no começo do conteúdo no DOM.

#### FIN-25 · Campos de dinheiro sem `inputMode`

**Baixa · esforço P** · regra PiluTech de formulário com o `inputmode` certo

- **Onde:** `pages/new-entry.tsx:346`, `pages/transferir.tsx:349`, `pages/accounts.tsx:479`, `pages/config.tsx:200`, `pages/recorrentes.tsx:831` e `:862`, `pages/regras.tsx:672` e `:681`, `pages/extrato.tsx:762` e `pages/debt-detail.tsx` (`pagamento-valor` e `alocacao-*`).
- **Evidência:** só 5 campos têm `inputMode` (`categorias.tsx:692`, `orcamento.tsx:257`, `NovoItemForm.tsx:105`, `metas.tsx:321`, `reserva.tsx:500`). Em `#/lancar`, o campo Valor é `type=text` sem `inputmode`, então o Android abre o teclado de letras.
- **Medir de novo:** `financas/formularios.json` (lancar.campos[*].inputmode) e `grep -c inputMode apps/financas/web/src/pages/*.tsx`.
- **Corrigir:** `inputMode="decimal"` em todo campo de valor e `numeric` nos inteiros.

#### FIN-26 · A fonte não tem pilha de reserva

**Baixa · esforço P** · legibilidade e robustez (não é critério WCAG direto)

- **Onde:** `apps/financas/web/src/styles.css` (bloco `@layer base` que define `--font-plus-jakarta` e `--font-jetbrains`).
- **Evidência:** `--font-plus-jakarta: 'Plus Jakarta Sans'` não tem reserva, então o reserva do token (`ui-sans-serif`) nunca vale. Com o Google Fonts bloqueado (`SEM_FONTES=1`), o `font-family` do body continua `"Plus Jakarta Sans"` e a página inteira cai na fonte serifada padrão do navegador (`shots/smoke-home.png`).
- **Medir de novo:** `SEM_FONTES=1` com `financas/fonte.mjs`, ou `getComputedStyle(document.body).fontFamily` com as fontes bloqueadas.
- **Corrigir:** `--font-plus-jakarta: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif` (e o mesmo para JetBrains Mono, com `ui-monospace`).

## 5. Contraste dos tokens nos dois temas

Medido pelo `ui/contraste-tokens.mjs` sobre o `packages/ui/src/styles.css` real (claro em `:root`, escuro em `.dark`) e sobre o bloco `.halloween` do `apps/web/app/globals.css` (escopo escuro). Os outros scripts das frentes dão diferenças de até 0,07 por arredondamento (ex.: foreground / background 17,53 em vez de 17,46). **Negrito** marca o que reprova.

**Texto (mínimo 4,5):**

| Par                                        | Claro    | Escuro | Halloween | Onde aparece                               |
| ------------------------------------------ | -------- | ------ | --------- | ------------------------------------------ |
| foreground / background                    | 17,46    | 16,57  | 17,18     | texto da página, Dialog, Sheet             |
| card-foreground / card                     | 18,42    | 15,52  | 16,21     | Card                                       |
| popover-foreground / popover               | 18,42    | 15,52  | 16,21     | menu, Command, Ajuda                       |
| secondary-foreground / secondary           | 16,26    | 14,52  | 14,14     | Button e Badge secondary                   |
| accent-foreground / accent                 | 15,48    | 13,63  | 13,59     | item focado do menu, hover ghost e outline |
| muted-foreground / background              | 6,98     | 7,44   | 9,29      | descrições, texto de exemplo do Input      |
| muted-foreground / card                    | 7,37     | 6,96   | 8,76      | descrição em card                          |
| muted-foreground / muted                   | 6,50     | 6,51   | 8,04      | texto apagado sobre `bg-muted`             |
| muted-foreground / accent                  | 6,19     | 6,12   | 7,35      | Close do Dialog aberto                     |
| primary-foreground / primary               | 7,46     | 8,96   | 7,50      | Button e Badge default                     |
| primary-foreground / primary a 90%         | 5,94     | 7,37   | 6,18      | Button default em hover                    |
| primary-foreground / primary a 80%         | 4,72     | 5,98   | 5,10      | Badge default em hover                     |
| destructive-foreground / destructive       | 5,03     | 6,86   | 4,58      | Button e Badge destructive                 |
| destructive-foreground / destructive a 90% | 4,66     | 5,70   | 5,42      | Button destructive em hover                |
| primary / background                       | 7,07     | 9,36   | 7,50      | links, Button link                         |
| primary / card                             | 7,46     | 8,76   | 7,08      | links em card                              |
| primary / muted                            | 6,59     | 8,20   | 6,49      | link sobre `bg-muted`                      |
| primary / accent-soft sobre background     | 6,43     | 7,74   | 6,26      | chips `text-primary bg-accent-soft`        |
| primary / accent-soft sobre card           | 6,73     | 7,01   | 5,75      | os mesmos chips dentro de card             |
| destructive / background                   | 4,77     | 7,16   | **4,35**  | FormMessage, rótulo com erro               |
| destructive / card                         | 5,03     | 6,70   | **4,11**  | FormMessage em card                        |
| destructive / muted                        | **4,46** | —      | —         | erro sobre `bg-muted` (script do site)     |
| success / background                       | 5,08     | 10,24  | 10,13     | texto de sucesso                           |
| warn / background                          | 4,87     | 11,62  | 12,93     | texto de atenção                           |
| win / background                           | 4,60     | 7,10   | 9,34      | texto de vencedor                          |
| win / card                                 | 4,85     | 6,65   | 8,82      | vencedor em card                           |
| win / muted                                | **4,28** | —      | —         | vencedor sobre `bg-muted` (script do site) |
| success-foreground / success               | 5,36     | 9,81   | 10,13     | pílula de sucesso                          |
| warn-foreground / warn                     | 5,14     | 11,13  | 12,93     | pílula de atenção                          |
| win-foreground / win                       | 4,85     | 6,80   | 9,34      | pílula de vencedor                         |
| popover-foreground a 60% / popover         | 4,82     | 6,19   | 6,34      | atalho do menu (`opacity-60`)              |

**Não textual (mínimo 3):**

| Par                           | Claro    | Escuro   | Halloween | Onde aparece                                              |
| ----------------------------- | -------- | -------- | --------- | --------------------------------------------------------- |
| ring / background             | 7,07     | 9,36     | 7,50      | anel de foco sobre a página                               |
| ring / card                   | 7,46     | 8,76     | 7,08      | anel de foco dentro de card                               |
| ring / primary                | 1,00     | 1,00     | 1,00      | anel colado ao Button default (UI-04; só informativo)     |
| ring / destructive            | 1,48     | 1,31     | 1,72      | anel colado ao Button destructive (UI-04; só informativo) |
| ring / input                  | 5,55     | 6,39     | 5,05      | anel colado à borda do Input                              |
| input / background            | **1,27** | **1,46** | **1,48**  | borda do campo transparente (UI-03)                       |
| input / card                  | **1,34** | **1,37** | **1,40**  | borda do campo em card (UI-03)                            |
| border / background           | **1,27** | **1,46** | **1,48**  | contorno de Card e Dialog (só informativo)                |
| accent / popover              | **1,19** | **1,14** | **1,19**  | item focado do menu e do Command (UI-01)                  |
| accent / background           | **1,13** | **1,22** | **1,26**  | hover de ghost e outline (só informativo)                 |
| foreground a 70% / background | 6,75     | 8,31     | 8,50      | ícone do Close (`opacity-70`)                             |
| muted-foreground / background | 6,98     | 7,44     | 9,29      | ícone do gatilho do Ajuda                                 |
| chart-1 / card                | **2,10** | 8,76     | —         | série de gráfico (UI-11)                                  |
| chart-2 / card                | 3,06     | 9,59     | —         | série de gráfico                                          |
| chart-3 / card                | **2,13** | 10,88    | —         | série de gráfico (UI-11)                                  |
| chart-4 / card                | 4,85     | 6,65     | —         | série de gráfico                                          |
| chart-5 / card                | 4,20     | 5,81     | —         | série de gráfico                                          |
| chart-1 / background          | **1,99** | 9,36     | —         | série de gráfico (UI-11)                                  |
| chart-2 / background          | **2,90** | 10,24    | —         | série de gráfico (UI-11)                                  |
| chart-3 / background          | **2,02** | 11,62    | —         | série de gráfico (UI-11)                                  |

"Só informativo": o 1.4.11 só exige 3:1 da borda quando ela é o que identifica o componente, e o hover não é exigido. Para o anel de foco, o que o 1.4.11 e o 2.4.13 comparam é o pixel com foco contra o mesmo pixel sem foco (ring / background e ring / card, que passam); ring / primary e ring / destructive só mostram que o anel de 1 px se confunde com o botão (UI-04).

## 6. O que já cumpre

### `packages/ui`

- **Contraste de texto dos tokens** passa 4,5:1 nos dois temas (tabela da seção 5), incluindo hover, links sobre `accent-soft`, FormMessage e o atalho do menu com `opacity-60`. O gate `src/contraste.test.ts` roda no CI e trava texto sobre card e background, os pares `--x-foreground` / `--x` e ring / background.
- **Anel de foco contra as superfícies** passa com folga: ring sobre background, card e popover mede 7,07 ou mais (claro) e 8,76 ou mais (escuro). O ícone do Close com `opacity-70` mede 6,75 e 8,31.
- **Foco visível por teclado** no Button (nas 6 variantes), no Input, no Textarea e no gatilho do Ajuda: `:focus-visible` com `box-shadow` na cor do ring, e a mudança dos pixels fica com contraste mediano de 5,8 ou mais (claro) e 7,8 ou mais (escuro), medido em captura. As exceções são UI-01, UI-04, UI-10 e UI-23.
- **Ordem do Tab igual à visual:** 40 Tabs na galeria, com y e x crescentes por linha, voltando ao body sem armadilha, nos dois temas.
- **Semântica do Radix correta:** Dialog e Sheet têm `role=dialog` com título e descrição ligados, prendem o foco e fecham com Esc (`sheet.test.tsx`, `ajuda.test.tsx`). O DropdownMenu tem `role=menu` nomeado pelo gatilho e expõe o estado dos itens de marcar. O Close do Sheet se chama "Fechar". O gatilho do Ajuda tem `aria-label`, `aria-haspopup` e `aria-expanded`.
- **Ajuda com área de 44×44:** o círculo de 20×20 tem área clicável de 44×44 por pseudo-elemento; `elementFromPoint` a ±21 px do centro acerta o gatilho, e o `ajuda.test.tsx` cobre isso.
- **Reduzir movimento nas sobreposições:** Dialog, Sheet, DropdownMenu, CommandDialog e o popover do Ajuda trocam a entrada com deslocamento (200 a 300 ms) por só opacidade (120 ms). O Button pressionado só encolhe com `motion-safe`. A troca de tema pula a View Transition com reduzir movimento (`transicao-de-tema.ts:19-24`). Há trava E2E em `apps/web/app/(site)/movimento.e2e.ts`.
- **Texto a 200%** (1280 px): sem rolagem para o lado e sem texto cortado. Os componentes usam rem; o Button default passa de 36 para 72 px.
- **Dialog em 320×256:** `max-h-[calc(100dvh-2rem)]` com `overflow-y-auto` deixa todo o conteúdo alcançável. O CommandDialog cabe inteiro.
- **Espaçamento de texto (1.4.12)** a 375 px: nenhum componente corta texto.
- **Formulário:** FormLabel ligado ao controle; `aria-invalid` e `aria-describedby` no erro; no envio, o foco vai ao primeiro campo inválido; o erro não depende só de cor.
- **Consumo:** os três apps têm `<html lang="pt-BR">`; web e finanças trocam o tema pela classe `.dark` no `<html>`, como o pacote exige; a landing redeclara as cores em `@theme inline` para o `.dark` por seção funcionar.

### `apps/web`, site público e Votaí

- **axe sem violação nos dois temas em 16 dos 22 estados:** home, PiluLabs, `/tools`, 8 das 9 ferramentas (o JWT só falha no claro), `/privacidade`, `/feed` e os estados do Votaí anônimo, lista, sessão aberta, `/anteriores` e Halloween. No tema escuro, só o `/tasks` tem violação.
- **`<html lang="pt-BR">`** em todas as páginas e `openGraph.locale` `pt_BR`.
- **Foco por Tab em 22 estados:** toda parada muda de estilo de forma visível; 0 elemento focável escondido, invisível ou em `aria-hidden`; 0 foco coberto; a ordem segue a visual e toda sequência termina no body, sem armadilha.
- **Diálogo da carreira (Radix):** Enter abre, o foco fica preso por 8 Tabs, Esc fecha e devolve o foco ao gatilho. **Menu Tema:** `aria-haspopup=menu` e `aria-expanded`, Enter abre no 1º item e Esc devolve o foco ao botão.
- **Votaí:** o cartão de filme é um `<button>` com `aria-pressed`, que alterna com Espaço; o toast "Voto registrado" sai na região polite do Sonner; o histórico usa `nav aria-label="Páginas do histórico"` e `aria-busy`; voto e vencedor têm texto ou ícone além da cor ("Seu voto" com ✓, 🏆 Vencedor).
- **Reduzir movimento:** a home (kubectl, digitação e cursor) e o cenário de Halloween ficam sem animações; as entradas do pacote viram fade curto; o next-themes usa `disableTransitionOnChange`.
- **Refluxo e zoom:** em 320 px, 20 dos 22 estados não rolam para o lado; com zoom de 200%, nenhuma rolagem em `/`, `/tools`, `/tasks`, `/privacidade` e `/pilulabs`; o espaçamento do 1.4.12 não corta nada; o texto a 200% cresce em todas as páginas fora a home.
- **Nomes acessíveis:** as redes da home têm `aria-label` e 48×48 px, ícones em `aria-hidden` e uma `nav` "Redes sociais e contato"; logos decorativos com `alt=""`; ícones das lojas no PiluLabs com `sr-only`; campos de CPF, CNPJ, JSON (entrada), Base64 e roleta com `<Label htmlFor>`; busca do feed com `aria-label`; o kubectl decorativo em `aria-hidden`.
- **Alvos da home com `min-h-11`** (44 px): cards dos apps, links do blog, linhas da carreira e os botões "Falar comigo" e "Serviços da PiluTech". Só 2 alvos do site ficam abaixo de 24 px sem espaço (WEB-04).
- **Status dos apps da PiluTech** têm texto ("no ar", "beta…") além do ponto colorido, que fica em `aria-hidden`.
- **Datas do histórico do Votaí** saem do `Intl.DateTimeFormat` com `timeZone: 'America/Fortaleza'` (`lib/votacao/historico.ts:33`), e o feed formata a data pelo `Intl`.
- **`llms.txt`** no formato do llmstxt.org (`# nome`, `> resumo`, parágrafo e seções Páginas, Ferramentas, PiluLabs e Perfis). Há também o `llms-full.txt` (12.871 bytes no build local), a linha `# llms.txt:` no `robots.txt` e os dois no `sitemap.xml`. São gerados de `lib/rotas-publicas.ts` e do CMS (não escritos à mão), testados em `lib/llms.test.ts` e `app/seo.e2e.ts`, e só trazem o e-mail help@pilutech.com.br.
- A linha "Padrões: skill `padroes-produto-pilutech`." já está em `apps/web/CLAUDE.md:5`.

### `apps/web`, `/admin`

- **Login** (AdminLoginScreen), no build e nos dois temas: axe com 0 violações e 0 incompletos (WCAG e best-practice); `lang=pt-BR`, `main` e um único h1 ("Painel admin"); botões com nome; Tab na ordem visual, com foco visível; sem rolagem em 320 px; sem corte com texto a 200%; sem animação; erro com `role=alert` perto dos botões.
- **axe sem violação WCAG nos dois temas** em `/admin`, `/admin/posts`, `/admin/perfil`, `/admin/midia`, `/admin/sessoes`, `/admin/transcricao` e `/admin/passkeys`.
- **Diálogos do pacote:** o foco entra no diálogo ao abrir, 12 Tabs seguidos ficam dentro dele e Esc fecha. O título vira o nome do diálogo.
- **Ícones decorativos do FontAwesome** saem com `aria-hidden="true"`; o separador "/" da trilha e a seta da lista de votos também.
- **Botões só de ícone têm nome:** "Subir", "Descer" e "Remover <arquivo>" na transcrição; "Remover <tag>" nas tags; os 7 botões da barra de formatação; os switches com `role=switch`, `aria-checked` e `aria-label`; "Remover a passkey <nome>".
- **Reordenar a fila de áudios** da transcrição tem alternativa sem arrastar (Subir e Descer), o que atende o 2.5.7 nessa tela.
- **Mensagens de status:** ResumoButton com `role=alert` no erro e `role=status` no sucesso; Passkeys com `role=alert` e "Tentar de novo"; TranscricaoJob com `aria-live=polite`, `role=alert` no erro e `role=progressbar` com valores e o nome "Progresso da transcrição".
- **Toasts** (Sonner 2.0.7) numa região `aria-live=polite`; o Sonner respeita reduzir movimento e pausa no hover e no foco.
- **Reduzir movimento:** a entrada de página vira só opacidade (120 ms); a troca de tema pula a View Transition; nada pisca nem se mexe sozinho.
- **Formulários:** a maioria dos campos tem rótulo visível ligado ao campo; "Termos que aparecem" tem `Label htmlFor`; "Modo" da transcrição e "Tipos" da nova sessão usam `fieldset` e `legend`; nos formulários de coleção, o erro de validação aparece em texto ao lado do campo.
- **Passkeys** formata datas com `Intl.DateTimeFormat` ("Criada em 1 de out. de 2026").
- **Fora da busca:** `/admin` está em `Disallow: /admin` no `robots.txt`, fora do `sitemap.xml` e do `llms.txt`, e serve `noindex, nofollow`.

### `apps/financas`

- **Tema escuro sem nenhuma violação de contraste** no axe nas 18 rotas, nos dois tamanhos, e no login. Todo texto reprovado no claro passa no escuro (5,69 a 9,05, pelo pixel).
- **axe sem violações** em 14 das 18 rotas no claro e em 17 das 18 no escuro. A tela de login tem 0 violações nos dois temas, e os erros dela usam `role=alert`.
- **Estrutura:** `lang="pt-BR"`; 1 h1 por rota; landmarks `header`, `main` e `nav[aria-label='Navegação principal']` no celular e `aside`, `nav` e `main` no desktop.
- **Ícones e nomes:** todos os ícones lucide têm `aria-hidden`; os botões só de ícone têm nome (tema, conta, "Mais destinos", "Mês anterior" e "Próximo mês", estes com 44×44).
- **Formulários:** `<label>` ligado a todos os campos (medido em `#/lancar` e no Pagar fatura); os checkboxes do Lançar ficam dentro de rótulo com `ALVO_LINHA` (76×44, 37×44, 92×44).
- **Estado não depende só de cor:** a aba ativa tem `border-t-2` além da cor; as barras do Comprometido em alerta têm contorno tracejado e rótulo; os chips do Orçamento e das Metas têm texto e ícone; as barras de orçamento têm `role=progressbar` com `aria-valuenow`.
- **Reduzir movimento:** Sheet e Dialog trocam o deslize por um fade de 120 ms; a View Transition do tema não é chamada; as barras usam `motion-reduce:transition-none`; o botão só encolhe com `motion-safe`; o recharts roda com `isAnimationActive={false}`; não há carrossel nem troca automática.
- **Foco:** visível em todas as paradas medidas (7 rotas, 2 temas, 2 tamanhos); nenhum elemento focado fica coberto pela barra de abas fixa (`scroll-padding-bottom`); o Sheet prende o foco e o devolve no Esc; o diálogo de apagar abre em "Cancelar", a opção segura.
- **Alvos de 44 no uso diário:** barra de abas com `min-h-14`; tema e conta `size-11`; itens do painel Mais `min-h-11`; ações de linha do extrato com `ALVO_LINK` ("apagar" 57×44); "pagar fatura" 86×44; `#/metas` sem nenhum alvo abaixo de 44 a 390; as constantes `ALVO_*` de `lib/touch.ts` aparecem em 49 lugares.
- **Zoom liberado:** o meta viewport não bloqueia zoom. Em 640 px, nenhuma rota rola para o lado; em 320 px, 13 das 18 também não.
- **Gráficos com alternativa:** `#/fluxo` e `#/comprometido` têm tabela com cabeçalhos `<th>`; a legenda de categorias traz nome, valor e porcentagem em texto.
- **`color-scheme`** claro e escuro aplicado e fundo do body definido nos dois temas.
- **Data de hoje** calculada no fuso de Teresina (`todayInTeresina`); o `Passkeys.tsx:18` já usa `Intl.DateTimeFormat` com `timeZone: 'America/Fortaleza'`; ordenação com `localeCompare`.

## 7. Não medido

- **Leitor de tela real** (VoiceOver, TalkBack, NVDA): nenhuma frente ouviu. Os anúncios foram conferidos pelos atributos, pela árvore de acessibilidade (`ariaSnapshot`) e pelo axe.
- **Alto contraste do sistema (`forced-colors`) e inversão de cores:** não emulados. Os anéis de foco são `box-shadow`, que some em `forced-colors`; o efeito não foi medido.
- **Zoom real do navegador, escala de fonte do Android e Dynamic Type:** aproximados com largura de 320 e 640 px e `font-size` do `<html>` a 200%, sem aparelho.
- **Flash (WCAG 2.3.1):** sem instrumento. Nada no código anima luminância rápido (as asas dos morcegos do Halloween escalam em 0,35 s), e o finanças não tem animação em laço na carga.
- **Contraste sobre gradiente e imagem:** o axe deixou `color-contrast` como incompleto em 13 a 14 nós na home, 4 na roleta e no `/anteriores` e 6 no Halloween; falta conferir com conta-gotas. No pacote, o gradiente do body foi calculado como uma camada sólida de 13% (o pior caso). No admin, as imagens dos mocks têm 1×1 px. No finanças, os 832 incompletos foram resolvidos por composição e pixel real; a recontagem com composição em canvas foi cancelada pela carga da máquina (load 60 a 140), e vale a primeira passada, confirmada pelo pixel dos 10 textos reprovados.
- **Distinção entre as séries do gráfico e daltonismo:** só cada série contra o fundo foi medida.
- **Contraste em hover e pressionado:** só o `primary/90` (5,94 e 7,37) e os desabilitados (isentos).
- **`/votacao/admin`** (`app/(site)/votacao/admin/page.tsx`) e os fluxos de admin do Votaí (encerrar, desempate, girar a roleta de Halloween): a frente do site deixou para a do admin, e a do admin deixou para a do site. Ficou sem medir. (As telas `/admin/sessoes` foram medidas.)
- **Página real de post:** sem `BLOG_REPO_TOKEN`, o build não tem post. Só o CSS do corpo foi medido (WEB-01). Ficam sem medir o diagrama mermaid (tema "neutral" fixo nos dois temas), os blocos shiki, o TL;DR, a capa e o teclado na página.
- **Câmera** (leitor de QR e entropia da roleta) e **Copiar** (área de transferência): o headless não tem câmera; só o estado de erro e o caminho com o aleatório do navegador foram medidos.
- **Partes do site não abertas:** diálogo de gerenciar tags e importar/exportar do Kanban; estados vazios do Kanban e do feed com erro de rede; ordem do Tab no layout de celular (o Tab foi medido só a 1280); o Votaí no host de produção (o 308 não foi exercitado); os ícones remotos dos apps (`pilutech.com.br/apps.json`), porque com a rede bloqueada a home usou a lista local.
- **Partes do admin só por leitura de código:** MediaPickerDialog, DeleteConfirmDialog, painel "Trocar as tags" do ResumoButton, aba Dividir, tela "Acesso negado" e o menu de tema aberto. Não medidos: OAuth do Google e do GitHub, cerimônia de passkey, envio e arrasto de arquivos e transcrição em andamento.
- **Partes do finanças:** Worker real (estados vazios, carregamento longo, passos 2 a 4 do `#/importar`, Pluggy, gerar insight, cadastrar passkey, e-mail de alertas); login real com Google; Tab completo em importar, regras, recorrentes, categorias, dívidas e transferir.
- **Mensagens de erro do `apps/ramielle` e do `apps/promeia`** que chegam ao usuário: nenhuma frente leu esses textos. O `lib/votacao/api-client.ts` do web, que as mostra, entra no WEB-17.
- **Expansão de 35% dos textos em en e es:** não há catálogos para medir.
- **Botaí:** consome o pacote pelo npm em outro repositório e não foi auditado aqui. A conferência leu os imports do checkout local (`133cc89`): só `avatar`, `button`, `card`, `cn` e `input`, sem Command, Chart, Dialog, Sheet nem menu.
- **Storybook do web:** não foi rodado (o decorador "dark" não troca as cores das classes, segundo o `packages/ui/CLAUDE.md`).
- **Checkbox, Switch e Select:** não existem no `packages/ui`; os apps usam controles nativos ou próprios, medidos dentro de cada app.
- **Rotas por idioma e `llms.txt` no admin e no finanças:** não se aplicam (atrás de login e fora da busca). O idioma desses dois deve vir do navegador e dos Ajustes quando houver catálogo.
- **`apps/pilutech-site`:** não auditado, porque não está mais em produção; o `pilutech.com.br` sai do repositório `pilutech-sites` (ver seção 1).

## 8. Proposta de ordem dos PRs

**A ordem final é do Pilutech Maestro.** Esta é só uma proposta: PRs pequenos, juntando os achados que se corrigem no mesmo lugar, com os de severidade alta primeiro. A localização vai numa trilha à parte, porque é esforço G em três produtos.

Regras para todos os PRs:

- Cada PR traz o teste do que corrige (Jest ou Vitest, E2E com Playwright, `ariaSnapshot`) e a linha "A11y/l10n" no relatório, como pede a skill.
- As mudanças no `packages/ui` valem para o web e o finanças, e para o Botaí pelo npm nos componentes que ele importa (Button, Input, Card, Avatar): medir o efeito visual em cada um antes de subir.
- O gate de axe com "zero serious e critical" entra por produto, depois que os achados serious daquele produto saírem, para entrar verde.

### Trilha A: acessibilidade

**Bloco 1: severidade alta**

| #   | PR                                                      | Achados                                            | Sev. | Esforço |
| --- | ------------------------------------------------------- | -------------------------------------------------- | ---- | ------- |
| A1  | web: prose do post e da pré-visualização nos dois temas | WEB-01                                             | alta | P       |
| A2  | ui: foco visível nos itens de menu e do Command         | UI-01, UI-23                                       | alta | P       |
| A4  | web: Kanban por teclado e com nomes                     | WEB-02, WEB-03, WEB-04                             | alta | M       |
| A5  | admin: reordenar listas por teclado                     | ADM-01                                             | alta | M       |
| A6  | admin: menu da conta                                    | ADM-02, ADM-13                                     | alta | P       |
| A7  | admin: editor de post                                   | ADM-05, ADM-09, ADM-25, rótulos do editor (ADM-12) | alta | P       |
| A8  | admin: erros de formulário visíveis e anunciados        | ADM-06, FieldShell e ImageField (ADM-12)           | alta | M       |
| A9  | admin: layout em tela estreita e com texto grande       | ADM-04, ADM-17                                     | alta | M       |
| A10 | financas: contraste dos alertas no tema claro           | FIN-01, FIN-02                                     | alta | P       |

O A3 (Command) desceu para o bloco 2 na conferência: nenhum app do monorepo nem o Botaí o importa hoje.

**Bloco 2: design system (média e baixa, vale para os apps que usam o pacote)**

| #   | PR                                                               | Achados              | Sev.  | Esforço |
| --- | ---------------------------------------------------------------- | -------------------- | ----- | ------- |
| A11 | ui: borda do campo e anel de foco com afastamento                | UI-03, UI-04         | média | P       |
| A12 | ui: Fechar de Dialog e Sheet (44 px e rótulo "Fechar")           | UI-06, UI-08         | média | P       |
| A13 | ui: alvos de 44 em Button, Input e menus; botão que quebra linha | UI-05, UI-07, UI-15  | média | M       |
| A14 | ui: refluxo de menu e Sheet                                      | UI-14, UI-21         | baixa | P       |
| A15 | ui: FormMessage anunciado, Ajuda com nome, menu modal            | UI-12, UI-24, UI-25  | média | P       |
| A16 | ui: gráfico com foco e nome                                      | UI-10                | média | P       |
| A17 | ui: movimento                                                    | UI-13, UI-26, WEB-25 | média | P       |
| A18 | ui: cores das séries do gráfico (depois da decisão do dono)      | UI-11                | média | M       |
| A3  | ui: Command (itens desabilitados, separador, nomes)              | UI-02, UI-09, UI-22  | média | P       |

No A12, a prop do rótulo com padrão "Fechar" já resolve o 3.1.2; o catálogo do pacote (B1) passa a fornecer o texto depois.

**Bloco 3: apps (média e baixa)**

| #   | PR                                                        | Achados                        | Sev.  | Esforço |
| --- | --------------------------------------------------------- | ------------------------------ | ----- | ------- |
| A19 | web: textos de interface em pt-BR (Tema, toasts, dnd-kit) | WEB-19                         | média | P       |
| A20 | web: contraste das tags, dos selos e do Halloween         | WEB-05, WEB-06                 | média | P       |
| A21 | web: ferramentas anunciam erro e resultado                | WEB-09                         | média | P       |
| A22 | web: animações com pausa e reduzir movimento              | WEB-11, WEB-12                 | média | P       |
| A23 | web: refluxo e texto grande na home e no Kanban           | WEB-14, WEB-15                 | média | M       |
| A24 | web: alvos de 44 no site (depois do A13)                  | WEB-13                         | média | M       |
| A25 | web: filtros do feed, landmarks e títulos                 | WEB-10, WEB-24                 | média | P       |
| A26 | web: `llms.txt` do Votaí                                  | WEB-23                         | baixa | P       |
| A27 | admin: foco visível e devolvido                           | ADM-07, ADM-08, ADM-10, ADM-22 | média | P       |
| A28 | admin: estado, títulos, tabelas e cabeçalhos              | ADM-11, ADM-18, ADM-19, ADM-21 | média | P       |
| A29 | admin: contraste do diff e do switch                      | ADM-14, ADM-15                 | média | P       |
| A30 | admin: alvos de 44 (depois do A13)                        | ADM-16                         | média | M       |
| A31 | admin: erros que não somem                                | ADM-20                         | média | M       |
| A32 | financas: foco ao fechar, ao editar e no painel Mais      | FIN-06, FIN-22                 | média | P       |
| A33 | financas: título por tela, pular para o conteúdo, h2      | FIN-07, FIN-20, FIN-19         | média | P       |
| A34 | financas: refluxo em 320 px                               | FIN-10, FIN-12                 | média | P       |
| A35 | financas: erros por campo e avisos sem `role=alert`       | FIN-08, FIN-13                 | média | M       |
| A36 | financas: tamanhos de texto em rem                        | FIN-11                         | média | M       |
| A37 | financas: alvos de 44 (depois do A13)                     | FIN-04                         | média | M       |
| A38 | financas: `inputMode` e fonte de reserva                  | FIN-25, FIN-26                 | baixa | P       |

**Bloco 4: gates de teste por produto**

| #   | PR                                                                         | Achados | Sev.  | Esforço |
| --- | -------------------------------------------------------------------------- | ------- | ----- | ------- |
| A39 | ui: axe, teclado e `ariaSnapshot` no pacote; contraste não textual no gate | UI-19   | média | M       |
| A40 | web: `@axe-core/playwright` no site e no admin                             | WEB-16  | média | M       |
| A41 | financas: axe nas 18 rotas, nos dois temas                                 | FIN-14  | média | M       |

A infraestrutura do axe pode entrar antes, já no primeiro PR de cada produto, com o gate ligado só no fim.

### Trilha B: localização

| #   | PR                                                                                   | Achados                | Sev.  | Esforço |
| --- | ------------------------------------------------------------------------------------ | ---------------------- | ----- | ------- |
| B1  | ui: catálogo do pacote, idioma por contexto, teste de chaves, tooltip pelo `Intl`    | UI-16, UI-18, UI-17    | média | M       |
| B2  | web: módulo de formatação por idioma (datas, números, unidades, plural)              | WEB-20, ADM-28, ADM-31 | média | M       |
| B3  | financas e tools: moeda, datas e plural pelo `Intl`                                  | FIN-16                 | média | M       |
| B4  | web: catálogo pt-BR e teste de chaves, por área (vários PRs)                         | WEB-17, WEB-22         | média | G       |
| B5  | financas: catálogo pt-BR e teste de chaves, por tela (vários PRs)                    | FIN-15, FIN-18         | média | G       |
| B6  | financas: Worker devolve código e a SPA traduz; insight e e-mail no idioma da pessoa | FIN-17                 | média | G       |
| B7  | web: rotas `/en` e `/es` com `hreflang` (depois do B4)                               | WEB-18                 | média | G       |
| B8  | web: conteúdo do CMS em en e es (depois da decisão do Paulo)                         | WEB-21                 | média | G       |

Antes do B6, vale ler as mensagens de erro do `apps/ramielle` e do `apps/promeia` que chegam ao usuário (seção 7), para o mesmo padrão de código e tradução valer para os três. As traduções en e es são texto de produto e, quando públicas, precisam do OK do Paulo.

## 9. Conferência adversarial

Feita em 2026-11-13, no mesmo commit `faa66a0`. Não houve build novo: a conferência serviu o standalone do web já gerado (porta 4661), o `dist` do finanças por `vite preview` (porta 4663) e um harness Vite próprio só com o Command do `packages/ui` (porta 4665). O navegador foi o headless shell 1243 com o Playwright 1.59.1 do monorepo e o axe-core 4.11.1. Toda requisição fora do servidor local foi abortada e as APIs responderam dados fictícios. Os três servidores foram parados no fim. Scripts e JSON: `conferencia/` na pasta de rascunho da seção 2 (`comum.cjs`, `site.cjs`, `admin.cjs`, `financas.mjs`, `command.cjs`).

### Refeito e confirmado

| Achado         | O que foi refeito                                       | Resultado                                                                                                                                                                              |
| -------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-01          | menu Tema em `/`, Enter e ↓, nos dois temas             | #e5ecf5 sobre #ffffff = 1,19; #18212f sobre #0f141f = 1,14; sem outline nem box-shadow. Igual.                                                                                         |
| UI-02          | harness com o Command, nos dois temas                   | `data-disabled="false"`, opacidade 0,5 e `pointer-events: none` nos 3 itens; o clique cai no contêiner; axe 3,46 e 3,18 (claro) e 4,35 (escuro), `aria-required-children` 1 nó. Igual. |
| UI-10          | SVGs do recharts em `#/` do finanças                    | 2 com `role=application`, `tabindex=0`, `<title>` vazio e sem `aria-label`. Igual.                                                                                                     |
| WEB-01         | bloco `prose prose-invert post-prose` em `/privacidade` | claro: #ffffff sobre #f7f9fc = 1,05 (h2, h3, negrito) e #d1d5dc = 1,39 a 1,40 (p, li); axe 5 nós. Escuro: 0. Igual.                                                                    |
| WEB-02         | Enter e Espaço no cartão `k1`                           | 0 diálogos nos dois; região viva "Draggable item k1 was moved over droppable area k1."; clique abre 1. Igual.                                                                          |
| WEB-03         | modal do cartão com 1 link                              | axe `button-name` critical 1 nó; 2 campos sem rótulo; tags sem `aria-pressed`. Igual.                                                                                                  |
| WEB-04         | axe em `/tasks`                                         | `nested-interactive` 2 nós, `target-size` 4 nós (246×12 e 226×20). Igual.                                                                                                              |
| WEB-05         | branco sobre as 10 cores de `TAG_COLORS`                | de 1,52 a 5,48; 7 reprovam; axe 1,51 e 2,32. Igual, a menos de 0,01 de arredondamento.                                                                                                 |
| WEB-24         | título e link de pular em 6 páginas                     | `/tools/cpf` com título "CPF"; nenhuma página com link de pular. Igual.                                                                                                                |
| ADM-01         | Espaço, ↓, Espaço, Enter, ↓, Enter na linha "Botaí"     | ordem igual e 0 chamadas ao `reorder`; instrução em inglês; axe `nested-interactive` 2 e `target-size` 4. Igual.                                                                       |
| ADM-02         | Enter no Menu da conta, ↓ quatro vezes, ↑ e Tab duas    | foco sempre em "Sair"; "Desconectar" visível e nunca focado. Igual.                                                                                                                    |
| ADM-04         | 320 px                                                  | `/admin` com 599 px e `/admin/posts` com 590, `main` com 64 px. Confirmado; as larguras ficam 3 a 4% abaixo das do relatório por causa dos dados fictícios.                            |
| ADM-05         | Tab, Tab, Shift+Tab e Esc+Tab no editor                 | Tab e Shift+Tab ficam no `.cm-content` e mudam o texto; Esc+Tab vai para o switch "Publicado"; axe `aria-input-field-name` 1 e `color-contrast` 1. Igual.                              |
| ADM-06         | título vazio e "Salvar alterações"                      | "Obrigatório" não aparece; "Slug inválido…" aparece; 0 `role=alert`, 0 `aria-invalid`, 0 toast; o foco fica no botão. Igual.                                                           |
| ADM-13         | nome do gatilho                                         | `aria-label` "Menu da conta" e texto visível "PV Paulo Victor". Igual.                                                                                                                 |
| FIN-01         | pixel real atrás do texto, 390, nos dois temas          | claro 4,13 e 4,16 (lido no começo da linha; o relatório leu 3,96 e 4,10 no centro); escuro 6,47 e 6,62. Confirmado.                                                                    |
| FIN-02         | axe em `#/`, claro                                      | #dd1313 sobre #fcecec = 4,39 (10 px) e a manchete em 4,46. Igual.                                                                                                                      |
| FIN-07, FIN-20 | Enter no link "Extrato", a 1280                         | título "Finanças" antes e depois; o foco fica no link; 0 `aria-live`; nenhum link de pular. Igual.                                                                                     |
| FIN-13         | carga de `#/`, sem interação                            | 1 `role=alert` visível ("acima de 50% — mais da metade…"). Igual.                                                                                                                      |

Também batem com o código as referências de UI-01, UI-03, UI-05, UI-08, UI-13, UI-16, UI-17, UI-21, WEB-01, WEB-06, WEB-16, WEB-20, ADM-02, ADM-04, ADM-05, ADM-06, ADM-18, FIN-01, FIN-07, FIN-08, FIN-16, FIN-17 (215 chamadas a `errJson`) e FIN-25, e as contagens de uso do pacote (Button em 77 arquivos, Input em 28, Skeleton em 20).

### Corrigido

1. **UI-02, de alta para média.** O defeito existe, mas nenhum app do monorepo importa o Command, e o Botaí (checkout local `133cc89`) importa só `avatar`, `button`, `card`, `cn` e `input`. Saiu o 2.1.1 dos critérios, porque o teclado funciona (Enter escolheu o item). O PR A3 foi para o bloco 2.
2. **UI-09, de média para baixa,** pelo mesmo motivo.
3. **UI-14, de média para baixa.** Os dois menus reais cabem em 320×256 (o da conta vai até 253 px; o Tema, até 162). É o mesmo critério que o relatório já usava no UI-21. O PR A14 ficou como baixa.
4. **UI-04, critério.** Nenhum critério AA exige 3:1 entre o anel e o próprio botão: o 1.4.11 e o 2.4.13 comparam o pixel com foco e sem foco, e o anel de 1 px fica sobre o fundo (7,07 e 9,36). A severidade média ficou pela regra PiluTech de foco visível, e as tabelas das seções 3 e 5 deixaram de marcar ring / primary e ring / destructive como reprovação.
5. **WEB-02:** a linha do KeyboardSensor é a `kanban-board.tsx:46`, não a `:130`. Entrou o 2.5.7, porque mover cartão e coluna só existe por arrasto, e a correção ganhou o campo "Coluna" no modal.
6. **ADM-17:** entrou a medição com zoom de 200% (640 px), que sustenta o 1.4.4 também pelo zoom.
7. **ADM-21:** entrou a falta do link de pular no admin (16 interativos antes do `main` em `/admin`), que nenhuma frente tinha registrado.
8. **FIN-01:** entrou a variação do número conforme o ponto lido no fundo com brilho.
9. **UI-19:** a referência do ESLint é `eslint.config.mjs:58-63`, não `:56-61`.
10. **Seções 1, 7 e 8:** o `apps/pilutech-site` não está mais em produção (o `pilutech.com.br` vem do repositório `pilutech-sites` desde 2026-10-27); o Botaí teve os imports conferidos; a regra dos PRs deixou de citar a landing.
11. **Seção 3:** contagens refeitas para 10 de severidade alta, 62 média e 20 baixa (92 no total).

### Conferido sem mudança

- **Numeração:** os ids que faltam (UI-20, WEB-07, WEB-08, ADM-03, ADM-23, ADM-24, ADM-26, ADM-27, ADM-29, ADM-30, FIN-03, FIN-05, FIN-09, FIN-21, FIN-23 e FIN-24) foram todos juntados e estão citados no achado que os absorveu. Não há achado duplicado, e todo achado aparece em um PR da seção 8.
- **O que o pedido mandou procurar já estava coberto:** `lang` (seção 6 e FIN-15), link de pular (WEB-24 e FIN-20, agora também ADM-21), título de página (WEB-24, ADM-18 e FIN-07), foco depois da troca de rota do hash router (FIN-07) e rótulo de gráfico (UI-10).
- **Linhas "Padrões":** estão no `CLAUDE.md` da raiz, no `apps/financas/CLAUDE.md` e no `packages/ui/CLAUDE.md` (acrescentadas nesta rodada) e no `apps/web/CLAUDE.md:5` (já existia). Não entraram no `apps/ramielle` e no `apps/promeia`, que não têm interface e ficam cobertos pela linha da raiz, nem no `apps/pilutech-site`, que saiu de produção.

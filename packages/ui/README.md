# @piluvitu/ui

Design system da PiluTech: tokens do Tailwind CSS 4 (cores, raio, fontes, temas claro e escuro), o helper `cn()` e componentes [shadcn/ui](https://ui.shadcn.com) sobre Radix, para React 19.

## Instalar

```sh
pnpm add @piluvitu/ui
```

`react` 19 é peer dependency. O pacote é só ESM, com um import por componente (não há import da raiz).

## CSS

O CSS de entrada do app importa o Tailwind e os tokens, e manda o Tailwind ler as classes do pacote:

```css
@import 'tailwindcss';
@import '@piluvitu/ui/styles.css';
@source '../node_modules/@piluvitu/ui/dist';
```

O caminho do `@source` é relativo ao arquivo CSS. Sem ele o Tailwind não varre o `node_modules` e descarta, sem erro nenhum, toda classe que só existe nos componentes. Para provar isso no build, o `styles.css` define (no fim, por `@utility`) uma classe sentinela que só é gerada quando o `@source` alcança o `dist/`: procure-a no CSS emitido.

## Componentes

```tsx
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
```

Subpaths: `cn`, `ajuda`, `aspect-ratio`, `avatar`, `badge`, `button`, `card`, `chart`, `command`, `dialog`, `dropdown-menu`, `form`, `input`, `label`, `separator`, `sheet`, `skeleton`, `textarea` e `styles.css`.

## Licença

MIT, © PiluTech, com o aviso do shadcn ([`LICENSE`](./LICENSE)). Código: https://github.com/PiluVitu/PiluVitu-Dev/tree/main/packages/ui

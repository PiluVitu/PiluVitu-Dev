/**
 * Tema claro/escuro/sistema, sem provider — alterna `.dark` em `<html>` e
 * persiste em `localStorage`. `index.html` duplica a leitura inicial (script
 * síncrono no `<head>`) pra evitar flash antes do bundle React carregar;
 * mantenha a chave `CHAVE_STORAGE` em sincronia com aquele script.
 */
export type Tema = 'claro' | 'escuro' | 'sistema'

const CHAVE_STORAGE = 'financas-tema'
const MEDIA_QUERY_ESCURO = '(prefers-color-scheme: dark)'

// Handle do listener de `sistema` ativo, se houver — pra poder remover antes
// de registrar outro (troca de tema) ou trocar pra claro/escuro (sem vazar).
let pararDeOuvirSistema: (() => void) | null = null

function aplicarClasseDark(escuro: boolean): void {
  document.documentElement.classList.toggle('dark', escuro)
}

export function temaSalvo(): Tema {
  const valor = localStorage.getItem(CHAVE_STORAGE)
  return valor === 'claro' || valor === 'escuro' || valor === 'sistema'
    ? valor
    : 'sistema'
}

export function aplicarTema(tema: Tema): void {
  localStorage.setItem(CHAVE_STORAGE, tema)

  pararDeOuvirSistema?.()
  pararDeOuvirSistema = null

  if (tema !== 'sistema') {
    aplicarClasseDark(tema === 'escuro')
    return
  }

  const media = window.matchMedia(MEDIA_QUERY_ESCURO)
  const ouvirMudanca = () => aplicarClasseDark(media.matches)
  ouvirMudanca()
  media.addEventListener('change', ouvirMudanca)
  pararDeOuvirSistema = () => media.removeEventListener('change', ouvirMudanca)
}

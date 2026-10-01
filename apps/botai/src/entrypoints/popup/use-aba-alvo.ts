import { useEffect, useState } from 'react'
import { browser } from 'wxt/browser'
import { detectarNavegador } from '../../lib/navegador'
import { situacaoDaUrl, type SituacaoPagina } from '../../lib/paginas'

export interface AbaAlvo {
  id: number
  url: string | undefined
  situacao: SituacaoPagina
}

export async function buscarAbaAlvo(busca: string): Promise<AbaAlvo | null> {
  // Costura de teste: aberto como aba pelo Playwright, o popup se enxergaria como a aba ativa.
  const forcada =
    import.meta.env.MODE === 'e2e'
      ? new URLSearchParams(busca).get('aba')
      : null
  const aba = forcada
    ? await browser.tabs.get(Number(forcada))
    : (await browser.tabs.query({ active: true, currentWindow: true }))[0]
  if (aba?.id === undefined) return null
  const acessoArquivo = aba.url?.startsWith('file:')
    ? await browser.extension.isAllowedFileSchemeAccess()
    : false
  return {
    id: aba.id,
    url: aba.url,
    situacao: situacaoDaUrl(aba.url, acessoArquivo, detectarNavegador()),
  }
}

export function useAbaAlvo(): AbaAlvo | null | undefined {
  const [aba, setAba] = useState<AbaAlvo | null | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    void buscarAbaAlvo(location.search).then((encontrada) => {
      if (vivo) setAba(encontrada)
    })
    return () => {
      vivo = false
    }
  }, [])
  return aba
}

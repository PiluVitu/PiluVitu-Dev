import type { Pessoa } from '@piluvitu/tools/pessoa'
import { useEffect, useState } from 'react'
import { browser } from 'wxt/browser'
import { PessoaPronta } from '../../components/pessoa-pronta'
import type { StatusHost } from '../../components/pilula-host'
import { PopupShell } from '../../components/popup-shell'
import { PrimeiroUso } from '../../components/primeiro-uso'
import { Rodape } from '../../components/rodape'
import { gerarPessoaNova, pessoaItem } from '../../lib/armazenamento'
import { hojeISO, idadeEm } from '../../lib/hoje'
import { enviar } from '../../lib/mensagens'
import { rotuloDoHost } from '../../lib/paginas'
import { useAbaAlvo } from './use-aba-alvo'

const PAGINA_DE_ATALHOS = 'chrome://extensions/shortcuts'
const COMANDO_PREENCHER = 'preencher-pagina'

function usePessoa(): Pessoa | null | undefined {
  const [pessoa, setPessoa] = useState<Pessoa | null | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    void pessoaItem.getValue().then((guardada) => {
      if (vivo) setPessoa(guardada)
    })
    const pararDeOuvir = pessoaItem.watch((nova) => setPessoa(nova))
    return () => {
      vivo = false
      pararDeOuvir()
    }
  }, [])
  return pessoa
}

function useAtalho(): string | undefined {
  const [atalho, setAtalho] = useState<string | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    void browser.commands.getAll().then((comandos) => {
      if (vivo)
        setAtalho(
          comandos.find((c) => c.name === COMANDO_PREENCHER)?.shortcut ?? '',
        )
    })
    return () => {
      vivo = false
    }
  }, [])
  return atalho
}

export function App() {
  const pessoa = usePessoa()
  const aba = useAbaAlvo()
  const atalho = useAtalho()
  if (pessoa === undefined || aba === undefined || atalho === undefined)
    return null

  const podePreencher = aba !== null && aba.situacao === 'ok'
  const status: StatusHost =
    aba === null || aba.situacao === 'ok' ? 'ok' : 'lock'
  const host = rotuloDoHost(aba?.url)
  const abrirAtalhos = () =>
    void browser.tabs.create({ url: PAGINA_DE_ATALHOS })

  if (pessoa === null) {
    return (
      <PopupShell
        host={host}
        status={status}
        rodape={
          <Rodape
            atalho={atalho}
            texto="preenche sem abrir o popup"
            onAlterarAtalho={abrirAtalhos}
          />
        }
      >
        <PrimeiroUso onGerar={() => void gerarPessoaNova()} />
      </PopupShell>
    )
  }

  return (
    <PopupShell
      host={host}
      status={status}
      rodape={
        <Rodape
          atalho={atalho}
          texto="preenche sem abrir"
          comAlterar
          onAlterarAtalho={abrirAtalhos}
        />
      }
    >
      <PessoaPronta
        pessoa={pessoa}
        idade={idadeEm(pessoa.nascimento.iso, hojeISO())}
        atalho={atalho}
        preencherDesabilitado={!podePreencher}
        onPreencher={() => {
          if (aba) void enviar({ tipo: 'preencher', tabId: aba.id })
        }}
        onNovaPessoa={() => void gerarPessoaNova()}
        onAbrirCaixa={() =>
          void browser.tabs.create({ url: pessoa.email.caixaUrl })
        }
        onCopiar={(valor) => navigator.clipboard.writeText(valor)}
      />
    </PopupShell>
  )
}

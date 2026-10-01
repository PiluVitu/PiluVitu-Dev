import type { Pessoa } from '@piluvitu/tools/pessoa'
import { useEffect, useState, type ReactNode } from 'react'
import { browser } from 'wxt/browser'
import { NenhumCampo } from '../../components/nenhum-campo'
import { PaginaProibida } from '../../components/pagina-proibida'
import { PessoaPronta } from '../../components/pessoa-pronta'
import { PopupShell } from '../../components/popup-shell'
import { PrimeiroUso } from '../../components/primeiro-uso'
import { ResultadoPreenchimento } from '../../components/resultado-preenchimento'
import { Rodape } from '../../components/rodape'
import { gerarPessoaNova, pessoaItem } from '../../lib/armazenamento'
import {
  aposPreencher,
  estadoAoAbrir,
  rodapeDaTela,
  statusDoHost,
  verDados,
  type EstadoPopup,
} from '../../lib/estado-popup'
import { hojeISO, idadeEm } from '../../lib/hoje'
import { enviar, type RespostaPreencher } from '../../lib/mensagens'
import { caminhoDaUrl, rotuloDoHost } from '../../lib/paginas'
import type { LinhaCampo } from '../../lib/resultado'
import { useAbaAlvo, type AbaAlvo } from './use-aba-alvo'

const PAGINA_DE_ATALHOS = 'chrome://extensions/shortcuts'
const COMANDO_PREENCHER = 'botai-preencher'

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
  return <TelaDoPopup pessoa={pessoa} aba={aba} atalho={atalho} />
}

function TelaDoPopup({
  pessoa,
  aba,
  atalho,
}: {
  pessoa: Pessoa | null
  aba: AbaAlvo | null
  atalho: string
}) {
  const [estado, setEstado] = useState<EstadoPopup>(() =>
    estadoAoAbrir(aba?.situacao ?? 'ok'),
  )
  const abrirAtalhos = () =>
    void browser.tabs.create({ url: PAGINA_DE_ATALHOS })
  const abrirCaixa = (dono: Pessoa) =>
    void browser.tabs.create({ url: dono.email.caixaUrl })
  const irParaOsDados = () => setEstado(verDados)

  async function preencher() {
    if (!aba) return
    const resposta = (await enviar({ tipo: 'preencher', tabId: aba.id })) as
      | RespostaPreencher
      | undefined
    if (resposta) setEstado(aposPreencher(resposta))
  }

  function mostrar(linha: LinhaCampo) {
    if (aba)
      void enviar({
        tipo: 'mostrar',
        tabId: aba.id,
        documentId: linha.documentId,
        idx: linha.idx,
      })
  }

  let conteudo: ReactNode
  if (estado.tela === 'proibida') {
    conteudo = (
      <PaginaProibida
        motivo={
          estado.situacao === 'arquivo-sem-acesso'
            ? 'arquivo-sem-acesso'
            : 'proibida'
        }
        nome={pessoa?.nome.completo ?? null}
        onVerDados={irParaOsDados}
        onGerarPessoa={() => void gerarPessoaNova()}
      />
    )
  } else if (estado.tela === 'resultado' && estado.resumo && pessoa) {
    conteudo = (
      <ResultadoPreenchimento
        resumo={estado.resumo}
        caminho={caminhoDaUrl(aba?.url)}
        nome={pessoa.nome.completo}
        onMostrar={mostrar}
        onAbrirCaixa={() => abrirCaixa(pessoa)}
        onVerDados={irParaOsDados}
      />
    )
  } else if (estado.tela === 'nenhum-campo' && estado.resumo) {
    conteudo = (
      <NenhumCampo
        y={estado.resumo.y}
        onTentarDeNovo={() => void preencher()}
        onVerDados={irParaOsDados}
      />
    )
  } else if (pessoa === null) {
    conteudo = <PrimeiroUso onGerar={() => void gerarPessoaNova()} />
  } else {
    conteudo = (
      <PessoaPronta
        pessoa={pessoa}
        idade={idadeEm(pessoa.nascimento.iso, hojeISO())}
        atalho={atalho}
        preencherDesabilitado={aba === null || estado.situacao !== 'ok'}
        onPreencher={() => void preencher()}
        onNovaPessoa={() => void gerarPessoaNova()}
        onAbrirCaixa={() => abrirCaixa(pessoa)}
        onCopiar={(valor) => navigator.clipboard.writeText(valor)}
      />
    )
  }

  const rodape = rodapeDaTela(estado.tela, pessoa !== null)
  return (
    <PopupShell
      host={rotuloDoHost(aba?.url)}
      status={statusDoHost(estado)}
      rodape={
        rodape && (
          <Rodape
            atalho={atalho}
            texto={rodape.texto}
            comAlterar={rodape.comAlterar}
            onAlterarAtalho={abrirAtalhos}
          />
        )
      }
    >
      {conteudo}
    </PopupShell>
  )
}

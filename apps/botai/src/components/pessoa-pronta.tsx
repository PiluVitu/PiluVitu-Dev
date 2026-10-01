import {
  faArrowUpRightFromSquare,
  faBolt,
  faEye,
  faInbox,
  faShuffle,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import { Avatar, AvatarFallback } from '@piluvitu/ui/avatar'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { useState } from 'react'
import { CHIPS, gruposDaPessoa, type IdGrupo } from '../lib/grupos'
import { FiltroChips } from './filtro-chips'
import { LinhaCopiavel } from './linha-copiavel'
import { BOTAO_SM, META_MONO, OVERLINE } from './tipografia'
import { useCopiado } from './use-copiado'

export interface PessoaProntaProps {
  pessoa: Pessoa
  idade: number
  atalho: string
  preencherDesabilitado: boolean
  onPreencher: () => void
  onNovaPessoa: () => void
  onAbrirCaixa: () => void
  onCopiar: (valor: string) => Promise<void>
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

function CabecalhoGrupo({ rotulo, total }: { rotulo: string; total: number }) {
  return (
    <div className="flex items-center gap-2.5 px-2 pt-3.5 pb-1.5">
      <h2 className={cn(OVERLINE, 'text-muted-foreground m-0')}>{rotulo}</h2>
      <span className="text-primary font-mono text-[10.5px] font-medium">
        {String(total).padStart(2, '0')}
      </span>
      <span className="bg-border h-px flex-1" />
    </div>
  )
}

function AvisoCaixaPublica({ onAbrir }: { onAbrir: () => void }) {
  return (
    <div className="border-warn/35 bg-warn/[0.08] mx-2 mt-1.5 mb-0.5 flex gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-normal">
      <FontAwesomeIcon icon={faEye} className="text-warn mt-1 text-[11px]" />
      <span className="text-pretty">
        <strong className="text-warn font-semibold">Caixa pública.</strong> Quem
        souber o endereço lê os e-mails. Só para teste, nunca para conta real.{' '}
        <button
          type="button"
          onClick={onAbrir}
          className="text-primary focus-visible:ring-ring cursor-pointer underline-offset-[3px] hover:underline focus-visible:ring-1 focus-visible:outline-none"
        >
          abrir caixa →
        </button>
      </span>
    </div>
  )
}

export function PessoaPronta({
  pessoa,
  idade,
  atalho,
  preencherDesabilitado,
  onPreencher,
  onNovaPessoa,
  onAbrirCaixa,
  onCopiar,
}: PessoaProntaProps) {
  const [filtro, setFiltro] = useState<'tudo' | IdGrupo>('tudo')
  const copiado = useCopiado()
  const grupos = gruposDaPessoa(pessoa).filter(
    (g) => filtro === 'tudo' || g.id === filtro,
  )

  async function copiar(chave: string, valor: string) {
    await onCopiar(valor)
    copiado.marcar(chave)
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 pt-4 pb-3.5">
        <Avatar>
          <AvatarFallback className="bg-accent-soft text-primary font-sans text-[13px] font-bold">
            {iniciais(pessoa.nome.completo)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-[3px]">
          <h1 className="m-0 text-base font-bold tracking-[-0.01em]">
            {pessoa.nome.completo}
          </h1>
          <div className={META_MONO}>
            {idade} anos · {pessoa.endereco.cidade}, {pessoa.endereco.uf}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        <Button
          size="lg"
          className="w-full gap-2"
          disabled={preencherDesabilitado}
          onClick={onPreencher}
        >
          <FontAwesomeIcon icon={faBolt} className="text-[13px]" />
          Preencher esta página
          {atalho !== '' && (
            <kbd className="bg-primary-foreground/[0.14] ml-1 rounded-[6px] px-1.5 py-0.5 font-mono text-[10.5px] font-medium">
              {atalho}
            </kbd>
          )}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className={BOTAO_SM}
            onClick={() => {
              copiado.limpar()
              onNovaPessoa()
            }}
          >
            <FontAwesomeIcon icon={faShuffle} className="text-xs" />
            Nova pessoa
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={BOTAO_SM}
            onClick={onAbrirCaixa}
          >
            <FontAwesomeIcon icon={faInbox} className="text-xs" />
            Caixa de entrada
            <FontAwesomeIcon
              icon={faArrowUpRightFromSquare}
              className="text-muted-foreground text-[10px]"
            />
          </Button>
        </div>
      </div>
      <FiltroChips opcoes={CHIPS} ativo={filtro} onChange={setFiltro} />
      <div className="px-2 pb-3">
        {grupos.map((grupo) => (
          <section key={grupo.id} aria-label={grupo.rotulo}>
            <CabecalhoGrupo rotulo={grupo.rotulo} total={grupo.linhas.length} />
            {grupo.linhas.map((linha) => {
              const chave = `${grupo.id}:${linha.rotulo}`
              return (
                <LinhaCopiavel
                  key={chave}
                  rotulo={linha.rotulo}
                  valor={linha.valor}
                  copiado={copiado.chave === chave}
                  onCopiar={() => void copiar(chave, linha.valor)}
                />
              )
            })}
            {grupo.id === 'email' && (
              <AvisoCaixaPublica onAbrir={onAbrirCaixa} />
            )}
            {grupo.id === 'cartao' && (
              <p className="text-muted-foreground mx-2 mt-1.5 mb-0.5 text-xs leading-normal text-pretty">
                Número de teste documentado da Stripe. Passa no Luhn; só aprova
                em sandbox.
              </p>
            )}
          </section>
        ))}
      </div>
    </>
  )
}

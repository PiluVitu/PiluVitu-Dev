import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBolt,
  faCheck,
  faCrosshairs,
  faInbox,
  faLock,
  faMagnifyingGlass,
  faRotateRight,
  faUserPlus,
} from '@fortawesome/free-solid-svg-icons'
import { Button } from '@piluvitu/ui/button'
import { Card } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { META_MONO, OVERLINE } from './tipografia'

export const BOTAO_SM = 'w-full gap-2 rounded-[14px] text-[13px]'
const PAINEL = 'rounded-[14px] px-3.5 py-3 shadow-none'
const H2_ESTADO = 'm-0 text-[17px] leading-[1.25] font-bold tracking-[-0.01em]'
const CORPO = 'm-0 text-[13px] leading-[1.55] text-muted-foreground text-pretty'
const CODIGO = 'font-mono text-xs'

function IconeTile({
  tom = 'neutro',
  children,
}: {
  tom?: 'neutro' | 'ok'
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex size-10 flex-none items-center justify-center rounded-[14px] border',
        tom === 'ok'
          ? 'border-ok/40 bg-ok/12 text-ok'
          : 'bg-card text-muted-foreground',
      )}
    >
      {children}
    </div>
  )
}

export function PrimeiroUso({ onGerar }: { onGerar: () => void }) {
  const linhas: [string, string][] = [
    ['CPF/CNPJ', 'dígito verificador correto'],
    ['CEP', 'existe, e rua, bairro e cidade batem'],
    ['cartão', 'faixa de sandbox, Luhn válido'],
  ]
  return (
    <div className="flex flex-col gap-3.5 px-5 pt-7 pb-5">
      <span className={cn(OVERLINE, 'text-primary')}>Primeiro uso</span>
      <h2 className="m-0 text-[20px] leading-[1.2] font-bold tracking-[-0.02em]">
        Ainda não há pessoa de teste
      </h2>
      <p className={CORPO}>
        Gere uma pessoa brasileira falsa e coerente. CPF, CNPJ, CEP e cartão
        passam na validação. Ela fica guardada até você pedir outra.
      </p>
      <Card className={cn(PAINEL, 'flex flex-col gap-2')}>
        {linhas.map(([k, v]) => (
          <div
            key={k}
            className="grid grid-cols-[72px_1fr] gap-2.5 text-[12px] leading-[1.4]"
          >
            <span className="text-primary font-mono">{k}</span>
            <span className="text-muted-foreground">{v}</span>
          </div>
        ))}
      </Card>
      <Button size="lg" className="w-full gap-2" onClick={onGerar}>
        <FontAwesomeIcon icon={faUserPlus} className="text-[13px]" />
        Gerar pessoa
      </Button>
    </div>
  )
}

export type CampoNaoReconhecido = { rotulo: string; seletor: string }

export function FillResult({
  preenchidos,
  total,
  caminho,
  nome,
  naoReconhecidos,
  onMostrar,
  onCaixa,
  onVerDados,
}: {
  preenchidos: number
  total: number
  caminho: string
  nome: string
  naoReconhecidos: CampoNaoReconhecido[]
  onMostrar: (i: number) => void
  onCaixa: () => void
  onVerDados: () => void
}) {
  return (
    <div className="flex flex-col gap-3.5 px-4 pt-[18px] pb-4">
      <div className="flex items-center gap-3">
        <IconeTile tom="ok">
          <FontAwesomeIcon icon={faCheck} />
        </IconeTile>
        <div className="flex flex-col gap-[3px]">
          <div className="text-[16px] font-bold tracking-[-0.01em]">
            {preenchidos} de {total} campos preenchidos
          </div>
          <div className={META_MONO}>
            {caminho} · com {nome}
          </div>
        </div>
      </div>
      <div
        className="flex gap-[3px]"
        role="img"
        aria-label={`${preenchidos} de ${total} campos preenchidos`}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-[3px]',
              i < preenchidos ? 'bg-ok' : 'border-warn border border-dashed',
            )}
          />
        ))}
      </div>
      {naoReconhecidos.length > 0 && (
        <>
          <div className="mt-1 flex items-center gap-2.5">
            <span className={cn(OVERLINE, 'text-muted-foreground')}>
              Não reconhecidos
            </span>
            <span className="text-warn font-mono text-[10.5px] font-medium">
              {String(naoReconhecidos.length).padStart(2, '0')}
            </span>
            <span className="bg-border h-px flex-1" />
          </div>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {naoReconhecidos.map((c, i) => (
              <li
                key={c.seletor}
                className="border-warn/50 flex items-center gap-2.5 rounded-xl border border-dashed px-3 py-[9px]"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] font-semibold">{c.rotulo}</span>
                  <span className="text-muted-foreground font-mono text-[11px] font-medium [overflow-wrap:anywhere]">
                    {c.seletor}
                  </span>
                </div>
                <button
                  type="button"
                  title="Mostrar na página"
                  aria-label={`Mostrar na página: ${c.rotulo}`}
                  onClick={() => onMostrar(i)}
                  className="text-muted-foreground hover:bg-accent -my-1 ml-auto flex size-7 flex-none cursor-pointer items-center justify-center rounded-[8px]"
                >
                  <FontAwesomeIcon icon={faCrosshairs} className="text-xs" />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground m-0 text-xs leading-normal text-pretty">
            Para esses, clique com o botão direito no campo e use{' '}
            <span className="text-foreground font-mono">
              piluvitu › Inserir
            </span>
            .
          </p>
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" className={BOTAO_SM} onClick={onCaixa}>
          <FontAwesomeIcon icon={faInbox} className="text-xs" />
          Caixa de entrada
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={BOTAO_SM}
          onClick={onVerDados}
        >
          Ver os dados
        </Button>
      </div>
    </div>
  )
}

export function NenhumCampo({
  encontrados,
  onTentar,
  onVerDados,
}: {
  encontrados: number
  onTentar: () => void
  onVerDados: () => void
}) {
  return (
    <div className="flex flex-col gap-3.5 px-4 pt-5 pb-4">
      <IconeTile>
        <FontAwesomeIcon icon={faMagnifyingGlass} />
      </IconeTile>
      <h2 className={H2_ESTADO}>Nenhum campo reconhecido nesta página</h2>
      <p className={CORPO}>
        Encontrei {encontrados} campos, mas nenhum com{' '}
        <span className={CODIGO}>name</span>, <span className={CODIGO}>id</span>
        , label ou <span className={CODIGO}>autocomplete</span> que eu conheça.
        Formulários dentro de iframe de outro domínio também ficam de fora.
      </p>
      <Card className={cn(PAINEL, 'flex flex-col gap-2.5')}>
        <span className="text-muted-foreground text-[12px]">
          Dá para inserir campo a campo:
        </span>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] font-medium">
          {['botão direito', 'piluvitu', 'Inserir'].map((t) => (
            <span key={t} className="contents">
              <span className="rounded-full border px-2 py-[3px]">{t}</span>
              <span className="text-muted-foreground">›</span>
            </span>
          ))}
          <span className="border-accent-line bg-accent-soft text-primary rounded-full border px-2 py-[3px]">
            CPF
          </span>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          className={BOTAO_SM}
          onClick={onTentar}
        >
          <FontAwesomeIcon icon={faRotateRight} className="text-xs" />
          Tentar de novo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={BOTAO_SM}
          onClick={onVerDados}
        >
          Ver os dados
        </Button>
      </div>
    </div>
  )
}

export function PaginaProibida({
  nome,
  onVerDados,
}: {
  nome?: string
  onVerDados: () => void
}) {
  return (
    <div className="flex flex-col gap-3.5 px-4 pt-5 pb-4">
      <IconeTile>
        <FontAwesomeIcon icon={faLock} />
      </IconeTile>
      <h2 className={H2_ESTADO}>
        O Chrome não deixa extensões mexerem nesta página
      </h2>
      <p className={CORPO}>
        Vale para páginas <span className={CODIGO}>chrome://</span>, a Chrome
        Web Store e o leitor de PDF, e para qualquer extensão. Abra o formulário
        numa aba comum e tente de novo.
      </p>
      <Button size="lg" disabled className="w-full gap-2">
        <FontAwesomeIcon icon={faBolt} className="text-[13px]" />
        Preencher esta página
      </Button>
      {nome && (
        <Card className={cn(PAINEL, 'flex items-center gap-3')}>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] font-semibold">{nome}</span>
            <span className="text-muted-foreground text-[12px]">
              Os dados continuam aqui para copiar.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto rounded-[14px] text-[13px]"
            onClick={onVerDados}
          >
            Ver os dados
          </Button>
        </Card>
      )}
    </div>
  )
}

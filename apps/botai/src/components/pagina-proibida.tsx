import { faBolt, faLock } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { Card } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import type { Navegador } from '../lib/navegador'
import type { SituacaoPagina } from '../lib/paginas'
import { IconeTile } from './icone-tile'
import { CODIGO, CORPO, H1_ESTADO, PAINEL } from './tipografia'

const BOTAO_DO_CARTAO = 'ml-auto flex-none gap-2 rounded-[14px] text-[13px]'

interface TextosDoNavegador {
  nome: string
  esquema: string
  loja: string
  paginaDeExtensoes: string
  opcaoDeArquivos: string
}

const TEXTOS: Record<Navegador, TextosDoNavegador> = {
  chrome: {
    nome: 'Chrome',
    esquema: 'chrome://',
    loja: 'a Chrome Web Store',
    paginaDeExtensoes: 'chrome://extensions',
    opcaoDeArquivos: 'Permitir acesso a URLs de arquivo',
  },
  edge: {
    nome: 'Edge',
    esquema: 'edge://',
    loja: 'a loja de complementos do Edge',
    paginaDeExtensoes: 'edge://extensions',
    opcaoDeArquivos: 'Permitir acesso a URLs de arquivo',
  },
  opera: {
    nome: 'Opera',
    esquema: 'opera://',
    loja: 'a loja de extensões do Opera',
    paginaDeExtensoes: 'opera://extensions',
    opcaoDeArquivos: 'Permitir acesso a URLs de arquivo',
  },
  firefox: {
    nome: 'Firefox',
    esquema: 'about:',
    loja: 'os sites da Mozilla (como addons.mozilla.org)',
    paginaDeExtensoes: 'about:addons',
    opcaoDeArquivos: 'Acessar arquivos locais no seu computador',
  },
}

export interface PaginaProibidaProps {
  motivo: Exclude<SituacaoPagina, 'ok'>
  navegador: Navegador
  nome: string | null
  onVerDados: () => void
  onGerarPessoa: () => void
}

export function PaginaProibida({
  motivo,
  navegador,
  nome,
  onVerDados,
  onGerarPessoa,
}: PaginaProibidaProps) {
  const textos = TEXTOS[navegador]
  return (
    <div className="flex flex-col gap-3.5 px-4 pt-5 pb-4">
      <IconeTile>
        <FontAwesomeIcon icon={faLock} />
      </IconeTile>
      {motivo === 'arquivo-sem-acesso' ? (
        <>
          <h1 className={H1_ESTADO}>Falta liberar o acesso a arquivos</h1>
          <p className={CORPO}>
            Em <span className={CODIGO}>{textos.paginaDeExtensoes}</span>, nos
            detalhes da extensão, ative {`'${textos.opcaoDeArquivos}'`} e tente
            de novo.
          </p>
        </>
      ) : (
        <>
          <h1 className={H1_ESTADO}>
            O {textos.nome} não deixa extensões mexerem nesta página
          </h1>
          <p className={CORPO}>
            Vale para páginas <span className={CODIGO}>{textos.esquema}</span>,{' '}
            {textos.loja} e o leitor de PDF, e para qualquer extensão. Abra o
            formulário numa aba comum e tente de novo.
          </p>
        </>
      )}
      <Button size="lg" disabled className="w-full gap-2">
        <FontAwesomeIcon icon={faBolt} className="text-[13px]" />
        Preencher esta página
      </Button>
      <Card className={cn(PAINEL, 'flex items-center gap-3')}>
        {nome ? (
          <>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-semibold">{nome}</span>
              <span className="text-muted-foreground text-[12px]">
                Os dados continuam aqui para copiar.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className={BOTAO_DO_CARTAO}
              onClick={onVerDados}
            >
              Ver os dados
            </Button>
          </>
        ) : (
          <>
            <span className="text-muted-foreground min-w-0 text-[12px]">
              Gere uma pessoa para copiar os dados à mão.
            </span>
            <Button
              variant="outline"
              size="sm"
              className={BOTAO_DO_CARTAO}
              onClick={onGerarPessoa}
            >
              Gerar pessoa
            </Button>
          </>
        )}
      </Card>
    </div>
  )
}

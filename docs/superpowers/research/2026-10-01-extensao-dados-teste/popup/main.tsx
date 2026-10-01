import './tema'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { config } from '@fortawesome/fontawesome-svg-core'
import { PopupShell, Rodape } from '../../components/PopupShell'
import {
  ActionBar,
  CardSandboxNote,
  CopyRow,
  FilterChips,
  GroupHeader,
  type Grupo,
  PersonHeader,
  PublicInboxNotice,
  useCopiado,
} from '../../components/Dados'
import {
  FillResult,
  NenhumCampo,
  PaginaProibida,
  PrimeiroUso,
} from '../../components/Estados'
import './style.css'
config.autoAddCss = false

const p = {
  nome: 'Maria Eduarda Souza',
  nasc: '14/03/1991',
  idade: 35,
  cpf: '384.529.176-19',
  rg: '38.452.917-8',
  cel: '(11) 98734-2156',
  senha: 'Ur$a-7kQ!pm2Lx',
  email: 'maria.souza.4821@tuamaeaquelaursa.com',
  cep: '01310-100',
  rua: 'Avenida Paulista',
  num: '402',
  compl: 'Apto 81',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  uf: 'SP',
  razao: 'Souza & Ribeiro Tecnologia Ltda',
  fantasia: 'Ribeiro Dev',
  cnpj: '47.508.213/0001-92',
  bandeira: 'Visa',
  cartao: '4000 0000 0000 3188',
  nomeCartao: 'MARIA E SOUZA',
  validade: '08/29',
  cvv: '731',
  pis: '127.48391.05-7',
  titulo: '1047 3826 0108',
}
const G: Grupo[] = [
  {
    id: 'pessoais',
    rotulo: 'Pessoais',
    linhas: [
      ['Nome', p.nome],
      ['Nascimento', p.nasc],
      ['CPF', p.cpf],
      ['RG', p.rg],
      ['Celular', p.cel],
      ['Senha', p.senha],
    ],
  },
  { id: 'email', rotulo: 'E-mail', linhas: [['E-mail', p.email]] },
  {
    id: 'endereco',
    rotulo: 'Endereço',
    linhas: [
      ['CEP', p.cep],
      ['Rua', p.rua],
      ['Número', p.num],
      ['Complemento', p.compl],
      ['Bairro', p.bairro],
      ['Cidade', p.cidade],
      ['UF', p.uf],
    ],
  },
  {
    id: 'empresa',
    rotulo: 'Empresa',
    linhas: [
      ['Razão social', p.razao],
      ['Fantasia', p.fantasia],
      ['CNPJ', p.cnpj],
    ],
  },
  {
    id: 'cartao',
    rotulo: 'Cartão',
    linhas: [
      ['Bandeira', p.bandeira],
      ['Número', p.cartao],
      ['Nome impresso', p.nomeCartao],
      ['Validade', p.validade],
      ['CVV', p.cvv],
    ],
  },
  {
    id: 'docs',
    rotulo: 'Documentos',
    linhas: [
      ['PIS/NIS', p.pis],
      ['Título', p.titulo],
    ],
  },
]
function App() {
  const [filtro, setFiltro] = useState('tudo')
  const copiado = useCopiado()
  const atalho = 'Alt+Shift+P'
  return (
    <PopupShell
      host="localhost:3000"
      status="ok"
      rodape={
        <Rodape
          atalho={atalho}
          texto="preenche sem abrir"
          onAlterar={() => {}}
        />
      }
    >
      <PersonHeader nome={p.nome} idade={p.idade} cidade={p.cidade} uf={p.uf} />
      <ActionBar atalho={atalho} />
      <FilterChips
        opcoes={[
          ['tudo', 'Tudo'],
          ...G.map((g) => [g.id, g.rotulo] as [string, string]),
        ]}
        ativo={filtro}
        onChange={setFiltro}
      />
      <div className="px-2 pb-3">
        {G.filter((g) => filtro === 'tudo' || filtro === g.id).map((g) => (
          <section key={g.id}>
            <GroupHeader rotulo={g.rotulo} total={g.linhas.length} />
            {g.linhas.map(([r, v]) => (
              <CopyRow
                key={r}
                rotulo={r}
                valor={v}
                copiado={copiado.chave === g.id + r}
                onCopiar={() => copiado.marcar(g.id + r)}
              />
            ))}
            {g.id === 'email' && <PublicInboxNotice onAbrir={() => {}} />}
            {g.id === 'cartao' && <CardSandboxNote />}
          </section>
        ))}
      </div>
    </PopupShell>
  )
}
const estado = new URLSearchParams(location.search).get('e') ?? '1b'
function Raiz() {
  const nada = () => {}
  if (estado === '1a')
    return (
      <PopupShell
        host="localhost:3000"
        status="ok"
        rodape={
          <Rodape atalho="Alt+Shift+P" texto="preenche sem abrir o popup" />
        }
      >
        <PrimeiroUso onGerar={nada} />
      </PopupShell>
    )
  if (estado === '1c')
    return (
      <PopupShell
        host="localhost:3000"
        status="ok"
        rodape={<Rodape atalho="Alt+Shift+P" texto="preenche de novo" />}
      >
        <FillResult
          preenchidos={12}
          total={14}
          caminho="/cadastro"
          nome={p.nome}
          naoReconhecidos={[
            {
              rotulo: 'Código de indicação',
              seletor: 'input[name="ref_code"]',
            },
            { rotulo: 'Como nos conheceu?', seletor: 'select#origem' },
          ]}
          onMostrar={nada}
          onCaixa={nada}
          onVerDados={nada}
        />
      </PopupShell>
    )
  if (estado === '1d')
    return (
      <PopupShell
        host="staging.app.dev"
        status="warn"
        rodape={<Rodape atalho="Alt+Shift+P" texto="preenche sem abrir" />}
      >
        <NenhumCampo encontrados={3} onTentar={nada} onVerDados={nada} />
      </PopupShell>
    )
  if (estado === '1e')
    return (
      <PopupShell host="chrome://settings" status="lock">
        <PaginaProibida nome={p.nome} onVerDados={nada} />
      </PopupShell>
    )
  return <App />
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Raiz />
  </StrictMode>,
)

import {
  NOME_PADRAO_DO_PDF_FINAL,
  TETO_TOTAL_EM_BYTES,
  cabemNoTeto,
  fracaoDaMesclagem,
  nomeDoPdfFinal,
} from './pdf-regras'

describe('fracaoDaMesclagem', () => {
  it('começa em 0 e anda pelo tamanho dos arquivos já lidos, até 90%', () => {
    const tamanhos = [10, 30, 60]
    expect(fracaoDaMesclagem(tamanhos, 0)).toBe(0)
    expect(fracaoDaMesclagem(tamanhos, 1)).toBeCloseTo(0.09)
    expect(fracaoDaMesclagem(tamanhos, 2)).toBeCloseTo(0.36)
    expect(fracaoDaMesclagem(tamanhos, 3)).toBeCloseTo(0.9)
  })

  it('salvando fica em 90%; lista vazia fica em 0', () => {
    expect(fracaoDaMesclagem([10], 1, true)).toBe(0.9)
    expect(fracaoDaMesclagem([], 0)).toBe(0)
  })
})

describe('cabemNoTeto', () => {
  it('o teto é de 100 MB', () => {
    expect(TETO_TOTAL_EM_BYTES).toBe(100_000_000)
  })

  it('aceita até somar o teto, inclusive', () => {
    expect(cabemNoTeto(0, [60, 40], 100)).toEqual([true, true])
  })

  it('recusa o que passa e continua tentando os menores que vêm depois', () => {
    expect(cabemNoTeto(50, [60, 30, 30], 100)).toEqual([false, true, false])
  })
})

describe('nomeDoPdfFinal', () => {
  it('vazio ou só espaços: mesclado.pdf', () => {
    expect(nomeDoPdfFinal('')).toBe(NOME_PADRAO_DO_PDF_FINAL)
    expect(nomeDoPdfFinal('   ')).toBe('mesclado.pdf')
    expect(nomeDoPdfFinal('.pdf')).toBe('mesclado.pdf')
  })

  it('põe a extensão quando falta e não repete quando já tem', () => {
    expect(nomeDoPdfFinal('contrato assinado')).toBe('contrato assinado.pdf')
    expect(nomeDoPdfFinal('Contrato.PDF')).toBe('Contrato.pdf')
  })

  it('tira barras, caracteres de controle e os proibidos no Windows', () => {
    expect(nomeDoPdfFinal('../../etc/passwd')).toBe('etc passwd.pdf')
    expect(nomeDoPdfFinal('a:b*c?"d<e>f|g\\h\u0000i')).toBe(
      'a b c d e f g h i.pdf',
    )
  })

  it('mantém acento e corta nomes longos', () => {
    expect(nomeDoPdfFinal('relatório de ação')).toBe('relatório de ação.pdf')
    expect(nomeDoPdfFinal('x'.repeat(300))).toBe(`${'x'.repeat(120)}.pdf`)
  })
})

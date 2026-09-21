import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  conectarPluggy,
  conexaoPluggy,
  contasPluggy,
  dicaParaErroPluggy,
  janelaPadrao,
  rotuloDeConta,
  salvarConexaoPluggy,
} from './pluggy'

afterEach(() => {
  vi.unstubAllGlobals()
})

function respondJson(data: unknown, status = 200) {
  return Promise.resolve({
    status,
    json: async () => ({ ok: true, data, notifications: [] }),
  })
}

function respondErro(status: number, code: string, message: string) {
  return Promise.resolve({
    status,
    json: async () => ({
      ok: false,
      data: null,
      notifications: [{ type: 'error', code, message }],
    }),
  })
}

describe('janelaPadrao — a guarda do primeiro import', () => {
  test('volta UM MÊS, nunca doze', () => {
    expect(janelaPadrao('2026-08-19')).toEqual({
      de: '2026-07-19',
      ate: '2026-08-19',
    })
  })

  test('vira o ano sem quebrar', () => {
    expect(janelaPadrao('2026-01-15')).toEqual({
      de: '2025-12-15',
      ate: '2026-01-15',
    })
  })

  test('apara o dia ao tamanho do mês anterior (31/03 → 28/02, nunca 03/03)', () => {
    expect(janelaPadrao('2026-03-31').de).toBe('2026-02-28')
  })

  test('ano bissexto: 31/03/2028 → 29/02', () => {
    expect(janelaPadrao('2028-03-31').de).toBe('2028-02-29')
  })

  test('a janela tem no máximo ~31 dias — o teste que quebra se alguém "ampliar o default"', () => {
    const { de, ate } = janelaPadrao('2026-08-19')
    const dias =
      (Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) /
      86_400_000
    expect(dias).toBeGreaterThan(0)
    expect(dias).toBeLessThanOrEqual(31)
  })
})

describe('dicaParaErroPluggy — cada causa manda pra um lugar diferente', () => {
  test('item desconectado nomeia o app Meu Pluggy e diz que repetir não adianta', () => {
    const dica = dicaParaErroPluggy('pluggy_item_disconnected')
    expect(dica).toMatch(/Meu Pluggy/)
    expect(dica).toMatch(/mesmo resultado/)
    // Não pode virar "configure os secrets": a configuração está certa.
    expect(dica).not.toMatch(/PLUGGY_CLIENT_ID/)
  })

  test('desligado fala dos secrets e NÃO manda reconectar nada', () => {
    const dica = dicaParaErroPluggy('pluggy_disabled')
    expect(dica).toMatch(/PLUGGY_CLIENT_ID/)
    expect(dica).not.toMatch(/Meu Pluggy/)
  })

  test('credencial inválida ≠ conexão caída', () => {
    const dica = dicaParaErroPluggy('pluggy_invalid_credentials')
    expect(dica).toMatch(/PLUGGY_CLIENT_SECRET/)
    expect(dica).not.toMatch(/Meu Pluggy/)
  })

  test('rate limit e indisponível dizem que nada precisa ser reconfigurado', () => {
    expect(dicaParaErroPluggy('pluggy_rate_limited')).toMatch(
      /nada precisa ser reconfigurado/i,
    )
    expect(dicaParaErroPluggy('pluggy_unreachable')).toMatch(
      /nada precisa ser mudado/i,
    )
  })

  test('"alguém respondeu e não entendi" nunca manda mexer em secret', () => {
    for (const code of ['pluggy_token_expired', 'pluggy_ilegivel']) {
      expect(dicaParaErroPluggy(code)).toMatch(/RESPONDEU/)
    }
  })

  test('janela grande manda dividir em partes', () => {
    expect(dicaParaErroPluggy('pluggy_janela_grande')).toMatch(
      /intervalo menor/,
    )
  })

  test('código não mapeado NÃO inventa conselho', () => {
    expect(dicaParaErroPluggy('invalid_query')).toBeNull()
    expect(dicaParaErroPluggy('qualquer_coisa')).toBeNull()
  })
})

describe('conexaoPluggy / salvarConexaoPluggy', () => {
  test('lê a conexão salva da chave por conta', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        urls.push(String(url))
        return respondJson({
          key: 'pluggy:a1',
          value: JSON.stringify({ item_id: 'it-1', account_id: 'ac-1' }),
        })
      }),
    )

    expect(await conexaoPluggy('a1')).toEqual({
      item_id: 'it-1',
      account_id: 'ac-1',
    })
    expect(urls[0]).toContain('/api/settings/pluggy%3Aa1')
  })

  test('nada salvo ⇒ null (não é erro)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => respondJson({ key: 'k', value: null })),
    )
    expect(await conexaoPluggy('a1')).toBeNull()
  })

  test('valor corrompido ou rota fora ⇒ null (degrada pro formulário)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => respondJson({ key: 'k', value: '{{{' })),
    )
    expect(await conexaoPluggy('a1')).toBeNull()

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() => respondErro(500, 'internal_error', 'caiu')),
    )
    expect(await conexaoPluggy('a1')).toBeNull()
  })

  test('shape incompleto (item_id vazio) ⇒ null, nunca uma conexão pela metade', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        respondJson({
          key: 'k',
          value: JSON.stringify({ item_id: '', account_id: 'ac-1' }),
        }),
      ),
    )
    expect(await conexaoPluggy('a1')).toBeNull()
  })

  test('salvar manda o par serializado na chave da conta', async () => {
    const chamadas: Array<{ url: string; body: string | undefined }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        chamadas.push({ url: String(url), body: init?.body as string })
        return respondJson({ key: 'k', value: 'x' })
      }),
    )

    await salvarConexaoPluggy('a1', { item_id: 'it-1', account_id: 'ac-1' })

    expect(chamadas[0].url).toContain('/api/settings/pluggy%3Aa1')
    expect(JSON.parse(chamadas[0].body ?? '{}')).toEqual({
      value: JSON.stringify({ item_id: 'it-1', account_id: 'ac-1' }),
    })
  })

  test('salvar LANÇA quando falha — um "salvei" mudo faria o dono voltar amanhã pro formulário vazio', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() => respondErro(500, 'internal_error', 'caiu')),
    )

    await expect(
      salvarConexaoPluggy('a1', { item_id: 'it-1', account_id: 'ac-1' }),
    ).rejects.toThrow()
  })
})

describe('dicaParaErroPluggy — aguardando autorização ≠ conexão caída', () => {
  test('manda TERMINAR a autorização em curso, e diz que o link é de uso único', () => {
    const dica = dicaParaErroPluggy('pluggy_aguardando_autorizacao')
    expect(dica).toMatch(/autorizar/i)
    expect(dica).toMatch(/aba/i)
    expect(dica).toMatch(/uso único/i)
  })

  // ⚠️ A asserção NEGATIVA é o ponto: as duas são 409 e as duas falam de
  // "conexão", mas uma manda TERMINAR o que está em curso e a outra manda
  // REFAZER no app Meu Pluggy o que caiu. Trocar as mensagens é mandar o dono
  // desfazer exatamente o que está certo.
  test('NÃO se parece com a de item_disconnected — nem a recíproca', () => {
    const aguardando = dicaParaErroPluggy('pluggy_aguardando_autorizacao')
    const desconectado = dicaParaErroPluggy('pluggy_item_disconnected')

    expect(aguardando).not.toBe(desconectado)
    // A de espera nunca manda abrir o app nem refazer a conexão.
    expect(aguardando).not.toMatch(/Meu Pluggy/)
    expect(aguardando).not.toMatch(/reconect/i)
    expect(aguardando).not.toMatch(/refazer/i)
    // E a de conexão caída nunca fala do link de autorização.
    expect(desconectado).not.toMatch(/uso único/i)
    expect(desconectado).not.toMatch(/autorizar/i)
  })
})

describe('conectarPluggy', () => {
  test('POSTa em /api/pluggy/connect e devolve o shape da conexão', async () => {
    const chamadas: Array<{ url: string; method: string | undefined }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        chamadas.push({ url: String(url), method: init?.method })
        return respondJson({
          item_id: 'it-1',
          status: 'WAITING_USER_INPUT',
          execution_status: 'USER_INPUT_TIMEOUT',
          authorize_url: 'https://meu.pluggy.ai/auth/abc',
        })
      }),
    )

    expect(await conectarPluggy()).toEqual({
      item_id: 'it-1',
      status: 'WAITING_USER_INPUT',
      execution_status: 'USER_INPUT_TIMEOUT',
      authorize_url: 'https://meu.pluggy.ai/auth/abc',
    })
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].url).toBe('/api/pluggy/connect')
    expect(chamadas[0].method).toBe('POST')
  })

  test('item que já veio autorizado ⇒ authorize_url null (não é erro)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        respondJson({
          item_id: 'it-1',
          status: 'UPDATED',
          execution_status: 'SUCCESS',
          authorize_url: null,
        }),
      ),
    )

    const conexao = await conectarPluggy()
    expect(conexao.authorize_url).toBeNull()
    expect(conexao.status).toBe('UPDATED')
  })

  test('LANÇA em erro — um "conectei" mudo deixaria o dono esperando uma aba que nunca abre', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          respondErro(503, 'pluggy_disabled', 'Pluggy não configurado'),
        ),
    )

    await expect(conectarPluggy()).rejects.toThrow('Pluggy não configurado')
  })
})

describe('contasPluggy', () => {
  test('sem itemId NÃO manda query nenhuma — o servidor usa o item salvo', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        urls.push(String(url))
        return respondJson({ item_id: 'it-salvo', contas: [] })
      }),
    )

    expect(await contasPluggy()).toEqual({ item_id: 'it-salvo', contas: [] })
    expect(urls).toEqual(['/api/pluggy/accounts'])
  })

  test('com itemId monta ?item_id= (encodado) e devolve as contas', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        urls.push(String(url))
        return respondJson({
          item_id: 'it/1',
          contas: [
            { id: 'ac-1', type: 'BANK', name: 'Nubank', number: '1234' },
            { id: 'ac-2', type: 'CREDIT', name: 'Nubank Cartão' },
          ],
        })
      }),
    )

    const contas = await contasPluggy('it/1')
    expect(contas.contas).toHaveLength(2)
    expect(contas.contas[0].id).toBe('ac-1')
    expect(urls).toEqual(['/api/pluggy/accounts?item_id=it%2F1'])
  })

  test('LANÇA em erro — "aguardando autorização" não pode virar lista vazia', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          respondErro(
            409,
            'pluggy_aguardando_autorizacao',
            'A conexão ainda não foi autorizada.',
          ),
        ),
    )

    await expect(contasPluggy()).rejects.toThrow(
      'A conexão ainda não foi autorizada.',
    )
  })
})

describe('rotuloDeConta — o type desconhecido é EXIBIDO, nunca achatado', () => {
  test('BANK vira "Conta corrente"', () => {
    expect(rotuloDeConta({ id: 'a', type: 'BANK' })).toBe('Conta corrente')
  })

  test('CREDIT vira "Cartão"', () => {
    expect(rotuloDeConta({ id: 'a', type: 'CREDIT' })).toBe('Cartão')
  })

  test('type desconhecido sai CRU — nunca "Desconhecido", nunca lança', () => {
    expect(rotuloDeConta({ id: 'a', type: 'INVESTMENT' })).toBe('INVESTMENT')
    expect(rotuloDeConta({ id: 'a', type: 'LOAN', name: 'Consignado' })).toBe(
      'LOAN · Consignado',
    )
    expect(rotuloDeConta({ id: 'a', type: '' })).toBe('')
  })

  test('concatena name e number quando existem', () => {
    expect(
      rotuloDeConta({
        id: 'a',
        type: 'BANK',
        name: 'Nubank',
        number: '1234-5',
      }),
    ).toBe('Conta corrente · Nubank · 1234-5')
  })

  test('sem name/number devolve só o tipo; só number também funciona', () => {
    expect(
      rotuloDeConta({ id: 'a', type: 'CREDIT', number: '**** 4242' }),
    ).toBe('Cartão · **** 4242')
    expect(rotuloDeConta({ id: 'a', type: 'CREDIT', name: 'Nubank' })).toBe(
      'Cartão · Nubank',
    )
  })
})

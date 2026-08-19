import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  conexaoPluggy,
  dicaParaErroPluggy,
  janelaPadrao,
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

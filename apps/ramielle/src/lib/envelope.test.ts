import { describe, expect, test } from 'vitest'
import { errJson, okJson, type Envelope } from './envelope'

describe('okJson', () => {
  test('devolve ok=true, data e notifications vazio, com status 200 por padrão', async () => {
    const res = okJson({ id: 'abc', db: 'up' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )

    const body = (await res.json()) as Envelope<{ id: string; db: string }>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual({ id: 'abc', db: 'up' })
    expect(body.notifications).toEqual([])
  })

  test('respeita o status informado (201 no create)', async () => {
    const res = okJson({ id: 'abc' }, 201)
    expect(res.status).toBe(201)
  })

  test('data null com ok=true é resposta válida (rota sem payload)', async () => {
    const res = okJson(null)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(true)
    expect(body.data).toBeNull()
  })

  test('notifications serializa como [] no JSON cru, nunca null', async () => {
    const texto = await okJson({ id: 'abc' }).text()
    expect(texto).toContain('"notifications":[]')
  })
})

describe('errJson', () => {
  test('devolve ok=false, data=null e uma notification do tipo error', async () => {
    const res = errJson(
      422,
      'invalid_json',
      'corpo da requisição não é JSON válido',
    )
    expect(res.status).toBe(422)
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )

    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.data).toBeNull()
    expect(body.notifications).toEqual([
      {
        type: 'error',
        code: 'invalid_json',
        message: 'corpo da requisição não é JSON válido',
      },
    ])
  })

  test('propaga o status HTTP recebido', async () => {
    expect(errJson(401, 'not_authenticated', 'sem sessão').status).toBe(401)
    expect(errJson(404, 'not_found', 'rota não encontrada').status).toBe(404)
    expect(errJson(503, 'db_down', 'banco indisponível').status).toBe(503)
  })

  test('com field: a notification carrega o campo ofensor', async () => {
    const res = errJson(422, 'invalid_field', 'email é obrigatório', 'email')
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications).toEqual([
      {
        type: 'error',
        code: 'invalid_field',
        message: 'email é obrigatório',
        field: 'email',
      },
    ])
  })

  test('sem field: a chave some do JSON, nunca vira null', async () => {
    const texto = await errJson(422, 'invalid_json', 'corpo inválido').text()
    expect(texto).not.toContain('"field"')

    const body = (await errJson(
      422,
      'invalid_json',
      'corpo inválido',
    ).json()) as Envelope<null>
    expect(body.notifications[0].field).toBeUndefined()
  })
})

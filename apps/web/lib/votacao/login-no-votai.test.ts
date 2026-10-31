/**
 * @jest-environment-options {"url": "http://votai.localhost:3333/12?x=1"}
 */
import { apiBase, startGoogleLogin } from './api-client'

it('no Votaí, o login manda callbackURL e errorCallbackURL absolutas na origem fixa', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      url: 'https://accounts.google.com/o/oauth2',
      redirect: true,
    }),
  } as Response)
  const navigate = jest.fn()
  await startGoogleLogin({ navigate })
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toBe(`${apiBase}/api/auth/sign-in/social`)
  expect(JSON.parse(init.body)).toEqual({
    provider: 'google',
    callbackURL: 'http://votai.localhost:3333/12?x=1',
    errorCallbackURL: 'http://votai.localhost:3333/12?x=1',
  })
  expect(navigate).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2')
})

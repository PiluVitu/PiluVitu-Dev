import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>()

// Envelope no mesmo shape de apps/api/internal/httpx/respond.go:
// { ok, data, notifications } — notifications NUNCA null, [] quando vazio.
// A Task 4 substitui este c.json manual pelo helper okJson() de lib/envelope.ts.
app.get('/api/health', (c) =>
  c.json({ ok: true, data: { status: 'ok' }, notifications: [] }),
)

export default app

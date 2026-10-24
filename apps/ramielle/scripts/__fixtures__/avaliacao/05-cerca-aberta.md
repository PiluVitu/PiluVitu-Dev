# Tratando erros no Worker

Toda excessão que escapa do handler vira um 500 genérico. Na semana passada houveram erros que ninguém viu nos logs.

A medida que o projeto cresce, vale centralizar isso num lugar só. O trecho abaixo é o começo:

```ts
// excessao tratada aqui, houveram casos sem log
app.onError((err, c) => {
  return c.json({ ok: false }, 500)

# Como organizei o deploy do blog

Mudei o fluxo de deploy devido a mudança no plano da hospedagem. O objetivo pricipal era parar de depender de um servidor ligado no meu Mac.

```ts
// nao mexer aqui: o build depende desta ordem
export const passos = ['lint', 'test', 'build']
```

Depois da troca, os testes passou de primeira, graças a ajuda do cache do pnpm. O resto foi ajustar as variáveis de ambiente.

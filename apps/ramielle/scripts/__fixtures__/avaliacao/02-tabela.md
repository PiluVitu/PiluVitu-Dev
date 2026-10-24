# Comparando três bancos para um projeto pequeno

Se voce quiser algo simples, o SQLite resolve quase tudo. Montei duas tabela para comparar os custos.

| Banco    | Custo   | Observacao             |
| -------- | ------- | ---------------------- |
| SQLite   | zero    | arquivo unico          |
| D1       | baixo   | roda na borda          |
| Postgres | variavel| precisa de um servidor |

No fim, deu pra ver qeu o D1 cobre o meu caso sem servidor nenhum.

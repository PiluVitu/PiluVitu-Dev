# Fatia ③ — Fatura em PDF com Ollama local

**Data:** 2026-07-27
**Antecedente:** fatia ② (import CSV/OFX), entregue. Esta fatia é **outra entrada para o mesmo pipeline**, não um pipeline novo.

## 0. Fatos medidos (2026-07-27)

- **Ollama 0.32.0** instalado, respondendo em `http://localhost:11434/api/generate`. Modelos disponíveis: `qwen2.5:3b-instruct` (1,9 GB) e `qwen2.5:7b-instruct` (4,7 GB).
- **Não existe `pdftotext`, `qpdf` nem `mutool`** na máquina. A extração de texto precisa de biblioteca JS.
- Node **v22.22.3**.

## 1. Problema

Banco que só entrega fatura em PDF fica de fora do import. É o buraco que sobra depois da fatia ②.

## 2. Onde isso roda, e por que não no Worker

Ollama exige GPU/Metal. **Nenhum instance type de Cloudflare Containers oferece GPU** — isso já estava registrado quando se discutiu migrar a API Go. Então o LLM roda no MacBook, ponto.

Restam três formas de conectar:

| Caminho                             | Veredito                                                                                                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navegador → `localhost:11434`       | **Incógnita não medida.** A SPA é servida por HTTPS; navegadores tratam `localhost` como origem confiável, mas a regra de conteúdo misto precisa ser verificada num navegador de verdade. Não construir sobre premissa não medida. |
| Worker → Cloudflare Tunnel → Ollama | Funciona de qualquer lugar, **mas acopla o app a o Mac estar ligado**. Uma tela que depende de outro computador acordado é uma tela que falha sem explicação.                                                                      |
| **CLI no Mac**                      | **Escolhido.** Sem incógnita, sem infra nova, funciona offline.                                                                                                                                                                    |

**Decisão: CLI.** O dono roda no Mac quando tem PDF para importar. É um fluxo oportunista por natureza — o Mac não está sempre ligado, e o app não pode depender disso.

O caminho do túnel fica documentado como evolução possível, não como promessa.

## 3. A saída do LLM não é confiável, e o desenho assume isso

⚠️ **O CLI não grava nada no banco.** Ele produz um **CSV** que entra pela tela de conferência da fatia ②.

Isso não é preguiça de integração — é o desenho certo. Um modelo de 3B extraindo linha de fatura vai errar valor, data ou descrição em alguma linha. A tela de conferência já existe, já mostra duplicata, já deixa trocar o estabelecimento sugerido e já obriga confirmação explícita. Mandar saída de LLM direto para o banco desperdiçaria a única etapa que existe justamente para isso.

Consequência: **zero backend novo nesta fatia.** O CSV gerado usa o mesmo caminho já testado ponta a ponta.

## 4. Fluxo

1. `node apps/financas/scripts/pdf-import.mjs fatura.pdf`
2. Extrai texto do PDF (biblioteca JS — não há `pdftotext`)
3. Manda para o Ollama com prompt pedindo **JSON estruturado**
4. Valida o JSON: data plausível, valor numérico, descrição não vazia
5. Escreve `fatura.csv` no formato que a tela de import já lê
6. O dono importa por `#/importar` e confere linha a linha

## 5. O prompt e a validação

O modelo devolve JSON. **JSON de LLM não é JSON até ser validado** — pode vir com markdown em volta, campo faltando, valor como string com "R$", data em formato inventado.

- Extrair o bloco JSON mesmo se vier cercado de ``` ou de texto
- Rejeitar linha que falhe validação, **reportando quais e por quê** — nunca descartar em silêncio
- Valor com `R$`, ponto de milhar e vírgula decimal passa por `parseBRL`
- Data em qualquer formato plausível vira `YYYY-MM-DD`; a que não converter é rejeitada, não chutada

**Se o modelo devolver zero linha válida, o CLI falha alto** com a saída bruta do modelo no log. Um CSV vazio que parece sucesso é pior que um erro.

## 6. Modelo

`qwen2.5:7b-instruct` por padrão (melhor em seguir esquema), com `--modelo` para trocar. O 3B fica como opção para máquina apertada.

⚠️ **Temperatura zero.** Extração não é criação; variação entre execuções aqui é defeito, não recurso.

## 7. Fora de escopo

- Categorização automática pelo LLM. Uma coisa de cada vez: primeiro extrair confiável, depois classificar.
- OCR de PDF escaneado. Se o PDF não tem camada de texto, o CLI diz isso e para — não é o mesmo problema.
- Rodar no Worker. Ver §2.

## 8. Critérios de aceitação

- `node scripts/pdf-import.mjs fatura.pdf` produz CSV que a tela de import lê sem ajuste
- JSON com markdown em volta é extraído mesmo assim
- Linha inválida é **relatada**, não silenciada
- Zero linha válida ⇒ falha alta, com a saída do modelo no log
- PDF sem camada de texto ⇒ mensagem clara, não stack trace
- Ollama desligado ⇒ mensagem dizendo como ligar, não `ECONNREFUSED` cru
- Nada é gravado no banco por este caminho

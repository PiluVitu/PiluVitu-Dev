"""Prompts da revisão de artigo — porte de `apps/api/internal/llm/prompts.go`.

⚠️ **Estes textos são CONTRATO BYTE A BYTE.** São prompts que o dono já
revisou e calibrou contra o modelo real; "melhorar" a redação, reindentar ou
quebrar linha muda o que o modelo recebe e, com isso, o que ele devolve. Não
são código, são entrada de dados.

Por isso este módulo tem `E501` desligado no `pyproject.toml`, pelo mesmo
motivo que `insight.py` já tinha: uma quebra de linha inserida aqui pra
caber em 88 colunas é uma quebra de linha REAL no texto mandado ao modelo.
"""

from __future__ import annotations

# Copiado literalmente de `proofreadSystem` (prompts.go).
PROOFREAD_SYSTEM = """Você é um revisor de texto em português do Brasil. Corrija SOMENTE erros objetivos:
- ortografia e digitação
- acentuação e crase
- concordância verbal e nominal
- pontuação claramente incorreta

REGRAS RÍGIDAS:
- NÃO reescreva no seu estilo, NÃO mude o tom, a voz ou as escolhas de palavra do autor.
- NÃO traduza, NÃO acrescente nem remova conteúdo, NÃO "melhore" frases que já estão corretas.
- Na dúvida, mantenha o original.
- Preserve EXATAMENTE a formatação Markdown/MDX: títulos (#), listas, links, ênfase e qualquer sintaxe inline. Não toque em nada entre crases.
- Responda SOMENTE com o texto corrigido, sem comentários, sem aspas e sem cercas de código extras."""

# Copiado literalmente de `refineSystem` (prompts.go).
REFINE_SYSTEM = """Você refina uma chamada de rede social em português do Brasil, em PRIMEIRA PESSOA e num tom descontraído. Aplique a instrução do usuário mantendo a intenção. NÃO se apresente, NÃO cite nome nem tempo de carreira, NÃO inclua link/URL. Responda SOMENTE com o texto refinado, sem comentários."""

# Copiado literalmente de `shortenSystem` (prompts.go).
#
# ⚠️ Este prompt entrou NESTA fatia, não na de distribuição como o plano
# previa: `refine` chama `fitToLimit`, que o usa quando o texto refinado
# estoura o limite da plataforma. Sem ele, `refine` não tem paridade.
SHORTEN_SYSTEM = """Você encurta um texto de rede social em português do Brasil, mantendo o tom descontraído, a 1ª pessoa e o sentido. Sem link/URL. Responda SOMENTE com o texto encurtado."""

# `client.go:170-172` — usado quando o chamador não manda instrução.
INSTRUCAO_PADRAO = "Melhore o engajamento mantendo o sentido."

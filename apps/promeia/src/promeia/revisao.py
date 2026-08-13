"""Revisão de artigo: `proofread` (corrigir) e `refine` (refinar chamada).

Porte de `apps/api/internal/llm/client.go`. Só a INFERÊNCIA mora aqui — o
estado e a publicação são do ramielle (§7.2 do spec). A regra de corte do
promeia é o que decide: inferência precisa de GPU/modelo local ⇒ aqui;
publicar em dev.to/Bluesky é HTTP pra API de terceiro ⇒ ramielle.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from promeia.markdown_blocos import Tipo, dividir_blocos, restaurar_bordas
from promeia.prompts import (
    HOOKS_SYSTEM_TMPL,
    INSTRUCAO_PADRAO,
    PROOFREAD_SYSTEM,
    REFINE_SYSTEM,
    SHORTEN_SYSTEM,
)

# ⚠️ Temperaturas DIFERENTES de propósito, medidas no Go: correção tem que ser
# conservadora (0.1), reescrita precisa de variação (0.7), encurtamento fica no
# meio (0.3). Uniformizar muda o comportamento das três.
TEMP_PROOFREAD = 0.1
TEMP_REFINE = 0.7
TEMP_SHORTEN = 0.3

# `platformLimit` (client.go). O default de 280 vale pra qualquer plataforma
# desconhecida — não é o limite do Twitter por acaso, é o mais restritivo.
LIMITES = {"bluesky": 300, "mastodon": 500}
LIMITE_PADRAO = 280

# Assinatura do `chat` injetado — mantém este módulo testável sem Ollama.
Chat = Callable[..., str]


def limite_da_plataforma(plataforma: str) -> int:
    return LIMITES.get(plataforma, LIMITE_PADRAO)


def truncar(texto: str, limite: int) -> str:
    """Corta em no máximo `limite` caracteres, recuando à última palavra inteira.

    ⚠️ **Divergência consciente do Go, registrada:** `truncateRunes`
    (client.go:205) compara um índice de BYTE (`strings.LastIndexAny`) com
    `limit/2`, que é contagem de RUNAS. Em texto acentuado — que é o caso, é
    português — o índice de byte é inflado, então o Go recua até a palavra
    inteira com mais frequência do que a condição sugere. Aqui uso índice de
    CARACTERE, que é o que a condição quer dizer.

    Efeito prático da diferença: só aparece quando o último espaço cai perto
    da metade do limite. Nesse caso o Go preserva a palavra e este porte corta
    — resultado mais curto, nunca texto quebrado. Preferi a semântica correta
    à réplica do arredondamento, porque o valor aqui é o texto que vai pro
    post, não um contrato de wire.
    """
    if len(texto) <= limite:
        return texto
    corte = texto[:limite]
    indice = max(corte.rfind(" "), corte.rfind("\n"), corte.rfind("\t"))
    if indice > limite // 2:
        corte = corte[:indice]
    return corte.strip()


def _ajustar_ao_limite(
    texto: str,
    limite: int,
    *,
    chat: Chat,
    model_hooks: str,
    base_url: str,
) -> str:
    """Porte de `fitToLimit`. Tenta encurtar via LLM; se não der, trunca.

    ⚠️ **Falha do LLM aqui é FAIL-SOFT, de propósito** (o Go faz
    `if shorter, err := ...; err == nil`): se o modelo não responder, o texto
    é truncado e devolvido, não vira erro. Um refine que falha inteiro porque
    o encurtamento opcional falhou seria pior que uma chamada um pouco longa.
    """
    if len(texto) <= limite:
        return texto

    try:
        encurtado = chat(
            model=model_hooks,
            system=SHORTEN_SYSTEM,
            user=(
                f"Encurte para no máximo {limite} caracteres, mantendo o tom e o "
                f"sentido, sem link/URL. Responda só com o texto:\n\n{texto}"
            ),
            temperature=TEMP_SHORTEN,
            base_url=base_url,
        )
    except Exception:
        # Silenciar aqui é o comportamento do Go, e é o certo: o encurtamento
        # é melhoria opcional sobre um texto que já existe.
        return truncar(texto, limite)

    despido = encurtado.strip()
    if despido and len(despido) <= limite:
        return despido
    if despido:
        texto = despido
    return truncar(texto, limite)


def proofread(
    texto: str,
    *,
    careful: bool,
    chat: Chat,
    model_proofread: str,
    model_proofread_careful: str,
    base_url: str,
) -> str:
    """Corrige typos/gramática preservando Markdown/MDX.

    ⚠️ Manda ao modelo **só os blocos de prosa** — código, tabela, HTML/JSX,
    citação e imagem passam verbatim. Não é otimização: é o que impede o LLM
    de "corrigir" um trecho de código.

    `careful=True` usa o modelo maior. O nível de revisão **já existia no Go**
    (`Proofread(ctx, text, careful bool)`); isto é porte, não feature nova.
    """
    model = model_proofread_careful if careful else model_proofread
    partes: list[str] = []
    for bloco in dividir_blocos(texto):
        if bloco.tipo is Tipo.PASSTHROUGH or bloco.texto.strip() == "":
            partes.append(bloco.texto)
            continue
        corrigido = chat(
            model=model,
            system=PROOFREAD_SYSTEM,
            user=bloco.texto,
            temperature=TEMP_PROOFREAD,
            base_url=base_url,
        )
        partes.append(restaurar_bordas(bloco.texto, corrigido.strip()))
    return "".join(partes)


def refine(
    plataforma: str,
    texto: str,
    instrucao: str,
    *,
    chat: Chat,
    model_hooks: str,
    base_url: str,
) -> str:
    """Reescreve uma chamada social conforme a instrução, dentro do limite."""
    if not instrucao:
        instrucao = INSTRUCAO_PADRAO
    limite = limite_da_plataforma(plataforma)
    user = (
        f"Plataforma: {plataforma} (limite {limite} chars)\n"
        f"Instrução: {instrucao}\n\nTexto atual:\n{texto}"
    )
    saida = chat(
        model=model_hooks,
        system=REFINE_SYSTEM,
        user=user,
        temperature=TEMP_REFINE,
        base_url=base_url,
    )
    return _ajustar_ao_limite(
        saida, limite, chat=chat, model_hooks=model_hooks, base_url=base_url
    )


@dataclass(frozen=True)
class Artigo:
    """Resumo do post usado pra gerar as chamadas (`llm.Article` no Go)."""

    title: str = ""
    excerpt: str = ""
    url: str = ""
    tags: list[str] = field(default_factory=list)
    # Trecho do artigo, só pra calibrar o tom do autor — o prompt manda
    # explicitamente NÃO copiá-lo.
    voice_sample: str = ""


@dataclass(frozen=True)
class Chamada:
    """Uma chamada gerada pra uma plataforma (`llm.Hook` no Go)."""

    platform: str
    text: str


def gerar_hooks(
    artigo: Artigo,
    plataformas: list[str],
    *,
    chat: Chat,
    model_hooks: str,
    base_url: str,
) -> list[Chamada]:
    """Porte de `GenerateHooks` (client.go:152).

    ⚠️ **Uma plataforma que falha derruba o lote inteiro**, igual ao Go
    (`return nil, fmt.Errorf(...)`). É paridade deliberada: devolver 3 de 4
    chamadas sem dizer qual faltou deixaria o dono publicar achando que
    gerou tudo.
    """
    chamadas: list[Chamada] = []
    for plataforma in plataformas:
        limite = limite_da_plataforma(plataforma)
        system = HOOKS_SYSTEM_TMPL.format(plataforma=plataforma, limite=limite)
        user = (
            f"Título: {artigo.title}\n"
            f"Resumo: {artigo.excerpt}\n"
            f"Tags: {', '.join(artigo.tags)}\n\n"
            f"Trecho do meu artigo (referência de voz):\n{artigo.voice_sample}"
        )
        texto = chat(
            model=model_hooks,
            system=system,
            user=user,
            temperature=TEMP_REFINE,
            base_url=base_url,
        )
        chamadas.append(
            Chamada(
                platform=plataforma,
                text=_ajustar_ao_limite(
                    texto, limite, chat=chat, model_hooks=model_hooks, base_url=base_url
                ),
            )
        )
    return chamadas

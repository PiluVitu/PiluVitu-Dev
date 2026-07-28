"""Insight financeiro — porte de apps/financas/scripts/insight.mjs.

⚠️ O MODELO NUNCA VÊ LANÇAMENTO CRU. `GET /api/insights/numbers` devolve só
agregado (totais por categoria/período, já calculados no Worker) — build_prompt
só recebe isso. É o que mantém o escopo do INGEST_TOKEN honesto: lê totais,
escreve prosa, nunca toca o livro-caixa.

⚠️ A ARITMÉTICA NÃO É IA. "Onde gastei mais", "quanto subiu" e "o que mais
cresceu" são consultas exatas, feitas no Worker, e a tela renderiza esses
números direto do dado. O texto gerado aqui é a leitura AO REDOR deles —
nenhum número exibido vem do modelo.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from promeia import ollama, ramielle
from promeia.config import Settings
from promeia.dates import competencia_atual, competencia_valida
from promeia.money import format_brl


class InsightVazio(Exception):
    """O modelo devolveu texto vazio — nada foi publicado."""


class PublicacaoFalhou(Exception):
    """Falhou ao publicar DEPOIS de o texto já estar gerado.

    ⚠️ Carrega o texto de propósito. Ele custou uma rodada de modelo, e a
    janela entre gerar e publicar é onde a rede realmente cai. Deixar a
    exceção de transporte subir crua perderia o texto e obrigaria a rodar
    tudo de novo — o CLI Node que este módulo substitui já imprimia o texto
    sob "--- texto gerado (NÃO publicado) ---" por esse motivo.

    NÃO herda de RamielleError: é um conceito do promeia (houve trabalho
    salvável), não uma categoria de falha de transporte. Quem trata precisa
    poder distinguir as duas.
    """

    def __init__(self, texto: str, causa: Exception) -> None:
        super().__init__(str(causa))
        self.texto = texto
        self.causa = causa


# --- prompt -------------------------------------------------------------


def _linha_categoria(row: dict, index: int) -> str:
    return f"{index + 1}. {row['category_name']}: {format_brl(abs(row['total_cents']))}"


def _linha_variacao(numbers: dict) -> str:
    pct = numbers["variation_pct"]
    cents = numbers["variation_cents"]
    anterior = numbers["previous_competence"]
    if pct is None:
        return f"Sem base de comparação: não houve gasto registrado em {anterior}."
    if cents == 0:
        return f"Sem variação em relação a {anterior}."
    direcao = "Aumento" if cents > 0 else "Redução"
    return (
        f"{direcao} de {format_brl(abs(cents))} ({abs(pct)}%) em relação a {anterior}."
    )


def _linha_maior_crescimento(numbers: dict) -> str:
    b = numbers["biggest_increase"]
    if b is None:
        return "(sem dado suficiente para apontar)"
    direcao = "aumento" if b["delta_cents"] >= 0 else "redução"
    return (
        f"{b['category_name']}: foi de {format_brl(abs(b['previous_cents']))} "
        f"para {format_brl(abs(b['current_cents']))} ({direcao} de "
        f"{format_brl(abs(b['delta_cents']))})."
    )


def build_prompt(numbers: dict) -> str:
    """Monta o prompt a partir do payload de GET /api/insights/numbers.

    As "REGRAS OBRIGATÓRIAS" no fim são o que impede o modelo de inventar um
    número. Não as enfraqueça: o prompt é contrato, e o dono lê este texto
    todo mês achando que os números vieram do banco.
    """
    competence = numbers["competence"]
    anterior = numbers["previous_competence"]
    top = numbers["top_categories"]

    linhas_categorias = (
        "\n".join(_linha_categoria(row, i) for i, row in enumerate(top))
        if top
        else "(nenhum gasto registrado nesta competência)"
    )

    return f"""Você escreve um resumo financeiro curto, em português do Brasil, para o dono de um controle financeiro pessoal/PJ.

Abaixo estão os ÚNICOS fatos que você pode usar. Eles já foram calculados por consulta exata ao banco de dados — você NÃO tem acesso a nenhum lançamento individual, só a estes totais já agregados.

Competência: {competence} (mês anterior de comparação: {anterior})
Total gasto em {competence}: {format_brl(abs(numbers["total_cents"]))}
Total gasto em {anterior}: {format_brl(abs(numbers["previous_total_cents"]))}
Variação: {_linha_variacao(numbers)}

Maiores categorias de gasto em {competence} (da maior para a menor):
{linhas_categorias}

Categoria com a maior variação de gasto em relação a {anterior}:
{_linha_maior_crescimento(numbers)}

Escreva um parágrafo de 3 a 5 frases resumindo esses fatos para o dono, em tom direto, sem saudação, sem "espero que ajude", sem markdown, sem lista — só o parágrafo corrido.

REGRAS OBRIGATÓRIAS, sem exceção:
- Use SOMENTE os números e nomes de categoria que aparecem acima. Não calcule nada novo, não arredonde diferente do que já está escrito, não converta nem estime.
- NUNCA invente um valor, uma categoria ou uma porcentagem que não esteja listada acima.
- Se um fato não tem dado suficiente (ex.: "sem base de comparação" ou "nenhum gasto registrado"), diga isso em vez de inventar um número.
- Não é preciso citar todos os números — escolha o que mais importa para contar a história do mês, mas nunca cite um número que não veio da lista acima."""


# --- orquestração -------------------------------------------------------


def run_insight(
    *,
    settings: Settings,
    competence: str | None = None,
    ler: Callable[[str], dict] | None = None,
    gerar: Callable[[str], str] | None = None,
    publicar: Callable[[str, str, str], Any] | None = None,
) -> tuple[str, str]:
    """Lê os números, gera a leitura, publica. Devolve (competência, texto).

    Os três passos são injetáveis: é o que permite testar a ORDEM e os casos
    degenerados sem tocar Ollama nem rede.
    """
    comp = competence or competencia_atual()
    if not competencia_valida(comp):
        raise ValueError(f"competência inválida (esperado YYYY-MM): {comp}")

    _ler = ler or (
        lambda c: ramielle.fetch_numbers(
            base_url=settings.ramielle_url,
            token=settings.ingest_token,
            competence=c,
        )
    )
    _gerar = gerar or (
        lambda p: ollama.generate(
            model=settings.ollama_model, prompt=p, base_url=settings.ollama_url
        )
    )
    _publicar = publicar or (
        lambda texto, modelo, periodo: ramielle.post_insight(
            base_url=settings.ramielle_url,
            token=settings.ingest_token,
            texto=texto,
            modelo=modelo,
            periodo=periodo,
        )
    )

    numbers = _ler(comp)
    texto = _gerar(build_prompt(numbers)).strip()

    if texto == "":
        raise InsightVazio(
            "o modelo devolveu texto vazio — nada foi publicado. "
            "Publicar um insight em branco pareceria sucesso e deixaria o card "
            "vazio na tela sem explicação"
        )

    try:
        _publicar(texto, settings.ollama_model, comp)
    except ramielle.RamielleError as err:
        raise PublicacaoFalhou(texto, err) from err

    return comp, texto


# --- rota ---------------------------------------------------------------

router = APIRouter()


class InsightBody(BaseModel):
    competence: str | None = None


def _erro(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status, content={"ok": False, "code": code, "message": message}
    )


@router.post("/insight")
def gerar_insight(body: InsightBody, request: Request):
    settings: Settings = request.app.state.settings
    try:
        competence, texto = run_insight(settings=settings, competence=body.competence)
    except ValueError as err:
        return _erro(422, "invalid_competence", str(err))
    except InsightVazio as err:
        return _erro(502, "empty_insight", str(err))
    except PublicacaoFalhou as err:
        # Devolve o texto no corpo do erro: quem chamou pode republicar sem
        # gastar outra rodada de modelo. Precisa vir ANTES dos ramos de
        # RamielleError — PublicacaoFalhou não herda deles de propósito, mas
        # a ordem deixa a intenção explícita pra quem lê.
        return JSONResponse(
            status_code=502,
            content={
                "ok": False,
                "code": "publish_failed",
                "message": str(err),
                "data": {"texto": err.texto},
            },
        )
    except ollama.OllamaModelMissing as err:
        return _erro(503, "ollama_model_missing", str(err))
    except ollama.OllamaUnreachable as err:
        # 503, não 502: o promeia está de pé, o Ollama não. Quem chama precisa
        # dessa distinção pra dizer "abra o Ollama" em vez de "suba o promeia".
        return _erro(503, "ollama_unreachable", str(err))
    except ollama.OllamaFailed as err:
        return _erro(502, "ollama_failed", str(err))
    except ramielle.RamielleUnreachable as err:
        return _erro(502, "ramielle_unreachable", str(err))
    except ramielle.RamielleRefused as err:
        return _erro(502, "ramielle_refused", str(err))

    return {
        "ok": True,
        "data": {
            "competence": competence,
            "texto": texto,
            "modelo": settings.ollama_model,
        },
    }

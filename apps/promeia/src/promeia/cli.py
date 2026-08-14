"""Entrypoint `promeia-insight` — o que o dono roda no Mac.

⚠️ Nada precisa continuar rodando depois. O Ollama só precisa estar de pé
DURANTE a execução; quando o comando termina, pode fechar o terminal e a
tampa. A tela lê o que já foi publicado no D1 e continua funcionando igual.

Enquanto o ramielle não tiver como chamar a rota POST /insight (o que depende
do hostname do promeia, e portanto de a API Go sair do ar), este comando é o
gatilho — exatamente como o CLI Node que ele substitui.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable, Mapping

from promeia.config import ConfigError, load_settings
from promeia.insight import InsightVazio, PublicacaoFalhou, run_insight
from promeia.ollama import OllamaError
from promeia.ramielle import RamielleError

USO = """Uso: promeia-insight [opções]

Lê os números já calculados de uma competência, manda pro Ollama local
escrever uma leitura em texto por cima deles, e publica o resultado no
ramielle. NÃO envia nenhum lançamento cru pro modelo — só os totais
agregados que a API já calculou.

Opções:
  --competencia <YYYY-MM>  Competência a resumir (default: mês corrente em Teresina)
  --help, -h               Mostra esta ajuda

Requisitos:
  - Ollama rodando localmente (ollama serve) com o modelo instalado
  - PROMEIA_TOKEN e INGEST_TOKEN no ambiente (ver apps/promeia/.env.example)
"""


def main(
    argv: list[str] | None = None,
    *,
    env: Mapping[str, str] | None = None,
    log: Callable[[str], None] = print,
    log_erro: Callable[[str], None] = lambda m: print(m, file=sys.stderr),
    executar: Callable[..., tuple[str, str]] | None = None,
) -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--competencia", "--competence", dest="competencia")
    parser.add_argument("--help", "-h", dest="ajuda", action="store_true")

    try:
        args, sobra = parser.parse_known_args(
            argv if argv is not None else sys.argv[1:]
        )
    except SystemExit:
        log_erro("erro: argumentos inválidos")
        log(USO)
        return 2

    if args.ajuda:
        log(USO)
        return 0
    if sobra:
        log_erro(f"erro: opção desconhecida: {sobra[0]}")
        log(USO)
        return 2

    try:
        settings = load_settings(env)
    except ConfigError as err:
        log_erro(f"erro: {err}")
        return 1

    if not settings.ingest_token:
        log_erro(
            "erro: a variável de ambiente INGEST_TOKEN não está definida — este "
            "comando não tem como se autenticar no ramielle.\n"
            "      Defina antes de rodar, com o MESMO valor configurado no "
            'servidor via "wrangler secret put INGEST_TOKEN"\n'
            "      (ou a chave INGEST_TOKEN de apps/financas/.dev.vars em "
            "desenvolvimento). Ex.: export INGEST_TOKEN=..."
        )
        return 1

    rodar = executar or run_insight

    log(f"==> buscando os números em {settings.ramielle_url}")
    log(
        f"==> consultando o Ollama (modelo {settings.ollama_model}, "
        f"{settings.ollama_url}) — pode levar alguns segundos"
    )
    try:
        competence, texto = rodar(settings=settings, competence=args.competencia)
    except ValueError as err:
        log_erro(f"erro: {err}")
        log(USO)
        return 2
    except PublicacaoFalhou as err:
        # O texto existe e não foi publicado. Imprimi-lo é o que separa
        # "perdi o trabalho" de "posso republicar isto à mão" — o CLI Node
        # que este substitui fazia exatamente isso.
        log_erro(f"erro: {err}")
        log_erro("--- texto gerado (NÃO publicado) ---")
        log_erro(err.texto)
        return 1
    except (InsightVazio, OllamaError, RamielleError) as err:
        log_erro(f"erro: {err}")
        return 1

    log("")
    log(f"==> insight de {competence} publicado com sucesso")
    log("")
    log(texto)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())

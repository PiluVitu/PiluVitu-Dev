import httpx
import pytest

from promeia.ollama import (
    OllamaFailed,
    OllamaModelMissing,
    OllamaUnreachable,
    generate,
)

BASE = "http://localhost:11434"


def cliente(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_caminho_feliz_devolve_o_campo_response():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/generate"
        return httpx.Response(200, json={"response": "  texto do modelo  "})

    with cliente(handler) as c:
        assert (
            generate(model="m", prompt="p", base_url=BASE, client=c)
            == "  texto do modelo  "
        )


def test_manda_temperatura_zero_e_stream_falso():
    # Isto é resumo de fatos já calculados, não criação: variação entre
    # execuções aqui é DEFEITO, não estilo.
    visto = {}

    def handler(request: httpx.Request) -> httpx.Response:
        import json

        visto.update(json.loads(request.content))
        return httpx.Response(200, json={"response": "ok"})

    with cliente(handler) as c:
        generate(model="qwen2.5:7b-instruct", prompt="oi", base_url=BASE, client=c)

    assert visto["options"]["temperature"] == 0
    assert visto["stream"] is False
    assert visto["model"] == "qwen2.5:7b-instruct"
    assert visto["prompt"] == "oi"


def test_ollama_desligado_diz_como_ligar():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    with cliente(handler) as c, pytest.raises(OllamaUnreachable) as exc:
        generate(model="m", prompt="p", base_url=BASE, client=c)

    msg = str(exc.value)
    assert "ollama serve" in msg
    assert BASE in msg
    # Nunca o erro cru da biblioteca.
    assert "ConnectError" not in msg


def test_modelo_ausente_cita_o_pull_exato():
    # Formato MEDIDO contra o Ollama real: 404 com corpo
    # {"error":"model '<nome>' not found"}
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": "model 'fantasma' not found"})

    with cliente(handler) as c, pytest.raises(OllamaModelMissing) as exc:
        generate(model="fantasma", prompt="p", base_url=BASE, client=c)

    assert "ollama pull fantasma" in str(exc.value)


def test_404_que_nao_e_modelo_ausente_nao_vira_model_missing():
    # Um 404 de path errado não pode virar "instale o modelo" — mandaria o
    # dono baixar 5 GB para resolver um erro de URL.
    #
    # ⚠️ Este corpo é a ARMADILHA de propósito: "404 page not found" CONTÉM a
    # substring "not found". Uma checagem ingênua (`"not found" in corpo`)
    # passa nos outros testes e falha só aqui — que é exatamente o ponto.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, text="404 page not found")

    with cliente(handler) as c, pytest.raises(OllamaFailed) as exc:
        generate(model="m", prompt="p", base_url=BASE, client=c)

    assert not isinstance(exc.value, OllamaModelMissing)


def test_erro_http_qualquer_reporta_status_e_corpo():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    with cliente(handler) as c, pytest.raises(OllamaFailed) as exc:
        generate(model="m", prompt="p", base_url=BASE, client=c)

    assert "500" in str(exc.value)
    assert "boom" in str(exc.value)


def test_resposta_sem_campo_response_falha_alto():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"outra_coisa": 1})

    with cliente(handler) as c, pytest.raises(OllamaFailed) as exc:
        generate(model="m", prompt="p", base_url=BASE, client=c)

    assert "response" in str(exc.value)


def test_resposta_que_nao_e_json_falha_alto():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>nope</html>")

    with cliente(handler) as c, pytest.raises(OllamaFailed):
        generate(model="m", prompt="p", base_url=BASE, client=c)


def test_timeout_e_inalcancavel_nao_falha():
    # Timeout é "não consegui falar com ele", não "ele me respondeu errado" —
    # a distinção da §5 do spec começa aqui, na classificação do erro.
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("too slow", request=request)

    with cliente(handler) as c, pytest.raises(OllamaUnreachable):
        generate(model="m", prompt="p", base_url=BASE, client=c)

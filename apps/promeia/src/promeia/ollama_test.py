import httpx
import pytest

from promeia.ollama import (
    OllamaFailed,
    OllamaModelMissing,
    OllamaUnreachable,
    OllamaVazio,
    chat,
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
    # ⚠️ `/api/generate` NÃO tem o bug de resposta vazia do `/api/chat` (MEDIDO:
    # ele separa o raciocínio em `thinking` e ainda preenche `response`). O que
    # ele tem é custo: mesma prompt de uma frase, 3.481 tokens e >120 s sem o
    # campo contra 21 tokens e 5,4 s com ele — contra um `read=180.0`. Ver a
    # tabela na docstring de `generate`.
    assert visto["think"] is False


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


def test_resposta_que_e_lista_nao_vira_attributeerror():
    # /api/generate devolvendo um JSON válido que não é objeto (ex.: uma
    # lista) — MEDIDO: sem a guarda isinstance, `payload_resposta.get(...)`
    # levanta `AttributeError: 'list' object has no attribute 'get'` cru.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[1, 2, 3])

    with cliente(handler) as c, pytest.raises(OllamaFailed) as exc:
        generate(model="m", prompt="p", base_url=BASE, client=c)

    assert "objeto JSON" in str(exc.value)


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


# --- chat() — /api/chat, para a revisão de artigo -------------------------
#
# ⚠️ É uma API DIFERENTE de /api/generate: corpo com `messages` (system+user)
# e resposta em `message.content`, não `response`. O Go usa esta
# (internal/llm/client.go); o insight continua no `generate`.


def test_chat_caminho_feliz_devolve_message_content():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/chat"
        return httpx.Response(200, json={"message": {"content": "  corrigido  "}})

    with cliente(handler) as c:
        assert (
            chat(
                model="m",
                system="s",
                user="u",
                temperature=0.1,
                base_url=BASE,
                client=c,
            )
            == "  corrigido  "
        )


def test_chat_monta_system_e_user_nas_posicoes_certas():
    import json

    visto = {}

    def handler(request: httpx.Request) -> httpx.Response:
        visto.update(json.loads(request.content))
        return httpx.Response(200, json={"message": {"content": "ok"}})

    with cliente(handler) as c:
        chat(
            model="qwen-teste",
            system="INSTRUCAO-DO-SISTEMA",
            user="TEXTO-DO-USUARIO",
            temperature=0.7,
            base_url=BASE,
            client=c,
        )

    assert visto["model"] == "qwen-teste"
    assert visto["stream"] is False
    # A ORDEM importa: system primeiro, user depois. Invertido, o modelo
    # trata a instrução como conteúdo a revisar.
    assert visto["messages"] == [
        {"role": "system", "content": "INSTRUCAO-DO-SISTEMA"},
        {"role": "user", "content": "TEXTO-DO-USUARIO"},
    ]
    # Temperatura é PARÂMETRO aqui (o generate fixa 0): proofread usa 0.1 e
    # refine usa 0.7 no Go — uniformizar mudaria o comportamento dos dois.
    assert visto["options"]["temperature"] == 0.7


def test_chat_ollama_desligado_vira_unreachable():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("recusada", request=request)

    with cliente(handler) as c, pytest.raises(OllamaUnreachable):
        chat(model="m", system="s", user="u", temperature=0.1, base_url=BASE, client=c)


def test_chat_modelo_ausente_vira_model_missing():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": "model 'sumido' not found"})

    with cliente(handler) as c, pytest.raises(OllamaModelMissing) as err:
        chat(
            model="sumido",
            system="s",
            user="u",
            temperature=0.1,
            base_url=BASE,
            client=c,
        )
    # A mensagem tem que citar o comando exato — mesma promessa do generate.
    assert "ollama pull sumido" in str(err.value)


def test_chat_404_generico_nao_vira_model_missing():
    # O 404 do Ollama é AMBÍGUO (path errado vs. modelo ausente). Mandar o
    # dono baixar 5 GB por causa de URL errada é o erro que _MODELO_AUSENTE_RE
    # existe pra evitar — a regressão aqui é silenciosa e cara.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, text="404 page not found")

    with cliente(handler) as c, pytest.raises(OllamaFailed):
        chat(model="m", system="s", user="u", temperature=0.1, base_url=BASE, client=c)


def test_chat_resposta_nao_objeto_vira_failed():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=["isto", "nao", "e", "objeto"])

    with cliente(handler) as c, pytest.raises(OllamaFailed):
        chat(model="m", system="s", user="u", temperature=0.1, base_url=BASE, client=c)


def test_chat_sem_message_content_vira_failed():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"message": {}})

    with cliente(handler) as c, pytest.raises(OllamaFailed):
        chat(model="m", system="s", user="u", temperature=0.1, base_url=BASE, client=c)


def test_chat_manda_think_falso():
    # ⚠️ MEDIDO contra o Ollama local: SEM este campo, `qwen3.5:4b` queimou
    # 3.614 tokens e devolveu `message.content` VAZIO, e `gemma4:12b` queimou
    # 3.621 tokens com 12.435 chars em `message.thinking` e `content` também
    # vazio. A geração 2026 é thinking-by-default: sem o campo, a revisão não
    # fica lenta — ela devolve NADA, gastando GPU. Os três defaults de modelo
    # (config.py) são modelos de raciocínio, então isto é o que os faz
    # funcionar, não uma otimização.
    import json

    visto = {}

    def handler(request: httpx.Request) -> httpx.Response:
        visto.update(json.loads(request.content))
        return httpx.Response(200, json={"message": {"content": "ok"}})

    with cliente(handler) as c:
        chat(
            model="qwen3.5:9b",
            system="s",
            user="u",
            temperature=0.1,
            base_url=BASE,
            client=c,
        )

    assert visto["think"] is False


def test_chat_message_content_vazio_vira_vazio_e_nao_passa_reto():
    # ⚠️ A BRECHA EXATA que `test_chat_sem_message_content_vira_failed` (o
    # campo AUSENTE) nunca cobriu: "" É `str`, então o `isinstance(texto, str)`
    # deixava passar. E o estrago não é um erro visível — é sucesso FALSO: o
    # `proofread` devolve o bloco vazio pro `restaurar_bordas`, que remonta um
    # markdown que ainda PARECE válido, e o artigo do dono sai com um parágrafo
    # comido sem nada ter falhado.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"message": {"content": ""}})

    with cliente(handler) as c, pytest.raises(OllamaVazio) as err:
        chat(model="m", system="s", user="u", temperature=0.1, base_url=BASE, client=c)

    # Acionável: diz o modelo, e cita a causa nº 1 (thinking) com o campo exato.
    assert "think" in str(err.value)
    assert "'m'" in str(err.value)


def test_chat_so_espaco_em_branco_TAMBEM_conta_como_vazio():
    # ⚠️ DECISÃO registrada: só-espaço-em-branco conta como vazio. Todo
    # consumidor de produção já trima antes de usar (`proofread` antes do
    # `restaurar_bordas`; `refine`/`gerar_hooks` antes de medir o limite), então
    # pra todos eles "\n \t " e "" são o mesmo nada — deixar passar reproduz o
    # mesmo sucesso falso do teste acima, só que mais difícil de enxergar.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"message": {"content": "  \n\t  "}})

    with cliente(handler) as c, pytest.raises(OllamaVazio):
        chat(model="m", system="s", user="u", temperature=0.1, base_url=BASE, client=c)


def test_chat_vazio_e_capturavel_como_ollama_failed_e_ollama_error():
    # A guarda que impede a exceção nova de virar 500 cru: `revisao_rotas.py`
    # tem UM `except ollama.OllamaError` por rota, e `insight.py` distingue
    # `OllamaFailed` (502) de `OllamaUnreachable`/`OllamaModelMissing` (503).
    # Uma classe fora dessa árvore atravessaria os dois módulos em silêncio.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"message": {"content": ""}})

    with cliente(handler) as c, pytest.raises(OllamaFailed) as err:
        chat(model="m", system="s", user="u", temperature=0.1, base_url=BASE, client=c)

    assert isinstance(err.value, OllamaVazio)
    # E NÃO é confundível com as duas de transporte: colapsar as categorias
    # mandaria o dono subir o Ollama quando o Ollama já respondeu.
    assert not isinstance(err.value, OllamaUnreachable | OllamaModelMissing)


def test_chat_NAO_trima_o_retorno_apesar_da_guarda_de_vazio():
    # ⚠️ REGRESSÃO que a guarda de vazio poderia introduzir sem ninguém ver: o
    # `.strip()` da checagem é do TESTE, nunca do valor devolvido. `chat`
    # promete texto CRU ("o trim é de quem chama" — invariante I3), e
    # `refine`/`gerar_hooks` dependem disso pra trimar UMA vez, do lado deles.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"message": {"content": "\n  tem texto  \n"}})

    with cliente(handler) as c:
        assert (
            chat(
                model="m",
                system="s",
                user="u",
                temperature=0.1,
                base_url=BASE,
                client=c,
            )
            == "\n  tem texto  \n"
        )


def test_chat_message_nao_objeto_vira_failed():
    # `message` presente mas não-dict: o .get abaixo levantaria AttributeError
    # cru em vez da mensagem acionável que este módulo promete.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"message": "texto solto"})

    with cliente(handler) as c, pytest.raises(OllamaFailed):
        chat(model="m", system="s", user="u", temperature=0.1, base_url=BASE, client=c)

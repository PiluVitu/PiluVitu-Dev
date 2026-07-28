import json

import httpx
import pytest

from promeia.ramielle import (
    RamielleRefused,
    RamielleUnreachable,
    fetch_numbers,
    post_insight,
)

BASE = "https://exemplo.invalid"
TOKEN = "ingest-token"


def cliente(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def envelope(data) -> dict:
    return {"ok": True, "data": data, "notifications": []}


def test_fetch_numbers_monta_a_url_e_manda_o_bearer():
    visto = {}

    def handler(request: httpx.Request) -> httpx.Response:
        visto["url"] = str(request.url)
        visto["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json=envelope({"competence": "2026-07"}))

    with cliente(handler) as c:
        dados = fetch_numbers(
            base_url=BASE, token=TOKEN, competence="2026-07", client=c
        )

    assert visto["url"] == f"{BASE}/api/insights/numbers?competence=2026-07"
    assert visto["auth"] == f"Bearer {TOKEN}"
    assert dados == {"competence": "2026-07"}


def test_post_insight_manda_os_tres_campos_e_nada_mais():
    # generated_at é SEMPRE o relógio do servidor (⚠️ em domain/insights.ts) —
    # mandar um daqui seria ignorado, mas mandar é sinal de mau entendimento.
    visto = {}

    def handler(request: httpx.Request) -> httpx.Response:
        visto.update(json.loads(request.content))
        return httpx.Response(201, json=envelope({"id": "abc"}))

    with cliente(handler) as c:
        post_insight(
            base_url=BASE,
            token=TOKEN,
            texto="a leitura",
            modelo="qwen2.5:7b-instruct",
            periodo="2026-07",
            client=c,
        )

    assert visto == {
        "texto": "a leitura",
        "modelo": "qwen2.5:7b-instruct",
        "periodo": "2026-07",
    }


def test_nao_alcancei_e_diferente_de_recusou():
    """A distinção da §5 do spec, provada nas DUAS direções."""

    def cai(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("dns", request=request)

    with cliente(cai) as c, pytest.raises(RamielleUnreachable) as exc:
        fetch_numbers(base_url=BASE, token=TOKEN, competence="2026-07", client=c)
    assert "não consegui alcançar" in str(exc.value)

    def recusa(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    with cliente(recusa) as c, pytest.raises(RamielleRefused) as exc:
        fetch_numbers(base_url=BASE, token=TOKEN, competence="2026-07", client=c)
    assert "não consegui alcançar" not in str(exc.value)
    assert "500" in str(exc.value)


def test_401_cita_o_ingest_token_e_como_configurar():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"ok": False, "notifications": []})

    with cliente(handler) as c, pytest.raises(RamielleRefused) as exc:
        fetch_numbers(base_url=BASE, token=TOKEN, competence="2026-07", client=c)

    msg = str(exc.value)
    assert "INGEST_TOKEN" in msg
    assert "wrangler secret put" in msg


def test_envelope_ok_false_com_200_ainda_e_recusa():
    # O Worker responde com envelope; um `ok: false` é recusa mesmo com
    # status 2xx em algum caminho. Confiar só no status HTTP deixaria isso
    # passar como sucesso e publicar/ler dado que não existe.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "ok": False,
                "data": None,
                "notifications": [
                    {
                        "type": "error",
                        "code": "invalid_query",
                        "message": "competência inválida",
                    }
                ],
            },
        )

    with cliente(handler) as c, pytest.raises(RamielleRefused) as exc:
        fetch_numbers(base_url=BASE, token=TOKEN, competence="2026-13", client=c)

    assert "competência inválida" in str(exc.value)


def test_resposta_fora_do_envelope_falha_alto():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"qualquer": "coisa"})

    with cliente(handler) as c, pytest.raises(RamielleRefused) as exc:
        fetch_numbers(base_url=BASE, token=TOKEN, competence="2026-07", client=c)

    assert "envelope" in str(exc.value)


def test_resposta_que_nao_e_json_falha_alto():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>Cloudflare</html>")

    with cliente(handler) as c, pytest.raises(RamielleRefused):
        fetch_numbers(base_url=BASE, token=TOKEN, competence="2026-07", client=c)


def test_timeout_e_inalcancavel():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    with cliente(handler) as c, pytest.raises(RamielleUnreachable):
        post_insight(
            base_url=BASE,
            token=TOKEN,
            texto="t",
            modelo="m",
            periodo="2026-07",
            client=c,
        )

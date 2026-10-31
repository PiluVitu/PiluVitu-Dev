import pytest


@pytest.fixture(autouse=True)
def _transcricoes_fora_do_disco_real(tmp_path, monkeypatch):
    # Sem isto, um create_app() sem diretório explícito subiria a fila no
    # diretório de PRODUÇÃO, e a recuperação marcaria como falha a transcrição
    # que o promeia de verdade estiver rodando.
    monkeypatch.setenv("TRANSCRICAO_DIR", str(tmp_path / "transcricoes-padrao"))

import pytest

from promeia.prompts import (
    INSTRUCAO_PADRAO,
    PROOFREAD_SYSTEM,
    REFINE_SYSTEM,
    SHORTEN_SYSTEM,
)
from promeia.revisao import (
    LIMITE_PADRAO,
    Artigo,
    gerar_hooks,
    limite_da_plataforma,
    proofread,
    refine,
    truncar,
)

BASE = "http://localhost:11434"

# ⚠️ Nomes de modelo DISTINGUÍVEIS entre si e do default. A lição da fatia ④:
# um valor esperado igual ao default não distingue "leu o parâmetro" de
# "devolveu a constante" — o teste passa com a implementação errada.
MODELO_RAPIDO = "modelo-RAPIDO-3b"
MODELO_CUIDADOSO = "modelo-CUIDADOSO-7b"
MODELO_HOOKS = "modelo-HOOKS"


def chat_espiao(resposta="corrigido", respostas=None):
    """Devolve (fn, chamadas). `respostas` permite resposta diferente por chamada."""
    chamadas: list[dict] = []
    fila = list(respostas) if respostas is not None else None

    def fn(**kwargs):
        chamadas.append(kwargs)
        if fila:
            return fila.pop(0)
        return resposta

    return fn, chamadas


def chamar_proofread(texto, *, careful=False, chat):
    return proofread(
        texto,
        careful=careful,
        chat=chat,
        model_proofread=MODELO_RAPIDO,
        model_proofread_careful=MODELO_CUIDADOSO,
        base_url=BASE,
    )


# --- proofread -----------------------------------------------------------


def test_proofread_manda_ao_modelo_SO_os_blocos_de_prosa():
    entrada = "Olá mundo.\n\n```py\nprint(1)\n```\n\n| a | b |\n\nTchau.\n"
    fn, chamadas = chat_espiao(resposta="CORRIGIDO")
    saida = chamar_proofread(entrada, chat=fn)

    # Duas chamadas: os dois parágrafos de prosa. Nem o código nem a tabela.
    assert len(chamadas) == 2
    enviados = [c["user"] for c in chamadas]
    assert enviados == ["Olá mundo.\n", "Tchau.\n"]
    # O que NÃO é prosa nunca chega ao modelo — é o ponto do splitter.
    assert not any("print(1)" in e for e in enviados)
    assert not any("| a | b |" in e for e in enviados)
    # E sai IDÊNTICO na remontagem.
    assert "```py\nprint(1)\n```" in saida
    assert "| a | b |" in saida


def test_proofread_manda_o_TITULO_SOZINHO_sem_contexto_ao_redor():
    # ⚠️ Esta é a PREMISSA DE MEDIÇÃO dos defaults de `config.py`, e o
    # 6808f60 escolheu modelo sem ela: um título não chega ao modelo dentro do
    # artigo, chega como uma chamada inteira contendo só `'## Subtítulo\n'` —
    # nenhum parágrafo antes, nenhum depois, nada que indique que `##` é
    # estrutura e não texto. É nessa condição que a família qwen3.5 rebaixa o
    # nível (medido: 1/9 e 4/9), e é por isso que um corpus que manda o texto
    # INTEIRO numa chamada só não mede o que a produção faz.
    entrada = "Antes.\n\n## Subtítulo\n\n### Seção\n\nDepois.\n"
    fn, chamadas = chat_espiao(resposta="X")
    chamar_proofread(entrada, chat=fn)

    enviados = [c["user"] for c in chamadas]
    assert enviados == ["Antes.\n", "## Subtítulo\n", "### Seção\n", "Depois.\n"]
    # O que importa não é a contagem: é que a chamada do título NÃO carrega
    # nada além do título. Agrupar blocos (ou mandar o artigo inteiro) invalida
    # a tabela de `config.py#Settings` — remeça antes de mudar isto.
    titulos = [e for e in enviados if e.lstrip().startswith("#")]
    assert titulos == ["## Subtítulo\n", "### Seção\n"]


def test_proofread_usa_o_prompt_de_sistema_literal():
    fn, chamadas = chat_espiao()
    chamar_proofread("texto\n", chat=fn)
    assert chamadas[0]["system"] == PROOFREAD_SYSTEM


def test_proofread_careful_falso_usa_o_modelo_rapido():
    fn, chamadas = chat_espiao()
    chamar_proofread("texto\n", careful=False, chat=fn)
    assert chamadas[0]["model"] == MODELO_RAPIDO


def test_proofread_careful_verdadeiro_usa_o_modelo_CUIDADOSO():
    # O nível de revisão já existia no Go — é porte, não feature nova.
    fn, chamadas = chat_espiao()
    chamar_proofread("texto\n", careful=True, chat=fn)
    assert chamadas[0]["model"] == MODELO_CUIDADOSO


def test_proofread_usa_temperatura_conservadora():
    fn, chamadas = chat_espiao()
    chamar_proofread("texto\n", chat=fn)
    assert chamadas[0]["temperature"] == 0.1


def test_proofread_preserva_o_espacamento_entre_blocos():
    # O chat devolve trimado; sem restaurar_bordas os blocos colam.
    entrada = "Primeiro.\n\nSegundo.\n"
    fn, _ = chat_espiao(resposta="  X  ")
    assert chamar_proofread(entrada, chat=fn) == "X\n\nX\n"


def test_proofread_de_texto_sem_prosa_nao_chama_o_modelo():
    fn, chamadas = chat_espiao()
    entrada = "```py\nso codigo\n```\n"
    assert chamar_proofread(entrada, chat=fn) == entrada
    assert chamadas == []


def test_proofread_de_texto_vazio_nao_chama_o_modelo():
    fn, chamadas = chat_espiao()
    assert chamar_proofread("", chat=fn) == ""
    assert chamadas == []


# --- refine --------------------------------------------------------------


def chamar_refine(plataforma, texto, instrucao, *, chat):
    return refine(
        plataforma,
        texto,
        instrucao,
        chat=chat,
        model_hooks=MODELO_HOOKS,
        base_url=BASE,
    )


def test_refine_usa_o_prompt_e_a_temperatura_de_reescrita():
    fn, chamadas = chat_espiao(resposta="curto")
    chamar_refine("bluesky", "texto", "deixa mais direto", chat=fn)
    assert chamadas[0]["system"] == REFINE_SYSTEM
    assert chamadas[0]["temperature"] == 0.7
    assert chamadas[0]["model"] == MODELO_HOOKS


def test_refine_sem_instrucao_usa_o_default_literal_do_Go():
    fn, chamadas = chat_espiao(resposta="curto")
    chamar_refine("bluesky", "texto", "", chat=fn)
    assert INSTRUCAO_PADRAO in chamadas[0]["user"]


def test_refine_manda_plataforma_e_limite_no_corpo():
    fn, chamadas = chat_espiao(resposta="curto")
    chamar_refine("mastodon", "texto", "instrução", chat=fn)
    assert "Plataforma: mastodon (limite 500 chars)" in chamadas[0]["user"]


@pytest.mark.parametrize(
    "plataforma,esperado",
    [("bluesky", 300), ("mastodon", 500), ("desconhecida", LIMITE_PADRAO)],
)
def test_limite_por_plataforma(plataforma, esperado):
    assert limite_da_plataforma(plataforma) == esperado


def test_refine_que_cabe_no_limite_nao_chama_o_encurtador():
    fn, chamadas = chat_espiao(resposta="cabe")
    assert chamar_refine("bluesky", "t", "i", chat=fn) == "cabe"
    assert len(chamadas) == 1  # só o refine, sem o shorten


def test_refine_que_estoura_chama_o_encurtador_e_usa_o_resultado():
    longo = "x" * 400  # > 300 do bluesky
    fn, chamadas = chat_espiao(respostas=[longo, "versão curta"])
    assert chamar_refine("bluesky", "t", "i", chat=fn) == "versão curta"
    assert len(chamadas) == 2
    assert chamadas[1]["system"] == SHORTEN_SYSTEM
    assert chamadas[1]["temperature"] == 0.3


def test_refine_trunca_quando_o_encurtador_tambem_estoura():
    longo = "x" * 400
    ainda_longo = "y" * 350
    fn, _ = chat_espiao(respostas=[longo, ainda_longo])
    saida = chamar_refine("bluesky", "t", "i", chat=fn)
    assert len(saida) <= 300
    assert saida.startswith("y")  # usou o encurtado, não o original


def test_refine_TRIMA_o_resultado_do_chat_como_o_Go():
    # ⚠️ I3 (revisão): o Go trima SEMPRE, em client.go:96 (`chat()` devolve
    # `strings.TrimSpace(...)` pra todo chamador). O `chat` injetado aqui
    # devolve texto CRU de propósito ("o trim é de quem chama" — ollama.py)
    # — antes deste fix, `refine` devolvia o espaço em branco cru.
    fn, _ = chat_espiao(resposta="\n  Olá pessoal!  \n\n")
    assert chamar_refine("bluesky", "t", "i", chat=fn) == "Olá pessoal!"


def test_refine_TRIM_evita_chamada_EXTRA_ao_encurtador_por_espaco_em_branco():
    # ⚠️ I3: o espaço em branco nas bordas conta pro limite SEM o trim — 300
    # caracteres de conteúdo (cabe exatamente no limite do bluesky) + as
    # bordas de espaço em branco somam 305, disparando uma chamada EXTRA ao
    # encurtador que o Go nunca faz (medido pelo revisor: 2 chamadas onde o
    # Go faz 1). Com o trim, `_ajustar_ao_limite` vê 300<=300 e nem chama o
    # encurtador.
    conteudo = "y" * 300  # limite exato do bluesky
    com_espacos_nas_bordas = f"\n  {conteudo}  \n\n"
    fn, chamadas = chat_espiao(resposta=com_espacos_nas_bordas)
    saida = chamar_refine("bluesky", "t", "i", chat=fn)
    assert saida == conteudo
    assert len(chamadas) == 1  # só o refine — SEM a chamada extra


def test_refine_FAIL_SOFT_quando_o_encurtador_FALHA():
    # ⚠️ Comportamento do Go (`if shorter, err := ...; err == nil`): falha no
    # encurtamento NÃO derruba o refine. Um refine que morre inteiro porque a
    # melhoria opcional falhou seria pior que uma chamada um pouco longa.
    longo = "x" * 400
    chamadas = []

    def fn(**kwargs):
        chamadas.append(kwargs)
        if kwargs["system"] == SHORTEN_SYSTEM:
            raise RuntimeError("Ollama caiu no meio do encurtamento")
        return longo

    saida = chamar_refine("bluesky", "t", "i", chat=fn)
    assert len(saida) <= 300  # truncado, não explodiu
    assert len(chamadas) == 2


# --- truncar -------------------------------------------------------------


def test_truncar_recua_ate_a_ultima_palavra_inteira():
    texto = "palavra " * 10  # 80 chars
    assert not truncar(texto, 30).endswith("pala")
    assert len(truncar(texto, 30)) <= 30


def test_truncar_nao_mexe_no_que_ja_cabe():
    assert truncar("curto", 100) == "curto"


def test_truncar_corta_no_limite_quando_nao_ha_espaco_util():
    # Sem espaço depois da metade, corta seco — melhor que devolver 400 chars.
    assert len(truncar("x" * 100, 10)) == 10


def test_truncar_conta_CARACTERES_nao_bytes():
    # Guarda: texto que já cabe usa CONTAGEM DE CARACTERE (não bytes) pra
    # decidir que não precisa cortar. 10 caracteres, 20 bytes em UTF-8 —
    # contar bytes cortaria à toa.
    acentuado = "ãããããããããã"
    assert len(acentuado) == 10
    assert truncar(acentuado, 10) == acentuado

    # ⚠️ M2 (revisão): a asserção acima só exercita a GUARDA (`len <=
    # limite`, retorno imediato) — nunca chega na lógica de CORTE que o nome
    # deste teste alega cobrir (mutar a comparação de volta pra índice de
    # byte deixava a suíte inteira verde). Este segundo caso força a
    # passagem pelo `rfind`/recuo, construído pra que o índice de CARACTERE
    # e o de BYTE UTF-8 do espaço apontem posições DIFERENTES em relação a
    # `limite // 2`: 9 caracteres acentuados (2 bytes cada em UTF-8) seguidos
    # de um espaço — índice de CARACTERE do espaço = 9; índice de BYTE
    # equivalente = 18. limite=20, limite//2=10.
    #   - por CARACTERE (o que este porte usa): 9 > 10 é False — NÃO recua,
    #     devolve a fatia inteira de 20 caracteres (corta a palavra de "b"s
    #     no meio).
    #   - por BYTE (o que o Go faz, e o que uma mutação reintroduziria):
    #     18 > 10 é True — RECUARIA, devolvendo só os 9 acentuados.
    texto_misto = "ã" * 9 + " " + "b" * 20
    assert truncar(texto_misto, 20) == "ã" * 9 + " " + "b" * 10


# --- gerar_hooks ---------------------------------------------------------


def chamar_hooks(artigo, plataformas, *, chat):
    return gerar_hooks(
        artigo, plataformas, chat=chat, model_hooks=MODELO_HOOKS, base_url=BASE
    )


def test_hooks_gera_uma_chamada_por_plataforma():
    fn, chamadas = chat_espiao(resposta="chamada")
    r = chamar_hooks(Artigo(title="T"), ["bluesky", "mastodon"], chat=fn)
    assert [c.platform for c in r] == ["bluesky", "mastodon"]
    assert len(chamadas) == 2


def test_hooks_poe_o_limite_DA_PLATAFORMA_no_prompt_de_sistema():
    # O limite entra no system via template — se vazar o da plataforma errada,
    # o modelo mira no tamanho errado e o texto é truncado depois.
    fn, chamadas = chat_espiao(resposta="c")
    chamar_hooks(Artigo(), ["bluesky", "mastodon", "outra"], chat=fn)
    assert "Limite ABSOLUTO: 300" in chamadas[0]["system"]
    assert "Limite ABSOLUTO: 500" in chamadas[1]["system"]
    assert f"Limite ABSOLUTO: {LIMITE_PADRAO}" in chamadas[2]["system"]


def test_hooks_monta_o_corpo_com_titulo_resumo_tags_e_trecho():
    fn, chamadas = chat_espiao(resposta="c")
    chamar_hooks(
        Artigo(title="Título", excerpt="Resumo", tags=["go", "rust"], voice_sample="V"),
        ["bluesky"],
        chat=fn,
    )
    user = chamadas[0]["user"]
    assert "Título: Título" in user
    assert "Resumo: Resumo" in user
    assert "Tags: go, rust" in user  # juntadas por vírgula, como no Go
    assert user.rstrip().endswith("V")


def test_hooks_aplica_o_limite_na_saida():
    longo = "x" * 400
    fn, _ = chat_espiao(respostas=[longo, "curta"])
    r = chamar_hooks(Artigo(), ["bluesky"], chat=fn)
    assert r[0].text == "curta"


def test_hooks_TRIMA_o_resultado_do_chat_como_o_Go():
    # ⚠️ I3 (revisão): mesma paridade de `refine` — o Go trima SEMPRE
    # (client.go:96), o `chat` injetado devolve cru.
    fn, _ = chat_espiao(resposta="\n  Chamada boa!  \n\n")
    r = chamar_hooks(Artigo(), ["bluesky"], chat=fn)
    assert r[0].text == "Chamada boa!"


def test_hooks_TRIM_evita_chamada_EXTRA_ao_encurtador_por_espaco_em_branco():
    conteudo = "y" * 300  # limite exato do bluesky
    com_espacos_nas_bordas = f"\n  {conteudo}  \n\n"
    fn, chamadas = chat_espiao(resposta=com_espacos_nas_bordas)
    r = chamar_hooks(Artigo(), ["bluesky"], chat=fn)
    assert r[0].text == conteudo
    assert len(chamadas) == 1  # só a geração — SEM a chamada extra


def test_hooks_UMA_plataforma_que_falha_derruba_o_LOTE():
    # ⚠️ Paridade com o Go (`return nil, fmt.Errorf`). Devolver 3 de 4 chamadas
    # sem dizer qual faltou deixaria o dono publicar achando que gerou tudo.
    def fn(**kwargs):
        if "mastodon" in kwargs["system"]:
            raise RuntimeError("modelo caiu")
        return "ok"

    with pytest.raises(RuntimeError):
        chamar_hooks(Artigo(), ["bluesky", "mastodon", "outra"], chat=fn)

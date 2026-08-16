"""Configuração do promeia, lida do ambiente. Recusa subir sem o token."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field


class ConfigError(Exception):
    """Configuração inválida — o serviço não deve subir."""


@dataclass(frozen=True)
class Settings:
    # repr=False nos dois segredos: ninguém loga `settings` hoje, mas o
    # dataclass gera __repr__ com todos os campos por padrão, e este objeto
    # carrega os dois únicos segredos do serviço. Hardening que não custa
    # nada — não depende de ninguém lembrar de nunca logar o objeto inteiro.
    promeia_token: str = field(repr=False)
    ollama_url: str
    ollama_model: str
    ramielle_url: str
    ingest_token: str = field(repr=False)
    # Os três modelos da revisão de artigo. Separados do `ollama_model` (que é
    # do insight) porque o Go já os tratava como três configurações distintas:
    # o proofread rápido roda num modelo menor de propósito, e o `careful`
    # existe justamente pra trocar por um maior quando o dono quer precisão.
    #
    # ⚠️ COM DEFAULT, ao contrário dos campos acima, e não é descuido: sem
    # default, acrescentá-los quebraria toda construção existente de
    # `Settings` — inclusive as dos testes — por um motivo que não é do dono.
    #
    # ⚠️ **A PARIDADE COM A GO ACABOU AQUI, de propósito.** Até esta task os
    # defaults de `model_proofread`/`model_proofread_careful` eram os mesmos
    # da API Go em produção (`qwen2.5:3b-instruct`/`qwen2.5:7b-instruct`, do
    # log de boot dela), e `model_hooks` era registrado como "divergência a
    # resolver" porque o Go usava `qwen2.5:14b-instruct` (`main.go:83`), que
    # nunca foi instalado nesta máquina. **A Go foi APOSENTADA**
    # (`docs/superpowers/ROADMAP.md` §2): não há mais um comportamento de
    # produção do outro lado pra empatar, então "igual ao Go" deixou de ser
    # um critério de qualidade e virou só uma âncora num serviço morto. Os
    # três slots passam a ser ESCOLHA PRÓPRIA, e a divergência do
    # `model_hooks` deixa de existir enquanto conceito — não há mais de quem
    # divergir.
    #
    # ⚠️ **Os valores abaixo foram MEDIDOS PELO CAMINHO REAL — e a escolha
    # anterior (`qwen3.5:4b`/`qwen3.5:9b`, commit 6808f60) foi um ERRO DE
    # MÉTODO, não de gosto.** O corpus que elegeu o qwen3.5 mandava o texto
    # INTEIRO numa chamada só. O `proofread` de produção NÃO faz isso: ele
    # divide (`dividir_blocos`) e manda UM bloco de prosa por chamada, então
    # um título chega ao modelo SOZINHO, como `'## Subtitulo\n'`, sem nenhum
    # contexto ao redor — e é aí que a família qwen3.5 "normaliza" o nível
    # dele. Texto inteiro nunca expõe esse caso, por isso deu 9/9 a um modelo
    # que destrói mais da metade dos títulos.
    #
    # Preservação do NÍVEL do título, 9 repetições por modelo, blocos
    # `## Subtitulo` / `### Secao` / `#### Detalhe`, temperatura 0.1, pelo
    # caminho real do `chat()`:
    #
    #   gemma4:12b            9/9  —                            11,8 s/bloco
    #   qwen2.5:7b-instruct   9/9  —                             3,7 s/bloco
    #   qwen2.5:3b-instruct   6/9  '##\nSubtitulo'               2,1 s/bloco
    #   qwen3.5:9b            4/9  '# Subtítulo', '### Detalhe'
    #   qwen3.5:4b            1/9  '# Subtítulo'                 1,4 s/bloco
    #
    # ⚠️ `'##\nSubtitulo'` NÃO É UM TÍTULO: com a quebra de linha no meio, o
    # markdown renderiza `##` como texto literal — defeito que o
    # `qwen2.5:3b-instruct` (o rápido de sempre) já tinha. E o `qwen3.5:9b`
    # ainda vazou ESPANHOL uma vez: `'#### Detalhe'` → `'#### Detalle'`.
    #
    # Os dois slots MELHORAM contra o estado anterior ao 6808f60, mesmo com a
    # correção: o rápido sobe de 6/9 pra 9/9 em título e de 5/9 pra 8/9 no
    # corpus de erros; o careful sobe de 8/9 pra 9/9 no corpus, mantendo 9/9
    # em título. O careful paga no relógio (`gemma4:12b` no artigo real de
    # 5.778 chars, caminho real do `proofread`: 381 s contra 232 s, pior bloco
    # 35,9 s) — mas é exatamente o slot cuja razão de existir é trocar tempo
    # por precisão, e 35,9 s deixa 80% de folga contra o `read=180.0` de
    # `ollama.TIMEOUT`.
    #
    # ⚠️ **QUEM FOR REMEDIR: meça bloco a bloco** (`dividir_blocos` + um
    # `chat` por bloco), NUNCA o texto inteiro numa chamada — foi essa
    # diferença, e só ela, que produziu a escolha errada.
    #
    # ⚠️ `gemma4:12b` é modelo de RACIOCÍNIO (`capabilities` inclui
    # `"thinking"`): só funciona porque `ollama.chat` manda `"think": false`.
    # Sem esse campo devolve `message.content` VAZIO — medido: 3.621 tokens e
    # 12.435 chars em `thinking`. O `qwen2.5:7b-instruct` não tem thinking e
    # IGNORA o campo (HTTP 200 normal). Ver o cabeçalho de `ollama.py`.
    model_proofread: str = "qwen2.5:7b-instruct"
    model_proofread_careful: str = "gemma4:12b"
    model_hooks: str = "gemma4:12b"

    def exigir_ingest_token(self) -> str:
        """Devolve o `ingest_token`, ou levanta ConfigError se estiver vazio.

        ⚠️ **Por que aqui, no PONTO DE USO, e não no boot como o
        PROMEIA_TOKEN** (a pergunta foi feita e a resposta foi MEDIDA lendo o
        que cada rota precisa, não escolhida por simetria):

        | Rota               | usa `ingest_token`? |
        | ------------------ | ------------------- |
        | `POST /insight`    | **SIM** — `ramielle.fetch_numbers` + `post_insight` |
        | `POST /llm/proofread` | não — só Ollama  |
        | `POST /llm/refine`    | não — só Ollama  |
        | `POST /llm/hooks`     | não — só Ollama  |
        | `GET /health`         | não               |

        Três das quatro rotas POST não tocam o ramielle: elas mandam texto pro
        Ollama e devolvem texto, sem publicar nada em lugar nenhum. Exigir o
        token no boot (levantando ConfigError em `load_settings`, como o
        PROMEIA_TOKEN faz) derrubaria o serviço INTEIRO por uma credencial que
        `/llm/*` não usa — e `/llm/proofread` está EM PRODUÇÃO hoje, é o que o
        botão "Corrigir texto" do admin chama via ramielle. Seria trocar um
        modo de falha silencioso por uma queda de uma feature que funciona.

        O PROMEIA_TOKEN é o caso oposto, e por isso a assimetria é correta: ele
        protege TODA rota (é middleware), então "subir sem ele" não tem nenhum
        uso legítimo — é publicar a GPU do dono. Não há a quem preservar.

        A regra que sai disso: **credencial que TODA rota precisa ⇒ boot;
        credencial que UMA rota precisa ⇒ ponto de uso, com mensagem que diga
        o que fazer.** Precedente já existente no próprio serviço:
        `cli.py#main` já checa `if not settings.ingest_token` antes de chamar
        `run_insight`, com uma mensagem acionável — este método é a mesma
        decisão, agora também para quem entra por HTTP.
        """
        if not self.ingest_token:
            raise ConfigError(
                "INGEST_TOKEN não está definido — sem ele o promeia não tem "
                "como se autenticar no ramielle para ler os números nem para "
                "publicar o insight. NÃO é problema de rede: o serviço está de "
                "pé, falta configuração. Defina no ambiente onde ele roda, com "
                "o MESMO valor do servidor "
                '("wrangler secret put INGEST_TOKEN" em produção, ou a chave '
                "INGEST_TOKEN de apps/financas/.dev.vars em dev), e reinicie. "
                "Rodando por `make dev-promeia`/`make insight`, basta estar em "
                "apps/promeia/.env — os dois fazem source do arquivo."
            )
        return self.ingest_token


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    """Monta o Settings a partir do ambiente.

    ⚠️ Lança ConfigError quando PROMEIA_TOKEN está ausente ou vazio — de
    propósito, e mais forte que o fail-closed em tempo de request que o
    middleware também faz. Motivo medido neste projeto: o Better Auth, sem
    BETTER_AUTH_SECRET, cai num segredo default publicado no próprio pacote
    e NÃO avisa — deploy e login parecem saudáveis com tudo assinado por uma
    constante pública. Aqui o token é a ÚNICA proteção de um serviço que o
    túnel torna alcançável pela internet inteira: subir sem ele seria
    publicar a GPU do dono. Falhar alto no boot é o comportamento correto.

    ⚠️ **O INGEST_TOKEN NÃO segue essa regra, e isso é decisão, não a mesma
    lacuna com outro nome.** Ele cai em string vazia aqui de propósito, porque
    só `POST /insight` o usa — `/llm/proofread`, `/llm/refine` e `/llm/hooks`
    (em produção hoje) nunca tocam o ramielle. Quem exige o token é
    `Settings.exigir_ingest_token()`, no ponto de uso; leia o docstring dele
    para a tabela rota-a-rota que sustenta a escolha. Antes disso, o token
    vazio não falhava em lugar nenhum: virava o header `"Bearer "`, que o httpx
    recusa como `Illegal header value b'Bearer '`, e o erro saía classificado
    como `ramielle_unreachable` ("confira a conexão") — mandando o dono
    investigar a rede por um problema de configuração. MEDIDO por HTTP.
    """
    src = os.environ if env is None else env

    token = src.get("PROMEIA_TOKEN", "")
    if not token:
        raise ConfigError(
            "PROMEIA_TOKEN não está definido — o promeia não sobe sem ele. "
            "Sem esse token, qualquer um que descubra o hostname roda "
            "inferência no seu Mac. Defina antes de iniciar, ex.: "
            "export PROMEIA_TOKEN=$(openssl rand -base64 32)"
        )

    return Settings(
        promeia_token=token,
        ollama_url=src.get("OLLAMA_URL", "http://localhost:11434").rstrip("/"),
        ollama_model=src.get("OLLAMA_MODEL", "qwen2.5:7b-instruct"),
        ramielle_url=src.get("RAMIELLE_URL", "https://financas.piluvitu.com.br").rstrip(
            "/"
        ),
        ingest_token=src.get("INGEST_TOKEN", ""),
        # ⚠️ `OLLAMA_MODEL` (o insight, acima) segue em `qwen2.5:7b-instruct`
        # DE PROPÓSITO, e não por esquecimento de atualizar junto: a tarefa do
        # insight é redigir um parágrafo sobre números JÁ CALCULADOS pelo
        # Worker, e o gargalo medido dele é o PROMPT e a quantidade de dado,
        # não a capacidade do modelo. Evidência: o insight de 2026-08 saiu
        # afirmando "mantendo-se igual ao mesmo período do ano anterior" sobre
        # um banco que não TEM ano anterior — nenhum modelo maior conserta um
        # prompt que deixa essa afirmação ser possível. Trocar o modelo aqui
        # seria gastar GPU pra fingir que o problema é outro.
        #
        # ⚠️ Os três de baixo foram medidos BLOCO A BLOCO (é assim que o
        # `proofread` roda) — ver a tabela de preservação de título em
        # `Settings` acima antes de trocar qualquer um deles.
        model_proofread=src.get("MODEL_PROOFREAD", "qwen2.5:7b-instruct"),
        model_proofread_careful=src.get("MODEL_PROOFREAD_CAREFUL", "gemma4:12b"),
        model_hooks=src.get("MODEL_HOOKS", "gemma4:12b"),
    )

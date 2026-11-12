-- Alertas por e-mail: uma linha por alerta já reivindicado pelo Cron diário.
--
-- alert_key é a idempotência: 'orcamento:<categoria>:<YYYY-MM>:80',
-- 'orcamento:<categoria>:<YYYY-MM>:100' e 'fatura:<cartão>:<competência>'.
-- Uma chave que já existe nunca volta, então cada alerta sai em no máximo um
-- e-mail. sent_at NULL = reivindicado, envio ainda não confirmado.
--
-- Sem FK de propósito: apagar a categoria ou a conta não pode reabrir o
-- alerta nem travar o DELETE. Cresce poucas linhas por mês.
--
-- Sem BEGIN/COMMIT (o D1 rejeita). Forward-only.

CREATE TABLE alert_log (
  alert_key  TEXT PRIMARY KEY,
  kind       TEXT NOT NULL
               CHECK (kind IN ('orcamento_perto','orcamento_estourado','fatura_vencendo')),
  claimed_at TEXT NOT NULL,
  sent_at    TEXT
) STRICT;

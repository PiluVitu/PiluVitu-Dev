-- Categorias do Open Finance, uma por FAMÍLIA do Pluggy (GET /categories:
-- 130 categorias em 22 famílias). Nome em PT vem do `descriptionTranslated`
-- da própria API.
--
-- O `slug` 'pluggy-NN' é o que amarra o mapeamento: os 2 primeiros dígitos
-- do `categoryId` de uma transação são a família, então uma categoria-folha
-- NOVA do Pluggy cai sozinha na família que já existe, sem migration nova.
--
-- A família 05 (Transferências) vira DUAS categorias porque `kind` é do
-- registro e o sinal é da transação: PIX recebido de terceiro é receita,
-- PIX enviado é despesa. Ver `categoriaDoPluggy` em web/src/lib.
--
-- `INSERT OR IGNORE` + slug único: rodar de novo não duplica.

INSERT OR IGNORE INTO categories (id, name, kind, slug, created_at) VALUES
  ('cat-pluggy-01',    'Renda',                            'income',   'pluggy-01',     datetime('now')),
  ('cat-pluggy-02',    'Empréstimos e financiamento',      'expense',  'pluggy-02',     datetime('now')),
  ('cat-pluggy-03',    'Investimentos',                    'transfer', 'pluggy-03',     datetime('now')),
  ('cat-pluggy-04',    'Transferência mesma titularidade', 'transfer', 'pluggy-04',     datetime('now')),
  ('cat-pluggy-05in',  'Transferências recebidas',         'income',   'pluggy-05-in',  datetime('now')),
  ('cat-pluggy-05out', 'Transferências enviadas',          'expense',  'pluggy-05-out', datetime('now')),
  ('cat-pluggy-06',    'Obrigações legais',                'expense',  'pluggy-06',     datetime('now')),
  ('cat-pluggy-07',    'Serviços',                         'expense',  'pluggy-07',     datetime('now')),
  ('cat-pluggy-08',    'Compras',                          'expense',  'pluggy-08',     datetime('now')),
  ('cat-pluggy-09',    'Serviços digitais',                'expense',  'pluggy-09',     datetime('now')),
  ('cat-pluggy-10',    'Supermercado',                     'expense',  'pluggy-10',     datetime('now')),
  ('cat-pluggy-11',    'Alimentos e bebidas',              'expense',  'pluggy-11',     datetime('now')),
  ('cat-pluggy-12',    'Viagens',                          'expense',  'pluggy-12',     datetime('now')),
  ('cat-pluggy-13',    'Doações',                          'expense',  'pluggy-13',     datetime('now')),
  ('cat-pluggy-14',    'Apostas',                          'expense',  'pluggy-14',     datetime('now')),
  ('cat-pluggy-15',    'Impostos',                         'expense',  'pluggy-15',     datetime('now')),
  ('cat-pluggy-16',    'Taxas bancárias',                  'expense',  'pluggy-16',     datetime('now')),
  ('cat-pluggy-17',    'Moradia',                          'expense',  'pluggy-17',     datetime('now')),
  ('cat-pluggy-18',    'Saúde',                            'expense',  'pluggy-18',     datetime('now')),
  ('cat-pluggy-19',    'Transporte',                       'expense',  'pluggy-19',     datetime('now')),
  ('cat-pluggy-20',    'Seguros',                          'expense',  'pluggy-20',     datetime('now')),
  ('cat-pluggy-21',    'Lazer',                            'expense',  'pluggy-21',     datetime('now'));

-- 99 "Outros" NÃO entra de propósito: é o balde do Pluggy pra "não sei", e
-- criar uma categoria pra ele daria ares de classificação ao que não tem
-- nenhuma. Sem correspondência, a linha chega na conferência sem sugestão.

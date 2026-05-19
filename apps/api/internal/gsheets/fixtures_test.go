package gsheets_test

const validValueRange = `{
  "range": "Filmes!A2:F",
  "majorDimension": "ROWS",
  "values": [
    ["1", "A Coisa",      "Filme", "Terror", "Não", ""],
    ["2", "John Wick",    "Filme", "Ação",   "Sim", "8"],
    ["3", "Hereditário",  "Filme", "TERROR", "não", ""],
    ["4", "Breaking Bad", "Série", "Drama",  "Não", ""],
    ["5", "",             "Filme", "Drama",  "Não", ""],
    ["6", "Sem Categoria","Filme", "",       "Não", ""],
    ["7", "Trailing",     "Filme", " Comédia ", "Não", ""]
  ]
}`

const emptyValueRange = `{"range":"Filmes!A2:F","majorDimension":"ROWS","values":[]}`

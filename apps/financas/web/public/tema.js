// Aplica o tema salvo antes do primeiro paint (carregado síncrono no <head>).
// Mesma chave de src/lib/theme.ts.
;(function () {
  try {
    var tema = localStorage.getItem('financas-tema')
    var escuro =
      tema === 'escuro' ||
      (tema !== 'claro' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    if (escuro) document.documentElement.classList.add('dark')
  } catch (e) {
    // localStorage pode lançar (storage bloqueado); sem o catch a página
    // inteira ficaria em branco, não só sem tema.
  }
})()

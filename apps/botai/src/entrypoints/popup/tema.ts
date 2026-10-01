const escuro = window.matchMedia('(prefers-color-scheme: dark)')
const aplicar = () =>
  document.documentElement.classList.toggle('dark', escuro.matches)
aplicar()
escuro.addEventListener('change', aplicar)

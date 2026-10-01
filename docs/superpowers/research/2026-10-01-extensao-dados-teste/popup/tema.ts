const media = window.matchMedia('(prefers-color-scheme: dark)')
const aplicar = () =>
  document.documentElement.classList.toggle('dark', media.matches)
aplicar()
media.addEventListener('change', aplicar)

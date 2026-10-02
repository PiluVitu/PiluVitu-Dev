'use client'

import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useTheme } from 'next-themes'

export function BotaoTema() {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <button
      type="button"
      aria-label="Alternar tema"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="border-input bg-background text-foreground hover:bg-accent focus-visible:ring-ring inline-flex size-9 cursor-pointer items-center justify-center rounded-md border outline-none focus-visible:ring-2"
    >
      <FontAwesomeIcon icon={faMoon} className="size-3.5 dark:hidden" />
      <FontAwesomeIcon icon={faSun} className="hidden size-3.5 dark:block" />
    </button>
  )
}

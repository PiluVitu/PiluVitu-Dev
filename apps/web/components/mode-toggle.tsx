'use client'

import { MoonIcon, SunIcon } from '@radix-ui/react-icons'
import { useTheme } from 'next-themes'

import { NoSSR } from '@/components/no-ssr'
import { Button } from '@piluvitu/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@piluvitu/ui/dropdown-menu'
import { trocarTemaComTransicao } from '@piluvitu/ui/transicao-de-tema'

const triggerClass = 'flex w-fit items-center gap-2 rounded-full px-4'

export function ModeToggle() {
  const { setTheme } = useTheme()
  const trocar = (tema: string) => trocarTemaComTransicao(() => setTheme(tema))

  return (
    <NoSSR
      fallback={
        <Button variant="outline" className={triggerClass}>
          <MoonIcon className="h-[1.1rem] w-[1.1rem]" />
          <span>Tema</span>
        </Button>
      }
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={triggerClass}>
            <SunIcon className="h-[1.1rem] w-[1.1rem] scale-100 rotate-0 transition-all dark:sr-only dark:scale-0" />
            <MoonIcon className="sr-only h-[1.1rem] w-[1.1rem] scale-0 rotate-90 transition-all dark:not-sr-only dark:scale-100 dark:rotate-0" />
            <span>Tema</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => trocar('light')}>
            Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => trocar('dark')}>
            Dark
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => trocar('system')}>
            System
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </NoSSR>
  )
}

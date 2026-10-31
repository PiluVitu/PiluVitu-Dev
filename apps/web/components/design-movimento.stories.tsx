import { useEffect } from 'react'
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs'
import { expect, screen, userEvent, waitFor } from 'storybook/test'
import { Button } from '@piluvitu/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@piluvitu/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@piluvitu/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@piluvitu/ui/sheet'

// Os componentes abrem em portal no <body>, fora da story: o atributo vai no
// <html> para o seletor `[data-reduzir-movimento] &` do styles.css alcançá-los.
function ReduzirMovimento({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.setAttribute('data-reduzir-movimento', '')
    return () =>
      document.documentElement.removeAttribute('data-reduzir-movimento')
  }, [])
  return <>{children}</>
}

const comMovimentoReduzido: Decorator = (Story) => (
  <ReduzirMovimento>
    <Story />
  </ReduzirMovimento>
)

function Vitrine() {
  return (
    <div className="flex flex-wrap items-center gap-4 p-8">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Abrir menu</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Light</DropdownMenuItem>
          <DropdownMenuItem>Dark</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Abrir modal</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Modal</DialogTitle>
          <DialogDescription>Entra com fade e zoom de 95%.</DialogDescription>
        </DialogContent>
      </Dialog>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">Abrir painel</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetTitle>Painel</SheetTitle>
          <SheetDescription>Desliza da direita em 300 ms.</SheetDescription>
        </SheetContent>
      </Sheet>

      <Button>Pressione</Button>
    </div>
  )
}

const meta: Meta = {
  title: 'Design System/Movimento',
  parameters: { layout: 'fullscreen' },
  render: () => <Vitrine />,
}
export default meta
type Story = StoryObj

async function animacaoDe(el: HTMLElement) {
  return getComputedStyle(el).animationName
}

export const Fechado: Story = {}

export const MenuAberto: Story = {
  play: async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
    const menu = await screen.findByRole('menu')
    await expect(await animacaoDe(menu)).toBe('ui-entrar')
  },
}

export const ModalAberto: Story = {
  play: async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Abrir modal' }))
    const modal = await screen.findByRole('dialog')
    await expect(await animacaoDe(modal)).toBe('ui-entrar')
  },
}

export const PainelAberto: Story = {
  play: async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Abrir painel' }))
    const painel = await screen.findByRole('dialog')
    await expect(await animacaoDe(painel)).toBe('ui-entrar')
  },
}

export const ModalComMovimentoReduzido: Story = {
  decorators: [comMovimentoReduzido],
  play: async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Abrir modal' }))
    const modal = await screen.findByRole('dialog')
    await waitFor(async () =>
      expect(await animacaoDe(modal)).toBe('ui-entrar-reduzido'),
    )
  },
}

export const PainelComMovimentoReduzido: Story = {
  decorators: [comMovimentoReduzido],
  play: async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Abrir painel' }))
    const painel = await screen.findByRole('dialog')
    await waitFor(async () =>
      expect(await animacaoDe(painel)).toBe('ui-entrar-reduzido'),
    )
  },
}

'use client'

import { Button } from '@/components/ui/button'
import { PlusIcon } from '@radix-ui/react-icons'

interface AddCardButtonProps {
  onClick: () => void
}

export function AddCardButton({ onClick }: AddCardButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start text-muted-foreground hover:text-foreground"
      onClick={onClick}
    >
      <PlusIcon className="mr-2 h-4 w-4" />
      Adicionar card
    </Button>
  )
}

'use client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmailContactDialog } from '@/components/email-contact-dialog'
import { cn } from '@/lib/utils'

type EmailCardProps = {
  /** Mesma célula compacta da grelha que os SocialCard (variant bento). */
  variant?: 'default' | 'bento'
}

export function EmailCard({ variant = 'default' }: EmailCardProps) {
  const dialog = (
    <EmailContactDialog>
      <Button
        variant="outline"
        className={cn(
          'flex cursor-pointer items-center justify-start gap-5 p-4',
          variant === 'bento'
            ? 'h-full min-h-[132px] w-full flex-col items-center justify-center gap-3 rounded-3xl text-center text-sm leading-snug xl:min-h-[148px]'
            : 'h-fit xl:h-48 xl:w-48 xl:flex-col xl:items-start xl:py-8',
        )}
      >
        <Avatar className="flex h-10 w-10 shrink-0 rounded-xl">
          <AvatarImage src="/email.png" alt="Icone de email" />
          <AvatarFallback className="rounded-xl">EM</AvatarFallback>
        </Avatar>
        <p className={cn(variant === 'bento' && 'line-clamp-3 w-full')}>
          Me mande um email
        </p>
      </Button>
    </EmailContactDialog>
  )

  return (
    <div
      className={cn(
        variant === 'bento'
          ? 'flex h-full min-h-[132px] w-full min-w-0 cursor-pointer'
          : 'contents',
      )}
    >
      {dialog}
    </div>
  )
}

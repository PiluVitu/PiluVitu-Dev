import Link from 'next/link'
import { ModeToggle } from './mode-toggle'
import { Button } from './ui/button'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'

export function Bio() {
  return (
    <>
      <Avatar className="mb-2 flex h-24 w-24 flex-shrink-0 rounded-xl">
        <AvatarImage src="/profile-2.jpg" alt="Paulo Victor Profile Pic" />
        <AvatarFallback className="rounded-xl">PV</AvatarFallback>
      </Avatar>
      <section>
        <ModeToggle />
      </section>
      <h1 className="text-4xl font-semibold tracking-tight">
        Paulo Victor Torres Silva
      </h1>

      <section className="flex flex-col gap-2">
        <p>
          <strong className="text-lime-500">DevOps</strong> Developer na{' '}
          <Button asChild variant="link" className="h-fit p-0 text-[#4a65fc]">
            <Link href="" rel="noopener noreferrer nofollow" target="_blank">
              Devhatt
            </Link>
          </Button>
        </p>
        <p className="text-pretty text-muted-foreground">
          DevOps Developer que acelera a entrega de software e otimiza
          processos. Tenho experiência em automatizar pipelines de CI/CD e
          implementar aplicações em nuvem. Entre em contato para discutir como
          posso ajudar seu time a alcançar seus objetivos!
        </p>
      </section>
    </>
  )
}

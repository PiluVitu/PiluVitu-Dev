import { Avatar, AvatarFallback, AvatarImage } from '@piluvitu/ui/avatar'
import { Button } from '@piluvitu/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@piluvitu/ui/dialog'
import { Carreira } from '@/mocks/carreira'
import Link from 'next/link'

export function JobCard(props: Carreira) {
  const logo = (
    <Avatar className="bg-accent-soft size-10 shrink-0 rounded-md">
      {props.image && (
        <AvatarImage src={props.image} alt={props.orgName + ' Logo'} />
      )}
      <AvatarFallback className="bg-accent-soft text-primary rounded-md text-xs font-bold">
        {props.altImage}
      </AvatarFallback>
    </Avatar>
  )

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group bg-card border-border hover:bg-accent flex w-full cursor-pointer flex-col gap-3 rounded-lg border p-5 text-left transition-colors"
        >
          <div className="flex items-center gap-3">
            {logo}
            <div className="flex flex-col">
              <span className="leading-tight font-semibold">
                {props.orgName}
              </span>
              <span className="text-muted-foreground font-mono text-xs">
                {props.date}
              </span>
            </div>
          </div>
          <p className="text-sm">{props.title}</p>
          <div className="flex flex-wrap items-center gap-2">
            {props.current ? (
              <span className="border-border inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs">
                <span className="bg-ok size-1.5 rounded-full" aria-hidden />
                Atual
              </span>
            ) : null}
            {props.tags.map((tag) => (
              <span
                key={tag}
                className="border-border rounded-full border px-2.5 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
            <span className="text-primary ml-auto font-mono text-xs">
              detalhes →
            </span>
          </div>
        </button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-4">
            {logo}
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-xl">{props.orgName}</DialogTitle>
              <p className="text-muted-foreground font-mono text-xs">
                {props.title} · {props.date}
              </p>
            </div>
          </div>
          <DialogDescription className="text-primary pt-2 text-base">
            {props.orgDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground font-mono text-xs tracking-[0.2em] uppercase">
            Atribuições
          </p>
          <ul className="flex flex-col gap-3">
            {props.atribuitions.map((atribuicao) => (
              <li key={atribuicao} className="flex gap-3 text-sm">
                <span
                  className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-[2px]"
                  aria-hidden
                />
                <span>{atribuicao}</span>
              </li>
            ))}
          </ul>
        </div>

        {props.orgLink.trim() ? (
          <DialogFooter>
            <Button asChild className="w-full">
              <Link
                href={props.orgLink}
                rel="noopener noreferrer"
                target="_blank"
              >
                Saiba mais sobre {props.orgName}
              </Link>
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

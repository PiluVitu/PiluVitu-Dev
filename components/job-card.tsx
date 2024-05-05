import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Carreira } from '@/mocks/carreira'
import Link from 'next/link'

export function JobCard(props: Carreira) {
  return (
    <Dialog>
      <DialogTrigger asChild className="flex">
        <Button
          variant="outline"
          className="flex h-fit w-full items-start gap-5 p-4"
        >
          <Avatar className="flex h-10 w-10 flex-shrink-0 rounded-xl">
            {props.image && (
              <AvatarImage src={props.image} alt={props.orgName + ' Logo'} />
            )}
            <AvatarFallback className="rounded-xl">
              {props.altImage}
            </AvatarFallback>
          </Avatar>
          <div className="flex w-full flex-col justify-center gap-2">
            <section className="flex flex-col items-start justify-center gap-4">
              <section className="flex w-full items-center justify-between">
                <Badge>{props.orgName}</Badge>
                <time className="text-sm text-muted-foreground">
                  {props.date}
                </time>
              </section>
              <div className="flex h-5 items-center space-x-4 text-base">
                <p>{props.title}</p>
                <Separator orientation="vertical" decorative />
                <p>{props.role}</p>
              </div>
              <p className="text-muted-foreground">{props.location}</p>
            </section>
          </div>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.orgName}</DialogTitle>
          <DialogDescription>{props.orgDescription}</DialogDescription>
        </DialogHeader>
        <section>
          <h4>Atribuições:</h4>
          <ul className="list-inside list-disc">
            {props.atribuitions.map((atribuicao: string) => (
              <li key={atribuicao}>{atribuicao}</li>
            ))}
          </ul>
        </section>
        <DialogFooter>
          <Button asChild>
            <Link
              href={props.orgLink}
              rel="noopener noreferrer"
              target="_blank"
            >
              Saiba mais sobre {props.orgName.toLowerCase()}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Project } from '@/mocks/projects'
import Image from 'next/image'
import Link from 'next/link'

export function ProjectCard(props: Project) {
  return (
    <Card className="flex h-fit flex-col justify-between gap-4 p-5 md:flex-row">
      <section className="flex flex-col justify-center gap-4">
        <Avatar className="mb-2 flex h-11 w-11 flex-shrink-0 rounded-xl">
          {props.image && (
            <AvatarImage
              src={props.projectLogo}
              alt={props.projectName + ' Logo'}
            />
          )}
          <AvatarFallback className="rounded-xl">
            {props.altImage}
          </AvatarFallback>
        </Avatar>
        <h3>{props.projectName}</h3>
        <section className="flex flex-wrap items-center gap-4">
          {props.tags.map((tag: string) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </section>
        <section className="flex items-center gap-4">
          {props.deployLink ? (
            <Button asChild variant="ghost">
              <Link
                href={props.deployLink}
                rel="noopener noreferrer"
                target="_blank"
              >
                Deploy
              </Link>
            </Button>
          ) : (
            <Button
              disabled
              variant="destructive"
              className="cursor-not-allowed"
            >
              Deploy
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link
              href={props.repoLink}
              rel="noopener noreferrer nofollow"
              target="_blank"
            >
              Repo
            </Link>
          </Button>
        </section>
      </section>
      <div className="relative my-auto flex h-36 w-64 flex-shrink-0 overflow-hidden rounded-lg border">
        {props.image && (
          <Image
            alt="DevHatt"
            fill
            loading="lazy"
            src={props.image}
            className=" transition-transform hover:scale-x-110"
          />
        )}
      </div>
    </Card>
  )
}

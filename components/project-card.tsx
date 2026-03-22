import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Project } from '@/mocks/projects'
import Image from 'next/image'
import Link from 'next/link'

type ProjectCardProps = Project & {
  className?: string
}

export function ProjectCard(props: ProjectCardProps) {
  const { className, ...project } = props

  return (
    <Card
      className={cn(
        'flex h-fit flex-col justify-between gap-4 rounded-3xl p-5 xl:min-h-[454px] xl:w-80 xl:flex-col',
        className,
      )}
    >
      <section className="flex flex-col justify-center gap-4">
        <Avatar className="mb-2 flex h-11 w-11 shrink-0 rounded-xl">
          {project.image && (
            <AvatarImage
              src={project.projectLogo}
              alt={project.projectName + ' Logo'}
            />
          )}
          <AvatarFallback className="rounded-xl">
            {project.altImage}
          </AvatarFallback>
        </Avatar>
        <h3 className="text-lg font-bold">{project.projectName}</h3>
        <p
          className="text-muted-foreground line-clamp-6 max-h-48"
          title={project.description}
        >
          {project.description}
        </p>

        <section className="flex flex-wrap items-center gap-4">
          {project.tags.map((tag: string) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </section>
        <section className="flex items-center gap-4">
          {project.deployLink ? (
            <Button asChild variant="default">
              <Link
                href={project.deployLink}
                rel="noopener noreferrer"
                target="_blank"
              >
                Demo
              </Link>
            </Button>
          ) : (
            <Button
              disabled
              variant="destructive"
              className="cursor-not-allowed"
            >
              Demo
            </Button>
          )}
          {project.repoLink ? (
            <Button asChild variant="secondary">
              <Link
                href={project.repoLink}
                rel="noopener noreferrer nofollow"
                target="_blank"
              >
                Code
              </Link>
            </Button>
          ) : (
            <Button variant="secondary" disabled>
              Code
            </Button>
          )}
        </section>
      </section>
      {project.image ? (
        <div className="relative mx-auto flex h-fit w-72 max-w-full shrink-0 overflow-hidden rounded-lg border transition-all hover:-translate-y-2">
          <Image
            alt=""
            loading="lazy"
            width={288}
            height={144}
            src={project.image}
            className="h-auto w-full object-cover object-center"
          />
        </div>
      ) : null}
    </Card>
  )
}

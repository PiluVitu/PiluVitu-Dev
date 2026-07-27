import { Avatar, AvatarFallback, AvatarImage } from '@piluvitu/ui/avatar'
import { Button } from '@piluvitu/ui/button'
import { Card } from '@piluvitu/ui/card'
import { cn } from '@/lib/utils'
import { Project } from '@/mocks/projects'
import {
  faArrowUpRightFromSquare,
  faCode,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Link from 'next/link'

type ProjectCardProps = Project & {
  className?: string
}

export function ProjectCard(props: ProjectCardProps) {
  const { className, ...project } = props

  return (
    <Card
      className={cn(
        'bg-card border-border flex flex-col gap-5 rounded-lg p-6',
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <Avatar className="bg-accent-soft size-12 shrink-0 rounded-lg">
          {project.image && (
            <AvatarImage
              src={project.projectLogo}
              alt={project.projectName + ' Logo'}
            />
          )}
          <AvatarFallback className="bg-accent-soft text-primary rounded-lg font-bold">
            {project.altImage}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <h3 className="text-xl font-bold">{project.projectName}</h3>
          {project.subtitle ? (
            <p className="text-muted-foreground text-sm">{project.subtitle}</p>
          ) : null}
        </div>
      </div>

      <p className="text-muted-foreground" title={project.description}>
        {project.description}
      </p>

      <div className="flex flex-wrap gap-2">
        {project.tags.map((tag) => (
          <span
            key={tag}
            className="border-border rounded-full border px-2.5 py-0.5 font-mono text-xs"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        {project.deployLink ? (
          <Button asChild>
            <Link
              href={project.deployLink}
              rel="noopener noreferrer"
              target="_blank"
            >
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="size-3.5"
              />
              Demo
            </Link>
          </Button>
        ) : null}
        {project.repoLink ? (
          <Button asChild variant="outline">
            <Link
              href={project.repoLink}
              rel="noopener noreferrer nofollow"
              target="_blank"
            >
              <FontAwesomeIcon icon={faCode} className="size-3.5" />
              Código
            </Link>
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

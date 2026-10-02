import { faArrowRight } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Link from 'next/link'
import { ProjectCard } from '@/components/project-card'
import { SectionHeader } from '@/components/section-header'
import type { Project } from '@/mocks/projects'

export type SecaoPiluLabsProps = {
  itens: Project[]
  total: number
  hrefVitrine: string
}

export function SecaoPiluLabs({
  itens,
  total,
  hrefVitrine,
}: SecaoPiluLabsProps) {
  return (
    <section
      aria-labelledby="pilulabs-heading"
      className="flex flex-col gap-5"
      suppressHydrationWarning
    >
      <SectionHeader id="pilulabs-heading" label="PiluLabs" count={total} />
      {itens.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {itens.map((project) => (
            <ProjectCard key={project.id} {...project} />
          ))}
        </div>
      ) : null}
      <Link
        href={hrefVitrine}
        className="text-primary inline-flex items-center gap-2 self-start font-mono text-sm hover:underline"
      >
        Saiba mais no PiluLabs
        <FontAwesomeIcon icon={faArrowRight} className="size-3" />
      </Link>
    </section>
  )
}

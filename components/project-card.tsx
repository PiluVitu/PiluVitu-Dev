import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Project } from '@/mocks/projects';
import Image from 'next/image';
import Link from 'next/link';

export function ProjectCard(props: Project) {
  return (
    <Card className="flex h-fit flex-col justify-between gap-4 p-5 md:flex-row xl:min-h-[454px] xl:w-80 xl:flex-col">
      <section className="flex flex-col justify-center gap-4">
        <Avatar className="mb-2 flex h-11 w-11 shrink-0 rounded-xl">
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
        <h3 className="text-lg font-bold">{props.projectName}</h3>
        <p
          className="text-muted-foreground line-clamp-6 max-h-48"
          title={props.description}
        >
          {props.description}
        </p>

        <section className="flex flex-wrap items-center gap-4">
          {props.tags.map((tag: string) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </section>
        <section className="flex items-center gap-4">
          {props.deployLink ? (
            <Button asChild variant="default">
              <Link
                href={props.deployLink}
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
          {props.repoLink ? (
            <Button asChild variant="secondary">
              <Link
                href={props.repoLink}
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
        <div className="relative my-auto flex h-44 w-72 shrink-0 overflow-hidden rounded-lg border transition-all hover:-translate-y-2 xl:mx-auto">
          {props.image && (
            <Image
              alt="DevHatt"
              loading="lazy"
              width={288}
              height={144}
              src={props.image}
              className="object-cover"
            />
          )}
        </div>
      </section>
    </Card>
  );
}

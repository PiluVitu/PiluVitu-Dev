import { ItemDescription } from "@/components/ItemDescription";
import { projects } from "@/mock/projects";
import { nanoid } from "nanoid";
import Link from "next/link";

//TODO: Versão mobile o menu vai ficar escondido e será exibido quando arrastar da esquerda para direita e tera botão na esquerda

export default function Work({ params }: { params: { workId: string } }) {
  const projectNumber = Number(params.workId);
  if (projectNumber > projects.length - 1) {
    return (
      <ItemDescription.Root>
        <aside className="flex h-screen max-h-screen flex-col gap-3 overflow-hidden border-r-2 border-neutral-700 text-sm">
          <h1 className="mt-8 pl-3">Work</h1>
          <div className="flex flex-col gap-2">
            {projects.map((project, index) => {
              return (
                <Link
                  href={"/work/" + index}
                  key={nanoid()}
                  className="mr-4 flex cursor-pointer flex-col gap-1 rounded-2xl p-4 pl-3 brightness-125 transition-all hover:bg-neutral-800"
                >
                  <h2>{project.project}</h2>
                  <p className="text-pretty h-fit text-neutral-600 brightness-150">
                    {project.shortDescription}
                  </p>
                </Link>
              );
            })}
          </div>
        </aside>
        <ItemDescription.SectionWrapper>
          <h1>LALALALALAL</h1>
        </ItemDescription.SectionWrapper>
      </ItemDescription.Root>
    );
  }
  return (
    <ItemDescription.Root>
      <aside className="flex h-full max-h-screen flex-col gap-3 overflow-hidden border-r-2 border-neutral-700 text-sm">
        <h1 className="mt-8 pl-3">Work</h1>
        <div className="flex flex-col gap-2">
          <span className="pl-3 text-neutral-600 brightness-150">
            Vendo agora
          </span>
          <div className=" overflow-hidden">
            <section className="mr-4 flex flex-col gap-1 rounded-2xl bg-neutral-800 p-4 pl-3 brightness-125">
              <h2>{projects[projectNumber].project}</h2>
              <p className="text-pretty h-fit text-neutral-600 brightness-150">
                {projects[projectNumber].shortDescription}
              </p>
            </section>
          </div>
        </div>
        <div>
          <span className="pl-3 text-neutral-600 brightness-150">Próximos</span>
          {projects.map((project, index) => {
            const projectIsNotActive = index !== projectNumber;
            if (projectIsNotActive)
              return (
                <Link
                  href={"/work/" + index}
                  key={nanoid()}
                  className="mr-4 flex cursor-pointer flex-col gap-1 rounded-2xl p-4 pl-3 brightness-125 transition-all hover:bg-neutral-800"
                >
                  <h2>{project.project}</h2>
                  <p className="text-pretty h-fit text-neutral-600 brightness-150">
                    {project.shortDescription}
                  </p>
                </Link>
              );
          })}
        </div>
      </aside>
      <ItemDescription.SectionWrapper>
        <ItemDescription.Image
          src={projects[projectNumber].image || ""}
          alt="Octopost Preview Image"
        />
        <div className="flex w-[33.75rem] flex-col gap-6">
          <ItemDescription.Title title={projects[projectNumber].project} />
          <ItemDescription.ItemsWrapper>
            <ItemDescription.ItemsList>
              {projects[projectNumber].descriptionItems?.map((item) => {
                return (
                  <ItemDescription.Item
                    key={nanoid()}
                    title={item[0]}
                    content={item[1]}
                  />
                );
              })}
            </ItemDescription.ItemsList>
            {projects[projectNumber].description?.map((paragraph) => {
              return (
                <p key={nanoid()} className="text-pretty whitespace-pre-wrap">
                  {paragraph}
                </p>
              );
            })}
          </ItemDescription.ItemsWrapper>
        </div>
        <footer className="pt-48">
          <p>&copy; 2023 portfólio by @piluvitu </p>
          <p>Inspired by @justinmfarrugia</p>
        </footer>
      </ItemDescription.SectionWrapper>
    </ItemDescription.Root>
  );
}

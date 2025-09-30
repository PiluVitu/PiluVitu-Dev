import Link from "next/link";
import { ModeToggle } from "./mode-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";

export function Bio() {
  return (
    <>
      <Avatar className="mb-2 flex h-24 w-24 shrink-0 rounded-xl">
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
          <strong className="text-lime-500">FullStackOps</strong> na{" "}
          <Button asChild variant="link" className="h-fit p-0 text-[#4a65fc]">
            <Link href="" rel="noopener noreferrer nofollow" target="_blank">
              ViralizePlus
            </Link>
          </Button>
        </p>
        <p className="text-muted-foreground text-pretty">
          Desenvolvedor FullStack com foco em DevOps, apaixonado por tecnologia
          e automação. Trabalho com desenvolvimento de aplicações web modernas,
          CI/CD, infraestrutura como código e soluções em nuvem. Sempre buscando
          aprender e compartilhar conhecimento com a comunidade. Vamos conversar
          sobre tecnologia e projetos interessantes!
        </p>
      </section>
    </>
  );
}

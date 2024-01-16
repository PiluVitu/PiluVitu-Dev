import Image, { StaticImageData } from "next/image";
import { default as Link } from "next/link";
import { ReactNode } from "react";

//TODO: Adicionar tags das tecnologias dos projetos abaixo da imagem

interface IContentSectionImageContent {
  children?: ReactNode;
  title: string;
  path: StaticImageData;
  url?: string;
}

export function ContentSectionImageContent({
  title,
  children,
  path,
  url = "",
}: IContentSectionImageContent) {
  return (
    <Link
      href={url}
      target="_blank"
      className="hover:backdrop-brightness-120 flex h-fit w-full cursor-pointer flex-col justify-center gap-3 rounded-lg border border-neutral-700 px-2 pb-2 pt-3 text-sm text-neutral-200 backdrop-brightness-110 transition-all hover:backdrop-brightness-125"
    >
      <div className="flex items-center justify-start gap-2">
        {children}
        {title}
      </div>
      <div className="w-full overflow-hidden rounded-lg">
        <Image
          src={path}
          alt={`${title} image preview`}
          style={{ height: 260, objectFit: "cover" }}
          className=" transition-all hover:scale-105"
          loading="lazy"
        />
      </div>
    </Link>
  );
}

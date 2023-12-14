import Image, { StaticImageData } from "next/image";
import { ReactNode } from "react";

interface IContentSectionImageContent {
  children?: ReactNode;
  title: string;
  url: StaticImageData;
}

export function ContentSectionImageContent({
  title,
  children,
  url,
}: IContentSectionImageContent) {
  return (
    <main className="flex h-fit w-full flex-col justify-center gap-3 rounded-md border border-neutral-700 px-2 pb-2 pt-3 text-sm text-neutral-200 ">
      {title}
      <Image
        src={url}
        alt={`${title} image preview`}
        style={{ height: 260, objectFit: "cover" }}
        className="rounded-md"
        loading="lazy"
      />
    </main>
  );
}

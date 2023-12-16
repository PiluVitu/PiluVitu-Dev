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
    <main className="hover:backdrop-brightness-120 flex h-fit w-full cursor-pointer flex-col justify-center gap-3 rounded-lg border border-neutral-700 px-2 pb-2 pt-3 text-sm text-neutral-200 backdrop-brightness-110 transition-all hover:backdrop-brightness-125">
      <div className="flex items-center justify-start gap-2">
        {children}
        {title}
      </div>
      <div className="w-full overflow-hidden rounded-lg">
        <Image
          src={url}
          alt={`${title} image preview`}
          style={{ height: 260, objectFit: "cover" }}
          className=" transition-all hover:scale-105"
          loading="lazy"
        />
      </div>
    </main>
  );
}

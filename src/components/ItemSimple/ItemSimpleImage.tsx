import Image, { StaticImageData } from "next/image";

interface IItemSimpleImage {
  title: string;
  url: StaticImageData;
}

export function ItemSimpleImage({ title, url }: IItemSimpleImage) {
  return (
    <Image
      src={url}
      alt={title}
      className="mt-1 rounded-full"
      style={{ height: 48, width: 48, objectFit: "cover" }}
      loading="lazy"
    />
  );
}

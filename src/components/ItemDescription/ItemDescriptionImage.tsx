interface IItemDescriptionImage {
  src: string;
  alt: string;
}

import Image from "next/image";

export function ItemDescriptionImage({
  src,
  alt = "Project Image",
}: IItemDescriptionImage) {
  return (
    <Image
      src={src}
      alt={alt}
      className="rounded-xl"
      priority
      quality={80}
      width={540}
      height={300}
    />
  );
}

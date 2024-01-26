import { ReactNode } from "react";

interface IItemDescriptionItemsWrapper {
  children: ReactNode;
}

export function ItemDescriptionItemsWrapper({
  children,
}: IItemDescriptionItemsWrapper) {
  return (
    <section className="flex flex-col gap-6">
      <ul className="flex w-full flex-col gap-1">{children}</ul>
    </section>
  );
}

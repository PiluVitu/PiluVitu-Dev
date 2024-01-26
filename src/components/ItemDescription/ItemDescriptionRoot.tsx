import { ReactNode } from "react";
interface IItemDescriptionRoot {
  children: ReactNode;
}

export function ItemDescriptionRoot({ children }: IItemDescriptionRoot) {
  return <div className="flex w-[33.75rem] flex-col gap-6">{children}</div>;
}

import { ReactNode } from "react";

interface IContentSectionContent {
  children: ReactNode;
}

export function ContentSectionContent({ children }: IContentSectionContent) {
  return <main className="flex w-full flex-col gap-5">{children}</main>;
}

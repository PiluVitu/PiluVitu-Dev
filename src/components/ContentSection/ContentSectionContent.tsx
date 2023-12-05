import { ReactNode } from "react";

interface IContentSectionContent {
  children: ReactNode;
}

export function ContentSectionContent({ children }: IContentSectionContent) {
  return <main className="flex flex-col gap-3">{children}</main>;
}

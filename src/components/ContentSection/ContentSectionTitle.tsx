interface IContentSectionTitleProps {
  title: string;
}

export function ContentSectionTitle({ title }: IContentSectionTitleProps) {
  return <h3 className="text-neutral-400 md:absolute md:-start-20">{title}</h3>;
}

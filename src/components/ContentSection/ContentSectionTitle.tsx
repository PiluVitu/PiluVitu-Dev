interface IContentSectionTitleProps {
  title: string;
}

export function ContentSectionTitle({ title }: IContentSectionTitleProps) {
  return <h3 className="absolute -start-20 text-neutral-400">{title}</h3>;
}

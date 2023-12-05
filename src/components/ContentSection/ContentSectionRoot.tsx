interface IContentSectionRoot {
  children: React.ReactNode;
}

export function ContentSectionRoot({ children }: IContentSectionRoot) {
  return (
    <section className="relative flex items-start justify-center gap-5">
      {children}
    </section>
  );
}

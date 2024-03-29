interface IContentSectionRoot {
  children: React.ReactNode;
}

export function ContentSectionRoot({ children }: IContentSectionRoot) {
  return (
    <section className="relative flex w-full items-start justify-center gap-5 max-md:flex-col">
      {children}
    </section>
  );
}

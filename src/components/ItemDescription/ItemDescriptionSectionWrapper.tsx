export function ItemDescriptionSectionWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="gap col-span-4 mx-auto flex max-h-screen w-full flex-col items-center justify-start gap-10 overflow-auto pb-24 pt-10">
      {children}
    </section>
  );
}

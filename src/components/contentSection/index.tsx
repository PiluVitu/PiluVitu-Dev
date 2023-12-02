type TContentSection = {
  title: string;
  children: React.ReactNode;
};

export default function ContentSection({ title, children }: TContentSection) {
  return (
    <section className="flex gap-10">
      <h3 className="text-neutral-400">{title}</h3>
      <main>{children}</main>
    </section>
  );
}

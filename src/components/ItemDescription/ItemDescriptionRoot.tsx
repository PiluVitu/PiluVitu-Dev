export function ItemDescriptionRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="ml-16 grid max-h-screen w-full grid-cols-5 items-center pl-5">
      {children}
    </main>
  );
}

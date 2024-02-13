export function ItemDescriptionItemsList({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ul className="flex w-full flex-col gap-1">{children}</ul>;
}

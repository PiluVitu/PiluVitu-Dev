interface IItemSimpleRootProps {
  children: React.ReactNode;
}

export function ItemSimpleRoot({ children }: IItemSimpleRootProps) {
  return (
    <div className="flex w-full cursor-pointer items-start justify-between gap-4">
      {children}
    </div>
  );
}

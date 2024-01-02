interface IItemSimpleTitle {
  title: string;
  subtitle?: string;
  tags?: string[];
}
export function ItemSimpleTitle({ title, subtitle, tags }: IItemSimpleTitle) {
  return (
    <div className="flex w-full flex-col items-start justify-between gap-1">
      <p>{title}</p>
      {subtitle ? <p className="text-sm text-neutral-500 ">{subtitle}</p> : ""}
      <div className="flex items-center justify-start gap-1">
        {tags?.map((tag, index) => {
          return (
            <span
              className="rounded-md border border-neutral-600 p-1 text-sm text-neutral-400"
              key={index}
            >
              {tag}
            </span>
          );
        })}
      </div>
    </div>
  );
}

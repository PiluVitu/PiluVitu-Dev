interface IItemDescriptionItem {
  title: string;
  content: string;
}

export function ItemDescriptionItem({ title, content }: IItemDescriptionItem) {
  return (
    <li className="flex gap-2">
      <h3 className="w-[5.5rem] text-sm capitalize text-neutral-400">
        {title}
      </h3>
      <p className="max-w-[26rem] whitespace-pre-wrap">{content}</p>
    </li>
  );
}

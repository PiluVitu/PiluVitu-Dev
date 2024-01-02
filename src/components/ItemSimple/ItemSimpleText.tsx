interface ItemSimpleText {
  text: string | number;
  type: "price" | "default";
}

export function ItemSimpleText({ type, text }: ItemSimpleText) {
  if (type === "price" && typeof text === "number") {
    return <p>R${text}</p>;
  }
  return <p className="text-neutral-500">{text}</p>;
}

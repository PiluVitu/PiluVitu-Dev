export function ItemSimpleDate({ date }: { date: string }) {
  return <time dateTime={date}>${date}</time>;
}

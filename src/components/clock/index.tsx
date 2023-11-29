export default function Clock() {
  function setActualTimeInClock() {
    const date = new Date();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const formatDate = `${String(hours).padStart(2, "0")} : ${String(
      minutes,
    ).padStart(2, "0")}`;

    return formatDate;
  }
  return (
    <time dateTime={setActualTimeInClock()} className="text-neutral-500">
      {setActualTimeInClock()}
    </time>
  );
}

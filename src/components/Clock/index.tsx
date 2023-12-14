"use client";

import { useEffect, useState } from "react";

export default function Clock() {
  const [dateTime, setDateTime] = useState(new Date());

  useEffect(() => {
    const intervalID = setInterval(() => {
      setDateTime(new Date());
    }, 1000);

    return () => clearInterval(intervalID);
  });
  const hours = String(dateTime.getHours()).padStart(2, "0");
  const minutes = String(dateTime.getMinutes()).padStart(2, "0");
  const formatDate = `${hours} : ${minutes}`;
  return (
    <time dateTime={formatDate} className="text-neutral-500">
      {formatDate}
    </time>
  );
}

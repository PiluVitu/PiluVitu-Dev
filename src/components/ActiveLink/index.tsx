"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TActiveLink = {
  href: string;
  children: React.ReactNode;
};

export default function ActiveLink({ href, children }: TActiveLink) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={isActive ? "text-neutral-50" : "text-neutral-500"}
    >
      {children}
    </Link>
  );
}

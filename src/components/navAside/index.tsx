import Link from "next/link";

import {
  Article,
  At,
  Buildings,
  HouseSimple,
  ShoppingBag,
  Stack,
  Terminal,
  User,
} from "@phosphor-icons/react/dist/ssr";

export default function NavAside() {
  return (
    <aside className="flex h-full items-center justify-center border-r-2 border-neutral-700 px-5">
      <nav>
        <ul className="flex flex-col items-center justify-center gap-5">
          <li>
            <Link href="/">
              <HouseSimple
                size={24}
                className="fill-neutral-500 transition-all"
              />
            </Link>
          </li>
          <li>
            <Link href="/work">
              <Buildings
                size={24}
                className="fill-neutral-500 transition-all hover:fill-neutral-400"
              />
            </Link>
          </li>
          <li>
            <Link href="/blog">
              <Article
                size={24}
                className="fill-neutral-500 transition-all hover:fill-neutral-400"
              />
            </Link>
          </li>
          <li>
            <Link href="/store">
              <ShoppingBag
                size={24}
                className="fill-neutral-500 transition-all hover:fill-neutral-400"
              />
            </Link>
          </li>
          <li>
            <Link href="/stack">
              <Stack
                size={24}
                className="fill-neutral-500 transition-all hover:fill-neutral-400"
              />
            </Link>
          </li>
          <li>
            <Link href="/about">
              <User
                size={24}
                className="fill-neutral-500 transition-all hover:fill-neutral-400"
              />
            </Link>
          </li>
          <li>
            <Link href="/contact">
              <At
                size={24}
                className="fill-neutral-500 transition-all hover:fill-neutral-400"
              />
            </Link>
          </li>
          <li>
            <Link href="/">
              <Terminal
                size={24}
                className="fill-neutral-500 transition-all hover:fill-neutral-400"
              />
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}

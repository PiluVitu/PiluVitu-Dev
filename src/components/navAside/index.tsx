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
import ActiveLink from "../activeLink";

export default function NavAside() {
  return (
    <aside className="flex h-full items-center justify-center border-r-2 border-neutral-700 bg-neutral-800 px-5 max-lg:fixed max-lg:bottom-0 max-lg:h-fit max-lg:w-full max-lg:border-r-0 max-lg:border-t-2 max-lg:p-5">
      <nav className="max-lg:w-full max-lg:px-24 max-sm:px-2">
        <ul className="flex flex-col items-center justify-center gap-5 max-lg:w-full max-lg:flex-row max-lg:items-center max-lg:justify-between max-sm:flex-wrap">
          <li>
            <ActiveLink href="/">
              <HouseSimple
                size={24}
                className="fill-current transition-all hover:fill-neutral-400"
              />
            </ActiveLink>
          </li>
          <li>
            <ActiveLink href="/work">
              <Buildings
                size={24}
                className="fill-current transition-all hover:fill-neutral-400"
              />
            </ActiveLink>
          </li>
          <li>
            <ActiveLink href="/blog">
              <Article
                size={24}
                className="fill-current transition-all hover:fill-neutral-400"
              />
            </ActiveLink>
          </li>
          <li>
            <ActiveLink href="/store">
              <ShoppingBag
                size={24}
                className="fill-current transition-all hover:fill-neutral-400"
              />
            </ActiveLink>
          </li>
          <li>
            <ActiveLink href="/stack">
              <Stack
                size={24}
                className="fill-current transition-all hover:fill-neutral-400"
              />
            </ActiveLink>
          </li>
          <li>
            <ActiveLink href="/about">
              <User
                size={24}
                className="fill-current transition-all hover:fill-neutral-400"
              />
            </ActiveLink>
          </li>
          <li>
            <ActiveLink href="/contact">
              <At
                size={24}
                className="fill-current transition-all hover:fill-neutral-400"
              />
            </ActiveLink>
          </li>
          <li>
            <ActiveLink href="/">
              <Terminal
                size={24}
                className="fill-current transition-all hover:fill-neutral-400"
              />
            </ActiveLink>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
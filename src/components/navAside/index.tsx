import Link from "next/link";

export default function NavAside() {
  return (
    <aside className="flex h-full items-center justify-center border-r-2 border-neutral-700 px-5">
      <nav>
        <ul className="flex flex-col items-center justify-center gap-5">
          <li>
            <Link href="/">Home</Link>
          </li>
          <li>
            <Link href="/work">Work</Link>
          </li>
          <li>
            <Link href="/blog">Blog</Link>
          </li>
          <li>
            <Link href="/store">Store</Link>
          </li>
          <li>
            <Link href="/stack">Stack</Link>
          </li>
          <li>
            <Link href="/about">About</Link>
          </li>
          <li>
            <Link href="/contact">Contact</Link>
          </li>
          <li>
            <Link href="/">Search</Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}

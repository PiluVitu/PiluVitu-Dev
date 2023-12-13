import Link, { LinkProps } from "next/link";

type IButtonLinkProps = {
  children: React.ReactNode;
  rediretc?: true;
} & LinkProps;

export function ButtonLinkRootBlank(props: IButtonLinkProps) {
  return (
    <Link
      target="_blank"
      className="flex items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 brightness-105 transition-all hover:bg-neutral-700 hover:brightness-100"
      {...props}
    >
      {props.children}
    </Link>
  );
}

import { ReactNode } from 'react'

export function PageSection({
  children,
  title = '',
}: {
  children: ReactNode
  title?: string
}) {
  if (!title) {
    return <section className="flex flex-col gap-4">{children}</section>
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="my-3 text-xl">{title}</h2>
      {children}
    </section>
  )
}

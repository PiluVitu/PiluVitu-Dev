import { ReactNode } from 'react'

export function PageSection({
  children,
  title = '',
}: {
  children: ReactNode
  title?: string
}) {
  if (!title) {
    return (
      <section className="flex flex-col gap-4 2xl:flex-row 2xl:flex-wrap">
        {children}
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="my-3 text-xl">{title}</h2>
      <section className="flex flex-col gap-4 2xl:flex-row 2xl:flex-wrap">
        {children}
      </section>
    </section>
  )
}

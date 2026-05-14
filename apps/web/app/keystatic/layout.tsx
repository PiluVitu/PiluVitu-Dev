/**
 * Keystatic usa @keystar/ui com tema próprio — não envolver no ThemeProvider
 * do site (next-themes no `(site)`).
 *
 * O componente Keystatic só aparece após `useEffect` (ClientOnly interno);
 * até lá devolve null. Este fundo evita ecrã “vazio” branco enquanto o
 * editor hidrata (usa Chrome/Safari se o browser do Cursor falhar no HMR).
 */
export default function KeystaticLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">{children}</div>
  )
}

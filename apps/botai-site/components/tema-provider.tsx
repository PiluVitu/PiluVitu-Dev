'use client'

import '@/lib/font-awesome'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'

export function TemaProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  )
}

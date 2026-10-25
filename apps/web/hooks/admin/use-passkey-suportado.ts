'use client'

import { useSyncExternalStore } from 'react'
import { passkeySuportado } from '@/lib/admin/passkey'

const nadaMuda = () => () => {}

export function usePasskeySuportado(): boolean {
  return useSyncExternalStore(nadaMuda, passkeySuportado, () => false)
}

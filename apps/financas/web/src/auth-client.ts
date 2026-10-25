import { passkeyClient } from '@better-auth/passkey/client'
import { createAuthClient } from 'better-auth/react'

// SEM baseURL de propósito: sem argumento, resolve para
// window.location.origin + '/api/auth' — onde o Worker monta o handler.
// O cliente também seta credentials: 'include' sozinho.
export const authClient = createAuthClient({ plugins: [passkeyClient()] })
export const { useSession, signIn, signOut } = authClient

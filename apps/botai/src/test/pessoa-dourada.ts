import { gerarPessoa } from '@piluvitu/tools/pessoa'
import { sfc32 } from '@piluvitu/tools/prng'

export const PESSOA_DOURADA = gerarPessoa(sfc32(1, 2, 3, 4), '2026-10-01')

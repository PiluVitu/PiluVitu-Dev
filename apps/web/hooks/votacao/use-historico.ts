'use client'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ApiError, votacaoApi } from '@/lib/votacao/api-client'

// 400 e 404 são respostas definitivas do histórico: repetir só atrasa a mensagem.
const repeteSoFalhaDoServidor = (tentativas: number, erro: Error) =>
  !(erro instanceof ApiError && erro.status < 500) && tentativas < 2

export function useHistorico(page: number) {
  return useQuery({
    queryKey: ['votacao', 'historico', page],
    queryFn: () => votacaoApi.historico(page),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: repeteSoFalhaDoServidor,
    enabled: Number.isInteger(page) && page >= 1,
  })
}

export function useHistoricoSessao(id: number) {
  return useQuery({
    queryKey: ['votacao', 'historico', 'sessao', id],
    queryFn: () => votacaoApi.historicoSessao(id),
    staleTime: 60_000,
    retry: repeteSoFalhaDoServidor,
    enabled: Number.isInteger(id) && id > 0,
  })
}

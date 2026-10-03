// Os 1180 px são a área de conteúdo, como no design (content-box): o gutter fica por fora.
export const CONTEUDO =
  'mx-auto box-content max-w-[1180px] px-[clamp(20px,5vw,48px)]'
export const ESPACO_DA_SECAO = 'py-[clamp(72px,9vw,112px)]'
export const ANEL_DE_FOCO =
  'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
export const BOTAO_GRANDE = `h-[50px] gap-2 rounded-[14px] px-[22px] text-base font-semibold ${ANEL_DE_FOCO}`

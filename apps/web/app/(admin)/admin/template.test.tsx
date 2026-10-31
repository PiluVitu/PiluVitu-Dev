import { renderEstatico } from '@/lib/render-estatico'
import Template from './template'

// O template remonta a cada navegação do admin: é ele que dá a entrada da
// página nova. Só opacidade — transform no wrapper viraria bloco de contenção
// para elementos `fixed` das páginas durante a animação.
describe('template do admin — entrada da página', () => {
  it('a página nova entra com fade', () => {
    const raiz = renderEstatico(
      <Template>
        <p>conteúdo</p>
      </Template>,
    )
    const wrapper = raiz.querySelector('p')!.parentElement!
    expect(wrapper.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['animate-in', 'fade-in-0']),
    )
    expect(wrapper.className).not.toMatch(/slide-|zoom-|translate|scale/)
  })
})

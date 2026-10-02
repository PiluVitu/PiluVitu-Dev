import { renderEstatico } from '@/lib/render-estatico'
import { AdminSidebar } from './admin-sidebar'

jest.mock('next/navigation', () => ({ usePathname: () => '/admin/pilulabs' }))

describe('AdminSidebar', () => {
  it('PiluLabs em Coleções, com a contagem, no lugar de Projetos', () => {
    const raiz = renderEstatico(
      <AdminSidebar counts={{ posts: 6, pilulabs: 3, careers: 5 }} />,
    )
    expect(raiz.querySelector('a[href="/admin/pilulabs"]')?.textContent).toBe(
      'PiluLabs3',
    )
    expect(raiz.querySelector('a[href="/admin/projetos"]')).toBeNull()
    expect(raiz.textContent).not.toContain('Projetos')
  })

  it('marca o item da rota atual', () => {
    const raiz = renderEstatico(<AdminSidebar />)
    expect(
      raiz.querySelector('a[href="/admin/pilulabs"]')?.className,
    ).toContain('text-primary')
  })
})

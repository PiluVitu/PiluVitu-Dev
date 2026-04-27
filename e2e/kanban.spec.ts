import { test, expect } from '@playwright/test'

test.describe('Mini Kanban Board', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tasks')
    await page.evaluate(() => localStorage.removeItem('kanban-state'))
    await page.reload()
  })

  test('exibe board vazio na primeira visita', async ({ page }) => {
    await expect(page.getByText('Mini Kanban')).toBeVisible()
    await expect(page.getByText('Nova coluna')).toBeVisible()
  })

  test('criar primeira coluna', async ({ page }) => {
    await page.getByText('Nova coluna').click()
    await page.getByPlaceholder('Título da coluna').fill('Backlog')
    await page.getByRole('button', { name: 'Adicionar' }).click()
    await expect(page.getByText('Backlog')).toBeVisible()
  })

  test('criar card em coluna', async ({ page }) => {
    await page.getByText('Nova coluna').click()
    await page.getByPlaceholder('Título da coluna').fill('Backlog')
    await page.getByRole('button', { name: 'Adicionar' }).click()

    await page.getByText('Adicionar card').click()
    await page.getByLabel('Título *').fill('Meu primeiro card')
    await page.getByRole('button', { name: 'Salvar' }).click()

    await expect(page.getByText('Meu primeiro card')).toBeVisible()
  })

  test('editar título de card', async ({ page }) => {
    await page.getByText('Nova coluna').click()
    await page.getByPlaceholder('Título da coluna').fill('Backlog')
    await page.getByRole('button', { name: 'Adicionar' }).click()
    await page.getByText('Adicionar card').click()
    await page.getByLabel('Título *').fill('Card original')
    await page.getByRole('button', { name: 'Salvar' }).click()

    await page.getByText('Card original').click()
    await page.getByLabel('Título *').clear()
    await page.getByLabel('Título *').fill('Card editado')
    await page.getByRole('button', { name: 'Salvar' }).click()

    await expect(page.getByText('Card editado')).toBeVisible()
    await expect(page.getByText('Card original')).not.toBeVisible()
  })

  test('adicionar link ao card', async ({ page }) => {
    await page.getByText('Nova coluna').click()
    await page.getByPlaceholder('Título da coluna').fill('Backlog')
    await page.getByRole('button', { name: 'Adicionar' }).click()

    await page.getByText('Adicionar card').click()
    await page.getByLabel('Título *').fill('Card com link')
    await page.getByRole('button', { name: 'Adicionar link' }).click()
    await page.getByPlaceholder('URL (https://...)').fill('https://example.com')
    await page.getByRole('button', { name: 'Salvar' }).click()

    await expect(page.getByTestId('card-link-indicator')).toBeVisible()
  })

  test('criar tag e atribuir ao card', async ({ page }) => {
    await page.getByText('Nova coluna').click()
    await page.getByPlaceholder('Título da coluna').fill('Backlog')
    await page.getByRole('button', { name: 'Adicionar' }).click()

    await page.getByRole('button', { name: 'Tags' }).click()
    await page.getByPlaceholder('Nome da tag').fill('Frontend')
    await page.getByRole('button', { name: 'Criar tag' }).click()
    await page.keyboard.press('Escape')

    await page.getByText('Adicionar card').click()
    await page.getByLabel('Título *').fill('Card com tag')
    await page.getByRole('button', { name: 'Frontend' }).click()
    await page.getByRole('button', { name: 'Salvar' }).click()

    await expect(page.getByText('Card com tag')).toBeVisible()
    const card = page
      .locator('[data-card-id]')
      .filter({ hasText: 'Card com tag' })
    await expect(card.getByText('Frontend')).toBeVisible()
  })

  test('deletar card', async ({ page }) => {
    await page.getByText('Nova coluna').click()
    await page.getByPlaceholder('Título da coluna').fill('Backlog')
    await page.getByRole('button', { name: 'Adicionar' }).click()
    await page.getByText('Adicionar card').click()
    await page.getByLabel('Título *').fill('Card para deletar')
    await page.getByRole('button', { name: 'Salvar' }).click()

    await page.getByText('Card para deletar').click()
    await page.getByRole('button', { name: 'Excluir' }).click()
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click()

    await expect(page.getByText('Card para deletar')).not.toBeVisible()
  })

  test('deletar coluna', async ({ page }) => {
    await page.getByText('Nova coluna').click()
    await page.getByPlaceholder('Título da coluna').fill('Para deletar')
    await page.getByRole('button', { name: 'Adicionar' }).click()

    await page
      .getByRole('button', { name: 'Deletar coluna Para deletar', exact: true })
      .click()

    await expect(page.getByText('Para deletar')).not.toBeVisible()
  })

  test('exportar board como JSON', async ({ page }) => {
    await page.getByText('Nova coluna').click()
    await page.getByPlaceholder('Título da coluna').fill('Backlog')
    await page.getByRole('button', { name: 'Adicionar' }).click()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar' }).click(),
    ])

    expect(download.suggestedFilename()).toMatch(
      /kanban-backup-\d{4}-\d{2}-\d{2}\.json/,
    )
  })

  test('importar board de arquivo JSON válido', async ({ page }) => {
    const validState = {
      columnOrder: ['col1'],
      columns: {
        col1: { id: 'col1', title: 'Importado', cardIds: ['card1'] },
      },
      cards: {
        card1: {
          id: 'card1',
          title: 'Card importado',
          links: [],
          tagIds: [],
          createdAt: new Date().toISOString(),
        },
      },
      tags: {},
    }

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Importar' }).click(),
    ])

    await fileChooser.setFiles({
      name: 'kanban-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(validState)),
    })

    await expect(page.getByText('Importado', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Card importado', { exact: true }),
    ).toBeVisible()
  })

  test('importar arquivo JSON inválido exibe toast de erro', async ({
    page,
  }) => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Importar' }).click(),
    ])

    await fileChooser.setFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ "invalid": true }'),
    })

    await expect(page.getByText(/Erro ao importar/)).toBeVisible()
  })
})

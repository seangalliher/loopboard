import { expect, test } from '@playwright/test'

test('a card added and dragged to Doing is still in Doing after a reload', async ({ page }) => {
  const title = 'Smoke test card'
  await page.goto('/')

  await page.getByRole('button', { name: 'Add card' }).click()
  await page.getByRole('textbox', { name: 'Title' }).fill(title)
  await page.getByRole('button', { name: 'Save' }).click()

  // Cards can share a title, so look the card up inside its column, not by its Move buttons.
  const todo = page.getByRole('region', { name: 'To do' })
  const doing = page.getByRole('region', { name: 'Doing' })
  const cardIn = (column: typeof todo) =>
    column.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) })

  await expect(cardIn(todo)).toBeVisible()

  await cardIn(todo).dragTo(doing)

  await expect(cardIn(doing)).toBeVisible()
  await expect(cardIn(todo)).toHaveCount(0)

  await page.reload()

  await expect(cardIn(doing)).toBeVisible()
  await expect(cardIn(todo)).toHaveCount(0)
})

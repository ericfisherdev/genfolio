import { expect, type Locator, type Page } from '@playwright/test'

export const cards = (page: Page): Locator =>
  page.getByRole('list', { name: 'Images' }).getByRole('listitem')

/** A card whose details haven't arrived is labelled "Image <id>". */
const PLACEHOLDER = /^Image \d+$/

/** File names of the cards in display order, once every card's details have loaded. */
export async function cardNames(page: Page): Promise<string[]> {
  const read = (): Promise<string[]> =>
    cards(page)
      .getByRole('article')
      .evaluateAll((articles) =>
        articles.map((article) => article.getAttribute('aria-label') ?? '')
      )
  await expect.poll(async () => (await read()).some((name) => PLACEHOLDER.test(name))).toBe(false)
  return read()
}

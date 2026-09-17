import { expect, type Page } from '@playwright/test'

/** 選零件的機制集中在這裡；各驗收案例仍保留原本的業務斷言。 */
export async function pickSlot(page: Page, slotKey: string, partId: string): Promise<void> {
  await page.getByTestId(`slot-trigger-${slotKey}`).click()
  const sheet = page.getByTestId('part-picker-sheet')
  await expect(sheet).toBeVisible()
  await sheet.locator(`[data-testid="picker-option"][data-part-id="${partId}"]`).click()
  await expect(sheet).toBeHidden()
}

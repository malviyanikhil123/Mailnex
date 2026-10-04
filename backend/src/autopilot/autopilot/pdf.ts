import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Turning the tailored page into a PDF, using the browser that is already installed
 * for reading job sites. No extra library, and what you see in the browser is exactly
 * what the employer receives.
 */
export async function toPdf(html: string, name: string): Promise<string | null> {
  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    return null;              // no browser installed; the HTML is still saved
  }

  const folder = fileURLToPath(new URL('../../documents/', import.meta.url));
  await mkdir(folder, { recursive: true });
  const path = `${folder}${name}.pdf`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({ path, format: 'A4', printBackground: true });
  } finally {
    await browser.close();
  }
  return path;
}

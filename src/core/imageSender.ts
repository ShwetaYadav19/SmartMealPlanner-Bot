/**
 * Generates and sends plan/grocery images alongside text messages.
 * Thin orchestration layer: render → upload → send via WhatsApp.
 */
import { renderWeeklyPlanImage, renderGroceryListImage } from './imageRenderer';
import { uploadImage } from '../adapters/s3ImageStore';
import type { MessagingProvider } from './ports';
import type { WeeklyPlan, GroceryItem } from './types';

export async function sendWeeklyPlanImage(
  provider: MessagingProvider,
  to: string,
  plan: WeeklyPlan,
): Promise<void> {
  try {
    console.log(`[imageSender] Rendering weekly plan image for ${to}...`);
    const png = await renderWeeklyPlanImage(plan);
    console.log(`[imageSender] Rendered PNG: ${png.length} bytes`);

    const key = `plans/${to}/${Date.now()}.png`;
    const url = await uploadImage(key, png);
    console.log(`[imageSender] Uploaded to S3: ${url.substring(0, 100)}...`);

    await provider.sendImageMessage(to, url, 'Your weekly meal plan 🍽️');
    console.log(`[imageSender] Image message sent to ${to}`);
  } catch (err) {
    console.error(`[imageSender] Failed to send weekly plan image to ${to}:`, err);
  }
}

export async function sendGroceryListImage(
  provider: MessagingProvider,
  to: string,
  items: GroceryItem[],
  title?: string,
): Promise<void> {
  try {
    console.log(`[imageSender] Rendering grocery list image for ${to}...`);
    const png = await renderGroceryListImage(items, title);
    console.log(`[imageSender] Rendered PNG: ${png.length} bytes`);

    const key = `grocery/${to}/${Date.now()}.png`;
    const url = await uploadImage(key, png);
    console.log(`[imageSender] Uploaded to S3: ${url.substring(0, 100)}...`);

    await provider.sendImageMessage(to, url, title ?? 'Your grocery list 🛒');
    console.log(`[imageSender] Image message sent to ${to}`);
  } catch (err) {
    console.error(`[imageSender] Failed to send grocery list image to ${to}:`, err);
  }
}

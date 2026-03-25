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
    const png = await renderWeeklyPlanImage(plan);
    const key = `plans/${to}/${Date.now()}.png`;
    const url = await uploadImage(key, png);
    await provider.sendImageMessage(to, url, 'Your weekly meal plan 🍽️');
  } catch (err) {
    console.warn(`[imageSender] Failed to send weekly plan image to ${to}:`, err);
    // Non-fatal — text message was already sent
  }
}

export async function sendGroceryListImage(
  provider: MessagingProvider,
  to: string,
  items: GroceryItem[],
  title?: string,
): Promise<void> {
  try {
    const png = await renderGroceryListImage(items, title);
    const key = `grocery/${to}/${Date.now()}.png`;
    const url = await uploadImage(key, png);
    await provider.sendImageMessage(to, url, title ?? 'Your grocery list 🛒');
  } catch (err) {
    console.warn(`[imageSender] Failed to send grocery list image to ${to}:`, err);
  }
}

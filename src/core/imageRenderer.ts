/**
 * Canvas-based image renderer for meal plans and grocery lists.
 * Generates PNG buffers that can be uploaded to S3 and sent via WhatsApp.
 *
 * Uses dynamic import for @napi-rs/canvas so the module only loads
 * at render time — avoids crashes in test environments without native bindings.
 */
import type { WeeklyPlan, GroceryItem } from './types';

// ── Colour palette ──────────────────────────────────────────────────
const BG        = '#FFFDF7';
const HEADER_BG = '#2E7D32';
const HEADER_FG = '#FFFFFF';
const DAY_BG    = '#E8F5E9';
const TEXT      = '#333333';
const ACCENT    = '#43A047';
const DIVIDER   = '#C8E6C9';

// ── Layout constants ────────────────────────────────────────────────
const W = 800;
const PAD = 32;
const HEADER_H = 64;

// ── Lazy canvas loader ──────────────────────────────────────────────
let _canvas: typeof import('@napi-rs/canvas') | null = null;

async function getCanvas() {
  if (!_canvas) {
    _canvas = await import('@napi-rs/canvas');
  }
  return _canvas;
}

// ── Helpers ─────────────────────────────────────────────────────────

function wrapText(ctx: any, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.fill();
}

// ── Weekly Plan Image ───────────────────────────────────────────────

export async function renderWeeklyPlanImage(plan: WeeklyPlan): Promise<Buffer> {
  const { createCanvas } = await getCanvas();

  // First pass: measure height
  const tmpCanvas = createCanvas(W, 100);
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.font = '16px sans-serif';

  const contentW = W - PAD * 2;
  let totalH = HEADER_H + 20;

  const dayData: { day: string; lines: string[][] }[] = [];

  for (const d of plan) {
    const meals = [
      `🥣  Breakfast: ${d.breakfast.name}`,
      `🍛  Lunch: ${d.lunch.name}`,
      `🍽️  Dinner: ${d.dinner.name}`,
    ];
    const wrapped = meals.map((m) => wrapText(tmpCtx, m, contentW - 24));
    dayData.push({ day: d.day, lines: wrapped });

    const lineCount = wrapped.reduce((s, l) => s + l.length, 0);
    totalH += 36 + lineCount * 22 + 16;
  }

  totalH += 20;

  // Second pass: draw
  const canvas = createCanvas(W, totalH);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, totalH);

  ctx.fillStyle = HEADER_BG;
  ctx.fillRect(0, 0, W, HEADER_H);
  ctx.fillStyle = HEADER_FG;
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('🍽️  Weekly Meal Plan', PAD, 42);

  let y = HEADER_H + 20;

  for (const { day, lines } of dayData) {
    const dayLineCount = lines.reduce((s, l) => s + l.length, 0);
    const blockH = 36 + dayLineCount * 22 + 8;
    ctx.fillStyle = DAY_BG;
    roundRect(ctx, PAD - 8, y - 4, contentW + 16, blockH, 8);

    ctx.fillStyle = ACCENT;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(day, PAD, y + 20);
    y += 36;

    ctx.font = '16px sans-serif';
    ctx.fillStyle = TEXT;
    for (const mealLines of lines) {
      for (const line of mealLines) {
        ctx.fillText(line, PAD + 12, y + 16);
        y += 22;
      }
    }
    y += 16;
  }

  return Buffer.from(canvas.toBuffer('image/png'));
}

// ── Grocery List Image ──────────────────────────────────────────────

export async function renderGroceryListImage(items: GroceryItem[], title?: string): Promise<Buffer> {
  const { createCanvas } = await getCanvas();

  const grouped = new Map<string, GroceryItem[]>();
  for (const item of items) {
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category)!.push(item);
  }

  const tmpCanvas = createCanvas(W, 100);
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.font = '16px sans-serif';

  const contentW = W - PAD * 2;
  let totalH = HEADER_H + 20;

  const catData: { name: string; items: { text: string; wrapped: string[] }[] }[] = [];

  for (const [category, catItems] of grouped) {
    const itemLines = catItems.map((it) => {
      const text = `•  ${it.name} — ${it.quantity}`;
      return { text, wrapped: wrapText(tmpCtx, text, contentW - 24) };
    });
    catData.push({ name: category.charAt(0).toUpperCase() + category.slice(1), items: itemLines });

    const lineCount = itemLines.reduce((s, l) => s + l.wrapped.length, 0);
    totalH += 32 + lineCount * 22 + 16;
  }

  totalH += 20;

  const canvas = createCanvas(W, totalH);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, totalH);

  ctx.fillStyle = HEADER_BG;
  ctx.fillRect(0, 0, W, HEADER_H);
  ctx.fillStyle = HEADER_FG;
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(title ?? '🛒  Grocery List', PAD, 42);

  let y = HEADER_H + 20;

  for (const cat of catData) {
    ctx.fillStyle = ACCENT;
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(cat.name, PAD, y + 18);
    y += 32;

    ctx.strokeStyle = DIVIDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y - 8);
    ctx.lineTo(W - PAD, y - 8);
    ctx.stroke();

    ctx.font = '16px sans-serif';
    ctx.fillStyle = TEXT;
    for (const item of cat.items) {
      for (const line of item.wrapped) {
        ctx.fillText(line, PAD + 12, y + 14);
        y += 22;
      }
    }
    y += 16;
  }

  return Buffer.from(canvas.toBuffer('image/png'));
}

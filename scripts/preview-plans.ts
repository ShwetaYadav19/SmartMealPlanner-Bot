#!/usr/bin/env npx tsx
/**
 * Generate an interactive HTML preview of candidate plans.
 * Open in any browser to review, and approve/archive plans.
 *
 * Usage:
 *   npx tsx scripts/preview-plans.ts                    # from saved JSON files
 *   npx tsx scripts/preview-plans.ts --combo north_indian-veg-health
 *   open data/candidate-plans/preview.html              # open in browser
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.resolve(__dirname, '../data');
const OUTPUT_DIR = path.join(DATA_DIR, 'candidate-plans');

interface LightDayPlan {
  day: string;
  breakfast: { id: string; name: string };
  lunch: { componentIds: string[]; name: string };
  dinner: { componentIds: string[]; name: string };
}
interface StoredPlan {
  planId: string;
  combo: string;
  lunchFormat: string;
  dinnerFormat: string;
  status: string;
  createdAt: string;
  days: LightDayPlan[];
}

function loadPlans(comboFilter?: string): StoredPlan[] {
  const plans: StoredPlan[] = [];
  if (!fs.existsSync(OUTPUT_DIR)) return plans;

  const comboDirs = fs.readdirSync(OUTPUT_DIR).filter(d => {
    if (d.startsWith('.') || d.endsWith('.html') || d.endsWith('.md')) return false;
    const full = path.join(OUTPUT_DIR, d);
    return fs.statSync(full).isDirectory();
  });

  for (const dir of comboDirs) {
    if (comboFilter && dir !== comboFilter) continue;
    const files = fs.readdirSync(path.join(OUTPUT_DIR, dir)).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(OUTPUT_DIR, dir, file), 'utf-8');
        plans.push(JSON.parse(raw));
      } catch { /* skip bad files */ }
    }
  }
  return plans;
}

function buildHtml(plans: StoredPlan[]): string {
  // Group by combo
  const grouped = new Map<string, StoredPlan[]>();
  for (const p of plans) {
    if (!grouped.has(p.combo)) grouped.set(p.combo, []);
    grouped.get(p.combo)!.push(p);
  }

  let planCards = '';
  for (const [combo, comboPlans] of grouped) {
    planCards += `<h2>${combo}</h2>\n`;
    for (const plan of comboPlans) {
      const statusClass = plan.status === 'approved' ? 'approved' : plan.status === 'archived' ? 'archived' : 'candidate';
      planCards += `<div class="plan-card ${statusClass}" data-plan-id="${plan.planId}">\n`;
      planCards += `<div class="plan-header">`;
      planCards += `<h3>${plan.planId}</h3>`;
      planCards += `<span class="badge badge-${statusClass}">${plan.status}</span>`;
      planCards += `<span class="meta">Lunch: ${plan.lunchFormat} | Dinner: ${plan.dinnerFormat} | ${plan.createdAt}</span>`;
      planCards += `</div>\n`;
      planCards += `<table><thead><tr><th>Day</th><th>🥣 Breakfast</th><th>🍛 Lunch</th><th>🍽️ Dinner</th></tr></thead><tbody>\n`;
      for (const d of plan.days) {
        planCards += `<tr>`;
        planCards += `<td><strong>${d.day}</strong></td>`;
        planCards += `<td>${d.breakfast.name}</td>`;
        planCards += `<td>${d.lunch.name}</td>`;
        planCards += `<td>${d.dinner.name}</td>`;
        planCards += `</tr>\n`;
      }
      planCards += `</tbody></table>\n`;
      planCards += `<div class="actions">`;
      planCards += `<button onclick="setStatus('${plan.planId}','approved')" class="btn btn-approve">✅ Approve</button>`;
      planCards += `<button onclick="setStatus('${plan.planId}','archived')" class="btn btn-archive">🗑️ Archive</button>`;
      planCards += `<button onclick="setStatus('${plan.planId}','candidate')" class="btn btn-reset">↩️ Reset</button>`;
      planCards += `</div></div>\n`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meal Plan Review</title>
<style>
${CSS}
</style></head><body>
<h1>🍽️ Meal Plan Review</h1>
<p class="meta">${plans.length} plans loaded. Approve the ones you like — status is saved to the JSON files.</p>
<div class="filters">
  <button onclick="filterStatus('all')" class="btn">All</button>
  <button onclick="filterStatus('candidate')" class="btn">Candidates</button>
  <button onclick="filterStatus('approved')" class="btn btn-approve">Approved</button>
  <button onclick="filterStatus('archived')" class="btn btn-archive">Archived</button>
</div>
${planCards}
<script>
const plans = ${JSON.stringify(plans, null, 2)};

function setStatus(planId, status) {
  const plan = plans.find(p => p.planId === planId);
  if (!plan) return;
  plan.status = status;
  const card = document.querySelector('[data-plan-id="' + planId + '"]');
  if (card) {
    card.className = 'plan-card ' + status;
    card.querySelector('.badge').className = 'badge badge-' + status;
    card.querySelector('.badge').textContent = status;
  }
  // Download updated JSON
  saveToFile(plan);
}

function saveToFile(plan) {
  const blob = new Blob([JSON.stringify(plan, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = plan.planId + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function filterStatus(status) {
  document.querySelectorAll('.plan-card').forEach(card => {
    if (status === 'all') { card.style.display = ''; return; }
    card.style.display = card.classList.contains(status) ? '' : 'none';
  });
}
</script></body></html>`;
}

const CSS = `
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 1100px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
h1 { color: #333; margin-bottom: 4px; }
h2 { color: #555; margin-top: 40px; border-bottom: 2px solid #ddd; padding-bottom: 8px; }
h3 { margin: 0; color: #333; font-size: 15px; }
.meta { color: #888; font-size: 13px; }
.filters { margin: 16px 0; display: flex; gap: 8px; }
.plan-card { background: white; border-radius: 10px; padding: 16px; margin: 12px 0; box-shadow: 0 1px 4px rgba(0,0,0,0.08); border-left: 4px solid #ccc; }
.plan-card.approved { border-left-color: #4CAF50; }
.plan-card.archived { border-left-color: #999; opacity: 0.5; }
.plan-card.candidate { border-left-color: #FF9800; }
.plan-header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 14px; }
th { background: #f0f0f0; padding: 8px 10px; text-align: left; font-weight: 600; font-size: 13px; }
td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; }
tr:hover td { background: #fafafa; }
td:first-child { font-weight: 600; width: 90px; }
.badge { padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
.badge-candidate { background: #FFF3E0; color: #E65100; }
.badge-approved { background: #E8F5E9; color: #2E7D32; }
.badge-archived { background: #eee; color: #666; }
.actions { display: flex; gap: 8px; margin-top: 8px; }
.btn { padding: 6px 14px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-size: 13px; background: white; }
.btn:hover { background: #f5f5f5; }
.btn-approve { border-color: #4CAF50; color: #2E7D32; }
.btn-approve:hover { background: #E8F5E9; }
.btn-archive { border-color: #999; color: #666; }
.btn-archive:hover { background: #f0f0f0; }
.btn-reset { border-color: #FF9800; color: #E65100; }
`;

// --- Main ---
const args = process.argv.slice(2);
let comboFilter: string | undefined;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--combo' && args[i + 1]) comboFilter = args[++i];
}

const plans = loadPlans(comboFilter);
if (plans.length === 0) {
  console.log('No plans found. Run generate-weekly-plans.ts first.');
  process.exit(1);
}

const html = buildHtml(plans);
const outPath = path.join(OUTPUT_DIR, 'preview.html');
fs.writeFileSync(outPath, html);
console.log(`\n✅ Preview: ${path.relative(process.cwd(), outPath)}`);
console.log(`Open in browser: open ${path.relative(process.cwd(), outPath)}\n`);

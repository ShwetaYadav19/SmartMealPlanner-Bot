/**
 * Deletes all Twilio Content Templates EXCEPT a known keep-list.
 *
 * Usage:
 *   npx tsx scripts/cleanup-twilio-templates.ts              # dry run
 *   npx tsx scripts/cleanup-twilio-templates.ts --delete      # actually delete
 *
 * Requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars.
 */
import Twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.error('Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars');
  process.exit(1);
}

const client = Twilio(accountSid, authToken);
const dryRun = !process.argv.includes('--delete');

const KEEP = new Set([
  'weekly_reminder',
  'daily_meal_reminder_new',
  'daily_meal_reminder',
  'copy_mealplanner_main_menu_without_emoji',
  'copy_mealplanner_menu_more_without_emoji',
  'copy_mealplanner_daily_reminder_with_example',
  'mealplanner_main_menu_without_image_button',
  'mealplanner_cook_options',
  'mealplanner_meal_style',
  'mealplanner_diet_selection',
  'mealplanner_cuisine_selection',
]);

async function run() {
  const contents = await client.content.v1.contents.list({ limit: 1000 });
  const toDelete = contents.filter((c) => !KEEP.has(c.friendlyName));

  console.log(`Keeping ${contents.length - toDelete.length}, deleting ${toDelete.length} (total: ${contents.length})`);

  for (const t of toDelete) {
    const label = `${t.sid}  name="${t.friendlyName}"`;
    if (dryRun) {
      console.log(`[DRY RUN] would delete ${label}`);
    } else {
      await client.content.v1.contents(t.sid).remove();
      console.log(`Deleted ${label}`);
    }
  }

  console.log(dryRun ? '\nRe-run with --delete to actually remove them.' : '\nDone.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

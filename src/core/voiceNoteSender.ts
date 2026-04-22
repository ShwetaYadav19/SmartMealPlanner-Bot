/**
 * Generates Hindi voice notes for meal plans using AWS Polly TTS,
 * uploads to S3, and sends via WhatsApp.
 *
 * Voice notes are best-effort — callers should catch errors and
 * fall back gracefully (the text message is always the primary).
 */
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { uploadAudio } from '../adapters/s3ImageStore';
import type { MessagingProvider } from './ports';
import type { DayPlan } from './types';

const REGION = process.env.AWS_REGION || 'ap-south-1';
const polly = new PollyClient({ region: REGION });

/** Hindi day-name mapping */
const HINDI_DAYS: Record<string, string> = {
  Monday: 'सोमवार',
  Tuesday: 'मंगलवार',
  Wednesday: 'बुधवार',
  Thursday: 'गुरुवार',
  Friday: 'शुक्रवार',
  Saturday: 'शनिवार',
  Sunday: 'रविवार',
};

/**
 * Builds a natural Hindi sentence describing tomorrow's meals.
 * Keeps it conversational — like a quick voice message from a friend.
 */
export function buildHindiMealText(dayPlan: DayPlan): string {
  const hindiDay = HINDI_DAYS[dayPlan.day] ?? dayPlan.day;
  return (
    `नमस्ते! कल ${hindiDay} के लिए आपका मेन्यू तैयार है। ` +
    `सुबह के नाश्ते में ${dayPlan.breakfast.name}। ` +
    `दोपहर के खाने में ${dayPlan.lunch.name}। ` +
    `और रात के खाने में ${dayPlan.dinner.name}। ` +
    `धन्यवाद!`
  );
}

/**
 * Synthesizes Hindi speech from text using AWS Polly.
 * Returns an MP3 buffer.
 */
async function synthesizeHindiSpeech(text: string): Promise<Buffer> {
  const command = new SynthesizeSpeechCommand({
    Text: text,
    OutputFormat: 'mp3',
    VoiceId: 'Aditi',       // Hindi female voice
    LanguageCode: 'hi-IN',
    Engine: 'standard',
  });

  const response = await polly.send(command);

  if (!response.AudioStream) {
    throw new Error('Polly returned empty AudioStream');
  }

  // Convert the readable stream to a Buffer
  const chunks: Uint8Array[] = [];
  const stream = response.AudioStream as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Generates a Hindi voice note for a day's meal plan and sends it
 * via WhatsApp. Thin orchestration: text → Polly TTS → S3 → WhatsApp.
 */
export async function sendMealVoiceNote(
  provider: MessagingProvider,
  to: string,
  dayPlan: DayPlan,
): Promise<void> {
  console.log(`[voiceNote] Generating Hindi voice note for ${to}...`);

  const hindiText = buildHindiMealText(dayPlan);
  console.log(`[voiceNote] Hindi text: ${hindiText}`);

  const mp3 = await synthesizeHindiSpeech(hindiText);
  console.log(`[voiceNote] Synthesized MP3: ${mp3.length} bytes`);

  const key = `voice-notes/${to}/${Date.now()}.mp3`;
  const url = await uploadAudio(key, mp3);
  console.log(`[voiceNote] Uploaded to S3`);

  await provider.sendAudioMessage(to, url);
  console.log(`[voiceNote] Voice note sent to ${to}`);
}

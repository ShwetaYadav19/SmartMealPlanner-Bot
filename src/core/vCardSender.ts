/**
 * Generates a vCard (.vcf) for the bot's WhatsApp number,
 * uploads it to S3, and sends it to the user.
 */
import { uploadVCard } from '../adapters/s3ImageStore';
import type { MessagingProvider } from './ports';

const CONTACT_NAME = 'LiveHealthySmartMealPlanner';

function generateVCardContent(phoneNumber: string): string {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${CONTACT_NAME}`,
    `TEL;TYPE=CELL:${phoneNumber}`,
    `ORG:${CONTACT_NAME}`,
    'END:VCARD',
  ].join('\r\n');
}

export async function sendSaveContactVCard(
  provider: MessagingProvider,
  to: string,
  botPhoneNumber: string,
): Promise<void> {
  const vcf = generateVCardContent(botPhoneNumber);
  const key = `vcard/${CONTACT_NAME}.vcf`;
  const url = await uploadVCard(key, vcf);
  await provider.sendVCardMessage(to, url);
}

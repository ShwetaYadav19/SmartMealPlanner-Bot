/**
 * Uploads PNG buffers to S3 and returns a pre-signed URL.
 * Pre-signed URLs work without public bucket access — Twilio fetches
 * the image once and caches it, so a short expiry is fine.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const REGION = process.env.AWS_REGION || 'ap-south-1';
const BUCKET = process.env.IMAGE_BUCKET || `smartmealplanner-images-${process.env.STAGE || 'dev'}`;

const s3 = new S3Client({ region: REGION });

export async function uploadImage(key: string, png: Buffer): Promise<string> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: png,
    ContentType: 'image/png',
    CacheControl: 'max-age=86400',
  }));

  // Return a pre-signed URL valid for 1 hour — Twilio fetches immediately
  const url = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }), { expiresIn: 3600 });

  return url;
}

export async function uploadVCard(key: string, vcfContent: string): Promise<string> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: vcfContent,
    ContentType: 'text/vcard',
    CacheControl: 'max-age=86400',
  }));

  const url = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }), { expiresIn: 3600 });

  return url;
}

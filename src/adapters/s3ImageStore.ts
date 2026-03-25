/**
 * Uploads PNG buffers to S3 and returns a public URL.
 * Uses a dedicated bucket with public-read objects (or pre-signed URLs).
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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

  // Return the public S3 URL — bucket must have public access or CloudFront in front
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

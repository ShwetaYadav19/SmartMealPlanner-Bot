#!/usr/bin/env node

/**
 * One-time bootstrap: adds S3 permissions to the github-actions-deploy IAM user.
 * Run this locally with admin credentials before the first deploy that uses S3.
 *
 * Usage:
 *   node scripts/bootstrap-ci-permissions.js
 *
 * This is idempotent — safe to run multiple times.
 */

const { IAMClient, PutUserPolicyCommand } = require('@aws-sdk/client-iam');

const REGION = 'ap-south-1';
const CI_USER = 'github-actions-deploy';

const iam = new IAMClient({ region: REGION });

async function main() {
  console.log(`Updating IAM user "${CI_USER}" with S3 deploy permissions...`);

  const policy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'S3ImageBucketDeploy',
        Effect: 'Allow',
        Action: [
          's3:CreateBucket',
          's3:HeadBucket',
          's3:PutBucketPolicy',
          's3:PutBucketLifecycleConfiguration',
          's3:PutPublicAccessBlock',
        ],
        Resource: 'arn:aws:s3:::smartmealplanner-images-*',
      },
    ],
  });

  await iam.send(new PutUserPolicyCommand({
    UserName: CI_USER,
    PolicyName: 'MealPlannerS3DeployAccess',
    PolicyDocument: policy,
  }));

  console.log('Done. The CI user can now create and configure S3 image buckets.');
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});

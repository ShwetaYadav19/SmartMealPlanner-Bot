#!/usr/bin/env node

/**
 * Deployment script for SmartMealPlanner-Bot
 * Deploys Lambda functions, DynamoDB table, API Gateway, and EventBridge rules.
 *
 * Usage:
 *   STAGE=dev node scripts/deploy.js
 *   STAGE=prod node scripts/deploy.js
 *
 * Required env vars for Lambda config:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SENDER_NUMBER
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_PLAN_ID
 * Optional: TWILIO_TEMPLATE_SID_* overrides
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const { DynamoDBClient, CreateTableCommand, DescribeTableCommand, UpdateTimeToLiveCommand } = require('@aws-sdk/client-dynamodb');
const {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionCommand,
  AddPermissionCommand,
  GetPolicyCommand,
} = require('@aws-sdk/client-lambda');
const {
  IAMClient,
  CreateRoleCommand,
  GetRoleCommand,
  PutRolePolicyCommand,
  AttachRolePolicyCommand,
} = require('@aws-sdk/client-iam');
const {
  APIGatewayClient,
  CreateRestApiCommand,
  GetRestApisCommand,
  GetResourcesCommand,
  CreateResourceCommand,
  PutMethodCommand,
  PutIntegrationCommand,
  PutMethodResponseCommand,
  PutIntegrationResponseCommand,
  CreateDeploymentCommand,
} = require('@aws-sdk/client-api-gateway');
const {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
} = require('@aws-sdk/client-eventbridge');
const {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutPublicAccessBlockCommand,
  PutBucketPolicyCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const {
  CloudWatchClient: CWClient,
  PutDashboardCommand,
} = require('@aws-sdk/client-cloudwatch');

// --- Constants ---
const REGION = 'ap-south-1';
const AWS_ACCOUNT_ID = '713170882602';
const stage = process.env.STAGE || 'dev';

const TABLE_NAME = `MealPlannerUsers-${stage}`;
const WEBHOOK_FN = `MealPlannerWebhook-${stage}`;
const DAILY_FN = `MealPlannerDailyReminder-${stage}`;
const WEEKLY_FN = `MealPlannerWeeklyReminder-${stage}`;
const PAYMENT_WEBHOOK_FN = `MealPlannerPaymentWebhook-${stage}`;
const API_NAME = `MealPlannerAPI-${stage}`;
const ROLE_NAME = `MealPlannerLambdaRole-${stage}`;
const DAILY_RULE = `MealPlannerDailyReminder-${stage}`;
const WEEKLY_RULE = `MealPlannerWeeklyReminder-${stage}`;
const IMAGE_BUCKET = `smartmealplanner-images-${stage}`;
const DAILY_ACTIVITY_TABLE = `MealPlannerDailyActivity-${stage}`;
const METRICS_API_FN = `MealPlannerMetricsApi-${stage}`;
const DASHBOARD_NAME = `SmartMealPlanner-${stage}`;
const DASHBOARD_BUCKET = `smartmealplanner-dashboard-${stage}`;
const RUNTIME = 'nodejs18.x';

const LAMBDA_DEFS = [
  { name: WEBHOOK_FN, handler: 'handlers/webhookHandler.webhookHandler', src: 'webhookHandler.js' },
  { name: DAILY_FN, handler: 'handlers/dailyReminderHandler.dailyReminderHandler', src: 'dailyReminderHandler.js' },
  { name: WEEKLY_FN, handler: 'handlers/weeklyReminderHandler.weeklyReminderHandler', src: 'weeklyReminderHandler.js' },
  { name: PAYMENT_WEBHOOK_FN, handler: 'handlers/paymentWebhookHandler.paymentWebhookHandler', src: 'paymentWebhookHandler.js' },
  { name: METRICS_API_FN, handler: 'handlers/metricsApiHandler.metricsApiHandler', src: 'metricsApiHandler.js' },
];

// AWS clients
const dynamodb = new DynamoDBClient({ region: REGION });
const lambdaClient = new LambdaClient({ region: REGION });
const iamClient = new IAMClient({ region: REGION });
const apigw = new APIGatewayClient({ region: REGION });
const eb = new EventBridgeClient({ region: REGION });
const s3Client = new S3Client({ region: REGION });
const cwClient = new CWClient({ region: REGION });

function log(msg) {
  console.log(`[${stage}] ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Collect Lambda environment variables ---
function getLambdaEnvVars() {
  const env = {
    STAGE: stage,
    DYNAMODB_TABLE: TABLE_NAME,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
    TWILIO_SENDER_NUMBER: process.env.TWILIO_SENDER_NUMBER || '',
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
    RAZORPAY_PLAN_ID: process.env.RAZORPAY_PLAN_ID || '',
    ...(stage === 'prod' ? { RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '' } : {}),
    IMAGE_BUCKET: IMAGE_BUCKET,
    DAILY_ACTIVITY_TABLE: DAILY_ACTIVITY_TABLE,
    METRICS_API_KEY: process.env.METRICS_API_KEY || '',
  };
  // Pass through all TWILIO_TEMPLATE_SID_* overrides
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('TWILIO_TEMPLATE_SID_') && value) {
      env[key] = value;
    }
  }
  return env;
}

// --- Create zip buffer from a handler JS file ---
function createZipBuffer(handlerFileName) {
  const handlerPath = path.join(__dirname, '..', 'dist', 'handlers', handlerFileName);
  if (!fs.existsSync(handlerPath)) {
    throw new Error(`Built handler not found: ${handlerPath}. Run 'npm run build' first.`);
  }

  return new Promise((resolve, reject) => {
    const buffers = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('data', (chunk) => buffers.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(buffers)));
    archive.on('error', reject);

    // Add the handler file into a handlers/ directory inside the zip
    // so the handler path "handlers/webhookHandler.webhookHandler" resolves correctly
    archive.file(handlerPath, { name: `handlers/${handlerFileName}` });

    // Also include the meals.json data file for the JsonMealRepository
    const mealsPath = path.join(__dirname, '..', 'data', 'meals.json');
    if (fs.existsSync(mealsPath)) {
      archive.file(mealsPath, { name: 'data/meals.json' });
    }

    // Include the meal-components directory for the JsonMealComponentRepository
    const mealComponentsDir = path.join(__dirname, '..', 'data', 'meal-components');
    if (fs.existsSync(mealComponentsDir)) {
      archive.directory(mealComponentsDir, 'data/meal-components');
    }

    // Include the meal-selection-rules.json data file for the JsonRulesRepository
    const rulesPath = path.join(__dirname, '..', 'data', 'meal-selection-rules.json');
    if (fs.existsSync(rulesPath)) {
      archive.file(rulesPath, { name: 'data/meal-selection-rules.json' });
    }

    // Include @napi-rs/canvas native bindings (externalized from esbuild)
    const canvasDir = path.join(__dirname, '..', 'node_modules', '@napi-rs', 'canvas');
    if (fs.existsSync(canvasDir)) {
      archive.directory(canvasDir, 'node_modules/@napi-rs/canvas');
    }
    // Include the platform-specific binary package (e.g. canvas-linux-x64-gnu)
    const nmDir = path.join(__dirname, '..', 'node_modules', '@napi-rs');
    if (fs.existsSync(nmDir)) {
      for (const entry of fs.readdirSync(nmDir)) {
        if (entry.startsWith('canvas-') && entry !== 'canvas') {
          const platformDir = path.join(nmDir, entry);
          archive.directory(platformDir, `node_modules/@napi-rs/${entry}`);
        }
      }
    }

    archive.finalize();
  });
}

// --- Step 1: Build ---
async function buildLambdas() {
  log('Building Lambda bundles...');
  execSync('npm run build', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  log('Build complete.');
}

// --- Step 2: DynamoDB table ---
async function ensureDynamoDBTable() {
  log(`Ensuring DynamoDB table: ${TABLE_NAME}`);
  try {
    await dynamodb.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    log(`Table ${TABLE_NAME} already exists.`);
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      log(`Creating table ${TABLE_NAME}...`);
      await dynamodb.send(new CreateTableCommand({
        TableName: TABLE_NAME,
        KeySchema: [{ AttributeName: 'phoneNumber', KeyType: 'HASH' }],
        AttributeDefinitions: [{ AttributeName: 'phoneNumber', AttributeType: 'S' }],
        BillingMode: 'PAY_PER_REQUEST',
      }));
      log(`Table ${TABLE_NAME} created.`);
    } else {
      throw err;
    }
  }
}

// --- Step 2a: Daily Activity DynamoDB table ---
async function ensureDailyActivityTable() {
  log(`Ensuring DynamoDB table: ${DAILY_ACTIVITY_TABLE}`);
  try {
    await dynamodb.send(new DescribeTableCommand({ TableName: DAILY_ACTIVITY_TABLE }));
    log(`Table ${DAILY_ACTIVITY_TABLE} already exists.`);
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      log(`Creating table ${DAILY_ACTIVITY_TABLE}...`);
      await dynamodb.send(new CreateTableCommand({
        TableName: DAILY_ACTIVITY_TABLE,
        KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
        AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
        BillingMode: 'PAY_PER_REQUEST',
      }));
      log(`Table ${DAILY_ACTIVITY_TABLE} created. Waiting for ACTIVE status...`);
      // Wait for table to become ACTIVE before enabling TTL
      for (let i = 0; i < 30; i++) {
        const desc = await dynamodb.send(new DescribeTableCommand({ TableName: DAILY_ACTIVITY_TABLE }));
        if (desc.Table?.TableStatus === 'ACTIVE') break;
        await sleep(2000);
      }
      log(`Table ${DAILY_ACTIVITY_TABLE} is ACTIVE.`);
    } else {
      throw err;
    }
  }

  // Enable TTL on the ttl attribute
  try {
    await dynamodb.send(new UpdateTimeToLiveCommand({
      TableName: DAILY_ACTIVITY_TABLE,
      TimeToLiveSpecification: {
        Enabled: true,
        AttributeName: 'ttl',
      },
    }));
    log(`TTL enabled on ${DAILY_ACTIVITY_TABLE}.`);
  } catch (err) {
    if (err.name === 'ValidationException' && err.message?.includes('already enabled')) {
      log(`TTL already enabled on ${DAILY_ACTIVITY_TABLE}.`);
    } else {
      throw err;
    }
  }
}

// --- Step 2b: S3 image bucket ---
async function ensureS3Bucket() {
  log(`Ensuring S3 bucket: ${IMAGE_BUCKET}`);
  try {
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: IMAGE_BUCKET }));
      log(`Bucket ${IMAGE_BUCKET} already exists.`);
    } catch (err) {
      if (err.name === 'NotFound' || err['$metadata']?.httpStatusCode === 404) {
        log(`Creating bucket ${IMAGE_BUCKET}...`);
        await s3Client.send(new CreateBucketCommand({ Bucket: IMAGE_BUCKET }));
        log(`Bucket ${IMAGE_BUCKET} created.`);
      } else {
        throw err;
      }
    }

    // Allow public read so Twilio can fetch the images
    await s3Client.send(new PutPublicAccessBlockCommand({
      Bucket: IMAGE_BUCKET,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,
        IgnorePublicAcls: false,
        BlockPublicPolicy: false,
        RestrictPublicBuckets: false,
      },
    }));

    const bucketPolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Sid: 'PublicReadImages',
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${IMAGE_BUCKET}/*`,
      }],
    });
    await s3Client.send(new PutBucketPolicyCommand({
      Bucket: IMAGE_BUCKET,
      Policy: bucketPolicy,
    }));

    // Lifecycle rule: auto-delete objects after 7 days
    await s3Client.send(new PutBucketLifecycleConfigurationCommand({
      Bucket: IMAGE_BUCKET,
      LifecycleConfiguration: {
        Rules: [{
          ID: 'AutoDeleteAfter7Days',
          Status: 'Enabled',
          Filter: { Prefix: '' },
          Expiration: { Days: 7 },
        }],
      },
    }));

    log(`Bucket ${IMAGE_BUCKET} configured with public read + 7-day lifecycle.`);
  } catch (err) {
    log(`⚠️  S3 bucket setup skipped (missing IAM permissions). Run bootstrap-ci-permissions.js with admin creds to fix.`);
    log(`   Error: ${err.message}`);
  }
}

// --- Step 3: IAM role ---
async function ensureIAMRole() {
  log(`Ensuring IAM role: ${ROLE_NAME}`);
  const assumeRolePolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: { Service: 'lambda.amazonaws.com' },
      Action: 'sts:AssumeRole',
    }],
  });

  let roleArn;
  try {
    const resp = await iamClient.send(new GetRoleCommand({ RoleName: ROLE_NAME }));
    roleArn = resp.Role.Arn;
    log(`Role ${ROLE_NAME} already exists.`);
  } catch (err) {
    if (err.name === 'NoSuchEntityException') {
      log(`Creating role ${ROLE_NAME}...`);
      const resp = await iamClient.send(new CreateRoleCommand({
        RoleName: ROLE_NAME,
        AssumeRolePolicyDocument: assumeRolePolicy,
        Description: `Lambda execution role for MealPlanner ${stage}`,
      }));
      roleArn = resp.Role.Arn;
      // Wait for role propagation
      await sleep(10000);
    } else {
      throw err;
    }
  }

  // Attach basic Lambda execution policy
  try {
    await iamClient.send(new AttachRolePolicyCommand({
      RoleName: ROLE_NAME,
      PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
    }));
  } catch (err) {
    // Ignore if already attached
  }

  // Inline policy for DynamoDB access
  const dynamoPolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Action: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Scan',
        'dynamodb:Query',
      ],
      Resource: `arn:aws:dynamodb:${REGION}:${AWS_ACCOUNT_ID}:table/${TABLE_NAME}`,
    }],
  });

  await iamClient.send(new PutRolePolicyCommand({
    RoleName: ROLE_NAME,
    PolicyName: `MealPlannerDynamoAccess-${stage}`,
    PolicyDocument: dynamoPolicy,
  }));

  // Inline policy for S3 image bucket access
  const s3Policy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Action: [
        's3:PutObject',
        's3:GetObject',
        's3:DeleteObject',
      ],
      Resource: `arn:aws:s3:::${IMAGE_BUCKET}/*`,
    }],
  });

  await iamClient.send(new PutRolePolicyCommand({
    RoleName: ROLE_NAME,
    PolicyName: `MealPlannerS3ImageAccess-${stage}`,
    PolicyDocument: s3Policy,
  }));

  // Inline policy for DynamoDB Daily Activity Table access
  const dailyActivityPolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Action: [
        'dynamodb:PutItem',
      ],
      Resource: `arn:aws:dynamodb:${REGION}:${AWS_ACCOUNT_ID}:table/${DAILY_ACTIVITY_TABLE}`,
    }],
  });

  await iamClient.send(new PutRolePolicyCommand({
    RoleName: ROLE_NAME,
    PolicyName: `MealPlannerDailyActivityAccess-${stage}`,
    PolicyDocument: dailyActivityPolicy,
  }));

  // Inline policy for CloudWatch metrics access (all handlers)
  const cloudwatchPolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['cloudwatch:PutMetricData'],
        Resource: '*',
      },
      {
        Effect: 'Allow',
        Action: ['cloudwatch:GetMetricData'],
        Resource: '*',
      },
    ],
  });

  await iamClient.send(new PutRolePolicyCommand({
    RoleName: ROLE_NAME,
    PolicyName: `MealPlannerCloudWatchAccess-${stage}`,
    PolicyDocument: cloudwatchPolicy,
  }));

  // Inline policy for AWS Polly (Hindi voice note TTS)
  const pollyPolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Action: ['polly:SynthesizeSpeech'],
      Resource: '*',
    }],
  });

  await iamClient.send(new PutRolePolicyCommand({
    RoleName: ROLE_NAME,
    PolicyName: `MealPlannerPollyAccess-${stage}`,
    PolicyDocument: pollyPolicy,
  }));

  log(`IAM role configured: ${roleArn}`);
  return roleArn;
}

// --- Step 4: Deploy Lambda functions ---
async function deployLambdaFunction(fnDef, roleArn) {
  const { name, handler, src } = fnDef;
  log(`Deploying Lambda: ${name}`);

  const zipBuffer = await createZipBuffer(src);
  const envVars = getLambdaEnvVars();

  try {
    await lambdaClient.send(new GetFunctionCommand({ FunctionName: name }));
    // Function exists — update code and configuration
    log(`Updating ${name}...`);
    await lambdaClient.send(new UpdateFunctionCodeCommand({
      FunctionName: name,
      ZipFile: zipBuffer,
    }));
    // Wait for code update to finish before updating config
    await waitForLambdaReady(name);
    await lambdaClient.send(new UpdateFunctionConfigurationCommand({
      FunctionName: name,
      Handler: handler,
      Runtime: RUNTIME,
      Role: roleArn,
      Timeout: 30,
      MemorySize: 256,
      Environment: { Variables: envVars },
    }));
    await waitForLambdaReady(name);
    log(`Updated ${name}.`);
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      log(`Creating ${name}...`);
      await lambdaClient.send(new CreateFunctionCommand({
        FunctionName: name,
        Runtime: RUNTIME,
        Role: roleArn,
        Handler: handler,
        Code: { ZipFile: zipBuffer },
        Timeout: 30,
        MemorySize: 256,
        Environment: { Variables: envVars },
        Description: `MealPlanner ${name}`,
      }));
      await waitForLambdaReady(name);
      log(`Created ${name}.`);
    } else {
      throw err;
    }
  }
}

async function waitForLambdaReady(functionName, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const resp = await lambdaClient.send(new GetFunctionCommand({ FunctionName: functionName }));
    const status = resp.Configuration?.LastUpdateStatus;
    if (!status || status === 'Successful') return;
    if (status === 'Failed') throw new Error(`Lambda ${functionName} update failed`);
    await sleep(2000);
  }
  throw new Error(`Lambda ${functionName} still updating after ${maxAttempts * 2}s`);
}

async function deployAllLambdas(roleArn) {
  for (const fnDef of LAMBDA_DEFS) {
    await deployLambdaFunction(fnDef, roleArn);
  }
}

// --- Step 5: API Gateway ---
async function ensureApiGateway() {
  log(`Configuring API Gateway: ${API_NAME}`);

  // Find or create the REST API
  let apiId;
  const apis = await apigw.send(new GetRestApisCommand({ limit: 500 }));
  const existing = (apis.items || []).find((a) => a.name === API_NAME);

  if (existing) {
    apiId = existing.id;
    log(`API ${API_NAME} already exists (${apiId}).`);
  } else {
    const resp = await apigw.send(new CreateRestApiCommand({
      name: API_NAME,
      description: `MealPlanner API for ${stage}`,
    }));
    apiId = resp.id;
    log(`Created API ${API_NAME} (${apiId}).`);
  }

  // Get root resource
  const resources = await apigw.send(new GetResourcesCommand({ restApiId: apiId }));
  const rootResource = resources.items.find((r) => r.path === '/');

  // Find or create /webhook resource
  let webhookResource = resources.items.find((r) => r.path === '/webhook');
  if (!webhookResource) {
    const resp = await apigw.send(new CreateResourceCommand({
      restApiId: apiId,
      parentId: rootResource.id,
      pathPart: 'webhook',
    }));
    webhookResource = resp;
    log('Created /webhook resource.');
  }

  // Create POST method on /webhook
  try {
    await apigw.send(new PutMethodCommand({
      restApiId: apiId,
      resourceId: webhookResource.id,
      httpMethod: 'POST',
      authorizationType: 'NONE',
    }));
  } catch (err) {
    if (err.name !== 'ConflictException') throw err;
    // Method already exists
  }

  // Integrate with webhook Lambda
  const webhookLambdaArn = `arn:aws:lambda:${REGION}:${AWS_ACCOUNT_ID}:function:${WEBHOOK_FN}`;
  const integrationUri = `arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${webhookLambdaArn}/invocations`;

  await apigw.send(new PutIntegrationCommand({
    restApiId: apiId,
    resourceId: webhookResource.id,
    httpMethod: 'POST',
    type: 'AWS_PROXY',
    integrationHttpMethod: 'POST',
    uri: integrationUri,
  }));

  // Grant API Gateway permission to invoke the Lambda
  const statementId = `apigateway-invoke-${stage}`;
  try {
    await lambdaClient.send(new GetPolicyCommand({ FunctionName: WEBHOOK_FN }));
    // Policy exists, try to add permission (may already exist)
    try {
      await lambdaClient.send(new AddPermissionCommand({
        FunctionName: WEBHOOK_FN,
        StatementId: statementId,
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: `arn:aws:execute-api:${REGION}:${AWS_ACCOUNT_ID}:${apiId}/*/*/webhook`,
      }));
    } catch (permErr) {
      if (permErr.name !== 'ResourceConflictException') throw permErr;
    }
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      await lambdaClient.send(new AddPermissionCommand({
        FunctionName: WEBHOOK_FN,
        StatementId: statementId,
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: `arn:aws:execute-api:${REGION}:${AWS_ACCOUNT_ID}:${apiId}/*/*/webhook`,
      }));
    } else {
      throw err;
    }
  }

  // --- /payment-webhook resource ---
  let paymentResource = resources.items.find((r) => r.path === '/payment-webhook');
  if (!paymentResource) {
    const resp = await apigw.send(new CreateResourceCommand({
      restApiId: apiId,
      parentId: rootResource.id,
      pathPart: 'payment-webhook',
    }));
    paymentResource = resp;
    log('Created /payment-webhook resource.');
  }

  // Create POST method on /payment-webhook
  try {
    await apigw.send(new PutMethodCommand({
      restApiId: apiId,
      resourceId: paymentResource.id,
      httpMethod: 'POST',
      authorizationType: 'NONE',
    }));
  } catch (err) {
    if (err.name !== 'ConflictException') throw err;
  }

  // Integrate with payment webhook Lambda
  const paymentLambdaArn = `arn:aws:lambda:${REGION}:${AWS_ACCOUNT_ID}:function:${PAYMENT_WEBHOOK_FN}`;
  const paymentIntegrationUri = `arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${paymentLambdaArn}/invocations`;

  await apigw.send(new PutIntegrationCommand({
    restApiId: apiId,
    resourceId: paymentResource.id,
    httpMethod: 'POST',
    type: 'AWS_PROXY',
    integrationHttpMethod: 'POST',
    uri: paymentIntegrationUri,
  }));

  // Grant API Gateway permission to invoke the payment Lambda
  const paymentStatementId = `apigateway-payment-invoke-${stage}`;
  try {
    await lambdaClient.send(new GetPolicyCommand({ FunctionName: PAYMENT_WEBHOOK_FN }));
    try {
      await lambdaClient.send(new AddPermissionCommand({
        FunctionName: PAYMENT_WEBHOOK_FN,
        StatementId: paymentStatementId,
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: `arn:aws:execute-api:${REGION}:${AWS_ACCOUNT_ID}:${apiId}/*/*/payment-webhook`,
      }));
    } catch (permErr) {
      if (permErr.name !== 'ResourceConflictException') throw permErr;
    }
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      await lambdaClient.send(new AddPermissionCommand({
        FunctionName: PAYMENT_WEBHOOK_FN,
        StatementId: paymentStatementId,
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: `arn:aws:execute-api:${REGION}:${AWS_ACCOUNT_ID}:${apiId}/*/*/payment-webhook`,
      }));
    } else {
      throw err;
    }
  }

  // --- /metrics resource ---
  let metricsResource = resources.items.find((r) => r.path === '/metrics');
  if (!metricsResource) {
    const resp = await apigw.send(new CreateResourceCommand({
      restApiId: apiId,
      parentId: rootResource.id,
      pathPart: 'metrics',
    }));
    metricsResource = resp;
    log('Created /metrics resource.');
  }

  // Create GET method on /metrics
  try {
    await apigw.send(new PutMethodCommand({
      restApiId: apiId,
      resourceId: metricsResource.id,
      httpMethod: 'GET',
      authorizationType: 'NONE',
    }));
  } catch (err) {
    if (err.name !== 'ConflictException') throw err;
  }

  // Integrate with Metrics API Lambda
  const metricsLambdaArn = `arn:aws:lambda:${REGION}:${AWS_ACCOUNT_ID}:function:${METRICS_API_FN}`;
  const metricsIntegrationUri = `arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${metricsLambdaArn}/invocations`;

  await apigw.send(new PutIntegrationCommand({
    restApiId: apiId,
    resourceId: metricsResource.id,
    httpMethod: 'GET',
    type: 'AWS_PROXY',
    integrationHttpMethod: 'POST',
    uri: metricsIntegrationUri,
  }));

  // Grant API Gateway permission to invoke the Metrics API Lambda
  const metricsStatementId = `apigateway-metrics-invoke-${stage}`;
  try {
    await lambdaClient.send(new GetPolicyCommand({ FunctionName: METRICS_API_FN }));
    try {
      await lambdaClient.send(new AddPermissionCommand({
        FunctionName: METRICS_API_FN,
        StatementId: metricsStatementId,
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: `arn:aws:execute-api:${REGION}:${AWS_ACCOUNT_ID}:${apiId}/*/*/metrics`,
      }));
    } catch (permErr) {
      if (permErr.name !== 'ResourceConflictException') throw permErr;
    }
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      await lambdaClient.send(new AddPermissionCommand({
        FunctionName: METRICS_API_FN,
        StatementId: metricsStatementId,
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: `arn:aws:execute-api:${REGION}:${AWS_ACCOUNT_ID}:${apiId}/*/*/metrics`,
      }));
    } else {
      throw err;
    }
  }

  // Create OPTIONS method on /metrics for CORS preflight
  try {
    await apigw.send(new PutMethodCommand({
      restApiId: apiId,
      resourceId: metricsResource.id,
      httpMethod: 'OPTIONS',
      authorizationType: 'NONE',
    }));
  } catch (err) {
    if (err.name !== 'ConflictException') throw err;
  }

  // Mock integration for OPTIONS (CORS preflight)
  await apigw.send(new PutIntegrationCommand({
    restApiId: apiId,
    resourceId: metricsResource.id,
    httpMethod: 'OPTIONS',
    type: 'MOCK',
    requestTemplates: { 'application/json': '{"statusCode": 200}' },
  }));

  // Method response for OPTIONS (required for MOCK integration to return proper CORS headers)
  try {
    await apigw.send(new PutMethodResponseCommand({
      restApiId: apiId,
      resourceId: metricsResource.id,
      httpMethod: 'OPTIONS',
      statusCode: '200',
      responseParameters: {
        'method.response.header.Access-Control-Allow-Headers': false,
        'method.response.header.Access-Control-Allow-Methods': false,
        'method.response.header.Access-Control-Allow-Origin': false,
      },
    }));
  } catch (err) {
    if (err.name !== 'ConflictException') throw err;
  }

  // Integration response for OPTIONS — maps MOCK output to CORS headers
  try {
    await apigw.send(new PutIntegrationResponseCommand({
      restApiId: apiId,
      resourceId: metricsResource.id,
      httpMethod: 'OPTIONS',
      statusCode: '200',
      responseParameters: {
        'method.response.header.Access-Control-Allow-Headers': "'Content-Type,x-api-key'",
        'method.response.header.Access-Control-Allow-Methods': "'GET,OPTIONS'",
        'method.response.header.Access-Control-Allow-Origin': "'*'",
      },
      responseTemplates: { 'application/json': '' },
    }));
  } catch (err) {
    if (err.name !== 'ConflictException') throw err;
  }

  // Deploy to stage
  await apigw.send(new CreateDeploymentCommand({
    restApiId: apiId,
    stageName: stage,
    description: `Deployment to ${stage}`,
  }));

  const endpoint = `https://${apiId}.execute-api.${REGION}.amazonaws.com/${stage}/webhook`;
  const paymentEndpoint = `https://${apiId}.execute-api.${REGION}.amazonaws.com/${stage}/payment-webhook`;
  const metricsEndpoint = `https://${apiId}.execute-api.${REGION}.amazonaws.com/${stage}/metrics`;
  log(`API Gateway deployed: ${endpoint}`);
  log(`Payment webhook: ${paymentEndpoint}`);
  log(`Metrics API: ${metricsEndpoint}`);
  return { endpoint, metricsEndpoint };
}

// --- Step 6: EventBridge rules ---
async function configureEventBridgeRules() {
  const ruleState = (stage === 'prod' || stage === 'beta') ? 'ENABLED' : 'DISABLED';
  log(`Configuring EventBridge rules (${ruleState})...`);

  // Daily reminder: 8 PM IST = 2:30 PM UTC = cron(30 14 * * ? *)
  await eb.send(new PutRuleCommand({
    Name: DAILY_RULE,
    ScheduleExpression: 'cron(30 14 * * ? *)',
    State: ruleState,
    Description: `Daily 8 PM IST reminder for MealPlanner (${stage})`,
  }));

  const dailyLambdaArn = `arn:aws:lambda:${REGION}:${AWS_ACCOUNT_ID}:function:${DAILY_FN}`;
  await eb.send(new PutTargetsCommand({
    Rule: DAILY_RULE,
    Targets: [{ Id: `${DAILY_FN}-target`, Arn: dailyLambdaArn }],
  }));

  // Grant EventBridge permission to invoke daily Lambda
  try {
    await lambdaClient.send(new AddPermissionCommand({
      FunctionName: DAILY_FN,
      StatementId: `eventbridge-daily-${stage}`,
      Action: 'lambda:InvokeFunction',
      Principal: 'events.amazonaws.com',
      SourceArn: `arn:aws:events:${REGION}:${AWS_ACCOUNT_ID}:rule/${DAILY_RULE}`,
    }));
  } catch (err) {
    if (err.name !== 'ResourceConflictException') throw err;
  }

  log(`Daily rule ${DAILY_RULE} configured.`);

  // Weekly reminder: Sunday 6 PM IST = 12:30 PM UTC = cron(30 12 ? * SUN *)
  await eb.send(new PutRuleCommand({
    Name: WEEKLY_RULE,
    ScheduleExpression: 'cron(30 12 ? * SUN *)',
    State: ruleState,
    Description: `Weekly Sunday 6 PM IST reminder for MealPlanner (${stage})`,
  }));

  const weeklyLambdaArn = `arn:aws:lambda:${REGION}:${AWS_ACCOUNT_ID}:function:${WEEKLY_FN}`;
  await eb.send(new PutTargetsCommand({
    Rule: WEEKLY_RULE,
    Targets: [{ Id: `${WEEKLY_FN}-target`, Arn: weeklyLambdaArn }],
  }));

  // Grant EventBridge permission to invoke weekly Lambda
  try {
    await lambdaClient.send(new AddPermissionCommand({
      FunctionName: WEEKLY_FN,
      StatementId: `eventbridge-weekly-${stage}`,
      Action: 'lambda:InvokeFunction',
      Principal: 'events.amazonaws.com',
      SourceArn: `arn:aws:events:${REGION}:${AWS_ACCOUNT_ID}:rule/${WEEKLY_RULE}`,
    }));
  } catch (err) {
    if (err.name !== 'ResourceConflictException') throw err;
  }

  log(`Weekly rule ${WEEKLY_RULE} configured.`);
}

// --- Step 7: S3 dashboard bucket ---
async function ensureDashboardBucket(metricsEndpoint) {
  log(`Ensuring S3 dashboard bucket: ${DASHBOARD_BUCKET}`);
  try {
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: DASHBOARD_BUCKET }));
      log(`Bucket ${DASHBOARD_BUCKET} already exists.`);
    } catch (err) {
      if (err.name === 'NotFound' || err['$metadata']?.httpStatusCode === 404) {
        log(`Creating bucket ${DASHBOARD_BUCKET}...`);
        await s3Client.send(new CreateBucketCommand({ Bucket: DASHBOARD_BUCKET }));
        log(`Bucket ${DASHBOARD_BUCKET} created.`);
      } else {
        throw err;
      }
    }

    // Allow public read for the dashboard
    await s3Client.send(new PutPublicAccessBlockCommand({
      Bucket: DASHBOARD_BUCKET,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,
        IgnorePublicAcls: false,
        BlockPublicPolicy: false,
        RestrictPublicBuckets: false,
      },
    }));

    const bucketPolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Sid: 'PublicReadDashboard',
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${DASHBOARD_BUCKET}/*`,
      }],
    });
    await s3Client.send(new PutBucketPolicyCommand({
      Bucket: DASHBOARD_BUCKET,
      Policy: bucketPolicy,
    }));

    // Upload index.html with stage placeholder replaced
    const htmlPath = path.join(__dirname, '..', 'src', 'dashboard', 'index.html');
    const rawHtml = fs.readFileSync(htmlPath, 'utf-8');
    const htmlContent = rawHtml
      .replace(/__STAGE__/g, stage)
      .replace(/__METRICS_ENDPOINT__/g, metricsEndpoint || '');
    await s3Client.send(new PutObjectCommand({
      Bucket: DASHBOARD_BUCKET,
      Key: 'index.html',
      Body: htmlContent,
      ContentType: 'text/html',
    }));

    const dashboardUrl = `http://${DASHBOARD_BUCKET}.s3.${REGION}.amazonaws.com/index.html`;
    log(`Dashboard uploaded: ${dashboardUrl}`);
    return dashboardUrl;
  } catch (err) {
    log(`⚠️  Dashboard bucket setup skipped (missing IAM permissions).`);
    log(`   Error: ${err.message}`);
    return null;
  }
}

// --- Step 8: CloudWatch Dashboard ---
async function ensureCloudWatchDashboard() {
  log(`Provisioning CloudWatch Dashboard: ${DASHBOARD_NAME}`);

  const metricsNamespace = `SmartMealPlanner/${stage}`;

  const dashboardBody = {
    widgets: [
      {
        type: 'metric',
        x: 0, y: 0, width: 12, height: 6,
        properties: {
          title: 'User Acquisition',
          metrics: [
            [metricsNamespace, 'NewUser', { stat: 'Sum', label: 'NewUser' }],
            [metricsNamespace, 'OnboardingComplete', { stat: 'Sum', label: 'OnboardingComplete' }],
            [metricsNamespace, 'OnboardingStep', { stat: 'Sum', label: 'OnboardingStep' }],
            [metricsNamespace, 'ReachedPayment', { stat: 'Sum', label: 'ReachedPayment' }],
          ],
          region: REGION,
          period: 86400,
          view: 'timeSeries',
          stacked: false,
        },
      },
      {
        type: 'metric',
        x: 12, y: 0, width: 12, height: 6,
        properties: {
          title: 'Engagement',
          metrics: [
            [metricsNamespace, 'MessageReceived', { stat: 'Sum', label: 'MessageReceived' }],
            [metricsNamespace, 'DailyActiveUser', { stat: 'Sum', label: 'DailyActiveUser' }],
          ],
          region: REGION,
          period: 86400,
          view: 'timeSeries',
          stacked: false,
        },
      },
      {
        type: 'metric',
        x: 0, y: 6, width: 12, height: 6,
        properties: {
          title: 'Feature Usage',
          metrics: [
            [metricsNamespace, 'PlanGenerated', { stat: 'Sum', label: 'PlanGenerated' }],
            [metricsNamespace, 'GroceryListViewed', { stat: 'Sum', label: 'GroceryListViewed' }],
            [metricsNamespace, 'CookMenuSent', { stat: 'Sum', label: 'CookMenuSent' }],
            [metricsNamespace, 'PlanModified', { stat: 'Sum', label: 'PlanModified' }],
            [metricsNamespace, 'MealSwapped', { stat: 'Sum', label: 'MealSwapped' }],
          ],
          region: REGION,
          period: 86400,
          view: 'timeSeries',
          stacked: false,
        },
      },
      {
        type: 'metric',
        x: 12, y: 6, width: 12, height: 6,
        properties: {
          title: 'Errors',
          metrics: [
            [metricsNamespace, 'WebhookError', { stat: 'Sum', label: 'WebhookError' }],
            [metricsNamespace, 'PaymentWebhookError', { stat: 'Sum', label: 'PaymentWebhookError' }],
            [metricsNamespace, 'DailyReminderFailure', { stat: 'Sum', label: 'DailyReminderFailure' }],
            [metricsNamespace, 'WeeklyReminderFailure', { stat: 'Sum', label: 'WeeklyReminderFailure' }],
            [metricsNamespace, 'InvalidPaymentSignature', { stat: 'Sum', label: 'InvalidPaymentSignature' }],
            [metricsNamespace, 'InvalidInput', { stat: 'Sum', label: 'InvalidInput' }],
          ],
          region: REGION,
          period: 86400,
          view: 'timeSeries',
          stacked: false,
        },
      },
      {
        type: 'metric',
        x: 0, y: 12, width: 12, height: 6,
        properties: {
          title: 'Payments',
          metrics: [
            [metricsNamespace, 'SubscriptionActivated', { stat: 'Sum', label: 'SubscriptionActivated' }],
            [metricsNamespace, 'PaymentCaptured', { stat: 'Sum', label: 'PaymentCaptured' }],
          ],
          region: REGION,
          period: 86400,
          view: 'timeSeries',
          stacked: false,
        },
      },
      {
        type: 'metric',
        x: 12, y: 12, width: 12, height: 6,
        properties: {
          title: 'Reminders',
          metrics: [
            [metricsNamespace, 'DailyReminderSent', { stat: 'Sum', label: 'DailyReminderSent' }],
            [metricsNamespace, 'WeeklyReminderSent', { stat: 'Sum', label: 'WeeklyReminderSent' }],
            [metricsNamespace, 'ExpiredPlanPromptSent', { stat: 'Sum', label: 'ExpiredPlanPromptSent' }],
          ],
          region: REGION,
          period: 86400,
          view: 'timeSeries',
          stacked: false,
        },
      },
      {
        type: 'metric',
        x: 0, y: 18, width: 24, height: 6,
        properties: {
          title: 'Webhook Latency (p50 / p90 / p99)',
          metrics: [
            [metricsNamespace, 'WebhookLatency', { stat: 'p50', label: 'p50' }],
            [metricsNamespace, 'WebhookLatency', { stat: 'p90', label: 'p90' }],
            [metricsNamespace, 'WebhookLatency', { stat: 'p99', label: 'p99' }],
          ],
          region: REGION,
          period: 300,
          view: 'timeSeries',
          stacked: false,
          yAxis: { left: { label: 'ms', showUnits: false } },
        },
      },
    ],
  };

  try {
    await cwClient.send(new PutDashboardCommand({
      DashboardName: DASHBOARD_NAME,
      DashboardBody: JSON.stringify(dashboardBody),
    }));
    log(`CloudWatch Dashboard ${DASHBOARD_NAME} provisioned.`);
  } catch (err) {
    log(`⚠️  CloudWatch Dashboard setup skipped.`);
    log(`   Error: ${err.message}`);
  }
}

// --- Main ---
async function main() {
  console.log('');
  console.log('='.repeat(60));
  log(`SmartMealPlanner-Bot Deployment`);
  log(`AWS Account: ${AWS_ACCOUNT_ID}`);
  log(`Region: ${REGION}`);
  console.log('='.repeat(60));
  console.log('');

  try {
    // Step 1: Build
    await buildLambdas();

    // Step 2: DynamoDB
    await ensureDynamoDBTable();

    // Step 2a: Daily Activity DynamoDB table
    await ensureDailyActivityTable();

    // Step 2b: S3 image bucket
    await ensureS3Bucket();

    // Step 3: IAM Role
    const roleArn = await ensureIAMRole();

    // Step 4: Lambda functions
    await deployAllLambdas(roleArn);

    // Step 5: API Gateway
    const { endpoint, metricsEndpoint } = await ensureApiGateway();

    // Step 6: EventBridge
    await configureEventBridgeRules();

    // Step 7: S3 dashboard bucket
    const dashboardUrl = await ensureDashboardBucket(metricsEndpoint);

    // Step 8: CloudWatch Dashboard
    await ensureCloudWatchDashboard();

    // Done
    console.log('');
    console.log('='.repeat(60));
    log('Deployment complete!');
    console.log('');
    log(`Webhook endpoint: ${endpoint}`);
    log(`Metrics API:      ${metricsEndpoint}`);
    log(`DynamoDB table:   ${TABLE_NAME}`);
    log(`Image bucket:     ${IMAGE_BUCKET}`);
    if (dashboardUrl) log(`Dashboard:        ${dashboardUrl}`);
    log(`CW Dashboard:     ${DASHBOARD_NAME}`);
    log(`EventBridge:      ${stage === 'prod' ? 'ENABLED' : 'DISABLED'}`);
    console.log('='.repeat(60));
  } catch (err) {
    console.error(`\n[${stage}] Deployment failed:`, err.message);
    process.exit(1);
  }
}

main();

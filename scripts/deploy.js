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
 * Optional: TWILIO_TEMPLATE_SID_* overrides
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
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
  CreateDeploymentCommand,
} = require('@aws-sdk/client-api-gateway');
const {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
} = require('@aws-sdk/client-eventbridge');

// --- Constants ---
const REGION = 'ap-south-1';
const AWS_ACCOUNT_ID = '713170882602';
const stage = process.env.STAGE || 'dev';

const TABLE_NAME = `MealPlannerUsers-${stage}`;
const WEBHOOK_FN = `MealPlannerWebhook-${stage}`;
const DAILY_FN = `MealPlannerDailyReminder-${stage}`;
const WEEKLY_FN = `MealPlannerWeeklyReminder-${stage}`;
const API_NAME = `MealPlannerAPI-${stage}`;
const ROLE_NAME = `MealPlannerLambdaRole-${stage}`;
const DAILY_RULE = `MealPlannerDailyReminder-${stage}`;
const WEEKLY_RULE = `MealPlannerWeeklyReminder-${stage}`;
const RUNTIME = 'nodejs18.x';

const LAMBDA_DEFS = [
  { name: WEBHOOK_FN, handler: 'handlers/webhookHandler.webhookHandler', src: 'webhookHandler.js' },
  { name: DAILY_FN, handler: 'handlers/dailyReminderHandler.dailyReminderHandler', src: 'dailyReminderHandler.js' },
  { name: WEEKLY_FN, handler: 'handlers/weeklyReminderHandler.weeklyReminderHandler', src: 'weeklyReminderHandler.js' },
];

// AWS clients
const dynamodb = new DynamoDBClient({ region: REGION });
const lambdaClient = new LambdaClient({ region: REGION });
const iamClient = new IAMClient({ region: REGION });
const apigw = new APIGatewayClient({ region: REGION });
const eb = new EventBridgeClient({ region: REGION });

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

    // Include the meal-components.json data file for the JsonMealComponentRepository
    const mealComponentsPath = path.join(__dirname, '..', 'data', 'meal-components.json');
    if (fs.existsSync(mealComponentsPath)) {
      archive.file(mealComponentsPath, { name: 'data/meal-components.json' });
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
    // Wait briefly for code update to propagate
    await sleep(2000);
    await lambdaClient.send(new UpdateFunctionConfigurationCommand({
      FunctionName: name,
      Handler: handler,
      Runtime: RUNTIME,
      Role: roleArn,
      Timeout: 30,
      MemorySize: 256,
      Environment: { Variables: envVars },
    }));
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
      log(`Created ${name}.`);
    } else {
      throw err;
    }
  }
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

  // Deploy to stage
  await apigw.send(new CreateDeploymentCommand({
    restApiId: apiId,
    stageName: stage,
    description: `Deployment to ${stage}`,
  }));

  const endpoint = `https://${apiId}.execute-api.${REGION}.amazonaws.com/${stage}/webhook`;
  log(`API Gateway deployed: ${endpoint}`);
  return endpoint;
}

// --- Step 6: EventBridge rules ---
async function configureEventBridgeRules() {
  const ruleState = stage === 'prod' ? 'ENABLED' : 'DISABLED';
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

  // Weekly reminder: Sunday 8 PM IST = cron(30 14 ? * SUN *)
  await eb.send(new PutRuleCommand({
    Name: WEEKLY_RULE,
    ScheduleExpression: 'cron(30 14 ? * SUN *)',
    State: ruleState,
    Description: `Weekly Sunday 8 PM IST reminder for MealPlanner (${stage})`,
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

    // Step 3: IAM Role
    const roleArn = await ensureIAMRole();

    // Step 4: Lambda functions
    await deployAllLambdas(roleArn);

    // Step 5: API Gateway
    const endpoint = await ensureApiGateway();

    // Step 6: EventBridge
    await configureEventBridgeRules();

    // Done
    console.log('');
    console.log('='.repeat(60));
    log('Deployment complete!');
    console.log('');
    log(`Webhook endpoint: ${endpoint}`);
    log(`DynamoDB table:   ${TABLE_NAME}`);
    log(`EventBridge:      ${stage === 'prod' ? 'ENABLED' : 'DISABLED'}`);
    console.log('='.repeat(60));
  } catch (err) {
    console.error(`\n[${stage}] Deployment failed:`, err.message);
    process.exit(1);
  }
}

main();

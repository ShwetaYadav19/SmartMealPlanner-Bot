// Environment configuration — loads from Lambda environment variables

export interface Config {
  stage: string;
  dynamodbTable: string;
  dailyActivityTable: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioSenderNumber: string;
  awsAccountId: string;
  templateSidOverrides: Record<string, string>;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  razorpayPlanId: string;
  razorpayWebhookSecret: string;
  imageBucket: string;
  metricsApiKey: string;
}

const REQUIRED_VARS = [
  'STAGE',
  'DYNAMODB_TABLE',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_SENDER_NUMBER',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_PLAN_ID',
] as const;

const TEMPLATE_SID_PREFIX = 'TWILIO_TEMPLATE_SID_';

function loadTemplateSidOverrides(): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(TEMPLATE_SID_PREFIX) && value) {
      overrides[key] = value;
    }
  }
  return overrides;
}

export function loadConfig(): Config {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  return {
    stage: process.env.STAGE!,
    dynamodbTable: process.env.DYNAMODB_TABLE!,
    dailyActivityTable: process.env.DAILY_ACTIVITY_TABLE || `MealPlannerDailyActivity-${process.env.STAGE || 'dev'}`,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID!,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN!,
    twilioSenderNumber: process.env.TWILIO_SENDER_NUMBER!,
    awsAccountId: process.env.AWS_ACCOUNT_ID || '713170882602',
    templateSidOverrides: loadTemplateSidOverrides(),
    razorpayKeyId: process.env.RAZORPAY_KEY_ID!,
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET!,
    razorpayPlanId: process.env.RAZORPAY_PLAN_ID!,
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    imageBucket: process.env.IMAGE_BUCKET || `smartmealplanner-images-${process.env.STAGE || 'dev'}`,
    metricsApiKey: process.env.METRICS_API_KEY || '',
  };
}

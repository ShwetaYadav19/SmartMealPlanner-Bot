// Environment configuration — loads from Lambda environment variables

export interface Config {
  stage: string;
  dynamodbTable: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioSenderNumber: string;
  awsAccountId: string;
  templateSidOverrides: Record<string, string>;
}

const REQUIRED_VARS = [
  'STAGE',
  'DYNAMODB_TABLE',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_SENDER_NUMBER',
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
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID!,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN!,
    twilioSenderNumber: process.env.TWILIO_SENDER_NUMBER!,
    awsAccountId: process.env.AWS_ACCOUNT_ID || '713170882602',
    templateSidOverrides: loadTemplateSidOverrides(),
  };
}

import dotenv from 'dotenv';

dotenv.config();

function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value;
}

export const config = {
  line: {
    channelAccessToken: getEnvVar('LINE_CHANNEL_ACCESS_TOKEN'),
    channelSecret: getEnvVar('LINE_CHANNEL_SECRET'),
  },
  notion: {
    apiKey: getEnvVar('NOTION_API_KEY'),
    databaseId: getEnvVar('NOTION_DATABASE_ID'),
  },
  openai: {
    apiKey: getEnvVar('OPENAI_API_KEY'),
  },
  port: parseInt(process.env.PORT || '3000', 10),
};

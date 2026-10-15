import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Config {
  slackBotToken: string;
  slackAppToken: string;
  welcomeChannelId: string;
  approvedChannelId: string;
  aiModel: string;
  apiKey: string;
  aiMock: boolean;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing required env var ${name} (copy .env.example to .env and fill it in)`);
  }
  return value;
}

function commandCodeApiKey(): string {
  const fromEnv = process.env.CMD_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  try {
    const auth = JSON.parse(readFileSync(join(homedir(), '.commandcode', 'auth.json'), 'utf8')) as {
      apiKey?: string;
    };
    const stored = auth.apiKey?.trim();
    if (stored) return stored;
  } catch {
    // fall through to the error below
  }

  throw new Error(
    'missing command code api key: set CMD_API_KEY, or run `cmd login` so it can be read from ~/.commandcode/auth.json',
  );
}

export const config: Config = {
  slackBotToken: required('SLACK_BOT_TOKEN'),
  slackAppToken: required('SLACK_APP_TOKEN'),
  welcomeChannelId: required('WELCOME_CHANNEL_ID'),
  approvedChannelId: required('APPROVED_CHANNEL_ID'),
  aiModel: process.env.AI_MODEL?.trim() || 'claude-haiku-5-5',
  apiKey: commandCodeApiKey(),
  aiMock: process.env.AI_MOCK?.trim() === '1',
};

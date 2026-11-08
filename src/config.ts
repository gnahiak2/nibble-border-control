function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing env var ${name} (see .env.example)`);
  return value;
}

const optional = (name: string) => process.env[name]?.trim() || undefined;

export const config = {
  botToken: required("SLACK_BOT_TOKEN"),
  appToken: required("SLACK_APP_TOKEN"),
  welcomeChannelId: required("WELCOME_CHANNEL_ID"),
  approvedChannelId: required("APPROVED_CHANNEL_ID"),
  ownerId: optional("OWNER_SLACK_ID"),
  promisesFile: optional("PROMISES_FILE") ?? "data/promises.jsonl",
};

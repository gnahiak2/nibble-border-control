function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing env var ${name} (see .env.example)`);
  return value;
}

export const config = {
  botToken: required("SLACK_BOT_TOKEN"),
  appToken: required("SLACK_APP_TOKEN"),
  welcomeChannelId: required("WELCOME_CHANNEL_ID"),
  approvedChannelId: required("APPROVED_CHANNEL_ID"),
  ownerId: process.env.OWNER_SLACK_ID?.trim() || undefined,
};

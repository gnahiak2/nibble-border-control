// Posts the promise into the approved channel with an "I agree" button, for people who are already in.
// The running bot (src/index.ts) handles the button. Usage: bun run announce
import { WebClient } from "@slack/web-api";
import { config } from "./config";
import { channelPromiseMessage } from "./messages";

const client = new WebClient(config.botToken);
const res = await client.chat.postMessage({
  channel: config.approvedChannelId,
  ...channelPromiseMessage(config.ownerId, []),
});
console.log(`posted the promise to ${config.approvedChannelId} (ts ${res.ts})`);

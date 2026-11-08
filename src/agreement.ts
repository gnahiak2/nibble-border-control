import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/** Bump this whenever the wording below changes, so every record points at the exact text promised. */
export const PROMISE_VERSION = "3";

export const PROMISE_POINTS = [
  "*What's private:* anything personal: stuff about the life of whoever runs this channel, stuff about the other people in here, and " +
    "anything someone says is private.",
  "*What I promise:* I won't share private stuff outside the channel. No screenshots, no forwarding, no " +
    "telling people what was said, no posting it anywhere, and no pasting it into AI tools.",
  "*What's fine to share:* things that are clearly meant to be shared and aren't sensitive (a link, a meme, " +
    "an event) can be forwarded. Use common sense: if you're not sure, don't, or ask first.",
  "*If I break it:* I'll be removed from the channel and won't be let back in.",
  "*How long:* this promise still counts after I leave the channel.",
];

export const PROMISE_TEXT = `THE PROMISE (v${PROMISE_VERSION})\n\n` + PROMISE_POINTS.join("\n\n");

export interface PromiseRecord {
  promiseVersion: string;
  promiseSha256: string;
  promiseText: string;
  promisedAt: string;
  slackUserId: string;
  slackTeamId?: string;
  name: string;
}

export function buildPromise(input: {
  slackUserId: string;
  slackTeamId?: string;
  name: string;
  now?: Date;
}): PromiseRecord {
  return {
    promiseVersion: PROMISE_VERSION,
    promiseSha256: createHash("sha256").update(PROMISE_TEXT).digest("hex"),
    promiseText: PROMISE_TEXT,
    promisedAt: (input.now ?? new Date()).toISOString(),
    slackUserId: input.slackUserId,
    slackTeamId: input.slackTeamId,
    name: input.name,
  };
}

/** Append-only log, one JSON object per line: who promised, when, and to what. */
export async function savePromise(file: string, record: PromiseRecord): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(record) + "\n", "utf8");
}

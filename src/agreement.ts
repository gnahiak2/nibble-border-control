import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/** Bump this whenever the wording below changes, so every record points at the exact text promised. */
export const PROMISE_VERSION = "5";

export const PROMISE_TITLE = "The promise";

/** Plain text, shown in a box in the entry form. Keep it short. */
export const PROMISE_POINTS = [
  "Personal stuff stays here: anything about me, the other members, or anything someone says is private. No screenshots, forwarding, retelling, or AI tools.",
  "Clearly shareable, non-sensitive stuff (a link, a meme, an event) is fine to pass on. Not sure? Don't, or ask.",
  "Break it and you're out for good. It still counts after you leave.",
];

export const PROMISE_TEXT = `THE PROMISE (v${PROMISE_VERSION})\n\n` + PROMISE_POINTS.map((p) => `• ${p}`).join("\n");

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

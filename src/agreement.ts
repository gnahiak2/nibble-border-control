import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
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

/** The short version posted in the channel itself, for people who are already in. */
export function channelPromiseLines(owner?: string): string[] {
  const whose = owner ? `<@${owner}>'s life` : "the life of whoever runs this channel";
  return [
    `:lock: Personal stuff stays here: anything about ${whose}, about anyone in here, or anything someone says ` +
      "is private. No screenshots, forwarding, retelling, or pasting into AI.",
    ":outbox_tray: Stuff that's clearly meant for sharing and isn't sensitive (links, memes, events) is fine to " +
      "pass on. Use common sense: not sure? Don't, or ask first.",
    ":no_entry: Break it and you're out for good, and the promise still counts after you leave.",
  ];
}

export const channelPromiseText = (owner?: string) =>
  `THE PROMISE, CHANNEL VERSION (v${PROMISE_VERSION})\n\n` + channelPromiseLines(owner).join("\n");

export interface PromiseRecord {
  promiseVersion: string;
  promiseSha256: string;
  promiseText: string;
  promisedAt: string;
  slackUserId: string;
  slackTeamId?: string;
  name?: string;
  /** "entry_form" for newcomers; "channel_post" for the I agree button in the channel. */
  source: "entry_form" | "channel_post";
  /** For channel_post: the ts of the message whose button they pressed. */
  postTs?: string;
}

export function buildPromise(input: {
  slackUserId: string;
  slackTeamId?: string;
  name?: string;
  source?: PromiseRecord["source"];
  postTs?: string;
  text?: string;
  now?: Date;
}): PromiseRecord {
  const text = input.text ?? PROMISE_TEXT;
  return {
    promiseVersion: PROMISE_VERSION,
    promiseSha256: createHash("sha256").update(text).digest("hex"),
    promiseText: text,
    promisedAt: (input.now ?? new Date()).toISOString(),
    slackUserId: input.slackUserId,
    slackTeamId: input.slackTeamId,
    name: input.name,
    source: input.source ?? "entry_form",
    postTs: input.postTs,
  };
}

/** Append-only log, one JSON object per line: who promised, when, and to what. */
export async function savePromise(file: string, record: PromiseRecord): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(record) + "\n", "utf8");
}

export async function readPromises(file: string): Promise<PromiseRecord[]> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
  return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

/** Everyone who has pressed I agree on a given channel post, in the order they agreed. */
export function agreedOnPost(records: PromiseRecord[], postTs: string): string[] {
  const users = records.filter((r) => r.source === "channel_post" && r.postTs === postTs).map((r) => r.slackUserId);
  return [...new Set(users)];
}

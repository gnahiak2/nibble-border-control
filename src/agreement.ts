import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/** Bump this whenever the wording below changes, so every record points at the exact text agreed to. */
export const PROMISE_VERSION = "4";

export const AGREEMENT_TITLE = "Channel Confidentiality Agreement";

/** The contract, one clause per Slack section (each well under the 3000-char limit). */
export const PROMISE_POINTS = [
  '*Parties.* This agreement is between you ("the Member") and the person who runs the channel you are ' +
    'applying to ("the Owner"). It takes effect when you sign it below.',
  '*1. Definitions.* "The Channel" means the private Slack channel you are applying to join. "Confidential ' +
    'Information" means anything personal shared in the Channel, including: (a) information about the ' +
    "Owner's life; (b) information about any other member; and (c) anything a member says is private. It " +
    "covers messages, images, files, voice notes, and links, in any form.",
  "*2. Your obligations.* You must not disclose Confidential Information to anyone outside the Channel. In " +
    "particular, you must not: (a) take screenshots, photos, or recordings of it; (b) copy or forward it; " +
    "(c) repeat, describe, or paraphrase it to anyone; (d) post it anywhere; or (e) paste or upload it into " +
    "any AI tool or other service.",
  "*3. Permitted sharing.* Content that is clearly meant to be shared and is not sensitive, such as a public " +
    "link, a meme, or an event, may be shared outside the Channel. You must use common sense when deciding " +
    "this. If you are not sure whether something is sensitive, treat it as Confidential Information, or ask " +
    "the Owner first.",
  "*4. Exceptions.* Section 2 does not apply to information that is already public through no fault of " +
    "yours, or to disclosure required by law. If the law requires you to disclose something, tell the Owner " +
    "first where you are allowed to.",
  "*5. Consideration.* In exchange for your agreement, the Owner gives you access to the Channel. You would " +
    "not be given access without signing this agreement.",
  "*6. Breach.* If you break this agreement, the Owner will remove you from the Channel permanently. The " +
    "Owner may also take any other action available to them.",
  "*7. Duration.* This agreement continues after you leave or are removed from the Channel. Your obligations " +
    "under sections 2 and 3 never expire.",
  "*8. Changes.* If the Owner changes this agreement, you may be asked to sign the new version to stay in " +
    "the Channel. A new version does not cancel what you have already agreed to.",
  "*9. Signature.* Ticking the box and typing your full name below is your signature. It has the same effect " +
    "as signing by hand. A record of your Slack account, the name you typed, the time, and the exact text of " +
    "this agreement will be kept, and you will be sent a copy.",
];

export const PROMISE_TEXT =
  `${AGREEMENT_TITLE.toUpperCase()} (v${PROMISE_VERSION})\n\n` + PROMISE_POINTS.join("\n\n");

export interface PromiseRecord {
  promiseVersion: string;
  promiseSha256: string;
  promiseText: string;
  promisedAt: string;
  slackUserId: string;
  slackTeamId?: string;
  name: string;
  /** Full name typed as the signature. */
  signedName: string;
}

export function buildPromise(input: {
  slackUserId: string;
  slackTeamId?: string;
  name: string;
  signedName: string;
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
    signedName: input.signedName,
  };
}

/** Append-only log, one JSON object per line: who promised, when, and to what. */
export async function savePromise(file: string, record: PromiseRecord): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(record) + "\n", "utf8");
}

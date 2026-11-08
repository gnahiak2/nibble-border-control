import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/** Bump this whenever the wording below changes, so every signature points at the exact text signed. */
export const AGREEMENT_VERSION = "1";

export interface AgreementTerms {
  /** The person the promise is made to. */
  ownerName: string;
  /** Agreed amount per breach, e.g. "$500 USD". Omitted = no fixed amount. */
  fine?: string;
  /** e.g. "the laws of the State of New York". Omitted = no clause. */
  governingLaw?: string;
}

/** The undertaking as numbered clauses, one Slack section each (each well under the 3000-char limit). */
export function agreementClauses(t: AgreementTerms): string[] {
  const clauses = [
    `*Parties.* This is a binding agreement between you and ${t.ownerName} ("the Owner").`,
    `*1. What is confidential.* Everything in the channel you are applying to: messages, files, images, links, ` +
      `names, and any personal details about the Owner or other members, plus anything you learn about the ` +
      `Owner's life through it ("Confidential Information").`,
    `*2. Your promise.* You will not disclose Confidential Information to anyone outside the channel, in any form. ` +
      `That means no screenshots, recordings, copies, forwarding, paraphrasing, or repeating it, including to ` +
      `friends, on social media, or into AI tools.`,
    `*3. Exceptions.* This does not cover information that is already public through no fault of yours, or ` +
      `disclosure that the law requires (where lawful, tell the Owner first).`,
    `*4. What you get.* In exchange for your promise, the Owner gives you access to the channel. ` +
      `You would not get access without it.`,
    t.fine
      ? `*5. Breach.* If you break this promise, you agree to pay the Owner *${t.fine} for each breach* as ` +
        `liquidated damages. You accept that this is a reasonable estimate of the harm, which would be hard to ` +
        `measure exactly. The Owner may also remove you and seek any other remedy available, including an order ` +
        `to stop the disclosure.`
      : `*5. Breach.* If you break this promise, the Owner may remove you, claim damages for the harm caused, and ` +
        `seek any other remedy available, including an order to stop the disclosure.`,
    `*6. Duration.* Your promise continues after you leave the channel or are removed.`,
    `*7. Electronic signature.* Typing your full legal name and pressing *Sign & submit* is your electronic ` +
      `signature and has the same effect as signing by hand. A record of your Slack account, the name you type, ` +
      `the time, and this exact text is kept, and you will be sent a copy.`,
  ];
  if (t.governingLaw) clauses.push(`*8. Governing law.* This agreement is governed by ${t.governingLaw}.`);
  return clauses;
}

export function agreementText(t: AgreementTerms): string {
  return `CONFIDENTIALITY UNDERTAKING (v${AGREEMENT_VERSION})\n\n` + agreementClauses(t).join("\n\n");
}

export interface SignatureRecord {
  agreementVersion: string;
  agreementSha256: string;
  agreementText: string;
  signedAt: string;
  slackUserId: string;
  slackTeamId?: string;
  legalName: string;
  confirmedAdult: boolean;
}

export function buildSignature(input: {
  terms: AgreementTerms;
  slackUserId: string;
  slackTeamId?: string;
  legalName: string;
  confirmedAdult: boolean;
  now?: Date;
}): SignatureRecord {
  const text = agreementText(input.terms);
  return {
    agreementVersion: AGREEMENT_VERSION,
    agreementSha256: createHash("sha256").update(text).digest("hex"),
    agreementText: text,
    signedAt: (input.now ?? new Date()).toISOString(),
    slackUserId: input.slackUserId,
    slackTeamId: input.slackTeamId,
    legalName: input.legalName,
    confirmedAdult: input.confirmedAdult,
  };
}

/** Append-only log, one JSON object per line. Never rewritten, so it doubles as an audit trail. */
export async function saveSignature(file: string, record: SignatureRecord): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(record) + "\n", "utf8");
}

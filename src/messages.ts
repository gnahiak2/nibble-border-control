import type { KnownBlock, View } from "@slack/types";
import { AGREEMENT_VERSION, agreementClauses, type AgreementTerms, type SignatureRecord } from "./agreement";

export const ACTIONS = {
  start: "start_application",
  approve: "approve_application",
  deny: "deny_application",
} as const;

export const MODAL_CALLBACK = "entry_form";

/** Where the applicant's welcome message lives, so replies land in its thread. */
export interface Origin {
  user: string;
  channel: string;
  ts: string;
}

export interface Answers {
  name: string;
  found: string;
  why: string;
  /** Typed full legal name: the electronic signature. */
  legalName: string;
  agreed: boolean;
  adult: boolean;
}

export function welcomeMessage(user: string): { text: string; blocks: KnownBlock[] } {
  const text = `Welcome to the border, <@${user}>. Fill in the entry form to continue.`;
  return {
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:passport_control: *Welcome to the border, <@${user}>.*\nBefore you go any further, fill in the entry form. It takes a minute.`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            style: "primary",
            text: { type: "plain_text", text: "Fill in entry form" },
            action_id: ACTIONS.start,
            value: user,
          },
        ],
      },
    ],
  };
}

export function entryForm(origin: Origin, terms: AgreementTerms): View {
  return {
    type: "modal",
    callback_id: MODAL_CALLBACK,
    private_metadata: JSON.stringify(origin),
    title: { type: "plain_text", text: "Entry form" },
    submit: { type: "plain_text", text: "Sign & submit" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "name",
        label: { type: "plain_text", text: "What should we call you?" },
        element: { type: "plain_text_input", action_id: "value", max_length: 80 },
      },
      {
        type: "input",
        block_id: "found",
        label: { type: "plain_text", text: "How did you find this place / who sent you?" },
        element: { type: "plain_text_input", action_id: "value", max_length: 300 },
      },
      {
        type: "input",
        block_id: "why",
        label: { type: "plain_text", text: "Why do you want in?" },
        element: { type: "plain_text_input", action_id: "value", multiline: true, max_length: 1000 },
      },
      { type: "divider" },
      { type: "header", text: { type: "plain_text", text: "Confidentiality undertaking" } },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text:
              "The channel you're applying to is extremely personal. Entry requires a binding promise to keep it " +
              "private. Read it properly: it has consequences.",
          },
        ],
      },
      ...agreementClauses(terms).map(
        (text): KnownBlock => ({ type: "section", text: { type: "mrkdwn", text } }),
      ),
      {
        type: "input",
        block_id: "agree",
        label: { type: "plain_text", text: "Agreement" },
        element: {
          type: "checkboxes",
          action_id: "value",
          options: [
            {
              text: { type: "plain_text", text: "I have read this undertaking and agree to be legally bound by it" },
              value: "agree",
            },
            { text: { type: "plain_text", text: "I am 18 or older" }, value: "adult" },
          ],
        },
      },
      {
        type: "input",
        block_id: "signature",
        label: { type: "plain_text", text: "Signature: type your full legal name" },
        hint: { type: "plain_text", text: "Your real first and last name, not a nickname or username." },
        element: { type: "plain_text_input", action_id: "value", max_length: 120 },
      },
    ],
  };
}

type ViewValues = Record<
  string,
  Record<string, { value?: string | null; selected_options?: { value: string }[] | null }>
>;

export function readAnswers(values: ViewValues): Answers {
  const checked = new Set((values.agree?.value?.selected_options ?? []).map((o) => o.value));
  return {
    name: values.name?.value?.value?.trim() ?? "",
    found: values.found?.value?.value?.trim() ?? "",
    why: values.why?.value?.value?.trim() ?? "",
    legalName: (values.signature?.value?.value ?? "").trim().replace(/\s+/g, " "),
    agreed: checked.has("agree"),
    adult: checked.has("adult"),
  };
}

/** Field errors keyed by block_id, for `ack({ response_action: "errors" })`. Empty = good to go. */
export function validateAnswers(a: Answers): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!a.agreed || !a.adult) errors.agree = "Both boxes are required to enter. Press Cancel if you don't agree.";
  if (a.legalName.split(" ").length < 2) errors.signature = "Type your full legal name (first and last).";
  return errors;
}

const quote = (s: string) => s.split("\n").map((line) => `> ${line}`).join("\n");

export function reviewMessage(
  origin: Origin,
  a: Answers,
  sig: SignatureRecord,
): { text: string; blocks: KnownBlock[] } {
  const text = `New entry application from <@${origin.user}>`;
  return {
    text,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `:passport_control: *${text}*` } },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*Name:*\n${quote(a.name)}\n*Found us via:*\n${quote(a.found)}\n*Why:*\n${quote(a.why)}\n` +
            `*Confidentiality undertaking:* signed as *${sig.legalName}* at ${sig.signedAt} ` +
            `(v${sig.agreementVersion}, sha256 \`${sig.agreementSha256.slice(0, 12)}\`)`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            style: "primary",
            text: { type: "plain_text", text: "Approve" },
            action_id: ACTIONS.approve,
            value: JSON.stringify(origin),
          },
          {
            type: "button",
            style: "danger",
            text: { type: "plain_text", text: "Deny" },
            action_id: ACTIONS.deny,
            value: JSON.stringify(origin),
          },
        ],
      },
    ],
  };
}

export const copy = {
  notYours: "This form isn't yours. Wait for your own welcome message.",
  signedCopy: (sig: SignatureRecord) =>
    `:page_facing_up: Here is your copy of the confidentiality undertaking you signed as *${sig.legalName}* ` +
    `on ${sig.signedAt} (v${AGREEMENT_VERSION}, sha256 \`${sig.agreementSha256}\`). Keep it.\n\n` +
    "```\n" + sig.agreementText.replace(/\*/g, "") + "\n```",
  saveFailed: (user: string) =>
    `<@${user}>, something went wrong recording your signature. Nothing was saved, so please press the button and try again.`,
  pending: (user: string) => `<@${user}>, your form has been received and is awaiting review.`,
  approved: (user: string, channel: string) => `:white_check_mark: <@${user}>, entry approved. Head over to <#${channel}>.`,
  denied: (user: string) => `<@${user}>, entry denied.`,
  arrival: (user: string) => `<@${user}> has cleared the border. Say hi.`,
  decided: (verdict: "approved" | "denied", user: string, by: string) =>
    `${verdict === "approved" ? ":white_check_mark:" : ":x:"} <@${user}> ${verdict} by <@${by}>.`,
};

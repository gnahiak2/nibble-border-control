import type { KnownBlock, View } from "@slack/types";
import { AGREEMENT_TITLE, PROMISE_POINTS, PROMISE_TEXT, type PromiseRecord } from "./agreement";

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
  promised: boolean;
  /** Full name typed as the signature, whitespace collapsed. */
  signedName: string;
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

export function entryForm(origin: Origin): View {
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
      { type: "header", text: { type: "plain_text", text: AGREEMENT_TITLE } },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text:
              "The channel you're applying to is really personal, so entry requires signing this agreement. " +
              "Read all of it before you sign.",
          },
        ],
      },
      ...PROMISE_POINTS.map((text): KnownBlock => ({ type: "section", text: { type: "mrkdwn", text } })),
      {
        type: "input",
        block_id: "promise",
        label: { type: "plain_text", text: "Agreement" },
        element: {
          type: "checkboxes",
          action_id: "value",
          options: [
            {
              text: { type: "plain_text", text: "I have read this agreement and agree to be bound by it" },
              value: "promise",
            },
          ],
        },
      },
      {
        type: "input",
        block_id: "signature",
        label: { type: "plain_text", text: "Signature: type your full name" },
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
  const checked = (values.promise?.value?.selected_options ?? []).some((o) => o.value === "promise");
  return {
    name: values.name?.value?.value?.trim() ?? "",
    found: values.found?.value?.value?.trim() ?? "",
    why: values.why?.value?.value?.trim() ?? "",
    promised: checked,
    signedName: (values.signature?.value?.value ?? "").trim().replace(/\s+/g, " "),
  };
}

/** Field errors keyed by block_id, for `ack({ response_action: "errors" })`. Empty = good to go. */
export function validateAnswers(a: Answers): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!a.promised) errors.promise = "You have to agree to get in. Press Cancel if you don't want to.";
  if (a.signedName.split(" ").length < 2) errors.signature = "Type your full name (first and last).";
  return errors;
}

const quote = (s: string) => s.split("\n").map((line) => `> ${line}`).join("\n");

export function reviewMessage(
  origin: Origin,
  a: Answers,
  record: PromiseRecord,
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
            `*Agreement:* signed as *${record.signedName}* at ${record.promisedAt} (v${record.promiseVersion})`,
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
  promiseCopy: (r: PromiseRecord) =>
    `:page_facing_up: Here is your copy of the ${AGREEMENT_TITLE}, which you signed as *${r.signedName}* on ` +
    `${r.promisedAt}. Keep it.\n\n` +
    "```\n" + PROMISE_TEXT.replace(/\*/g, "") + "\n```",
  saveFailed: (user: string) =>
    `<@${user}>, something went wrong saving your signed agreement. Please press the button and try again.`,
  pending: (user: string) => `<@${user}>, your form has been received and is awaiting review.`,
  approved: (user: string, channel: string) => `:white_check_mark: <@${user}>, entry approved. Head over to <#${channel}>.`,
  denied: (user: string) => `<@${user}>, entry denied.`,
  arrival: (user: string) => `<@${user}> has cleared the border. Say hi.`,
  decided: (verdict: "approved" | "denied", user: string, by: string) =>
    `${verdict === "approved" ? ":white_check_mark:" : ":x:"} <@${user}> ${verdict} by <@${by}>.`,
};

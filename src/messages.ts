import type { KnownBlock, View } from "@slack/types";

export const ACTIONS = {
  start: "start_application",
  approve: "approve_application",
  deny: "deny_application",
} as const;

export const MODAL_CALLBACK = "entry_form";

export const CLAUSE_TEXT =
  "The channel you're applying to is extremely personal and can include details of my life. " +
  "Do you agree to keep everything you see in it private: no screenshots, no sharing, no repeating it outside?";

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
  agreed: boolean;
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
    submit: { type: "plain_text", text: "Submit" },
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
      {
        type: "input",
        block_id: "clause",
        label: { type: "plain_text", text: "Privacy clause" },
        hint: { type: "plain_text", text: "Answering no ends the application." },
        element: {
          type: "radio_buttons",
          action_id: "value",
          options: [
            { text: { type: "plain_text", text: "Yes, I agree" }, value: "yes" },
            { text: { type: "plain_text", text: "No" }, value: "no" },
          ],
        },
      },
      { type: "context", elements: [{ type: "mrkdwn", text: CLAUSE_TEXT }] },
    ],
  };
}

type ViewValues = Record<string, Record<string, { value?: string | null; selected_option?: { value: string } | null }>>;

export function readAnswers(values: ViewValues): Answers {
  return {
    name: values.name?.value?.value?.trim() ?? "",
    found: values.found?.value?.value?.trim() ?? "",
    why: values.why?.value?.value?.trim() ?? "",
    agreed: values.clause?.value?.selected_option?.value === "yes",
  };
}

const quote = (s: string) => s.split("\n").map((line) => `> ${line}`).join("\n");

export function reviewMessage(origin: Origin, a: Answers): { text: string; blocks: KnownBlock[] } {
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
            `*Privacy clause:* agreed`,
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
  declinedClause: (user: string) =>
    `<@${user}>, entry refused: the privacy clause is required. Press the button again if you change your mind.`,
  pending: (user: string) => `<@${user}>, your form has been received and is awaiting review.`,
  approved: (user: string, channel: string) => `:white_check_mark: <@${user}>, entry approved. Head over to <#${channel}>.`,
  denied: (user: string) => `<@${user}>, entry denied.`,
  arrival: (user: string) => `<@${user}> has cleared the border. Say hi.`,
  decided: (verdict: "approved" | "denied", user: string, by: string) =>
    `${verdict === "approved" ? ":white_check_mark:" : ":x:"} <@${user}> ${verdict} by <@${by}>.`,
};

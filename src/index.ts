import { App, type BlockAction, type ButtonAction } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { buildPromise, savePromise } from "./agreement";
import { config } from "./config";
import {
  ACTIONS,
  MODAL_CALLBACK,
  copy,
  entryForm,
  readAnswers,
  reviewMessage,
  validateAnswers,
  welcomeMessage,
  type Origin,
} from "./messages";

const app = new App({
  token: config.botToken,
  appToken: config.appToken,
  socketMode: true,
});

const reply = (client: WebClient, origin: Origin, text: string) =>
  client.chat.postMessage({ channel: origin.channel, thread_ts: origin.ts, text });

async function admit(client: WebClient, origin: Origin) {
  try {
    await client.conversations.invite({ channel: config.approvedChannelId, users: origin.user });
  } catch (err: any) {
    if (err?.data?.error !== "already_in_channel") throw err;
  }
  await reply(client, origin, copy.approved(origin.user, config.approvedChannelId));
  await client.chat.postMessage({ channel: config.approvedChannelId, text: copy.arrival(origin.user) });
}

// 1. someone joins the welcome channel -> greet them with the form button
app.event("member_joined_channel", async ({ event, client, context }) => {
  if (event.channel !== config.welcomeChannelId) return;
  if (event.user === context.botUserId) return;
  await client.chat.postMessage({ channel: event.channel, ...welcomeMessage(event.user) });
});

// 2. button -> open the entry form (only for the person it was posted for)
app.action<BlockAction<ButtonAction>>(ACTIONS.start, async ({ ack, body, action, client }) => {
  await ack();
  const applicant = action.value!;
  if (body.user.id !== applicant) {
    await client.chat.postEphemeral({ channel: body.channel!.id, user: body.user.id, text: copy.notYours });
    return;
  }
  const origin: Origin = { user: applicant, channel: body.channel!.id, ts: body.message!.ts };
  await client.views.open({ trigger_id: body.trigger_id, view: entryForm(origin) });
});

// 3. form submitted -> needs the signed agreement; record it, then review (or auto-approve with no owner)
app.view(MODAL_CALLBACK, async ({ ack, view, body, client }) => {
  const origin: Origin = JSON.parse(view.private_metadata);
  if (body.user.id !== origin.user) return ack();
  const answers = readAnswers(view.state.values as any);
  const errors = validateAnswers(answers);
  if (Object.keys(errors).length) return ack({ response_action: "errors", errors });
  await ack();

  const record = buildPromise({
    slackUserId: body.user.id,
    slackTeamId: body.team?.id,
    name: answers.name,
    signedName: answers.signedName,
  });
  try {
    await savePromise(config.promisesFile, record);
  } catch (err) {
    console.error("[border-control] could not save promise", err);
    await reply(client, origin, copy.saveFailed(origin.user));
    return;
  }
  await client.chat.postMessage({ channel: origin.user, text: copy.promiseCopy(record) });

  if (!config.ownerId) {
    await admit(client, origin);
    return;
  }
  await client.chat.postMessage({ channel: config.ownerId, ...reviewMessage(origin, answers, record) });
  await reply(client, origin, copy.pending(origin.user));
});

// 4. owner approves / denies from their DM
for (const [actionId, verdict] of [
  [ACTIONS.approve, "approved"],
  [ACTIONS.deny, "denied"],
] as const) {
  app.action<BlockAction<ButtonAction>>(actionId, async ({ ack, body, action, client }) => {
    await ack();
    if (body.user.id !== config.ownerId) return;
    const origin: Origin = JSON.parse(action.value!);

    if (verdict === "approved") await admit(client, origin);
    else await reply(client, origin, copy.denied(origin.user));

    // swap the buttons for the verdict so it can't be clicked twice
    const decided = copy.decided(verdict, origin.user, body.user.id);
    const blocks = (body.message?.blocks ?? []).filter((b: any) => b.type !== "actions");
    await client.chat.update({
      channel: body.channel!.id,
      ts: body.message!.ts,
      text: decided,
      blocks: [...blocks, { type: "context", elements: [{ type: "mrkdwn", text: decided }] }],
    });
  });
}

app.error(async (err) => {
  console.error("[border-control]", err);
});

await app.start();
console.log("border control is open");

import { join } from 'node:path';
import { App, type BlockAction, type ButtonAction } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { createAiClient, type Verdict } from './ai.js';
import { config } from './config.js';
import { interviewKey, newInterview, type Interview } from './interview.js';
import { approvedChannelNote, failBlocks, passBlocks, welcomeBlocks } from './slack/messages.js';
import { InterviewStore } from './store.js';

const app = new App({
  token: config.slackBotToken,
  appToken: config.slackAppToken,
  socketMode: true,
});

const store = new InterviewStore(join(process.cwd(), 'data', 'interviews.json'));
const ai = createAiClient({ apiKey: config.apiKey, model: config.aiModel, mock: config.aiMock });

let botUserId: string | undefined;

const queues = new Map<string, Promise<void>>();

function enqueue(key: string, task: () => Promise<void>): void {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(task).catch((err) => {
    console.error(`interview ${key} blew up:`, err);
  });

  void next.then(() => {
    if (queues.get(key) === next && store.get(key)?.status !== 'active') {
      queues.delete(key);
    }
  });

  queues.set(key, next);
}

async function finalize(
  client: WebClient,
  interview: Interview,
  verdict: Verdict,
  closingText: string,
): Promise<void> {
  interview.status = verdict.result === 'pass' ? 'approved' : 'rejected';
  interview.finishedAt = Date.now();
  interview.verdictReason = verdict.reason;
  store.set(interview);

  if (closingText) {
    await client.chat.postMessage({
      channel: interview.channelId,
      thread_ts: interview.threadTs,
      text: closingText,
    });
  }

  if (verdict.result === 'fail') {
    await client.chat.postMessage({
      channel: interview.channelId,
      thread_ts: interview.threadTs,
      text: `entry denied: ${verdict.reason}`,
      blocks: failBlocks(interview.userId, verdict.reason),
    });
    return;
  }

  let admitted = false;
  try {
    await client.conversations.invite({
      channel: config.approvedChannelId,
      users: interview.userId,
    });
    admitted = true;
  } catch (err) {
    const slackError = (err as { data?: { error?: string } }).data?.error;
    if (slackError === 'already_in_channel') {
      console.log(`${interview.userName} was already admitted`);
    } else {
      console.error(`could not admit ${interview.userName}:`, err);
      await client.chat.postMessage({
        channel: interview.channelId,
        thread_ts: interview.threadTs,
        text: 'your visa is stamped, but the gate did not open. an officer has been notified.',
      });
    }
  }

  await client.chat.postMessage({
    channel: interview.channelId,
    thread_ts: interview.threadTs,
    text: `visa granted: ${verdict.reason}`,
    blocks: passBlocks(interview.userId, verdict.reason, config.approvedChannelId),
  });

  if (admitted) {
    await client.chat.postMessage({
      channel: config.approvedChannelId,
      text: approvedChannelNote(interview.userId),
    });
  }
}

app.event('member_joined_channel', async ({ event, client, logger }) => {
  if (event.channel !== config.welcomeChannelId) return;
  if (!event.user || event.user === botUserId) return;

  try {
    const info = await client.users.info({ user: event.user });
    if (info.user?.is_bot || info.user?.deleted) return;

    await client.chat.postMessage({
      channel: event.channel,
      text: `welcome, <@${event.user}>. you've arrived at nibble border control.`,
      blocks: welcomeBlocks(event.user),
    });
  } catch (err) {
    logger.error(err);
  }
});

app.action<BlockAction<ButtonAction>>('start_interview', async ({ ack, body, action, client, logger }) => {
  await ack();

  const channelId = body.channel?.id;
  const threadTs = body.message?.ts;
  const clickerId = body.user.id;

  if (!channelId || !threadTs) return;

  if (action.value && action.value !== clickerId) {
    await client.chat.postEphemeral({
      channel: channelId,
      user: clickerId,
      text: 'this notice is addressed to someone else. press the button on your own welcome message.',
    });
    return;
  }

  if (store.findActiveByUser(clickerId)) {
    await client.chat.postEphemeral({
      channel: channelId,
      user: clickerId,
      text: 'you already have an interview in progress. finish that one first.',
    });
    return;
  }

  if (store.get(interviewKey(channelId, threadTs))?.status === 'active') {
    await client.chat.postEphemeral({
      channel: channelId,
      user: clickerId,
      text: 'an interview is already underway in this thread.',
    });
    return;
  }

  let userName = clickerId;
  try {
    const info = await client.users.info({ user: clickerId });
    userName = info.user?.profile?.display_name || info.user?.real_name || clickerId;
  } catch {
    // fall back to the user id
  }

  const interview = newInterview({ channelId, threadTs, userId: clickerId, userName });
  store.set(interview);

  try {
    const opening = await ai.start(userName);
    interview.history = opening.history;
    interview.turns = 1;
    store.set(interview);

    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: opening.text,
    });
  } catch (err) {
    logger.error(err);
    interview.status = 'rejected';
    interview.finishedAt = Date.now();
    interview.verdictReason = 'the officer’s terminal went dark';
    store.set(interview);

    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: 'the officer’s terminal has gone dark. press the button again to reapply.',
    });
  }
});

app.message(async ({ message, client, logger }) => {
  const msg = message as {
    subtype?: string;
    bot_id?: string;
    user?: string;
    channel?: string;
    text?: string;
    thread_ts?: string;
  };

  if (msg.bot_id || !msg.user || !msg.channel || !msg.text) return;
  if (msg.subtype && msg.subtype !== 'thread_broadcast') return;
  if (!msg.thread_ts) return;

  const key = interviewKey(msg.channel, msg.thread_ts);
  const interview = store.get(key);
  if (!interview || interview.status !== 'active') return;
  if (interview.userId !== msg.user) return;

  const replyText = msg.text;

  enqueue(key, async () => {
    const current = store.get(key);
    if (!current || current.status !== 'active') return;

    try {
      const reply = await ai.continue(current.history, replyText);
      current.history = reply.history;
      current.turns += 1;
      store.set(current);

      if (reply.verdict) {
        await finalize(client, current, reply.verdict, reply.text);
      } else {
        await client.chat.postMessage({
          channel: current.channelId,
          thread_ts: current.threadTs,
          text: reply.text,
        });
      }
    } catch (err) {
      logger.error(err);
      await client.chat.postMessage({
        channel: current.channelId,
        thread_ts: current.threadTs,
        text: 'the officer’s terminal flickered. say that again?',
      });
    }
  });
});

app.error(async (error) => {
  console.error('border control error:', error);
});

async function main(): Promise<void> {
  const auth = await app.client.auth.test();
  botUserId = auth.user_id;

  await app.start();
  console.log(
    `nibble border control is on duty — interviewing with ${config.aiModel}${config.aiMock ? ' (mock interviews)' : ''}`,
  );
}

main().catch((err) => {
  console.error('failed to open the border:', err);
  process.exit(1);
});

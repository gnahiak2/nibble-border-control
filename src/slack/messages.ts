import type { KnownBlock } from '@slack/types';

export function welcomeBlocks(userId: string): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `mrrp? <@${userId}> just landed!!! hi hi,,, :3`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'okay,,, before you get anywhere near the good stuff you have to clear immigration,,, i’ll interview you right here in this thread :3 answer honestly,,, i have seen everything',
      },
    },
    {
      type: 'actions',
      block_id: 'immigration_desk',
      elements: [
        {
          type: 'button',
          action_id: 'start_interview',
          style: 'primary',
          text: { type: 'plain_text', text: 'start the interview!!! :3', emoji: true },
          value: userId,
        },
      ],
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'only the person above can press this,,, those are the rules :3' }],
    },
  ];
}

export function passBlocks(userId: string, reason: string, approvedChannelId: string): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*visa granted!!!* welcome to <#${approvedChannelId}>, <@${userId}> :3`,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `_officer's note: ${reason}_` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `papers filed,,, you’re being admitted to <#${approvedChannelId}> now :3` },
    },
  ];
}

export function failBlocks(userId: string, reason: string): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*entry denied :<* not this time, <@${userId}>,,,`,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `_officer's note: ${reason}_` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: 'you can press the button above to reapply whenever you like :< ...okay that is enough pout' },
    },
  ];
}

export function approvedChannelNote(userId: string): string {
  return `hey hey,,, <@${userId}> just cleared immigration and has been admitted!!! be nice to them :3`;
}

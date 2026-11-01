import type { KnownBlock } from '@slack/types';

export function welcomeBlocks(userId: string): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Arrival recorded: <@${userId}>.`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Before admission, you must clear immigration. This thread is the interview. Answer the officer’s questions honestly. It will not take long.',
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
          text: { type: 'plain_text', text: 'Begin interview', emoji: true },
          value: userId,
        },
      ],
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'This button is assigned to the person above.' }],
    },
  ];
}

export function passBlocks(userId: string, reason: string, approvedChannelId: string): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Visa granted.* Welcome to <#${approvedChannelId}>, <@${userId}>.`,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `_Officer’s note: ${reason}_` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `Paperwork filed. Admission to <#${approvedChannelId}> is in progress.` },
    },
  ];
}

export function failBlocks(userId: string, reason: string): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Entry denied.* Not this time, <@${userId}>.`,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `_Officer’s note: ${reason}_` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: 'You may reapply with the button above whenever you like.' },
    },
  ];
}

export function approvedChannelNote(userId: string): string {
  return `Please welcome <@${userId}>, who has just cleared immigration.`;
}

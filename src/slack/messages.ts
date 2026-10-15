import type { KnownBlock } from '@slack/types';

export function welcomeBlocks(userId: string): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<@${userId}>'s flight just landed! Welcome, <@${userId}>. you've arrived at immigration.`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'before you get anywhere near the good stuff, you need to clear immigration. an officer will interview you right here in this thread. answer honestly — the officer has seen everything.',
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
          text: { type: 'plain_text', text: 'start immigration interview', emoji: true },
          value: userId,
        },
      ],
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'only the applicant named above may begin this interview.' }],
    },
  ];
}

export function passBlocks(userId: string, reason: string, approvedChannelId: string): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:passport_control: *visa granted.* welcome to <#${approvedChannelId}>, <@${userId}>.`,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `_officer's note: ${reason}_` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `your papers have been filed — you're being admitted to <#${approvedChannelId}>.` },
    },
  ];
}

export function failBlocks(userId: string, reason: string): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:no_entry: *entry denied.* not this time, <@${userId}>.`,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `_officer's note: ${reason}_` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: 'you may press the button above to reapply whenever you like.' },
    },
  ];
}

export function approvedChannelNote(userId: string): string {
  return `<@${userId}> just cleared immigration and has been admitted. be nice.`;
}

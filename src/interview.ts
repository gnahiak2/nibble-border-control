import type { WireMessage } from './ai.js';

export type InterviewStatus = 'active' | 'approved' | 'rejected';

export interface Interview {
  key: string;
  channelId: string;
  threadTs: string;
  userId: string;
  userName: string;
  status: InterviewStatus;
  history: WireMessage[];
  turns: number;
  startedAt: number;
  finishedAt?: number;
  verdictReason?: string;
}

export function interviewKey(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}

export function newInterview(input: {
  channelId: string;
  threadTs: string;
  userId: string;
  userName: string;
}): Interview {
  return {
    key: interviewKey(input.channelId, input.threadTs),
    channelId: input.channelId,
    threadTs: input.threadTs,
    userId: input.userId,
    userName: input.userName,
    status: 'active',
    history: [],
    turns: 0,
    startedAt: Date.now(),
  };
}

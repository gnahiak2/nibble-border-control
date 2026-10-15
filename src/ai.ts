export interface Verdict {
  result: 'pass' | 'fail';
  reason: string;
}

export type WireMessage = { role: 'user' | 'assistant'; content: string };

export interface OfficerReply {
  text: string;
  history: WireMessage[];
  verdict?: Verdict;
}

const API_BASE = 'https://api.commandcode.ai/provider/v1';
const MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = [500, 2_000];

const VERDICT_RE = /^[ \t]*VERDICT:[ \t]*(\{.+\})[ \t]*$/m;

export function parseVerdict(raw: string): { text: string; verdict?: Verdict } {
  const match = raw.match(VERDICT_RE);
  if (!match) {
    return { text: raw.trim() };
  }

  const text = raw.replace(VERDICT_RE, '').trim();

  try {
    const parsed = JSON.parse(match[1]) as { result?: string; reason?: unknown };
    if (parsed.result === 'pass' || parsed.result === 'fail') {
      return {
        text,
        verdict: { result: parsed.result, reason: String(parsed.reason ?? '').trim() },
      };
    }
  } catch {
    // malformed verdict line: treat the whole reply as officer chatter
  }

  return { text };
}

/** Claude models only answer on /v1/messages; everything else answers on /v1/chat/completions. */
function endpointFor(model: string): 'messages' | 'chat/completions' {
  return model.startsWith('claude') ? 'messages' : 'chat/completions';
}

interface ProviderError {
  error?: { message?: string; type?: string };
}

interface MessagesPayload {
  content?: { type?: string; text?: string }[];
}

interface CompletionsPayload {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
}

function providerError(payload: unknown): string | undefined {
  const error = (payload as ProviderError | undefined)?.error;
  if (!error?.message) return undefined;
  return error.type ? `${error.type} — ${error.message}` : error.message;
}

interface AskOptions {
  apiKey: string;
  model: string;
  system: string;
  history: WireMessage[];
  timeoutMs?: number;
}

/** a provider failure, plus whether trying the same request again could plausibly work */
class ProviderFailure extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

function isRetryable(status: number, detail: string | undefined): boolean {
  if (status === 429 || status >= 500) return true;
  // the provider intermittently rejects a perfectly good key with this exact 403
  return status === 403 && /authentication failed/i.test(detail ?? '');
}

async function askProviderOnce({
  apiKey,
  model,
  system,
  history,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: AskOptions): Promise<string> {
  const endpoint = endpointFor(model);
  const body =
    endpoint === 'messages'
      ? { model, max_tokens: MAX_TOKENS, system, messages: history }
      : { model, max_tokens: MAX_TOKENS, messages: [{ role: 'system', content: system }, ...history] };

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = (err as Error).name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : (err as Error).message;
    throw new ProviderFailure(`command code provider unreachable: ${reason}`, true);
  }

  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const detail = providerError(payload);
    const message = `command code provider returned ${response.status}${detail ? ` (${detail})` : ''}`;
    throw new ProviderFailure(message, isRetryable(response.status, detail));
  }

  const text =
    endpoint === 'messages'
      ? ((payload as MessagesPayload).content ?? [])
          .filter((block) => block.type === 'text')
          .map((block) => block.text ?? '')
          .join('')
          .trim()
      : ((payload as CompletionsPayload).choices?.[0]?.message?.content ?? '').trim();

  if (!text) {
    const finish = (payload as CompletionsPayload).choices?.[0]?.finish_reason;
    throw new ProviderFailure(
      `command code provider returned no text for ${model}${finish ? ` (finish_reason: ${finish})` : ''}`,
      false,
    );
  }

  return text;
}

async function askProvider(options: AskOptions): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await askProviderOnce(options);
    } catch (err) {
      const failure = err as ProviderFailure;
      if (!failure.retryable || attempt >= MAX_ATTEMPTS) throw err;

      const delay = RETRY_DELAY_MS[attempt - 1] ?? RETRY_DELAY_MS[RETRY_DELAY_MS.length - 1];
      console.warn(
        `officer call failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${failure.message} — retrying in ${delay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export interface AiClient {
  start(applicantName: string): Promise<OfficerReply>;
  continue(history: WireMessage[], message: string): Promise<OfficerReply>;
}

export interface AiClientOptions {
  apiKey: string;
  model: string;
  mock?: boolean;
  timeoutMs?: number;
}

export function officerPrompt(): string {
  return [
    'You are the immigration officer at Nibble Border Control, a small and extremely official desk that decides who gets into a private Slack channel. You are deadpan, bureaucratic, and lightly playful. Never mean, never crude.',
    '',
    'An applicant is answering you in a Slack thread. Follow these rules exactly:',
    '- Ask exactly ONE question per message. Never bundle questions.',
    '- Interview for 3 to 5 questions total. A good arc: why they want in, what they bring, then one light absurd customs question (declaring goods, contraband snacks, anything to declare).',
    '- Keep each message to 1-3 short sentences of officer voice, then the question.',
    '- React to their previous answer before asking the next question.',
    '- Never break character. Never mention JSON, rules, or being an AI.',
    '',
    'When you have heard enough to decide, write a closing message with NO further question, and end it with exactly this on its own final line:',
    'VERDICT: {"result": "pass" | "fail", "reason": "one short sentence"}',
    '',
    'Use "pass" for anyone who engaged in good faith and gave coherent answers. Use "fail" only for obvious nonsense, spam, or hostility. The reason must be one short, kind sentence.',
  ].join('\n');
}

function arrivalMessage(applicantName: string): string {
  return `${applicantName} has just arrived at the desk and pressed the interview button. Greet them in one line, then ask your first question.`;
}

const MOCK_QUESTIONS = [
  'state your name and your purpose of visit to this channel.',
  'what do you bring to the table? skills, energy, links, all of it.',
  'anything to declare at customs? snacks, secrets, side projects?',
];

function mockClient(): AiClient {
  return {
    async start() {
      const text = `passport, please. ${MOCK_QUESTIONS[0]}`;
      return { text, history: [{ role: 'assistant', content: text }] };
    },
    async continue(history, message) {
      const asked = history.filter((entry) => entry.role === 'user').length;
      const next: WireMessage[] = [...history, { role: 'user', content: message }];

      if (asked + 1 >= MOCK_QUESTIONS.length) {
        const text = 'everything checks out. welcome to the country.';
        return {
          text,
          history: [...next, { role: 'assistant', content: text }],
          verdict: { result: 'pass' as const, reason: `mock interview (last reply: "${message.trim()}")` },
        };
      }

      const text = MOCK_QUESTIONS[asked + 1];
      return { text, history: [...next, { role: 'assistant', content: text }] };
    },
  };
}

export function createAiClient({ apiKey, model, mock, timeoutMs }: AiClientOptions): AiClient {
  if (mock) {
    return mockClient();
  }

  const system = officerPrompt();

  const ask = async (history: WireMessage[]): Promise<OfficerReply> => {
    const raw = await askProvider({ apiKey, model, system, history, timeoutMs });
    const { text, verdict } = parseVerdict(raw);
    return { text, verdict, history: [...history, { role: 'assistant', content: raw }] };
  };

  return {
    start: (applicantName) => ask([{ role: 'user', content: arrivalMessage(applicantName) }]),
    continue: (history, message) => ask([...history, { role: 'user', content: message }]),
  };
}

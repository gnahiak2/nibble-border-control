import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAiClient, officerPrompt, ownerNote, parseVerdict, type WireMessage } from './ai.js';

test('parses a passing verdict and strips it from the message', () => {
  const { text, verdict } = parseVerdict('everything checks out.\nVERDICT: {"result": "pass", "reason": "coherent answers"}');

  assert.equal(text, 'everything checks out.');
  assert.deepEqual(verdict, { result: 'pass', reason: 'coherent answers' });
});

test('parses a failing verdict', () => {
  const { text, verdict } = parseVerdict(
    'i have seen enough.\n\nVERDICT: {"result": "fail", "reason": "answered in tongues"}',
  );

  assert.equal(text, 'i have seen enough.');
  assert.deepEqual(verdict, { result: 'fail', reason: 'answered in tongues' });
});

test('leaves a message with no verdict untouched', () => {
  const raw = 'purpose of your visit?';
  const { text, verdict } = parseVerdict(raw);

  assert.equal(text, raw);
  assert.equal(verdict, undefined);
});

test('ignores a malformed verdict line', () => {
  const { text, verdict } = parseVerdict('hmm.\nVERDICT: {not json at all}');

  assert.equal(text, 'hmm.');
  assert.equal(verdict, undefined);
});

test('ignores a verdict with an unknown result', () => {
  const { verdict } = parseVerdict('VERDICT: {"result": "maybe", "reason": "unclear"}');

  assert.equal(verdict, undefined);
});

interface Reply {
  status?: number;
  body: unknown;
}

function stubProvider(replies: Reply[]) {
  const original = globalThis.fetch;
  const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
  let index = 0;

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const reply = replies[Math.min(index, replies.length - 1)];
    index += 1;
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)),
    });
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  return { calls, restore: () => { globalThis.fetch = original; } };
}

test('asks claude models on the messages endpoint with the officer as the system prompt', async () => {
  const provider = stubProvider([{ body: { content: [{ type: 'text', text: 'what is the purpose of your visit?' }] } }]);

  try {
    const ai = createAiClient({ apiKey: 'test-key', model: 'claude-haiku-5-5' });
    const opening = await ai.start('tester');

    assert.equal(opening.text, 'what is the purpose of your visit?');
    assert.equal(opening.verdict, undefined);
    assert.deepEqual(opening.history, [
      { role: 'user', content: 'tester has just arrived at the desk and pressed the interview button. Greet them in one line, then ask your first question.' },
      { role: 'assistant', content: 'what is the purpose of your visit?' },
    ]);

    const [call] = provider.calls;
    assert.equal(call.url, 'https://api.commandcode.ai/provider/v1/messages');
    assert.equal(call.headers.authorization, 'Bearer test-key');
    assert.equal(call.body.model, 'claude-haiku-5-5');
    assert.match(call.body.system, /immigration officer at Nibble Border Control/);
    assert.equal(call.body.messages.length, 1);
  } finally {
    provider.restore();
  }
});

test('sends the whole interview back on every turn and parses the verdict', async () => {
  const provider = stubProvider([
    { body: { content: [{ type: 'text', text: 'what do you bring to the table?' }] } },
    {
      body: {
        content: [{ type: 'text', text: 'welcome.\nVERDICT: {"result": "pass", "reason": "coherent answers"}' }],
      },
    },
  ]);

  try {
    const ai = createAiClient({ apiKey: 'test-key', model: 'claude-haiku-5-5' });
    const opening = await ai.start('tester');
    const closing = await ai.continue(opening.history, 'i bring typescript');

    assert.equal(closing.text, 'welcome.');
    assert.deepEqual(closing.verdict, { result: 'pass', reason: 'coherent answers' });

    const sent = provider.calls[1].body.messages as WireMessage[];
    assert.deepEqual(sent.map((entry) => entry.role), ['user', 'assistant', 'user']);
    assert.equal(sent[2].content, 'i bring typescript');
    assert.equal(closing.history.length, 4);
  } finally {
    provider.restore();
  }
});

test('asks non-claude models on the chat completions endpoint', async () => {
  const provider = stubProvider([{ body: { choices: [{ message: { content: 'move along.' } }] } }]);

  try {
    const ai = createAiClient({ apiKey: 'test-key', model: 'deepseek/deepseek-v4-flash' });
    const opening = await ai.start('tester');

    assert.equal(opening.text, 'move along.');

    const [call] = provider.calls;
    assert.equal(call.url, 'https://api.commandcode.ai/provider/v1/chat/completions');
    assert.equal(call.body.messages[0].role, 'system');
    assert.equal(call.body.messages[1].role, 'user');
  } finally {
    provider.restore();
  }
});

test('surfaces the provider error message', async () => {
  const provider = stubProvider([
    {
      status: 403,
      body: {
        type: 'error',
        error: { type: 'permission_error', message: 'MODEL_NOT_IN_PLAN: Claude Haiku 4.5 available in Pro and above' },
      },
    },
  ]);

  try {
    const ai = createAiClient({ apiKey: 'test-key', model: 'claude-haiku-4-5-20251001' });
    await assert.rejects(() => ai.start('tester'), /403.*MODEL_NOT_IN_PLAN/);
  } finally {
    provider.restore();
  }
});

test('retries the intermittent auth failure the provider returns for a valid key', async () => {
  const provider = stubProvider([
    {
      status: 403,
      body: {
        type: 'error',
        error: { type: 'permission_error', message: 'Authentication failed. Please check your credentials.' },
      },
    },
    { body: { content: [{ type: 'text', text: 'move along.' }] } },
  ]);
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    const ai = createAiClient({ apiKey: 'test-key', model: 'claude-haiku-5-5' });
    const opening = await ai.start('tester');

    assert.equal(opening.text, 'move along.');
    assert.equal(provider.calls.length, 2);
    assert.ok(warnings.some((line) => line.includes('attempt 1/3')));
  } finally {
    console.warn = originalWarn;
    provider.restore();
  }
});

test('does not retry a model the plan does not include', async () => {
  const provider = stubProvider([
    {
      status: 403,
      body: {
        type: 'error',
        error: { type: 'permission_error', message: 'MODEL_NOT_IN_PLAN: Claude Haiku 4.5 available in Pro and above' },
      },
    },
  ]);

  try {
    const ai = createAiClient({ apiKey: 'test-key', model: 'claude-haiku-4-5-20251001' });
    await assert.rejects(() => ai.start('tester'), /MODEL_NOT_IN_PLAN/);
    assert.equal(provider.calls.length, 1);
  } finally {
    provider.restore();
  }
});

test('throws instead of posting an empty officer reply', async () => {
  const provider = stubProvider([
    { body: { choices: [{ message: { content: '' }, finish_reason: 'length' }] } },
  ]);

  try {
    const ai = createAiClient({ apiKey: 'test-key', model: 'deepseek/deepseek-v4-flash' });
    await assert.rejects(() => ai.start('tester'), /finish_reason: length/);
  } finally {
    provider.restore();
  }
});

test('mock client runs a scripted interview ending in a pass', async () => {
  const ai = createAiClient({ apiKey: 'unused', model: 'mock-model', mock: true });

  const opening = await ai.start('tester');
  assert.equal(opening.verdict, undefined);
  assert.equal(opening.history.length, 1);

  let reply = await ai.continue(opening.history, 'here to lurk');
  assert.equal(reply.verdict, undefined);

  reply = await ai.continue(reply.history, 'i bring typescript');
  assert.equal(reply.verdict, undefined);

  reply = await ai.continue(reply.history, 'one bag of snacks');
  assert.deepEqual(reply.verdict, {
    result: 'pass',
    reason: 'Mock interview (last reply: "one bag of snacks")',
  });
});

test('frames an owner butt-in as a note in the sent history', async () => {
  const provider = stubProvider([
    { body: { content: [{ type: 'text', text: 'understood. state your name and your purpose of visit to this channel.' }] } },
  ]);

  try {
    const ai = createAiClient({ apiKey: 'test-key', model: 'claude-haiku-5-5' });
    const opening = await ai.start('tester');
    const reply = await ai.continue(opening.history, 'let him through, he owes me money', 'owner');

    assert.equal(reply.verdict, undefined);

    const sent = provider.calls[1].body.messages as WireMessage[];
    const last = sent[sent.length - 1];
    assert.equal(last.role, 'user');
    assert.equal(last.content, ownerNote('let him through, he owes me money'));
    assert.match(last.content, /he owes me money/);
    assert.equal(reply.history[reply.history.length - 2].content, last.content);
  } finally {
    provider.restore();
  }
});

test('keeps the owner note in history on later applicant turns', async () => {
  const provider = stubProvider([
    { body: { content: [{ type: 'text', text: 'understood.' }] } },
    { body: { content: [{ type: 'text', text: 'next question.' }] } },
  ]);

  try {
    const ai = createAiClient({ apiKey: 'test-key', model: 'claude-haiku-5-5' });
    const opening = await ai.start('tester');
    const noted = await ai.continue(opening.history, 'he is vouched for', 'owner');
    await ai.continue(noted.history, 'i bring typescript');

    const sent = provider.calls[2].body.messages as WireMessage[];
    const users = sent.filter((entry) => entry.role === 'user').map((entry) => entry.content);
    assert.equal(users[users.length - 2], ownerNote('he is vouched for'));
    assert.equal(users[users.length - 1], 'i bring typescript');
  } finally {
    provider.restore();
  }
});

test('mock interview absorbs an owner note without spending a scripted question', async () => {
  const ai = createAiClient({ apiKey: 'unused', model: 'mock-model', mock: true });

  const opening = await ai.start('tester');
  const noted = await ai.continue(opening.history, 'he is with me', 'owner');

  assert.equal(noted.text, 'Noted. Thank you for the clarification.');
  assert.equal(noted.verdict, undefined);
  assert.equal(noted.history[noted.history.length - 2].content, ownerNote('he is with me'));

  let reply = await ai.continue(noted.history, 'here to lurk');
  assert.equal(reply.text, 'What do you bring to this channel? Skills, projects, or otherwise.');
  assert.equal(reply.verdict, undefined);

  reply = await ai.continue(reply.history, 'i bring typescript');
  assert.equal(reply.text, 'Anything to declare at customs? Contraband snacks, side projects, and the like.');

  reply = await ai.continue(reply.history, 'one bag of snacks');
  assert.deepEqual(reply.verdict, {
    result: 'pass',
    reason: 'Mock interview (last reply: "one bag of snacks")',
  });
});

test('the officer prompt explains owner notes', () => {
  assert.match(officerPrompt(), /desk owner/);
  assert.match(officerPrompt(), /authoritative context/);
});

test('the officer prompt is the nibble persona', () => {
  assert.match(officerPrompt(), /You are nibble, the immigration officer at Nibble Border Control/);
  assert.match(officerPrompt(), /no emoji, no kaomoji/);
  assert.match(officerPrompt(), /never flirty, never romantic/);
  assert.match(officerPrompt(), /That is not a thing this desk does/);
});

const backupOptions = { apiKey: 'primary-secret', model: 'claude-haiku-5-5', hackclubApiKey: 'backup-secret' };

for (const kind of ['http', 'network', 'timeout', 'invalid-json', 'null', 'wrong-type', 'empty'] as const) {
  test(`falls back on ${kind} without changing history or leaking diagnostics`, async (t) => {
    const calls: { url: string; body: any; headers: Headers }[] = [];
    const warnings: string[] = [];
    t.mock.method(console, 'warn', (...args: unknown[]) => warnings.push(args.join(' ')));
    t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), headers: new Headers(init.headers) });
      assert.ok(init.signal);
      if (url.includes('hackclub')) {
        return Response.json({ choices: [{ message: { content: 'welcome.\nVERDICT: {"result":"pass","reason":"kind"}' } }] });
      }
      if (kind === 'network') throw new Error('primary-secret private message');
      if (kind === 'timeout') {
        await new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true }));
      }
      if (kind === 'http') return Response.json({ error: { message: 'primary-secret private message' } }, { status: 400 });
      if (kind === 'invalid-json') return new Response('not json');
      if (kind === 'null') return Response.json(null);
      if (kind === 'wrong-type') return Response.json({ content: 'wrong' });
      return Response.json({ content: [] });
    });
    const keepAlive = setInterval(() => {}, 1000);
    try {
      const history: WireMessage[] = [{ role: 'assistant', content: 'hello' }];
      const before = structuredClone(history);
      const reply = await createAiClient({ ...backupOptions, timeoutMs: 5 }).continue(history, 'private message', 'owner');
      assert.deepEqual(history, before);
      assert.deepEqual(reply.verdict, { result: 'pass', reason: 'kind' });
      assert.equal(reply.text, 'welcome.');
      assert.equal(reply.history.length, 3);
      const backup = calls.at(-1)!;
      assert.equal(backup.url, 'https://ai.hackclub.com/proxy/v1/chat/completions');
      assert.equal(backup.headers.get('authorization'), 'Bearer backup-secret');
      assert.deepEqual(backup.body, {
        model: 'anthropic/claude-haiku-5.5', max_tokens: 1024, stream: false,
        messages: [{ role: 'system', content: officerPrompt() }, ...before, { role: 'user', content: ownerNote('private message') }],
      });
      assert.deepEqual(calls[0].body.messages, backup.body.messages.slice(1));
      assert.equal(calls.filter((call) => call.url.includes('hackclub')).length, 1);
      assert.match(warnings.join(' '), /command code -> Hack Club AI/);
      assert.doesNotMatch(warnings.join(' '), /primary-secret|backup-secret|private message/);
    } finally {
      clearInterval(keepAlive);
    }
  });
}

test('primary is retried first on every turn after a backup success and model override is honored', async () => {
  const provider = stubProvider([
    { status: 400, body: {} },
    { body: { choices: [{ message: { content: 'hello' } }] } },
    { body: { content: [{ type: 'text', text: 'no.\nVERDICT: {"result":"fail","reason":"spam"}' }] } },
  ]);
  try {
    const ai = createAiClient({ ...backupOptions, hackclubModel: 'custom/model' });
    const opening = await ai.start('tester');
    const closing = await ai.continue(opening.history, 'answer');
    assert.equal(provider.calls[1].body.model, 'custom/model');
    assert.match(provider.calls[2].url, /commandcode/);
    assert.equal(provider.calls.length, 3);
    assert.deepEqual(closing.verdict, { result: 'fail', reason: 'spam' });
  } finally { provider.restore(); }
});

for (const body of [
  { choices: [{ message: { content: 'no thanks' } }] },
  { choices: [{ message: { content: null, refusal: 'no thanks' } }] },
  { choices: [{ message: { content: 'no.\nVERDICT: {"result":"fail","reason":"spam"}' } }] },
]) {
  test('usable primary completions, refusals and verdicts never trigger backup', async () => {
    const provider = stubProvider([{ body }]);
    try {
      await createAiClient({ ...backupOptions, model: 'chat-model' }).start('tester');
      assert.equal(provider.calls.length, 1);
    } finally { provider.restore(); }
  });
}

for (const body of [null, { choices: [{ message: { content: 123 } }] }, { choices: [] }]) {
  test('both providers failing produces only sanitized errors and preserves input', async () => {
    const provider = stubProvider([{ status: 400, body: { error: { message: 'primary-secret' } } }, { body }]);
    const history: WireMessage[] = [{ role: 'assistant', content: 'private message' }];
    try {
      await assert.rejects(createAiClient(backupOptions).continue(history, 'answer'), (error: Error) => {
        assert.match(error.message, /AI providers failed/);
        assert.doesNotMatch(error.stack!, /primary-secret|backup-secret|private message/);
        return true;
      });
      assert.equal(provider.calls.length, 2);
      assert.deepEqual(history, [{ role: 'assistant', content: 'private message' }]);
    } finally { provider.restore(); }
  });
}

test('mock mode bypasses both configured providers', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected HTTP'); });
  const ai = createAiClient({ ...backupOptions, mock: true });
  const opening = await ai.start('tester');
  await ai.continue(opening.history, 'answer');
  assert.equal(fetch.mock.callCount(), 0);
});

test('application errors do not trigger backup', async () => {
  const provider = stubProvider([{ body: {} }]);
  try {
    await assert.rejects(createAiClient({ ...backupOptions, timeoutMs: -1 }).start('tester'), RangeError);
    assert.equal(provider.calls.length, 0);
  } finally { provider.restore(); }
});

for (const kind of ['http', 'network', 'timeout'] as const) {
  test(`backup ${kind} failure is sanitized and never retried`, async (t) => {
    let calls = 0;
    t.mock.method(console, 'warn', () => {});
    t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      calls += 1;
      if (!url.includes('hackclub')) return Response.json({}, { status: 400 });
      if (kind === 'network') throw new Error('backup-secret private message');
      if (kind === 'timeout') {
        await new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true }));
      }
      return Response.json({ error: { message: 'backup-secret private message' } }, { status: 503 });
    });
    const keepAlive = setInterval(() => {}, 1000);
    try {
      await assert.rejects(createAiClient({ ...backupOptions, timeoutMs: 5 }).start('tester'), (error: Error) => {
        assert.equal(error.message, `AI providers failed: command code (http); Hack Club AI (${kind})`);
        return true;
      });
      assert.equal(calls, 2);
    } finally { clearInterval(keepAlive); }
  });
}

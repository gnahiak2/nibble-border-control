import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { newInterview } from './interview.js';
import { InterviewStore } from './store.js';

function interview(key: string) {
  return newInterview({
    channelId: key.split(':')[0],
    threadTs: key.split(':')[1],
    userId: 'U1',
    userName: 'tester',
  });
}

test('round-trips interviews through the json snapshot', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'border-store-')), 'interviews.json');
  const store = new InterviewStore(file);

  store.set(interview('C1:111'));

  const reloaded = new InterviewStore(file);
  assert.equal(reloaded.get('C1:111')?.userName, 'tester');
  assert.equal(reloaded.get('C1:111')?.status, 'active');
});

test('keeps serving interviews when the snapshot cannot be written', () => {
  const dir = mkdtempSync(join(tmpdir(), 'border-ro-'));
  const store = new InterviewStore(join(dir, 'interviews.json'));
  const logged: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    // a data dir the process cannot write to: a read-only mount, or a bind mount owned by
    // another uid, which is exactly how this failed in the container
    chmodSync(dir, 0o555);
    assert.doesNotThrow(() => store.set(interview('C1:222')));

    assert.equal(store.get('C1:222')?.userName, 'tester');
    assert.ok(
      logged.some((line) => line.includes('interviews continue in memory')),
      `expected a write warning, got: ${logged.join(' | ')}`,
    );
  } finally {
    console.error = originalError;
    chmodSync(dir, 0o755);
  }
});

test('a corrupt snapshot does not stop the store from starting', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'border-corrupt-')), 'interviews.json');
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    const first = new InterviewStore(file);
    first.set(interview('C1:333'));
    // truncate it, as a killed container mid-write would
    writeFileSync(file, '{"half":');

    const reopened = new InterviewStore(file);
    assert.equal(reopened.get('C1:333'), undefined);
    assert.ok(readFileSync(file, 'utf8').startsWith('{"half":'));
  } finally {
    console.warn = originalWarn;
  }
});

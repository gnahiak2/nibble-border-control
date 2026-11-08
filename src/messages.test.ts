import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROMISE_TEXT, agreedOnPost, buildPromise, channelPromiseText, readPromises, savePromise } from "./agreement";
import { channelPromiseMessage, copy, entryForm, readAnswers, reviewMessage, welcomeMessage } from "./messages";

const origin = { user: "U1", channel: "C1", ts: "1.1" };

test("welcome message mentions the arrival and carries their id on the button", () => {
  const msg = welcomeMessage("U1");
  expect(msg.text).toContain("<@U1>");
  expect(JSON.stringify(msg.blocks)).toContain('"value":"U1"');
});

test("entry form round-trips its origin and has the promise checkbox", () => {
  const view = entryForm(origin);
  expect(JSON.parse(view.private_metadata!)).toEqual(origin);
  expect(view.blocks.some((b: any) => b.block_id === "promise")).toBe(true);
  expect(JSON.stringify(view.blocks)).not.toMatch(/legal|liquidated|signature/i);
});

test("readAnswers maps the promise checkbox", () => {
  const base = { name: { value: { value: " kai " } }, found: { value: { value: "a friend" } }, why: { value: { value: "vibes" } } };
  expect(readAnswers({ ...base, promise: { value: { selected_options: [{ value: "promise" }] } } })).toEqual({
    name: "kai", found: "a friend", why: "vibes", promised: true,
  });
  expect(readAnswers({ ...base, promise: { value: { selected_options: [] } } }).promised).toBe(false);
});

test("promise record pins the exact text and is appended to the log", async () => {
  const r = buildPromise({ slackUserId: "U1", slackTeamId: "T1", name: "kai", now: new Date("2026-11-08T12:00:00Z") });
  expect(r.promisedAt).toBe("2026-11-08T12:00:00.000Z");
  expect(r.promiseText).toBe(PROMISE_TEXT);
  expect(r.promiseSha256).toMatch(/^[0-9a-f]{64}$/);

  const file = join(await mkdtemp(join(tmpdir(), "bc-")), "nested", "promises.jsonl");
  await savePromise(file, r);
  await savePromise(file, { ...r, slackUserId: "U2" });
  const lines = (await readFile(file, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
  expect(lines.map((l) => l.slackUserId)).toEqual(["U1", "U2"]);
  expect(copy.promiseCopy(r)).toContain("No screenshots");
  expect(copy.promiseCopy(r)).toContain("common sense");
});

test("review message has approve and deny with the origin and the promise", () => {
  const r = buildPromise({ slackUserId: "U1", name: "kai" });
  const json = JSON.stringify(reviewMessage(origin, { name: "a", found: "b", why: "c", promised: true }, r).blocks);
  expect(json).toContain("approve_application");
  expect(json).toContain("deny_application");
  expect(json).toContain("*Promise:* made at");
});

test("channel promise post has the I agree button and lists who agreed", () => {
  const empty = JSON.stringify(channelPromiseMessage("UOWNER", []).blocks);
  expect(empty).toContain("agree_channel_promise");
  expect(empty).toContain("<@UOWNER>'s life");
  expect(empty).toContain("Nobody has yet");
  const some = JSON.stringify(channelPromiseMessage(undefined, ["U1", "U2"]).blocks);
  expect(some).toContain("Agreed (2): <@U1> <@U2>");
  expect(some).toContain("whoever runs this channel");
});

test("agreedOnPost dedupes per post and ignores entry-form promises", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "bc-")), "promises.jsonl");
  expect(await readPromises(file)).toEqual([]);
  const text = channelPromiseText();
  await savePromise(file, buildPromise({ slackUserId: "U1", source: "channel_post", postTs: "9.9", text }));
  await savePromise(file, buildPromise({ slackUserId: "U2", source: "channel_post", postTs: "9.9", text }));
  await savePromise(file, buildPromise({ slackUserId: "U1", source: "channel_post", postTs: "9.9", text }));
  await savePromise(file, buildPromise({ slackUserId: "U3", source: "channel_post", postTs: "8.8", text }));
  await savePromise(file, buildPromise({ slackUserId: "U4", name: "x" }));
  const records = await readPromises(file);
  expect(agreedOnPost(records, "9.9")).toEqual(["U1", "U2"]);
  expect(records[0].promiseText).toBe(text);
  expect(records[4].source).toBe("entry_form");
});

import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROMISE_TEXT, buildPromise, savePromise } from "./agreement";
import { copy, entryForm, readAnswers, reviewMessage, validateAnswers, welcomeMessage } from "./messages";

const origin = { user: "U1", channel: "C1", ts: "1.1" };

test("welcome message mentions the arrival and carries their id on the button", () => {
  const msg = welcomeMessage("U1");
  expect(msg.text).toContain("<@U1>");
  expect(JSON.stringify(msg.blocks)).toContain('"value":"U1"');
});

test("entry form round-trips its origin and shows the promise in a box with one checkbox", () => {
  const view = entryForm(origin);
  expect(JSON.parse(view.private_metadata!)).toEqual(origin);
  const ids = view.blocks.map((b: any) => b.block_id);
  expect(ids).toContain("promise");
  expect(ids).not.toContain("signature");
  const box = view.blocks.find((b: any) => b.type === "rich_text") as any;
  expect(box.elements[0].type).toBe("rich_text_preformatted");
  expect(box.elements[0].elements[0].text).toBe(PROMISE_TEXT);
  expect(PROMISE_TEXT).toContain("Not sure?");
});

test("validateAnswers only needs the box ticked", () => {
  const ok = { name: "a", found: "b", why: "c", promised: true };
  expect(validateAnswers(ok)).toEqual({});
  expect(validateAnswers({ ...ok, promised: false })).toHaveProperty("promise");
});

test("readAnswers maps the promise checkbox", () => {
  const base = {
    name: { value: { value: " kai " } },
    found: { value: { value: "a friend" } },
    why: { value: { value: "vibes" } },
  };
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
  expect(copy.promiseCopy(r)).toContain(PROMISE_TEXT);
});

test("review message has approve and deny with the origin and the promise", () => {
  const r = buildPromise({ slackUserId: "U1", name: "kai" });
  const answers = { name: "a", found: "b", why: "c", promised: true };
  const json = JSON.stringify(reviewMessage(origin, answers, r).blocks);
  expect(json).toContain("approve_application");
  expect(json).toContain("deny_application");
  expect(json).toContain("*Promise:* ticked");
});

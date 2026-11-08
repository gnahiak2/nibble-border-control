import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROMISE_POINTS, PROMISE_TEXT, buildPromise, savePromise } from "./agreement";
import { copy, entryForm, readAnswers, reviewMessage, validateAnswers, welcomeMessage } from "./messages";

const origin = { user: "U1", channel: "C1", ts: "1.1" };

test("welcome message mentions the arrival and carries their id on the button", () => {
  const msg = welcomeMessage("U1");
  expect(msg.text).toContain("<@U1>");
  expect(JSON.stringify(msg.blocks)).toContain('"value":"U1"');
});

test("entry form round-trips its origin and has the contract, agree box and signature", () => {
  const view = entryForm(origin);
  expect(JSON.parse(view.private_metadata!)).toEqual(origin);
  const ids = view.blocks.map((b: any) => b.block_id);
  expect(ids).toContain("promise");
  expect(ids).toContain("signature");
  const json = JSON.stringify(view.blocks);
  expect(json).toContain("Channel Confidentiality Agreement");
  expect(json).toContain("Permitted sharing");
  expect(view.blocks.length).toBeLessThanOrEqual(100);
  for (const c of PROMISE_POINTS) expect(c.length).toBeLessThan(3000);
});

test("validateAnswers needs the box ticked and a full name", () => {
  const ok = { name: "a", found: "b", why: "c", promised: true, signedName: "Kai Example" };
  expect(validateAnswers(ok)).toEqual({});
  expect(validateAnswers({ ...ok, promised: false })).toHaveProperty("promise");
  expect(validateAnswers({ ...ok, signedName: "kai" })).toHaveProperty("signature");
  expect(validateAnswers({ ...ok, signedName: "" })).toHaveProperty("signature");
});

test("readAnswers maps the promise checkbox", () => {
  const base = {
    name: { value: { value: " kai " } },
    found: { value: { value: "a friend" } },
    why: { value: { value: "vibes" } },
    signature: { value: { value: "  Kai   Example " } },
  };
  expect(readAnswers({ ...base, promise: { value: { selected_options: [{ value: "promise" }] } } })).toEqual({
    name: "kai", found: "a friend", why: "vibes", promised: true, signedName: "Kai Example",
  });
  expect(readAnswers({ ...base, promise: { value: { selected_options: [] } } }).promised).toBe(false);
});

test("promise record pins the exact text and is appended to the log", async () => {
  const r = buildPromise({ slackUserId: "U1", slackTeamId: "T1", name: "kai", signedName: "Kai Example", now: new Date("2026-11-08T12:00:00Z") });
  expect(r.promisedAt).toBe("2026-11-08T12:00:00.000Z");
  expect(r.promiseText).toBe(PROMISE_TEXT);
  expect(r.promiseSha256).toMatch(/^[0-9a-f]{64}$/);

  const file = join(await mkdtemp(join(tmpdir(), "bc-")), "nested", "promises.jsonl");
  await savePromise(file, r);
  await savePromise(file, { ...r, slackUserId: "U2" });
  const lines = (await readFile(file, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
  expect(lines.map((l) => l.slackUserId)).toEqual(["U1", "U2"]);
  expect(copy.promiseCopy(r)).toContain("signed as *Kai Example*");
  expect(copy.promiseCopy(r)).toContain("common sense");
});

test("review message has approve and deny with the origin and the promise", () => {
  const r = buildPromise({ slackUserId: "U1", name: "kai", signedName: "Kai Example" });
  const answers = { name: "a", found: "b", why: "c", promised: true, signedName: "Kai Example" };
  const json = JSON.stringify(reviewMessage(origin, answers, r).blocks);
  expect(json).toContain("approve_application");
  expect(json).toContain("deny_application");
  expect(json).toContain("signed as *Kai Example*");
});

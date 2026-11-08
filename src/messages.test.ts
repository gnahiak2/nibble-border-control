import { expect, test } from "bun:test";
import { entryForm, readAnswers, reviewMessage, welcomeMessage } from "./messages";

const origin = { user: "U1", channel: "C1", ts: "1.1" };

test("welcome message mentions the arrival and carries their id on the button", () => {
  const msg = welcomeMessage("U1");
  expect(msg.text).toContain("<@U1>");
  expect(JSON.stringify(msg.blocks)).toContain('"value":"U1"');
});

test("entry form round-trips its origin and has the clause", () => {
  const view = entryForm(origin);
  expect(JSON.parse(view.private_metadata!)).toEqual(origin);
  expect(view.blocks.some((b: any) => b.block_id === "clause")).toBe(true);
});

test("readAnswers maps yes/no clause", () => {
  const base = { name: { value: { value: " kai " } }, found: { value: { value: "a friend" } }, why: { value: { value: "vibes" } } };
  expect(readAnswers({ ...base, clause: { value: { selected_option: { value: "yes" } } } })).toEqual({
    name: "kai", found: "a friend", why: "vibes", agreed: true,
  });
  expect(readAnswers({ ...base, clause: { value: { selected_option: { value: "no" } } } }).agreed).toBe(false);
});

test("review message has approve and deny with the origin", () => {
  const json = JSON.stringify(reviewMessage(origin, { name: "a", found: "b", why: "c", agreed: true }).blocks);
  expect(json).toContain("approve_application");
  expect(json).toContain("deny_application");
});

import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agreementClauses, agreementText, buildSignature, saveSignature } from "./agreement";
import { entryForm, readAnswers, reviewMessage, validateAnswers, welcomeMessage } from "./messages";

const origin = { user: "U1", channel: "C1", ts: "1.1" };
const terms = { ownerName: "Kai Example", fine: "$500 USD" };

test("welcome message mentions the arrival and carries their id on the button", () => {
  const msg = welcomeMessage("U1");
  expect(msg.text).toContain("<@U1>");
  expect(JSON.stringify(msg.blocks)).toContain('"value":"U1"');
});

test("entry form round-trips its origin and has the undertaking, checkboxes and signature", () => {
  const view = entryForm(origin, terms);
  expect(JSON.parse(view.private_metadata!)).toEqual(origin);
  const ids = view.blocks.map((b: any) => b.block_id);
  expect(ids).toContain("agree");
  expect(ids).toContain("signature");
  expect(JSON.stringify(view.blocks)).toContain("$500 USD for each breach");
  expect(view.blocks.length).toBeLessThanOrEqual(100);
  for (const c of agreementClauses(terms)) expect(c.length).toBeLessThan(3000);
});

test("clauses adapt to missing fine and optional governing law", () => {
  const plain = agreementText({ ownerName: "X" });
  expect(plain).not.toContain("liquidated");
  expect(plain).not.toContain("Governing law");
  expect(agreementText({ ownerName: "X", governingLaw: "the laws of England and Wales" })).toContain("Governing law");
});

const base = {
  name: { value: { value: " kai " } },
  found: { value: { value: "a friend" } },
  why: { value: { value: "vibes" } },
  signature: { value: { value: "  Kai   Example " } },
};

test("readAnswers maps checkboxes and normalises the signature", () => {
  const both = { selected_options: [{ value: "agree" }, { value: "adult" }] };
  expect(readAnswers({ ...base, agree: { value: both } })).toEqual({
    name: "kai", found: "a friend", why: "vibes", legalName: "Kai Example", agreed: true, adult: true,
  });
  const none = readAnswers({ ...base, agree: { value: { selected_options: [] } } });
  expect(none.agreed).toBe(false);
  expect(none.adult).toBe(false);
});

test("validateAnswers requires both boxes and a full name", () => {
  const ok = { name: "a", found: "b", why: "c", legalName: "Kai Example", agreed: true, adult: true };
  expect(validateAnswers(ok)).toEqual({});
  expect(validateAnswers({ ...ok, adult: false })).toHaveProperty("agree");
  expect(validateAnswers({ ...ok, agreed: false })).toHaveProperty("agree");
  expect(validateAnswers({ ...ok, legalName: "kai" })).toHaveProperty("signature");
});

test("signature record pins the exact text and is appended to the log", async () => {
  const now = new Date("2026-11-08T12:00:00Z");
  const sig = buildSignature({ terms, slackUserId: "U1", slackTeamId: "T1", legalName: "Kai Example", confirmedAdult: true, now });
  expect(sig.signedAt).toBe("2026-11-08T12:00:00.000Z");
  expect(sig.agreementText).toBe(agreementText(terms));
  expect(sig.agreementSha256).toMatch(/^[0-9a-f]{64}$/);

  const file = join(await mkdtemp(join(tmpdir(), "bc-")), "nested", "agreements.jsonl");
  await saveSignature(file, sig);
  await saveSignature(file, { ...sig, slackUserId: "U2" });
  const lines = (await readFile(file, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
  expect(lines.map((l) => l.slackUserId)).toEqual(["U1", "U2"]);
});

test("review message has approve and deny with the origin and the signature", () => {
  const sig = buildSignature({ terms, slackUserId: "U1", legalName: "Kai Example", confirmedAdult: true });
  const answers = { name: "a", found: "b", why: "c", legalName: "Kai Example", agreed: true, adult: true };
  const json = JSON.stringify(reviewMessage(origin, answers, sig).blocks);
  expect(json).toContain("approve_application");
  expect(json).toContain("deny_application");
  expect(json).toContain("signed as *Kai Example*");
});

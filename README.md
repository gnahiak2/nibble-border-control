# nibble-border-control

a slack bot that guards a channel.

```
someone joins the welcome channel
  └─▶ bot posts a welcome message + [ Fill in entry form ] button
        └─▶ applicant opens the form: name, how they found you, why they want in,
            then a confidentiality undertaking they must sign:
              tick "I agree to be legally bound" + "I am 18 or older", type full legal name
              ├─ not signed ─▶ form won't submit (they can just cancel)
              └─ signed     ─▶ signature appended to AGREEMENTS_FILE + copy DMed to them
                                 OWNER_SLACK_ID set?  ─▶ DMed to you with Approve / Deny
                                 not set?             ─▶ auto-approved
                                        approved ─▶ invited to the approved channel
```

## the confidentiality undertaking

a promise one step lighter than a full NDA: plain-language clauses covering what's confidential, the
promise not to share it (screenshots, paraphrasing, AI tools…), standard exceptions, access to the channel as
what they get in exchange, what happens on breach (an agreed amount per breach if `BREACH_FINE` is set),
that it continues after they leave, and an electronic-signature clause. wording lives in `src/agreement.ts`;
bump `AGREEMENT_VERSION` whenever you change it.

each signature is one JSON line in `AGREEMENTS_FILE` (default `data/agreements.jsonl`) with the slack user
and team id, the typed legal name, the 18+ confirmation, an ISO timestamp, the full text they agreed to and
its sha256. that file is your evidence, so back it up. if it can't be written the applicant isn't let in.

not legal advice: whether it holds up (and whether a fixed fine counts as fair "liquidated damages" or as an
unenforceable penalty) depends on where you and they live. get a lawyer to look at it before relying on it.

## setup

1. **create the app** at <https://api.slack.com/apps> → create new app → from a manifest →
   paste `slack-manifest.yml`.
2. **tokens**: basic information → app-level token with `connections:write` = `SLACK_APP_TOKEN`;
   install to workspace → bot token = `SLACK_BOT_TOKEN`.
3. **invite the bot** to both the welcome channel and the approved channel
   (`/invite @border control`).
4. **configure**: `cp .env.example .env` and fill it in (channel id = the `C…` at the end of a
   channel's link; your user id is under your profile → ⋮ → copy member id).
5. **run**:

```bash
bun install
bun start        # or: bun dev (restarts on change)
bun test
bun run typecheck
```

`.claude/` and `.remember/` are gitignored, so nothing personal gets committed.

## docker

```bash
cp .env.example .env   # fill it in
docker compose up -d --build
docker compose logs -f
```

socket mode means no ports need exposing.

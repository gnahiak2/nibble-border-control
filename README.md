# nibble-border-control

a slack bot that guards a channel.

```
someone joins the welcome channel
  └─▶ bot posts a welcome message + [ Fill in entry form ] button
        └─▶ applicant opens the form: name, how they found you, why they want in,
            then the promise: tick "I promise to keep everything in the channel private"
              ├─ not ticked ─▶ form won't submit (they can just cancel)
              └─ ticked     ─▶ promise logged to PROMISES_FILE + a copy DMed to them
                                 OWNER_SLACK_ID set?  ─▶ DMed to you with Approve / Deny
                                 not set?             ─▶ auto-approved
                                        approved ─▶ invited to the approved channel
```

## the promise

a plain promise, not a contract: what stays in the channel, no sharing it anywhere (screenshots, forwarding,
retelling, AI tools), that breaking it gets you removed for good, and that it still counts after you leave.
wording lives in `PROMISE_POINTS` in `src/agreement.ts`; bump `PROMISE_VERSION` when you change it.

each promise is one JSON line in `PROMISES_FILE` (default `data/promises.jsonl`): slack user and team id,
the name they gave, when, and the exact text they promised. if it can't be saved they aren't let in.

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

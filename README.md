# nibble-border-control

nibble, but border control.

a slack bot that guards a channel. when someone joins the welcome channel, it posts them a
welcome message with a button. pressing the button starts an ai immigration interview in that
message's thread — a deadpan border-control officer who asks a few questions, then decides.
pass and you get invited to the approved channel. fail and you can reapply.

## how it works

```
someone joins #border-arrivals
        │
        ▼
bot posts welcome message + [ start immigration interview ] button
        │
        ▼  (applicant presses the button)
ai officer asks one question at a time, in the welcome message's thread
        │
        ▼  (applicant replies in the thread)
officer decides, ending its reply with:
    VERDICT: {"result": "pass" | "fail", "reason": "…"}
        │
   pass ├─▶ visa stamp in the thread + invited to the approved channel + welcome note there
   fail └─▶ denial note in the thread (press the button again to reapply)
```

- interviews are keyed per welcome message, so each arrival gets their own thread
- only the applicant can start their own interview and answer in it
- interview state and the full officer transcript are snapshotted to `data/interviews.json`, so a
  bot restart mid-interview doesn't lose the thread

## requirements

- [bun](https://bun.sh) 1.1+ — runs the bot and its typescript directly, no build step. the tests
  and `typecheck` still use node 20+ and `tsc`
- a [command code](https://commandcode.ai) account with api access — every plan except Go
  (GOAT, Pro, Max, Team, and Provider). the officer interviews through the
  [provider api](https://commandcode.ai/docs/provider), so no other model key is needed
- a slack workspace where you can install an app

## setup

### 1. create the slack app

create a new app from the manifest in this repo: <https://api.slack.com/apps> →
**create new app** → **from an app manifest** → pick your workspace → paste `slack-manifest.yml`.

then, on the app's **basic information** page:

- **app-level token**: generate one with the `connections:write` scope → that's `SLACK_APP_TOKEN`
- **bot token**: install the app to the workspace → that's `SLACK_BOT_TOKEN`
- **socket mode** is already enabled by the manifest (no public url needed)

scopes and events the manifest declares:

| | |
|---|---|
| bot scopes | `chat:write`, `channels:read`, `channels:history`, `channels:manage`, `groups:write`, `groups:history`, `users:read` |
| bot events | `member_joined_channel`, `message.channels` |
| interactivity | on (the `start_interview` button) |

### 2. invite the bot to both channels

`/invite @border control` in the welcome channel **and** in the approved channel. it needs to be
in the approved channel to invite people into it, and in the welcome channel to post and read
thread replies.

### 3. configure

```bash
cp .env.example .env
```

then fill in the tokens, an api key from <https://commandcode.ai/settings/keys>, and both channel
ids (right-click a channel → **copy link** — the id is the `C…` at the end). if `CMD_API_KEY` is
left blank, the key stored by `cmd login` in `~/.commandcode/auth.json` is used instead.

### 4. run

```bash
bun install
bun run dev        # or: bun start
```

try the flow with `AI_MOCK=1` first: the interview is scripted and always passes, so you can
verify the button, the thread, and the invite without spending model calls.

or run it in a container:

```bash
docker compose up --build -d
docker compose logs -f
```

`compose.yml` reads everything from `.env` — set `CMD_API_KEY` there, since the container has no
`~/.commandcode/auth.json` to fall back on. interviews are snapshotted into a named volume
(`border-data`), not a host directory: docker seeds a fresh volume with the image's ownership, so
the non-root `bun` user can always write it, whereas a bind mount inherits the host directory's uid
and the officer's transcript write fails with `EACCES`. to read the snapshot:

```bash
docker compose exec border-control cat /app/data/interviews.json
```

## configuration

| variable | default | what it does |
|---|---|---|
| `SLACK_BOT_TOKEN` | — | bot token (`xoxb-…`), required |
| `SLACK_APP_TOKEN` | — | app-level token (`xapp-…`) with `connections:write`, required |
| `WELCOME_CHANNEL_ID` | — | channel where arrivals get the welcome message + button, required |
| `APPROVED_CHANNEL_ID` | — | channel that passers are invited to, required |
| `AI_MODEL` | `claude-haiku-5-5` | model id for the officer; any id from `https://api.commandcode.ai/provider/v1/models` |
| `CMD_API_KEY` | from `~/.commandcode/auth.json` | command code api key with provider api access |
| `AI_MOCK` | off | `1` = scripted interview, no ai calls |

## notes

- **the model**: the default officer model is `claude-haiku-5-5`, which needs GOAT or above. the
  older `claude-haiku-4-5-20251001` needs Pro or above and answers `403 MODEL_NOT_IN_PLAN` on
  GOAT, so check your plan before switching.
- **how the ai is called**: the [command code provider api](https://commandcode.ai/docs/provider)
  directly — one `POST` per interview turn, no CLI subprocess. claude models answer on
  `/provider/v1/messages` (anthropic wire, officer prompt as `system`); every other model answers
  on `/provider/v1/chat/completions`, picked from the model id. the officer's transcript lives in
  the interview record and is replayed in full on each turn, so context survives a restart.
  auth is `Authorization: Bearer <CMD_API_KEY>`.
- **flaky provider turns**: a turn is retried up to 3 times (0.5s, then 2s) when the failure could
  plausibly be transient — a network error or timeout, a `429`, a `5xx`, or the `403
  "Authentication failed"` the provider intermittently returns for a perfectly valid key. errors
  that will not change on a retry, like `MODEL_NOT_IN_PLAN`, fail immediately. retries are logged
  with the attempt number.
- **the transcript snapshot is best-effort**: if `data/interviews.json` can't be written (read-only
  mount, wrong uid), it logs and carries on. the running interview lives in memory, so an
  unwritable data dir costs you the restart snapshot, not the conversation.
- **the verdict**: the officer's prompt requires a final line of
  `VERDICT: {"result": "pass" | "fail", "reason": "…"}`. that line is parsed and stripped; the
  rest is posted to the thread. malformed or missing verdicts are treated as ordinary chatter.
- **policy**: this is playful gatekeeping, not real access control. the officer passes anyone who
  engages in good faith and fails obvious nonsense, spam, or hostility.

## development

```bash
bun run dev         # bun --watch, restarts on save
bun run typecheck   # tsc --noEmit
bun test            # bun's runner, or: bun run test for node --test
```

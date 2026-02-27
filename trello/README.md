# Trello CLI Tool (`trello/`)

Command-line tool for managing Trello boards, lists, and cards.

## What it does

This tool supports:

- Auth validation (`me`)
- Listing boards (`boards`)
- Syncing and inspecting board state (`sync`, `overview`)
- Creating tasks in Inbox (`inboxAdd`)
- Creating cards in specific lists (`createCard`)
- Moving cards across lists (`moveCard`)
- Assigning members to cards (`assign`)
- Deadline-focused views (`deadlines`)

## Install

From inside `trello/`:

```bash
npm install
```

## Credentials required

- `TRELLO_KEY`
- `TRELLO_TOKEN`

Optional defaults:

- `TRELLO_DEFAULT_BOARD_ID`
- `TRELLO_DEFAULT_INBOX_LIST_ID`

## Credential setup options

### Option A: session environment

```bash
export TRELLO_KEY="your_trello_key"
export TRELLO_TOKEN="your_trello_token"
```

### Option B: `.env` file in `trello/`

```env
TRELLO_KEY=your_trello_key
TRELLO_TOKEN=your_trello_token
TRELLO_DEFAULT_BOARD_ID=your_board_id
```

> `.env` is gitignored in this repo.

## Getting Trello key/token

1. Create/login to your Trello/Atlassian account.
2. Generate an API key from Trello developer settings.
3. Generate a token with access to the target boards.
4. Store them as env vars shown above.

## First-use workflow (recommended)

```bash
node trello.js --action me
node trello.js --action boards
node trello.js --action sync --boardId <realBoardId>
node trello.js --action overview --boardId <realBoardId>
```

Then create/move/assign cards using real IDs from output.

## Common usage

```bash
node trello.js --action inboxAdd --boardId <realBoardId> --name "Follow up"
node trello.js --action createCard --listId <realListId> --name "Draft proposal"
node trello.js --action moveCard --cardId <realCardId> --list "Doing"
node trello.js --action deadlines --boardId <realBoardId> --days 7
```

## Notes for OpenClaw skills

- Action names must match exactly (e.g. `createCard`, not `create-card`).
- IDs must be real Trello IDs discovered from `boards/sync/overview`.
- If you see `invalid value for idList`, refresh IDs with `sync` and retry.

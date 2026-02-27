# usefulOpenClawNodeCLITools

A repo of practical Node.js CLI tools you can drop into your OpenClaw setup.

> **Short version:** each folder in this repo is a standalone CLI tool. Copy the folder into `~/.openclaw/mytools/`, run `npm install` inside that folder, add your credentials, and call the tool from a skill.

---

## Why this repo exists

This repository is designed for people who use OpenClaw and want reusable, scriptable tools for real workflows (CRM ops, task management, job search, etc.).

- Tools are kept in separate folders so you can install only what you need.
- The repo is intended to update regularly, so you can pull new tool folders over time.
- You can keep credentials in your local session/environment (instead of hardcoding them in scripts).

---

## Folder layout and install model

Each top-level folder is one tool:

- `trello/` → Trello task/board operations
- `hubspot/` → OpenAI + Zapier MCP operations wrapper
- `jobSearch/` → Remotive remote job search CLI

For each tool, there is a dedicated README in that folder with exact usage and required credentials.

---

## Quick start for OpenClaw users

1. Clone or download this repo.
2. Copy one or more tool folders into your OpenClaw tools path (example: `~/.openclaw/mytools/`).
3. For each copied folder, run:
   ```bash
   npm install
   ```
4. Configure credentials (session env vars or `.env`; examples below).
5. Update OpenClaw config so command execution is allowed and your `PATH` includes Node/npm locations.
6. Train/update your skill so it knows which tool to call and with what arguments.

---

## OpenClaw `openclaw.json` execution config

Your tools need command execution to be enabled. In `openclaw.json`, you should have an `exec` block conceptually like:

```json
{
  "exec": {
    "host": "gateway",
    "security": "full",
    "ask": "off",
    "pathPrepend": [
      "/path/to/your/node/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin"
    ]
  }
}
```

### How to find your own paths

Use these commands and add the directories they return:

```bash
which node
which npm
npm bin -g
```

Then include those directories in `pathPrepend`.

---

## Credentials: two supported patterns

### Option A (session-only env vars)
Good for temporary usage in a terminal session:

```bash
export SOME_API_KEY="..."
export OTHER_TOKEN="..."
node yourtool.js --help
```

### Option B (`.env` file)
Good for persistent local setup:

1. Create `.env` inside the tool folder.
2. Add key/value pairs, e.g. `API_KEY=...`.
3. Ensure `.env` is ignored by git (this repo already ignores `.env`).

Most tools here load `.env` via `dotenv`.

---

## Security warning (important)

Enabling command execution (`security: full`, `ask: off`) is powerful and risky.

- Only run tools you trust.
- Read the code yourself before use.
- Scope credentials to least privilege.
- Rotate keys if you suspect leakage.

Node.js CLIs are just local programs that can read environment variables, call APIs, and write files—treat them like any executable code.

---

## Collaboration and contribution policy

Contributions are welcome. If you want to share a tool:

1. Add it as a separate folder.
2. Include a clear README with setup + credential requirements.
3. Include safe defaults and argument validation.
4. Assume all incoming tools will undergo **strict security review**.

No guarantees are made about safety of third-party contributed tools. Always audit code before running it.

---

## Read each tool README next

- [trello/README.md](trello/README.md)
- [hubspot/README.md](hubspot/README.md)
- [jobSearch/README.md](jobSearch/README.md)

And again: please read source code yourself before running in a privileged environment.

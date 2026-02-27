# HubSpot Ops CLI (`hubspot/`)

CLI wrapper that sends structured operational instructions to OpenAI Responses API with a Zapier MCP server tool attached.

## What it does

You provide:

- `--org` (organization context)
- `--project` (project context)
- `--instruction` (what to do)

The tool builds a strict prompt and lets the model use Zapier MCP tools when needed.

## Install

From inside `hubspot/`:

```bash
npm install
```

## Credentials / config required

- `OPENAI_API_KEY`
- `ZAPIER_MCP_URL`

Optional:

- `OPENAI_MODEL` (default fallback is `gpt-4.1`)

## Credential setup options

### Option A: session environment

```bash
export OPENAI_API_KEY="..."
export ZAPIER_MCP_URL="https://your-mcp-endpoint"
export OPENAI_MODEL="gpt-4.1"
```

### Option B: `.env` file in `hubspot/`

```env
OPENAI_API_KEY=...
ZAPIER_MCP_URL=https://your-mcp-endpoint
OPENAI_MODEL=gpt-4.1
```

## Getting keys/endpoints

- **OpenAI key:** from your OpenAI account API keys page.
- **Zapier MCP URL:** from your Zapier MCP/server setup or team admin.

If either value is missing, the script exits with a clear error.

## Usage

```bash
node hubspot.js \
  --org "Acme Inc" \
  --project "Q1 Pipeline Cleanup" \
  --instruction "Create follow-up tasks for stale deals older than 30 days"
```

Helpful options:

- `--model <name>`
- `--tool-choice auto|required`
- `--approval never|...`
- `--json` (prints full response JSON)
- `--help`

## Notes for OpenClaw skills

- This tool is best when your skill can gather org/project context first.
- Keep instructions concrete and auditable.
- Use least-privilege credentials for MCP-connected systems.

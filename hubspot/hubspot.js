#!/usr/bin/env node
/**
 * BOT INSTRUCTIONS (READ THIS FIRST)
 * ----------------------------------
 * You are executing an operational task with access to Zapier MCP tools.
 *
 * REQUIRED INPUTS (provided by this CLI)
 * - Organization context
 * - Project context
 * - Instruction
 *
 * BEHAVIOR
 * - Use the provided organization + project context to interpret the instruction correctly.
 * - Use available MCP tools when needed.
 * - If the task cannot be completed, explain exactly what is missing.
 * - Prefer precise, actionable output.
 *
 * REQUIRED OUTPUT FORMAT
 * 1) Summary of what you did
 * 2) Actions taken (if any)
 * 3) Results / records affected
 * 4) Blockers or follow-up recommendations
 */

const process = require("node:process");
const OpenAI = require("openai");
const dotenv = require("dotenv");

// Silent env loading (prevents dotenv banner/logging)
dotenv.config({ quiet: true });

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const next = argv[i + 1];

    if (["help", "json"].includes(key)) {
      args[key] = true;
      continue;
    }

    if (!next || next.startsWith("--")) {
      args[key] = "";
      continue;
    }

    args[key] = next;
    i++;
  }
  return args;
}

function requireNonEmpty(name, value) {
  const v = String(value ?? "").trim();
  if (!v) throw new Error(`Missing required argument/value: ${name}`);
  return v;
}

function printHelp() {
  console.log(`
Usage:
  node hubspot.js --org "..." --project "..." --instruction "..."

Required:
  --org
  --project
  --instruction

Optional:
  --model         Model name (default: env OPENAI_MODEL or "gpt-4.1")
  --json          Print full JSON response
  --tool-choice   "auto" | "required" (default: "auto")
  --approval      MCP approval policy (default: "never")
  --help          Show help
`.trim());
}

function buildInput(org, project, instruction) {
  return [
    "You are executing an operational task with access to Zapier MCP tools.",
    "",
    "Use the provided context carefully and complete the task.",
    "If a tool/action is required, use the available MCP tools.",
    "If the task cannot be completed, explain exactly what is missing.",
    "",
    "=== ORGANIZATION CONTEXT (REQUIRED) ===",
    org,
    "",
    "=== PROJECT CONTEXT (REQUIRED) ===",
    project,
    "",
    "=== INSTRUCTION (REQUIRED) ===",
    instruction,
    "",
    "=== OUTPUT FORMAT ===",
    "1) Summary of what you did",
    "2) Actions taken (if any)",
    "3) Results / records affected",
    "4) Blockers or follow-up recommendations",
  ].join("\n");
}

function extractText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks = [];
  if (Array.isArray(response?.output)) {
    for (const item of response.output) {
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") {
            chunks.push(c.text);
          }
        }
      }
      if (typeof item?.text === "string") chunks.push(item.text);
    }
  }

  return chunks.join("\n").trim();
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  try {
    const org = requireNonEmpty("--org", args.org);
    const project = requireNonEmpty("--project", args.project);
    const instruction = requireNonEmpty("--instruction", args.instruction);

    const OPENAI_API_KEY = requireNonEmpty("OPENAI_API_KEY (env)", process.env.OPENAI_API_KEY);
    const ZAPIER_MCP_URL = requireNonEmpty("ZAPIER_MCP_URL (env)", process.env.ZAPIER_MCP_URL);

    const model = String(args.model || process.env.OPENAI_MODEL || "gpt-4.1").trim();
    const toolChoice = String(args["tool-choice"] || "auto").trim();
    const approval = String(args.approval || "never").trim();

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const response = await client.responses.create({
      model,
      input: buildInput(org, project, instruction),
      tools: [
        {
          type: "mcp",
          server_label: "zapier",
          server_url: ZAPIER_MCP_URL,
          require_approval: approval
        }
      ],
      tool_choice: toolChoice
    });

    if (args.json) {
      console.log(JSON.stringify(response, null, 2));
      process.exit(0);
    }

    const text = extractText(response);
    console.log(text || JSON.stringify(response, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }
}

main();
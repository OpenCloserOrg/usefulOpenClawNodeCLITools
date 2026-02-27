#!/usr/bin/env node
/**
 * Remotive Remote Jobs Search (Public API) — AI-friendly output (no HTML)
 *
 * What it does
 * - Queries Remotive’s public jobs API and returns a clean JSON payload suitable for downstream AI/tooling.
 * - Defaults to 20 results, sorted by newest publication date (client-side sort to be safe).
 * - Returns full job descriptions as plain text (HTML stripped).
 * - Always includes the Remotive job URL.
 *
 * Usage
 *   node remotive.js --query "sales"
 *   node remotive.js --query "sales" --limit 5
 *   node remotive.js --query "sales" --category "sales" --company "acme" --pretty
 *
 * Flags
 *   --query, -q       Search in title + description
 *   --limit, -l       Max number of jobs returned (default: 20)
 *   --category, -c    Category filter (Remotive category string)
 *   --company, -C     Filter by company name
 *   --pretty, -p      Pretty-print JSON output
 *   --raw             Return the raw API response (includes HTML descriptions + notices)
 *
 * Notes / gotchas (important for cron jobs)
 * - Remotive’s public API output includes a legal notice and may be delayed (their docs mention ~24h delay).
 * - They advise not requesting too frequently (cron hourly might be too much for production—fine for a demo).
 * - If you display these jobs publicly, link back to the job URL and mention Remotive as the source.
 *
 * Requires
 * - Node.js 18+ (uses global fetch)
 */

const BASE_URL = "https://remotive.com/api/remote-jobs";

function parseArgs(argv) {
  const args = {
    query: "",
    limit: 20,
    category: undefined,
    company: undefined,
    pretty: false,
    raw: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--query" || a === "-q") args.query = argv[++i] ?? "";
    else if (a === "--limit" || a === "-l") args.limit = Number(argv[++i] ?? "20");
    else if (a === "--category" || a === "-c") args.category = argv[++i];
    else if (a === "--company" || a === "-C") args.company = argv[++i];
    else if (a === "--pretty" || a === "-p") args.pretty = true;
    else if (a === "--raw") args.raw = true;
    else if (a === "--help" || a === "-h") {
      console.log(`
Usage:
  node remotive.js --query "sales" [--limit 20] [--category "sales"] [--company "acme"] [--pretty] [--raw]

Flags:
  --query, -q       Search in title + description
  --limit, -l       Max number of jobs returned (default: 20)
  --category, -c    Category filter
  --company, -C     Filter by company name
  --pretty, -p      Pretty-print JSON
  --raw             Return raw API response (includes HTML + notices)
`);
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.limit) || args.limit <= 0) args.limit = 20;
  return args;
}

/**
 * Minimal HTML -> text conversion (dependency-free).
 * Good enough for job descriptions, but not a full HTML parser.
 */
function htmlToText(html) {
  if (!html) return "";

  return String(html)
    // Remove script/style blocks
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    // Common line breaks
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    // Lists
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    // Drop remaining tags
    .replace(/<[^>]+>/g, " ")
    // Decode a few common entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // Cleanup whitespace
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeJob(job) {
  const description_text = htmlToText(job.description);

  return {
    id: job.id,
    title: job.title,
    company_name: job.company_name,
    category: job.category,
    tags: Array.isArray(job.tags) ? job.tags : [],
    job_type: job.job_type ?? null,
    publication_date: job.publication_date ?? null,
    candidate_required_location: job.candidate_required_location ?? null,
    salary: job.salary ?? null,
    url: job.url, // always include
    description_text, // full description, but plain text (no HTML)
  };
}

function sortByNewest(jobs) {
  // Sort descending by publication_date (ISO-ish string). Fallback stable.
  return [...jobs].sort((a, b) => {
    const ta = Date.parse(a.publication_date || "") || 0;
    const tb = Date.parse(b.publication_date || "") || 0;
    return tb - ta;
  });
}

async function main() {
  const { query, limit, category, company, pretty, raw } = parseArgs(process.argv);

  const url = new URL(BASE_URL);
  if (query) url.searchParams.set("search", query);
  if (Number.isFinite(limit)) url.searchParams.set("limit", String(limit));
  if (category) url.searchParams.set("category", category);
  if (company) url.searchParams.set("company_name", company);

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`Request failed: ${res.status} ${res.statusText}`);
    if (body) console.error(body);
    process.exit(1);
  }

  const data = await res.json();

  if (raw) {
    const outRaw = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    process.stdout.write(outRaw + "\n");
    return;
  }

  const jobsRaw = Array.isArray(data.jobs) ? data.jobs : [];
  const normalized = jobsRaw.map(normalizeJob);
  const sorted = sortByNewest(normalized);
  const limited = sorted.slice(0, limit);

  // AI-friendly output: no warnings/legal notice fields, clean top-level schema.
  const output = {
    source: "Remotive",
    query: query || null,
    filters: {
      category: category ?? null,
      company_name: company ?? null,
      limit,
    },
    returned: limited.length,
    jobs: limited,
  };

  const out = pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
  process.stdout.write(out + "\n");
}

main().catch((err) => {
  console.error("Unexpected error:", err?.stack || err);
  process.exit(1);
});
# Job Search CLI (`jobSearch/`)

Simple Node.js CLI for querying the Remotive remote jobs API and returning AI-friendly JSON.

## What it does

- Queries Remotive jobs API
- Supports filters (`query`, `category`, `company`)
- Sorts jobs by newest publication date
- Converts HTML descriptions to plain text
- Outputs structured JSON (or raw API response with `--raw`)

## Install

From inside `jobSearch/`:

```bash
npm install
```

## Credentials required

No API key is required for this tool (public Remotive endpoint).

## Usage

```bash
node remotive.js --query "sales"
node remotive.js --query "sales" --limit 5 --pretty
node remotive.js --query "sales" --category "sales" --company "acme"
node remotive.js --query "engineering" --raw --pretty
```

## Flags

- `--query`, `-q` search title + description
- `--limit`, `-l` max jobs (default `20`)
- `--category`, `-c` category filter
- `--company`, `-C` company name filter
- `--pretty`, `-p` pretty print JSON
- `--raw` raw API response
- `--help`, `-h`

## Notes

- Remotive warns that feed data may be delayed.
- Avoid polling too aggressively in production automation.
- If you publish results, include job URLs and source attribution.

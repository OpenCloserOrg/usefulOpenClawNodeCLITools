/*
/**
 * trello.js
 * =============================================================================
 * Trello CLI (Node.js + Trello REST API)
 *
 * PURPOSE
 * -------
 * A command-line tool for an AI agent (or human) to manage Trello boards/tasks:
 * - inspect boards/lists/cards
 * - understand deadlines / due dates
 * - create inbox tasks
 * - create cards in specific lists
 * - assign members
 * - move cards across lists
 * - keep work organized so progress can be tracked
 *
 * IMPORTANT AI USAGE RULES (READ FIRST)
 * -------------------------------------
 * 1) Action names must match EXACTLY what this script supports.
 *    ✅ createCard
 *    ✅ inboxAdd
 *    ✅ moveCard
 *    ❌ card-create        (wrong)
 *    ❌ create-card        (wrong)
 *
 * 2) Placeholder values in docs/examples are NOT real IDs.
 *    Example placeholders like:
 *      YOUR_INBOX_LIST_ID
 *      <boardId>
 *      <cardId>
 *    MUST be replaced with actual IDs from Trello output.
 *
 * 3) First-run / unknown-board workflow (recommended):
 *    a) me
 *    b) boards
 *    c) sync --boardId <realBoardId>
 *    d) overview --boardId <realBoardId>
 *    e) inboxAdd (preferred for quick capture)
 *    f) createCard (only after a real listId is known)
 *
 * 4) Prefer "friendly" helper commands when available:
 *    - Use inboxAdd for creating tasks in the Inbox list
 *    - Use createCard only when you already know the exact listId
 *    - Use moveCard with --list "Doing" (name-based) when supported
 *
 * 5) If a command fails with "invalid value for idList" or similar:
 *    - You probably passed a placeholder or wrong ID.
 *    - Run sync + overview again and use a real Trello ID.
 *
 * 6) IDs are opaque strings from Trello (long hex-like strings).
 *    Do not invent them. Read them from command output.
 *
 * ENVIRONMENT VARIABLES
 * ---------------------
 * Required:
 *   TRELLO_KEY=...
 *   TRELLO_TOKEN=...
 *
 * Optional:
 *   TRELLO_DEFAULT_BOARD_ID=...
 *   TRELLO_DEFAULT_INBOX_LIST_ID=...
 *
 * .env SUPPORT
 * ------------
 * If this script uses dotenv, it may auto-load a .env file.
 * Recommended .env (example):
 *
 *   TRELLO_KEY=your_key_here
 *   TRELLO_TOKEN=your_token_here
 *   TRELLO_DEFAULT_BOARD_ID=699a736861094c3d203f7f85
 *
 * QUICK START (HUMAN OR AI)
 * -------------------------
 * 1) Verify auth:
 *      node trello.js --action me
 *
 * 2) Find boards:
 *      node trello.js --action boards
 *
 * 3) Sync a board (replace with real board ID from "boards" output):
 *      node trello.js --action sync --boardId 699a736861094c3d203f7f85
 *
 * 4) Inspect current state (lists/cards/overview):
 *      node trello.js --action overview --boardId 699a736861094c3d203f7f85
 *
 * 5) Add a task to Inbox (preferred):
 *      node trello.js --action inboxAdd --boardId 699a736861094c3d203f7f85 --name "Follow up with Boardy"
 *
 * 6) Create a card directly in a specific list (advanced; requires REAL listId):
 *      node trello.js --action createCard --listId 699a... --name "Draft proposal"
 *
 * 7) Assign a card (requires cardId and member lookup by name):
 *      node trello.js --action assign --cardId 699a... --member "Mike"
 *
 * 8) Move a card by list name:
 *      node trello.js --action moveCard --cardId 699a... --list "Doing"
 *
 * 9) Check deadlines due soon:
 *      node trello.js --action deadlines --boardId 699a736861094c3d203f7f85 --days 7
 *
 * CANONICAL FIRST-USE SEQUENCE FOR AI AGENTS
 * ------------------------------------------
 * When the agent does not yet know IDs:
 *
 *   me
 *   boards
 *   sync --boardId <boardId>
 *   overview --boardId <boardId>
 *
 * Then:
 *   - use inboxAdd for fast task capture
 *   - use createCard only after obtaining a real listId
 *   - use assign/moveCard only after obtaining a real cardId (from overview/sync output)
 *
 * ERROR HANDLING GUIDE (AI)
 * -------------------------
 * - "Unknown action: X"
 *     -> action name is wrong; use exact supported action names from usage.
 *
 * - "invalid value for idList"
 *     -> bad or placeholder listId; run sync/overview and use a real listId.
 *
 * - "invalid token" / auth error
 *     -> Trello token/key invalid or expired; regenerate token and update .env.
 *
 * - "board not found" / permissions error
 *     -> wrong boardId OR token lacks access to that board/workspace.
 *
 * AI EXECUTION NOTES
 * ------------------
 * - Prefer deterministic commands and parseable outputs.
 * - Re-sync before making important decisions if data may be stale.
 * - Do not assume list IDs persist across different boards.
 * - Use exact IDs from the current environment, not examples from docs.
 *
 * SECURITY
 * --------
 * - Never print or expose TRELLO_KEY / TRELLO_TOKEN in logs.
 * - Store secrets in .env and keep .env out of version control.
 * =============================================================================
 */


const fs = require("fs");
const path = require("path");
require("dotenv").config({ quiet: true });
// -----------------------------
// Config
// -----------------------------
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const INDEX_PATH = path.join(DATA_DIR, "trello_index.json");
const LAST_RESULT_PATH = path.join(DATA_DIR, "last_result.json");

const API_BASE = "https://api.trello.com/1";

// -----------------------------
// Generic helpers
// -----------------------------
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function ensureDirs() {
  ensureDir(DATA_DIR);
}
function nowIso() {
  return new Date().toISOString();
}
function safeReadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error(`⚠️ Failed reading ${path.basename(file)}: ${e.message}`);
    return fallback;
  }
}
function safeWriteJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const key = t.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}
function printUsage() {
  console.log(`
Usage examples:
  node trello.js --action me
  node trello.js --action boards
  node trello.js --action sync --boardId <boardId>
  node trello.js --action overview --boardId <boardId>
  node trello.js --action deadlines --boardId <boardId> --days 7
  node trello.js --action inboxAdd --boardId <boardId> --name "Call vendor"
  node trello.js --action createCard --listId <listId> --name "Draft proposal"
  node trello.js --action assign --cardId <cardId> --member "Mike"
  node trello.js --action moveCard --cardId <cardId> --list "Doing"

Required env:
  TRELLO_KEY=...
  TRELLO_TOKEN=...

Optional env:
  TRELLO_DEFAULT_BOARD_ID=...
  TRELLO_DEFAULT_INBOX_LIST_ID=...
`);
}
function trimOneLine(s, max = 120) {
  const x = String(s || "").replace(/\s+/g, " ").trim();
  return x.length > max ? x.slice(0, max - 1) + "…" : x;
}
function normalizeText(s) {
  return String(s || "").toLowerCase().trim().replace(/\s+/g, " ");
}
function scoreNameMatch(query, candidate) {
  const q = normalizeText(query);
  const c = normalizeText(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1000;
  if (c.startsWith(q)) return 800 + q.length;
  if (c.includes(q)) return 600 + q.length;
  const qTokens = q.split(" ").filter(Boolean);
  const cTokens = c.split(" ").filter(Boolean);
  let overlap = 0;
  for (const qt of qTokens) {
    if (cTokens.some(ct => ct.includes(qt) || qt.includes(ct))) overlap++;
  }
  if (overlap > 0) return 100 + overlap * 25;
  return 0;
}
function toBool(v) {
  if (typeof v === "boolean") return v;
  if (v == null) return false;
  return ["1", "true", "yes", "y"].includes(String(v).toLowerCase());
}
function saveLastResult(action, payload) {
  safeWriteJson(LAST_RESULT_PATH, { at: nowIso(), action, payload });
}
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString();
}
function daysFromNow(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (t - Date.now()) / (24 * 60 * 60 * 1000);
}
function parseMaybeInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// -----------------------------
// Local index
// -----------------------------
function loadIndex() {
  return safeReadJson(INDEX_PATH, {
    version: 1,
    updatedAt: null,
    nextSeq: { board: 1, list: 1, card: 1, member: 1 },
    boards: { byLocalId: {}, byTrelloId: {} },
    lists: { byLocalId: {}, byTrelloId: {} },
    cards: { byLocalId: {}, byTrelloId: {} },
    members: { byLocalId: {}, byTrelloId: {} },
  });
}
function saveIndex(db) {
  db.updatedAt = nowIso();
  safeWriteJson(INDEX_PATH, db);
}
function allocLocalId(db, kind) {
  const prefix = { board: "b", list: "l", card: "c", member: "m" }[kind];
  if (!prefix) throw new Error(`Unknown index kind: ${kind}`);
  const seq = db.nextSeq[kind] || 1;
  db.nextSeq[kind] = seq + 1;
  return `${prefix}_${String(seq).padStart(6, "0")}`;
}
function upsertIndexEntity(db, kind, trelloId, patch) {
  const bucket = db[`${kind}s`];
  if (!bucket) throw new Error(`Invalid kind: ${kind}`);

  let localId = bucket.byTrelloId[trelloId];
  if (!localId) {
    localId = allocLocalId(db, kind);
    bucket.byTrelloId[trelloId] = localId;
  }

  const prev = bucket.byLocalId[localId] || {};
  bucket.byLocalId[localId] = {
    localId,
    trelloId,
    ...prev,
    ...patch,
    localId, // preserve
    trelloId,
    lastSeenAt: nowIso(),
    firstSeenAt: prev.firstSeenAt || nowIso(),
  };
  return bucket.byLocalId[localId];
}
function findIndexedByAny(db, kind, value) {
  if (!value) return null;
  const bucket = db[`${kind}s`];
  if (!bucket) return null;
  const raw = String(value).trim();

  // localId exact
  if (bucket.byLocalId[raw]) return bucket.byLocalId[raw];

  // Trello ID exact
  const lid = bucket.byTrelloId[raw];
  if (lid && bucket.byLocalId[lid]) return bucket.byLocalId[lid];

  // name-ish match fallback
  const rows = Object.values(bucket.byLocalId);
  const scored = rows
    .map(r => ({
      r,
      score: Math.max(
        scoreNameMatch(raw, r.name || ""),
        scoreNameMatch(raw, r.fullName || ""),
        scoreNameMatch(raw, r.username || "")
      ),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.r || null;
}
function resolveBoardId(db, args) {
  const raw = args.boardId || process.env.TRELLO_DEFAULT_BOARD_ID;
  if (!raw) throw new Error(`Missing --boardId (and no TRELLO_DEFAULT_BOARD_ID set)`);
  const rec = findIndexedByAny(db, "board", raw);
  return rec ? rec.trelloId : String(raw);
}
function resolveListId(db, raw) {
  if (!raw) throw new Error(`Missing list identifier`);
  const rec = findIndexedByAny(db, "list", raw);
  return rec ? rec.trelloId : String(raw);
}
function resolveCardId(db, args) {
  const raw = args.cardId || args.id;
  if (!raw) throw new Error(`Missing --cardId or --id`);
  const rec = findIndexedByAny(db, "card", raw);
  return rec ? rec.trelloId : String(raw);
}
function resolveMemberId(db, raw) {
  if (!raw) throw new Error(`Missing --member`);
  const rec = findIndexedByAny(db, "member", raw);
  return rec ? rec.trelloId : String(raw);
}

// -----------------------------
// Trello API client
// -----------------------------
function getCreds() {
  const key = process.env.TRELLO_KEY || "";
  const token = process.env.TRELLO_TOKEN || "";
  if (!key || !token) {
    throw new Error(
      `Missing TRELLO_KEY / TRELLO_TOKEN env vars. Example:\n` +
      `  export TRELLO_KEY=...\n  export TRELLO_TOKEN=...`
    );
  }
  return { key, token };
}
function buildUrl(pathname, query = {}) {
  const { key, token } = getCreds();
  const url = new URL(`${API_BASE}${pathname}`);
  url.searchParams.set("key", key);
  url.searchParams.set("token", token);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}
async function trelloRequest(method, pathname, { query = {}, body = null } = {}) {
  const url = buildUrl(pathname, query);
  const opts = { method, headers: {} };

  if (body != null) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`Trello API ${method} ${pathname} failed (${res.status}): ${detail}`);
  }
  return data;
}

const trello = {
  me: () => trelloRequest("GET", "/members/me"),
  boardsForMe: () =>
    trelloRequest("GET", "/members/me/boards", {
      query: { fields: "name,desc,closed,dateLastActivity,idOrganization,prefs,url" },
    }),
  board: (id) =>
    trelloRequest("GET", `/boards/${id}`, {
      query: {
        fields: "name,desc,closed,dateLastActivity,idOrganization,prefs,url",
      },
    }),
  boardLists: (id) =>
    trelloRequest("GET", `/boards/${id}/lists`, {
      query: { cards: "none", fields: "name,closed,pos,idBoard" },
    }),
  boardMembers: (id) =>
    trelloRequest("GET", `/boards/${id}/members`, {
      query: { fields: "fullName,username,initials,confirmed" },
    }),
  // cards endpoint on board
  boardCards: (id, extraQuery = {}) =>
    trelloRequest("GET", `/boards/${id}/cards`, {
      query: {
        fields:
          "name,desc,closed,idList,idBoard,idMembers,due,dueComplete,dateLastActivity,pos,url,labels,start",
        ...extraQuery,
      },
    }),
  listCards: (id) =>
    trelloRequest("GET", `/lists/${id}/cards`, {
      query: {
        fields:
          "name,desc,closed,idList,idBoard,idMembers,due,dueComplete,dateLastActivity,pos,url,labels,start",
      },
    }),
  card: (id) =>
    trelloRequest("GET", `/cards/${id}`, {
      query: {
        fields:
          "name,desc,closed,idList,idBoard,idMembers,due,dueComplete,dateLastActivity,pos,url,labels,start",
        members: "true",
        member_fields: "fullName,username,initials",
        list: "true",
        board: "true",
      },
    }),
  createBoard: ({ name, desc }) =>
    trelloRequest("POST", "/boards", {
      query: { name, desc, defaultLists: "true" },
    }),
  createList: ({ boardId, name, pos }) =>
    trelloRequest("POST", "/lists", {
      query: { idBoard: boardId, name, pos },
    }),
  createCard: ({ listId, name, desc, due, pos }) =>
    trelloRequest("POST", "/cards", {
      query: {
        idList: listId,
        name,
        desc,
        due,
        pos,
      },
    }),
  updateCard: (cardId, patch) =>
    trelloRequest("PUT", `/cards/${cardId}`, { query: patch }),
  setCardClosed: (cardId, closed) =>
    trelloRequest("PUT", `/cards/${cardId}/closed`, { query: { value: closed ? "true" : "false" } }),
  addMemberToCard: (cardId, memberId) =>
    trelloRequest("POST", `/cards/${cardId}/idMembers`, { query: { value: memberId } }),
  removeMemberFromCard: (cardId, memberId) =>
    trelloRequest("DELETE", `/cards/${cardId}/idMembers/${memberId}`),
};

// -----------------------------
// Mapping / indexing helpers
// -----------------------------
function indexBoard(db, b) {
  return upsertIndexEntity(db, "board", b.id, {
    name: b.name || null,
    desc: b.desc || "",
    closed: !!b.closed,
    url: b.url || null,
    idOrganization: b.idOrganization || null,
    dateLastActivity: b.dateLastActivity || null,
  });
}
function indexList(db, l) {
  return upsertIndexEntity(db, "list", l.id, {
    name: l.name || null,
    closed: !!l.closed,
    pos: l.pos ?? null,
    idBoard: l.idBoard || null,
  });
}
function indexMember(db, m, boardId = null) {
  return upsertIndexEntity(db, "member", m.id, {
    fullName: m.fullName || null,
    username: m.username || null,
    initials: m.initials || null,
    confirmed: m.confirmed ?? null,
    boardIds: Array.from(new Set([...(m.boardIds || []), ...(boardId ? [boardId] : [])])),
    name: m.fullName || m.username || m.id,
  });
}
function indexCard(db, c) {
  return upsertIndexEntity(db, "card", c.id, {
    name: c.name || null,
    desc: c.desc || "",
    closed: !!c.closed,
    idList: c.idList || null,
    idBoard: c.idBoard || null,
    idMembers: Array.isArray(c.idMembers) ? c.idMembers : [],
    due: c.due || null,
    dueComplete: c.dueComplete ?? false,
    start: c.start || null,
    labels: c.labels || [],
    pos: c.pos ?? null,
    url: c.url || null,
    dateLastActivity: c.dateLastActivity || null,
  });
}
function humanMemberName(m) {
  return m.fullName || m.username || m.localId || m.trelloId;
}
function getBoardContextFromIndex(db, boardId) {
  const lists = Object.values(db.lists.byLocalId).filter(x => x.idBoard === boardId && !x.closed);
  const cards = Object.values(db.cards.byLocalId).filter(x => x.idBoard === boardId && !x.closed);
  const members = Object.values(db.members.byLocalId).filter(x => (x.boardIds || []).includes(boardId));
  return { lists, cards, members };
}
function findListByNameInBoard(db, boardId, query) {
  const { lists } = getBoardContextFromIndex(db, boardId);
  const scored = lists
    .map(l => ({ l, score: scoreNameMatch(query, l.name || "") }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.l || null;
}
function inferInboxList(db, boardId) {
  const { lists } = getBoardContextFromIndex(db, boardId);
  if (lists.length === 0) return null;

  const preferredNames = [
    "inbox",
    "incoming",
    "triage",
    "to do",
    "todo",
    "backlog",
    "new",
    "next",
  ];

  for (const pn of preferredNames) {
    const exact = lists.find(l => normalizeText(l.name) === pn);
    if (exact) return exact;
  }
  for (const pn of preferredNames) {
    const contains = lists.find(l => normalizeText(l.name).includes(pn));
    if (contains) return contains;
  }

  // fallback: leftmost/open list by pos
  const sorted = [...lists].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
  return sorted[0] || null;
}
function describeDueStatus(card) {
  if (!card.due) return "no_due";
  if (card.dueComplete) return "done";
  const d = daysFromNow(card.due);
  if (d == null) return "unknown";
  if (d < 0) return "overdue";
  if (d <= 1) return "due_24h";
  if (d <= 7) return "due_7d";
  return "upcoming";
}
function resolveListTargetInBoard(db, boardId, listArg) {
  if (!listArg) throw new Error(`Missing --list`);
  // try explicit local/trello id first
  const exact = findIndexedByAny(db, "list", listArg);
  if (exact && exact.idBoard === boardId) return exact;
  // fallback name match within board
  const byName = findListByNameInBoard(db, boardId, String(listArg));
  if (byName) return byName;
  throw new Error(`List not found on board: ${listArg}`);
}

// -----------------------------
// Sync
// -----------------------------
async function syncBoard(boardId) {
  const db = loadIndex();

  const [b, lists, members, cards] = await Promise.all([
    trello.board(boardId),
    trello.boardLists(boardId),
    trello.boardMembers(boardId),
    trello.boardCards(boardId),
  ]);

  const bRec = indexBoard(db, b);
  for (const l of lists || []) indexList(db, l);
  for (const m of members || []) indexMember(db, m, b.id);
  for (const c of cards || []) indexCard(db, c);

  saveIndex(db);

  const payload = {
    board: bRec,
    counts: {
      lists: (lists || []).length,
      members: (members || []).length,
      cards: (cards || []).length,
    },
  };
  saveLastResult("sync", payload);
  return { db, payload };
}

// -----------------------------
// Actions
// -----------------------------
async function actionMe() {
  const me = await trello.me();
  saveLastResult("me", me);

  console.log(`✅ Trello auth works`);
  console.log(`Name: ${me.fullName || ""}`);
  console.log(`Username: ${me.username || ""}`);
  console.log(`Member ID: ${me.id}`);
  console.log(`URL: ${me.url || ""}`);
}

async function actionBoards() {
  const db = loadIndex();
  const boards = await trello.boardsForMe();
  for (const b of boards || []) indexBoard(db, b);
  saveIndex(db);
  saveLastResult("boards", boards);

  if (!boards || boards.length === 0) {
    console.log("ℹ️ No boards found.");
    return;
  }

  console.log(`\n📋 Boards (${boards.length})\n`);
  for (const b of boards) {
    const rec = findIndexedByAny(db, "board", b.id);
    console.log(`${rec?.localId || "?"} | ${b.name} ${b.closed ? "[closed]" : ""}`);
    console.log(`  TrelloID: ${b.id}`);
    console.log(`  Last activity: ${b.dateLastActivity || ""}`);
    console.log(`  URL: ${b.url || ""}`);
    console.log("");
  }
}

async function actionBoard(args) {
  const db = loadIndex();
  const boardId = resolveBoardId(db, args);
  const b = await trello.board(boardId);
  const rec = indexBoard(db, b);
  saveIndex(db);
  saveLastResult("board", b);

  console.log(`\n🗂️ Board ${rec.localId}`);
  console.log(`Name: ${b.name}`);
  console.log(`TrelloID: ${b.id}`);
  console.log(`Closed: ${!!b.closed}`);
  console.log(`Last activity: ${b.dateLastActivity || ""}`);
  console.log(`URL: ${b.url || ""}`);
  if (b.desc) console.log(`Desc: ${trimOneLine(b.desc, 300)}`);
}

async function actionLists(args) {
  const db = loadIndex();
  const boardId = resolveBoardId(db, args);
  const lists = await trello.boardLists(boardId);
  for (const l of lists || []) indexList(db, l);
  saveIndex(db);
  saveLastResult("lists", lists);

  console.log(`\n🧱 Lists on board ${boardId} (${lists.length})\n`);
  for (const l of lists) {
    const rec = findIndexedByAny(db, "list", l.id);
    console.log(`${rec?.localId || "?"} | ${l.name} ${l.closed ? "[closed]" : ""}`);
    console.log(`  TrelloID: ${l.id}`);
    console.log(`  Pos: ${l.pos}`);
    console.log("");
  }
}

async function actionMembers(args) {
  const db = loadIndex();
  const boardId = resolveBoardId(db, args);
  const members = await trello.boardMembers(boardId);
  for (const m of members || []) indexMember(db, m, boardId);
  saveIndex(db);
  saveLastResult("members", members);

  console.log(`\n👥 Members on board ${boardId} (${members.length})\n`);
  for (const m of members) {
    const rec = findIndexedByAny(db, "member", m.id);
    console.log(`${rec?.localId || "?"} | ${m.fullName || m.username}`);
    console.log(`  Username: ${m.username || ""}`);
    console.log(`  TrelloID: ${m.id}`);
    console.log("");
  }
}

async function actionCards(args) {
  const db = loadIndex();
  const boardId = resolveBoardId(db, args);

  // ensure local context is warm
  await syncBoard(boardId);

  const freshDb = loadIndex();
  const ctx = getBoardContextFromIndex(freshDb, boardId);
  let cards = ctx.cards;

  if (args.openOnly) cards = cards.filter(c => !c.closed);

  if (args.list) {
    const listRec = resolveListTargetInBoard(freshDb, boardId, args.list);
    cards = cards.filter(c => c.idList === listRec.trelloId);
  }

  cards = cards.sort((a, b) => {
    const ta = new Date(a.due || a.dateLastActivity || 0).getTime();
    const tb = new Date(b.due || b.dateLastActivity || 0).getTime();
    return tb - ta;
  });

  saveLastResult("cards", cards);

  console.log(`\n🃏 Cards (${cards.length}) on board ${boardId}\n`);
  for (const c of cards.slice(0, 500)) {
    const list = Object.values(freshDb.lists.byLocalId).find(l => l.trelloId === c.idList);
    console.log(`${c.localId} | ${c.name}${c.closed ? " [closed]" : ""}`);
    console.log(`  TrelloID: ${c.trelloId}`);
    console.log(`  List: ${list ? `${list.name} (${list.localId})` : c.idList}`);
    console.log(`  Due: ${c.due || ""} ${c.due ? `[${describeDueStatus(c)}]` : ""}`);
    console.log(`  Assigned: ${(c.idMembers || []).length}`);
    console.log(`  Snip: ${trimOneLine(c.desc || "", 140)}`);
    console.log("");
  }
}

async function actionOverview(args) {
  const db0 = loadIndex();
  const boardId = resolveBoardId(db0, args);
  await syncBoard(boardId);

  const db = loadIndex();
  const boardRec = findIndexedByAny(db, "board", boardId);
  const { lists, cards, members } = getBoardContextFromIndex(db, boardId);

  const listById = new Map(lists.map(l => [l.trelloId, l]));
  const countsByList = new Map();
  for (const c of cards.filter(c => !c.closed)) {
    countsByList.set(c.idList, (countsByList.get(c.idList) || 0) + 1);
  }

  const overdue = cards.filter(c => !c.closed && c.due && !c.dueComplete && describeDueStatus(c) === "overdue");
  const dueSoon = cards.filter(c => !c.closed && c.due && !c.dueComplete && ["due_24h", "due_7d"].includes(describeDueStatus(c)));
  const unassigned = cards.filter(c => !c.closed && (!c.idMembers || c.idMembers.length === 0));

  const inbox = inferInboxList(db, boardId);
  const inboxCards = inbox ? cards.filter(c => !c.closed && c.idList === inbox.trelloId) : [];

  saveLastResult("overview", {
    board: boardRec,
    counts: { lists: lists.length, cards: cards.length, members: members.length },
    overdue: overdue.map(c => c.localId),
    dueSoon: dueSoon.map(c => c.localId),
    inboxList: inbox?.localId || null,
  });

  console.log(`\n📊 Board overview: ${boardRec?.name || boardId}\n`);
  console.log(`Board: ${boardRec?.localId || "?"} | ${boardRec?.trelloId || boardId}`);
  console.log(`Lists: ${lists.length}`);
  console.log(`Open cards: ${cards.filter(c => !c.closed).length}`);
  console.log(`Members: ${members.length}`);
  console.log(`Overdue: ${overdue.length}`);
  console.log(`Due soon (<=7d): ${dueSoon.length}`);
  console.log(`Unassigned open cards: ${unassigned.length}`);
  console.log(`Inbox list: ${inbox ? `${inbox.name} (${inbox.localId})` : "not found"}`);
  console.log(`Inbox open cards: ${inboxCards.length}`);
  console.log("");

  console.log(`By list:`);
  for (const l of [...lists].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))) {
    const count = countsByList.get(l.trelloId) || 0;
    console.log(`- ${l.localId} | ${l.name}: ${count}`);
  }

  if (overdue.length) {
    console.log(`\n⚠️ Overdue cards:`);
    for (const c of overdue.slice(0, 20)) {
      const l = listById.get(c.idList);
      console.log(`- ${c.localId} | ${c.name} | due=${c.due} | list=${l?.name || c.idList}`);
    }
  }

  if (dueSoon.length) {
    console.log(`\n⏰ Upcoming deadlines:`);
    const sorted = [...dueSoon].sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
    for (const c of sorted.slice(0, 20)) {
      const l = listById.get(c.idList);
      console.log(`- ${c.localId} | ${c.name} | due=${c.due} | list=${l?.name || c.idList}`);
    }
  }
}

async function actionDeadlines(args) {
  const db0 = loadIndex();
  const boardId = resolveBoardId(db0, args);
  await syncBoard(boardId);
  const db = loadIndex();

  const days = Math.max(1, Math.min(365, parseMaybeInt(args.days, 7)));
  const includeDone = !!args.includeDone;
  const { cards, lists } = getBoardContextFromIndex(db, boardId);
  const listById = new Map(lists.map(l => [l.trelloId, l]));

  const cutoff = Date.now() + days * 24 * 60 * 60 * 1000;
  const rows = cards.filter(c => {
    if (c.closed) return false;
    if (!c.due) return false;
    if (!includeDone && c.dueComplete) return false;
    const t = new Date(c.due).getTime();
    return Number.isFinite(t) && t <= cutoff;
  });

  rows.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
  saveLastResult("deadlines", rows);

  console.log(`\n📅 Deadlines in next ${days} day(s): ${rows.length}\n`);
  for (const c of rows) {
    const l = listById.get(c.idList);
    const delta = daysFromNow(c.due);
    const deltaText = delta == null ? "" : `${delta < 0 ? "-" : ""}${Math.abs(delta).toFixed(1)}d`;
    console.log(`${c.localId} | ${c.name}`);
    console.log(`  Due: ${c.due}${c.dueComplete ? " [done]" : ""} [${describeDueStatus(c)}] (${deltaText})`);
    console.log(`  List: ${l ? `${l.name} (${l.localId})` : c.idList}`);
    console.log(`  Assigned: ${(c.idMembers || []).length}`);
    console.log("");
  }
}

async function actionInbox(args) {
  const db0 = loadIndex();
  const boardId = resolveBoardId(db0, args);
  await syncBoard(boardId);
  const db = loadIndex();

  const inbox = process.env.TRELLO_DEFAULT_INBOX_LIST_ID
    ? findIndexedByAny(db, "list", process.env.TRELLO_DEFAULT_INBOX_LIST_ID)
    : inferInboxList(db, boardId);

  if (!inbox) {
    console.log("ℹ️ No inbox-like list found.");
    return;
  }

  const cards = Object.values(db.cards.byLocalId)
    .filter(c => c.idBoard === boardId && c.idList === inbox.trelloId && !c.closed)
    .sort((a, b) => new Date(b.dateLastActivity || 0).getTime() - new Date(a.dateLastActivity || 0).getTime());

  saveLastResult("inbox", { inbox, cards });

  console.log(`\n📥 Inbox: ${inbox.name} (${inbox.localId}) | ${cards.length} card(s)\n`);
  for (const c of cards) {
    console.log(`${c.localId} | ${c.name}`);
    console.log(`  Due: ${c.due || ""} ${c.due ? `[${describeDueStatus(c)}]` : ""}`);
    console.log(`  Assigned: ${(c.idMembers || []).length}`);
    console.log(`  Snip: ${trimOneLine(c.desc || "", 140)}`);
    console.log("");
  }
}

async function actionSync(args) {
  const db = loadIndex();
  const boardId = resolveBoardId(db, args);
  const { payload } = await syncBoard(boardId);

  console.log(`✅ Synced board ${payload.board.name} (${payload.board.localId})`);
  console.log(`Lists: ${payload.counts.lists}`);
  console.log(`Members: ${payload.counts.members}`);
  console.log(`Cards: ${payload.counts.cards}`);
}

async function actionIndex(args) {
  const db = loadIndex();
  const type = args.type ? String(args.type).toLowerCase() : null;
  const find = normalizeText(args.find || "");

  const buckets = [];
  if (!type || type === "board") buckets.push(["board", Object.values(db.boards.byLocalId)]);
  if (!type || type === "list") buckets.push(["list", Object.values(db.lists.byLocalId)]);
  if (!type || type === "card") buckets.push(["card", Object.values(db.cards.byLocalId)]);
  if (!type || type === "member") buckets.push(["member", Object.values(db.members.byLocalId)]);

  for (const [kind, rows0] of buckets) {
    let rows = rows0;
    if (find) {
      rows = rows.filter(r => {
        const hay = [
          r.localId, r.trelloId, r.name, r.fullName, r.username, r.desc, r.url
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(find);
      });
    }

    rows.sort((a, b) => new Date(b.lastSeenAt || 0).getTime() - new Date(a.lastSeenAt || 0).getTime());

    console.log(`\n📚 ${kind}s (${rows.length})${find ? ` filtered="${find}"` : ""}\n`);
    for (const r of rows.slice(0, 200)) {
      if (kind === "member") {
        console.log(`${r.localId} | ${humanMemberName(r)} | @${r.username || ""}`);
      } else {
        console.log(`${r.localId} | ${r.name || "(no name)"}`);
      }
      console.log(`  TrelloID: ${r.trelloId}`);
      if (r.idBoard) {
        const b = findIndexedByAny(db, "board", r.idBoard);
        console.log(`  Board: ${b ? `${b.name} (${b.localId})` : r.idBoard}`);
      }
      if (r.idList) {
        const l = findIndexedByAny(db, "list", r.idList);
        console.log(`  List: ${l ? `${l.name} (${l.localId})` : r.idList}`);
      }
      if (r.due) console.log(`  Due: ${r.due} ${r.dueComplete ? "[done]" : ""}`);
      if (r.username) console.log(`  Username: ${r.username}`);
      if (r.desc) console.log(`  Snip: ${trimOneLine(r.desc, 120)}`);
      console.log("");
    }
  }
}

async function actionSearch(args) {
  const text = String(args.text || "").trim();
  if (!text) throw new Error(`search requires --text`);

  const db0 = loadIndex();
  const db = loadIndex();

  let boardId = null;
  if (args.boardId || process.env.TRELLO_DEFAULT_BOARD_ID) {
    boardId = resolveBoardId(db0, args);
    await syncBoard(boardId);
  }

  const fresh = loadIndex();
  let cards = Object.values(fresh.cards.byLocalId);
  let lists = Object.values(fresh.lists.byLocalId);
  let boards = Object.values(fresh.boards.byLocalId);
  let members = Object.values(fresh.members.byLocalId);

  if (boardId) {
    cards = cards.filter(c => c.idBoard === boardId);
    lists = lists.filter(l => l.idBoard === boardId);
    members = members.filter(m => (m.boardIds || []).includes(boardId));
    boards = boards.filter(b => b.trelloId === boardId);
  }

  const cardHits = cards
    .map(c => ({
      c,
      score: Math.max(scoreNameMatch(text, c.name), scoreNameMatch(text, c.desc)),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const listHits = lists
    .map(l => ({ l, score: scoreNameMatch(text, l.name) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const memberHits = members
    .map(m => ({
      m,
      score: Math.max(scoreNameMatch(text, m.fullName), scoreNameMatch(text, m.username)),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  saveLastResult("search", { text, boardId, cardHits, listHits, memberHits });

  console.log(`\n🔎 Search: "${text}"${boardId ? ` on board ${boardId}` : ""}\n`);

  console.log(`Cards (${cardHits.length}):`);
  for (const { c } of cardHits.slice(0, 20)) {
    console.log(`- ${c.localId} | ${c.name}`);
    console.log(`  Due: ${c.due || ""} ${c.due ? `[${describeDueStatus(c)}]` : ""}`);
    console.log(`  TrelloID: ${c.trelloId}`);
  }

  console.log(`\nLists (${listHits.length}):`);
  for (const { l } of listHits.slice(0, 10)) {
    console.log(`- ${l.localId} | ${l.name} | TrelloID=${l.trelloId}`);
  }

  console.log(`\nMembers (${memberHits.length}):`);
  for (const { m } of memberHits.slice(0, 10)) {
    console.log(`- ${m.localId} | ${humanMemberName(m)} | @${m.username || ""}`);
  }
}

async function actionCreateBoard(args) {
  const name = String(args.name || "").trim();
  const desc = String(args.desc || "");
  if (!name) throw new Error(`createBoard requires --name`);

  const db = loadIndex();
  const b = await trello.createBoard({ name, desc });
  const rec = indexBoard(db, b);
  saveIndex(db);
  saveLastResult("createBoard", b);

  console.log(`✅ Created board`);
  console.log(`Name: ${b.name}`);
  console.log(`TrelloID: ${b.id}`);
  console.log(`Local ID: ${rec.localId}`);
  console.log(`URL: ${b.url || ""}`);
}

async function actionCreateList(args) {
  const db = loadIndex();
  const boardId = resolveBoardId(db, args);
  const name = String(args.name || "").trim();
  const pos = args.pos ? String(args.pos) : undefined;
  if (!name) throw new Error(`createList requires --name`);

  const l = await trello.createList({ boardId, name, pos });
  const recDb = loadIndex();
  const rec = indexList(recDb, l);
  saveIndex(recDb);
  saveLastResult("createList", l);

  console.log(`✅ Created list`);
  console.log(`Name: ${l.name}`);
  console.log(`TrelloID: ${l.id}`);
  console.log(`Local ID: ${rec.localId}`);
  console.log(`BoardID: ${l.idBoard}`);
}

async function actionCreateCard(args) {
  const db = loadIndex();
  const listId = resolveListId(db, args.listId || args.list);
  const name = String(args.name || "").trim();
  const desc = String(args.desc || "");
  const due = args.due ? String(args.due) : undefined;
  const pos = args.pos ? String(args.pos) : undefined;
  if (!name) throw new Error(`createCard requires --name`);
  if (!listId) throw new Error(`createCard requires --listId`);

  const c = await trello.createCard({ listId, name, desc, due, pos });
  const recDb = loadIndex();
  const rec = indexCard(recDb, c);
  saveIndex(recDb);
  saveLastResult("createCard", c);

  console.log(`✅ Created card`);
  console.log(`Name: ${c.name}`);
  console.log(`TrelloID: ${c.id}`);
  console.log(`Local ID: ${rec.localId}`);
  console.log(`ListID: ${c.idList}`);
  console.log(`Due: ${c.due || ""}`);
  console.log(`URL: ${c.url || ""}`);
}

async function actionInboxAdd(args) {
  const name = String(args.name || "").trim();
  const desc = String(args.desc || "");
  const due = args.due ? String(args.due) : undefined;
  if (!name) throw new Error(`inboxAdd requires --name`);

  const db0 = loadIndex();
  const boardId = resolveBoardId(db0, args);
  await syncBoard(boardId);
  const db = loadIndex();

  let inbox = null;
  if (process.env.TRELLO_DEFAULT_INBOX_LIST_ID) {
    inbox = findIndexedByAny(db, "list", process.env.TRELLO_DEFAULT_INBOX_LIST_ID);
  }
  if (!inbox) inbox = inferInboxList(db, boardId);
  if (!inbox) throw new Error(`Could not find an inbox-like list on board. Use --action lists and then createCard --listId ...`);

  const c = await trello.createCard({
    listId: inbox.trelloId,
    name,
    desc,
    due,
    pos: "top",
  });

  const recDb = loadIndex();
  const rec = indexCard(recDb, c);
  saveIndex(recDb);
  saveLastResult("inboxAdd", { inbox, card: c });

  console.log(`✅ Added card to inbox`);
  console.log(`Inbox: ${inbox.name} (${inbox.localId})`);
  console.log(`Card: ${c.name}`);
  console.log(`Local ID: ${rec.localId}`);
  console.log(`TrelloID: ${c.id}`);
  if (c.due) console.log(`Due: ${c.due}`);
}

async function actionCard(args) {
  const db = loadIndex();
  const cardId = resolveCardId(db, args);
  const c = await trello.card(cardId);

  const db2 = loadIndex();
  const rec = indexCard(db2, c);
  if (Array.isArray(c.members)) for (const m of c.members) indexMember(db2, m);
  if (c.list) indexList(db2, { ...c.list, idBoard: c.idBoard });
  if (c.board) indexBoard(db2, c.board);
  saveIndex(db2);
  saveLastResult("card", c);

  console.log(`\n🃏 Card ${rec.localId}`);
  console.log(`Name: ${c.name}`);
  console.log(`TrelloID: ${c.id}`);
  console.log(`Board: ${c.board?.name || c.idBoard}`);
  console.log(`List: ${c.list?.name || c.idList}`);
  console.log(`Closed: ${!!c.closed}`);
  console.log(`Due: ${c.due || ""}${c.due ? ` [${describeDueStatus(rec)}]` : ""}${c.dueComplete ? " [done]" : ""}`);
  console.log(`Assigned members: ${(c.members || []).length}`);
  for (const m of c.members || []) {
    const mRec = findIndexedByAny(db2, "member", m.id);
    console.log(`  - ${mRec?.localId || "?"} | ${m.fullName || m.username} (@${m.username || ""})`);
  }
  console.log(`URL: ${c.url || ""}`);
  if (c.desc) {
    console.log(`\n--- Description ---\n`);
    console.log(c.desc);
    console.log("");
  }
}

async function actionRenameCard(args) {
  const db = loadIndex();
  const cardId = resolveCardId(db, args);
  const name = String(args.name || "").trim();
  if (!name) throw new Error(`renameCard requires --name`);

  const c = await trello.updateCard(cardId, { name });
  const db2 = loadIndex();
  const rec = indexCard(db2, c);
  saveIndex(db2);
  saveLastResult("renameCard", c);

  console.log(`✅ Renamed card ${rec.localId} -> ${c.name}`);
}

async function actionSetDesc(args) {
  const db = loadIndex();
  const cardId = resolveCardId(db, args);
  const desc = String(args.desc || "");
  const c = await trello.updateCard(cardId, { desc });

  const db2 = loadIndex();
  const rec = indexCard(db2, c);
  saveIndex(db2);
  saveLastResult("setDesc", c);

  console.log(`✅ Updated description for ${rec.localId}`);
}

async function actionSetDue(args) {
  const db = loadIndex();
  const cardId = resolveCardId(db, args);
  const due = String(args.due || "").trim();
  if (!due) throw new Error(`setDue requires --due "ISO_DATE"`);

  const c = await trello.updateCard(cardId, { due });
  const db2 = loadIndex();
  const rec = indexCard(db2, c);
  saveIndex(db2);
  saveLastResult("setDue", c);

  console.log(`✅ Set due date for ${rec.localId}: ${c.due || due}`);
}

async function actionClearDue(args) {
  const db = loadIndex();
  const cardId = resolveCardId(db, args);

  // Trello accepts due=null or empty string in many contexts; null query omitted, so use empty string.
  const c = await trello.updateCard(cardId, { due: "null" });
  const db2 = loadIndex();
  const rec = indexCard(db2, c);
  saveIndex(db2);
  saveLastResult("clearDue", c);

  console.log(`✅ Cleared due date for ${rec.localId}`);
}

async function actionMoveCard(args) {
  const db = loadIndex();
  const cardId = resolveCardId(db, args);

  // need board context to resolve list by name if provided
  const cardRec = findIndexedByAny(db, "card", cardId) || null;
  let boardId = cardRec?.idBoard || null;
  if (!boardId) {
    const full = await trello.card(cardId);
    boardId = full.idBoard;
    const dbx = loadIndex();
    indexCard(dbx, full);
    saveIndex(dbx);
  }

  await syncBoard(boardId);
  const db2 = loadIndex();
  const targetList = resolveListTargetInBoard(db2, boardId, args.list || args.listId);
  const c = await trello.updateCard(cardId, { idList: targetList.trelloId });

  const db3 = loadIndex();
  const rec = indexCard(db3, c);
  saveIndex(db3);
  saveLastResult("moveCard", { card: c, list: targetList });

  console.log(`✅ Moved card ${rec.localId} -> ${targetList.name} (${targetList.localId})`);
}

async function actionArchiveCard(args, closed) {
  const db = loadIndex();
  const cardId = resolveCardId(db, args);
  const c = await trello.setCardClosed(cardId, closed);

  const db2 = loadIndex();
  const rec = indexCard(db2, c);
  saveIndex(db2);
  saveLastResult(closed ? "archiveCard" : "unarchiveCard", c);

  console.log(`✅ ${closed ? "Archived" : "Unarchived"} ${rec.localId} (${c.name})`);
}

async function actionAssign(args, remove = false) {
  const db = loadIndex();
  const cardId = resolveCardId(db, args);
  const memberArg = args.member;
  if (!memberArg) throw new Error(`${remove ? "unassign" : "assign"} requires --member`);

  // warm board members if possible
  let cardRec = findIndexedByAny(db, "card", cardId);
  if (!cardRec) {
    const c = await trello.card(cardId);
    const dbx = loadIndex();
    cardRec = indexCard(dbx, c);
    if (Array.isArray(c.members)) for (const m of c.members) indexMember(dbx, m);
    saveIndex(dbx);
  }
  if (cardRec?.idBoard) {
    try {
      const members = await trello.boardMembers(cardRec.idBoard);
      const dby = loadIndex();
      for (const m of members) indexMember(dby, m, cardRec.idBoard);
      saveIndex(dby);
    } catch {}
  }

  const db2 = loadIndex();
  const memberId = resolveMemberId(db2, memberArg);

  if (remove) await trello.removeMemberFromCard(cardId, memberId);
  else await trello.addMemberToCard(cardId, memberId);

  const fresh = await trello.card(cardId);
  const db3 = loadIndex();
  const rec = indexCard(db3, fresh);
  if (Array.isArray(fresh.members)) for (const m of fresh.members) indexMember(db3, m, fresh.idBoard);
  saveIndex(db3);
  saveLastResult(remove ? "unassign" : "assign", fresh);

  console.log(`✅ ${remove ? "Unassigned" : "Assigned"} member on ${rec.localId}`);
  console.log(`Members now: ${(fresh.members || []).map(m => m.fullName || m.username).join(", ") || "(none)"}`);
}

async function actionComplete(args, dueComplete) {
  const db = loadIndex();
  const cardId = resolveCardId(db, args);
  const c = await trello.updateCard(cardId, { dueComplete: dueComplete ? "true" : "false" });

  const db2 = loadIndex();
  const rec = indexCard(db2, c);
  saveIndex(db2);
  saveLastResult(dueComplete ? "complete" : "reopen", c);

  console.log(`✅ ${dueComplete ? "Marked complete" : "Reopened"} ${rec.localId}`);
}

function actionLast() {
  const x = safeReadJson(LAST_RESULT_PATH, null);
  if (!x) {
    console.log("ℹ️ No last_result.json found.");
    return;
  }
  console.log(JSON.stringify(x, null, 2));
}

// -----------------------------
// Main
// -----------------------------
(async function main() {
  ensureDirs();

  const args = parseArgs(process.argv);
  if (args.help || !args.action) {
    printUsage();
    process.exit(0);
  }

  const action = String(args.action).toLowerCase();

  try {
    switch (action) {
      case "me":
        await actionMe();
        break;
      case "boards":
        await actionBoards();
        break;
      case "board":
        await actionBoard(args);
        break;
      case "lists":
        await actionLists(args);
        break;
      case "members":
        await actionMembers(args);
        break;
      case "cards":
        await actionCards(args);
        break;
      case "overview":
        await actionOverview(args);
        break;
      case "deadlines":
        await actionDeadlines(args);
        break;
      case "inbox":
        await actionInbox(args);
        break;
      case "sync":
        await actionSync(args);
        break;
      case "index":
        await actionIndex(args);
        break;
      case "search":
        await actionSearch(args);
        break;
      case "createboard":
        await actionCreateBoard(args);
        break;
      case "createlist":
        await actionCreateList(args);
        break;
      case "createcard":
        await actionCreateCard(args);
        break;
      case "inboxadd":
        await actionInboxAdd(args);
        break;
      case "card":
        await actionCard(args);
        break;
      case "renamecard":
        await actionRenameCard(args);
        break;
      case "setdesc":
        await actionSetDesc(args);
        break;
      case "setdue":
        await actionSetDue(args);
        break;
      case "cleardue":
        await actionClearDue(args);
        break;
      case "movecard":
        await actionMoveCard(args);
        break;
      case "archivecard":
        await actionArchiveCard(args, true);
        break;
      case "unarchivecard":
        await actionArchiveCard(args, false);
        break;
      case "assign":
        await actionAssign(args, false);
        break;
      case "unassign":
        await actionAssign(args, true);
        break;
      case "complete":
        await actionComplete(args, true);
        break;
      case "reopen":
        await actionComplete(args, false);
        break;
      case "last":
        actionLast();
        break;
      default:
        console.error(`❌ Unknown action: ${args.action}`);
        printUsage();
        process.exitCode = 1;
    }
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`);
    process.exitCode = 1;
  }
})();
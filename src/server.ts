/**
 * @file server.ts
 * @description MCP server entry point for context-steward.
 * Registers all 7 tools via stdio transport.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync, writeFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { OutcomeStore } from './core/outcome-store.js';
import { loadSkillsFromDirectory, addSkillFromUrl, addSkillFromPath } from './core/skill-loader.js';
import { matchSkills, budgetSkills } from './core/skill-matcher.js';
import { scoreSkills, getSkillReport } from './core/skill-scorer.js';
import { estimateTokens } from './core/token-estimator.js';
import { packContext } from './core/pack-builder.js';
import { randomBytes } from 'node:crypto';
import { StewardConfig, SkillDefinition, OutcomeSignal, SIGNAL_SCORES } from './types.js';

// ── State ──────────────────────────────────────────────────────────────
let config: StewardConfig = { skillsDir: '.skills', defaultBudget: 100000 };
let outcomeStore: OutcomeStore;

// ── Context map with TTL + size cap ────────────────────────────────────
// Each contextId maps to the slugs loaded for it. Without bounds a caller
// that never reports an outcome (deliberately or by failure) leaks memory.
// We cap total entries and evict anything older than CONTEXT_TTL_MS.
interface ContextEntry { slugs: string[]; createdAt: number; }
const CONTEXT_TTL_MS = 60 * 60 * 1000;   // 1 hour
const CONTEXT_MAX_SIZE = 1000;
const contextMap = new Map<string, ContextEntry>();

function pruneExpiredContexts(): void {
  const now = Date.now();
  for (const [key, entry] of contextMap) {
    if (now - entry.createdAt > CONTEXT_TTL_MS) contextMap.delete(key);
  }
}

function setContext(id: string, slugs: string[]): void {
  pruneExpiredContexts();
  while (contextMap.size >= CONTEXT_MAX_SIZE) {
    const oldest = contextMap.keys().next().value;
    if (!oldest) break;
    contextMap.delete(oldest);
  }
  contextMap.set(id, { slugs, createdAt: Date.now() });
}

function getContext(id: string): string[] | undefined {
  const entry = contextMap.get(id);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > CONTEXT_TTL_MS) {
    contextMap.delete(id);
    return undefined;
  }
  return entry.slugs;
}

// ── Security helpers ───────────────────────────────────────────────────
// See SECURITY.md for the threat model. Do not relax these without reading it.

/**
 * Resolve `filePath` and verify it lives inside one of `allowedDirs`.
 * Follows symlinks via realpath so a symlink inside an allowed dir that
 * points to /etc/passwd is rejected, not accepted. Throws on violation.
 */
function assertPathAllowed(filePath: string, allowedDirs: string[]): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('path is required');
  }
  // Reject NUL — Node would throw anyway but the error is clearer here.
  if (filePath.includes('\0')) throw new Error('path contains NUL byte');
  const resolved = resolve(filePath);
  // realpath only works if the file exists; fall back to the lexical path.
  let canonical: string;
  try { canonical = realpathSync(resolved); } catch { canonical = resolved; }
  for (const dir of allowedDirs) {
    const allowed = resolve(dir);
    let canonicalAllowed: string;
    try { canonicalAllowed = realpathSync(allowed); } catch { canonicalAllowed = allowed; }
    if (canonical === canonicalAllowed || canonical.startsWith(canonicalAllowed + sep)) {
      return canonical;
    }
  }
  throw new Error(
    `path access denied: ${filePath} is not within any allowed directory ` +
    `(${allowedDirs.join(', ')}). Set allowedReadDirs in steward.config.json to widen access.`
  );
}

const DEFAULT_URL_PREFIXES = [
  'https://raw.githubusercontent.com/',
  'https://gist.githubusercontent.com/',
  'https://gitlab.com/',
  'https://bitbucket.org/',
];

/**
 * Verify a URL is HTTPS and starts with one of the configured prefixes.
 * Blocks SSRF vectors like http://169.254.169.254/ (cloud metadata),
 * http://localhost/, file://, and arbitrary third-party origins.
 */
function assertUrlAllowed(url: string, allowedPrefixes: string[]): string {
  if (typeof url !== 'string' || url.length === 0) throw new Error('url is required');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error(`invalid url: ${url}`); }
  if (parsed.protocol !== 'https:') {
    throw new Error(`only https:// URLs are allowed (got ${parsed.protocol}${parsed.host})`);
  }
  for (const prefix of allowedPrefixes) {
    if (url.startsWith(prefix)) return url;
  }
  throw new Error(
    `url not in allowlist: ${parsed.host}. Allowed prefixes: ${allowedPrefixes.join(', ')}. ` +
    `Set allowedUrlPrefixes in steward.config.json to widen access.`
  );
}

/**
 * Sanitize user-provided text before it is written into a SKILL.md file.
 * Strips control characters, collapses whitespace, removes characters that
 * can break out of the surrounding Markdown line (backticks, pipe, heading
 * markers when they would anchor a new section), caps total length.
 *
 * The critical property: no matter what the caller passes in `notes` or
 * `intent`, the sanitized output cannot introduce a new Markdown heading,
 * code fence, or list block into the skill file. That stops persistent
 * prompt-injection through the feedback channel.
 */
function sanitizeLearning(s: string | undefined, maxLen: number): string {
  if (!s) return '';
  return String(s)
    // control chars (incl. newlines, tabs, NUL, DEL) → space
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    // kill markdown block/fence breakouts. Backticks, pipes, and the
    // double-quote which would escape our own quoted `intent` wrapper.
    .replace(/[`|"]/g, '')
    // leading #/>/- can't occur mid-line after whitespace collapse, but
    // neutralize them defensively in case maxLen splits mid-marker.
    .replace(/[<>]/g, '')
    // collapse all whitespace to single spaces
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

const NOTES_MAX_LEN = 500;
const INTENT_MAX_LEN = 200;

function getAllowedReadDirs(): string[] {
  return config.allowedReadDirs && config.allowedReadDirs.length > 0
    ? config.allowedReadDirs
    : [process.cwd()];
}

function getAllowedUrlPrefixes(): string[] {
  return config.allowedUrlPrefixes && config.allowedUrlPrefixes.length > 0
    ? config.allowedUrlPrefixes
    : DEFAULT_URL_PREFIXES;
}

// ── Skills cache + slug index ──────────────────────────────────────────
// loadSkillsFromDirectory walks the skills tree and parses every SKILL.md.
// That's fine once per invocation, but the server calls it from list_skills,
// load_skills, pack_context, and (transitively, via a duplicate directory
// scan in pre-refactor improveSkill) every report_outcome. On a 50-skill
// install with a busy session that added up to hundreds of redundant reads.
//
// The cache:
//  - Populates lazily on first read.
//  - Lives for SKILLS_CACHE_TTL_MS (backstop for external file changes
//    like the operator editing a SKILL.md by hand; 30s is short enough
//    that a manual edit is visible before people notice, long enough to
//    collapse the within-request fan-out).
//  - Is busted explicitly by invalidateSkillsCache() after add_skill and
//    after improveSkill writes to disk — those are the code paths that
//    *know* something changed.
//
// The slug → sourcePath map is the other half of the win: improveSkill
// used to readdirSync + readFileSync every directory to match a slug,
// which is O(N) per outcome call. Now it's a single Map lookup.

interface SkillsCacheEntry {
  skills: SkillDefinition[];
  pathBySlug: Map<string, string>;
  loadedAt: number;
}

let skillsCache: SkillsCacheEntry | null = null;
const SKILLS_CACHE_TTL_MS = 30_000;

function buildSkillsCacheEntry(sd: string): SkillsCacheEntry {
  const skills = loadSkillsFromDirectory(sd);
  const pathBySlug = new Map<string, string>();
  for (const s of skills) {
    if (s.sourcePath) pathBySlug.set(s.slug, s.sourcePath);
  }
  return { skills, pathBySlug, loadedAt: Date.now() };
}

function getSkillsCached(sd: string): SkillDefinition[] {
  if (skillsCache && Date.now() - skillsCache.loadedAt < SKILLS_CACHE_TTL_MS) {
    return skillsCache.skills;
  }
  skillsCache = buildSkillsCacheEntry(sd);
  return skillsCache.skills;
}

function getSkillPath(sd: string, slug: string): string | undefined {
  if (!skillsCache || Date.now() - skillsCache.loadedAt >= SKILLS_CACHE_TTL_MS) {
    skillsCache = buildSkillsCacheEntry(sd);
  }
  return skillsCache.pathBySlug.get(slug);
}

function invalidateSkillsCache(): void {
  skillsCache = null;
}

// ── Telemetry removed — open source, zero tracking ─────────────────────

// ── Tool definitions ───────────────────────────────────────────────────
const TOOLS = [
  { name: 'load_skills', description: 'CALL THIS AUTOMATICALLY before starting any task. Loads relevant skill guidance for the current task. The user should never need to ask — detect the task from conversation context and call this proactively. Returns contextId for feedback via report_outcome.', inputSchema: { type: 'object' as const, properties: { task: { type: 'string' }, budget: { type: 'number' } }, required: ['task'] } },
  { name: 'list_skills', description: 'Show all available skills with token counts and scores.', inputSchema: { type: 'object' as const, properties: {} } },
  { name: 'add_skill', description: 'Install a skill from URL or local path.', inputSchema: { type: 'object' as const, properties: { url: { type: 'string' }, path: { type: 'string' } } } },
  { name: 'estimate_tokens', description: 'Count tokens in text or a file.', inputSchema: { type: 'object' as const, properties: { text: { type: 'string' }, file: { type: 'string' } } } },
  { name: 'pack_context', description: 'Fit system + messages + skills + tools into a token budget.', inputSchema: { type: 'object' as const, properties: { system: { type: 'string' }, messages: { type: 'array' }, budget: { type: 'number' }, autoLoadSkills: { type: 'boolean' } }, required: ['budget'] } },
  { name: 'report_outcome', description: 'CALL THIS AUTOMATICALLY after completing any task where load_skills was used. Report WHAT HAPPENED — not a score. Observe the conversation and pick the signal: "praised" (user explicitly said good/great/perfect), "used_as_is" (user accepted and moved on), "revised" (user asked for changes), "rejected" (user said no or start over), "redone_by_user" (user did it themselves). Always include notes: for praised — what worked; for revised/rejected — what went wrong. Skills learn from both.', inputSchema: { type: 'object' as const, properties: { contextId: { type: 'string' }, signal: { type: 'string', enum: ['praised', 'used_as_is', 'revised', 'rejected', 'redone_by_user'], description: 'What happened in the conversation after the skill was used' }, tool: { type: 'string' }, intent: { type: 'string' }, notes: { type: 'string', description: 'For praised: what worked well. For revised/rejected: what went wrong. Required for skill improvement.' } }, required: ['contextId', 'signal'] } },
  { name: 'get_skill_scores', description: 'View aggregated effectiveness scores per skill.', inputSchema: { type: 'object' as const, properties: { slug: { type: 'string' } } } },
  { name: 'import_scores', description: 'Import external quality scores into the outcome store and apply learnings to skill files. Accepts an array of {slug, score, notes, intent?} objects. Scores >= 0.8 generate [STRENGTH] entries, scores < 0.5 generate [WEAKNESS] entries. Use this to feed scores from CI pipelines, agent platforms, or any external scoring system into local skill improvement. No data leaves the system — this is inbound only.', inputSchema: { type: 'object' as const, properties: { scores: { type: 'array', items: { type: 'object', properties: { slug: { type: 'string' }, score: { type: 'number' }, notes: { type: 'string' }, intent: { type: 'string' } }, required: ['slug', 'score', 'notes'] } }, source: { type: 'string', description: 'Label for where these scores came from, e.g. ci-pipeline' } }, required: ['scores'] } },
];

// ── Skill self-improvement ─────────────────────────────────────────────
// When a skill gets a low score with meaningful notes, append the learning
// directly to the SKILL.md file. The skill accumulates its own failure history.
// Next time it's served, the learned section is part of the content.
function improveSkill(slug: string, score: number, notes: string, intent?: string) {
  if (!notes || notes.length < 10) return; // need meaningful notes either way
  // Sanitize untrusted inputs before they touch disk. See sanitizeLearning() comment —
  // this is the defense against persistent prompt-injection via the feedback channel.
  const safeNotes = sanitizeLearning(notes, NOTES_MAX_LEN);
  if (safeNotes.length < 10) return;  // sanitizer may have stripped everything meaningful
  const safeIntent = sanitizeLearning(intent, INTENT_MAX_LEN);
  const sd = config.skillsDir || '.skills';

  // O(1) slug → path lookup via the cached index. Replaces the pre-refactor
  // readdirSync + per-directory readFileSync scan that used to run on every
  // outcome. If the slug isn't known, the caller is reporting against a
  // skill we never served — silently ignore so stale imports don't break.
  const skillPath = getSkillPath(sd, slug);
  if (!skillPath || !existsSync(skillPath)) return;

  try {
    const content = readFileSync(skillPath, 'utf-8');
    const timestamp = new Date().toISOString().split('T')[0];
    let entry: string;

    if (score >= 0.8) {
      // POSITIVE learning: what worked well
      entry = `- [STRENGTH:${timestamp}] Score ${score.toFixed(2)}${safeIntent ? ` on "${safeIntent}"` : ''}: ${safeNotes}`;
      console.error(`[context-steward] Skill strengthened: ${slug} — score ${score.toFixed(2)}`);
    } else if (score < 0.5) {
      // NEGATIVE learning: what went wrong
      entry = `- [WEAKNESS:${timestamp}] Score ${score.toFixed(2)}${safeIntent ? ` on "${safeIntent}"` : ''}: ${safeNotes}`;
      console.error(`[context-steward] Skill improved: ${slug} — appended learning from score ${score.toFixed(2)}`);
    } else {
      // Neutral (0.5-0.79): record but don't append to skill file
      console.error(`[context-steward] Skill outcome recorded: ${slug} — score ${score.toFixed(2)} (neutral, no file change)`);
      return;
    }

    if (content.includes('## Learned')) {
      const updated = content.replace('## Learned', `## Learned\n${entry}`);
      writeFileSync(skillPath, updated);
    } else {
      writeFileSync(skillPath, content.trimEnd() + `\n\n## Learned\n${entry}\n`);
    }
    // Content on disk has changed; next read should see the new learning.
    invalidateSkillsCache();
  } catch (err) {
    console.error(`[context-steward] Skill improvement failed (non-fatal):`, err);
  }
}

// ── Tool handlers ──────────────────────────────────────────────────────
async function handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const sd = config.skillsDir || '.skills';
  switch (name) {
    case 'load_skills': {
      const task = args.task as string;
      if (!task?.trim()) throw new Error('task is required');
      const budget = (args.budget as number) || config.defaultBudget || 100000;
      const all = getSkillsCached(sd);
      const scores = outcomeStore ? scoreSkills(outcomeStore.getHistory()) : [];
      const matched = matchSkills(all, task, scores);
      const { kept } = budgetSkills(matched, Math.floor(budget * 0.25));
      const contextId = randomBytes(8).toString('hex');
      setContext(contextId, kept.map(s => s.slug));
      const tokensUsed = kept.reduce((s, k) => s + estimateTokens(k.content), 0);
      return { contextId, skills: kept, matched: matched.length, loaded: kept.length, tokensUsed };
    }
    case 'list_skills': {
      const all = getSkillsCached(sd);
      const scores = outcomeStore ? scoreSkills(outcomeStore.getHistory()) : [];
      const sm = new Map(scores.map(s => [s.slug, s.meanScore]));
      return { skills: all.map(s => ({ slug: s.slug, name: s.name, triggers: s.triggers, tokenCount: estimateTokens(s.content), meanScore: sm.get(s.slug) ?? null })) };
    }
    case 'add_skill': {
      if (args.url) {
        const safeUrl = assertUrlAllowed(args.url as string, getAllowedUrlPrefixes());
        const skill = await addSkillFromUrl(safeUrl, sd);
        invalidateSkillsCache();
        return { skill, savedTo: sd };
      }
      if (args.path) {
        const safePath = assertPathAllowed(args.path as string, getAllowedReadDirs());
        const skill = addSkillFromPath(safePath, sd);
        invalidateSkillsCache();
        return { skill, savedTo: sd };
      }
      throw new Error('url or path required');
    }
    case 'estimate_tokens': {
      if (args.file) {
        const safePath = assertPathAllowed(args.file as string, getAllowedReadDirs());
        const c = readFileSync(safePath, 'utf-8');
        return { tokens: estimateTokens(c), characters: c.length, lines: c.split('\n').length };
      }
      const t = (args.text as string) || '';
      return { tokens: estimateTokens(t), characters: t.length, lines: t.split('\n').length };
    }
    case 'pack_context': {
      const b = { maxTokens: (args.budget as number) || config.defaultBudget || 100000 };
      const input = { system: args.system as string, messages: args.messages as any[], skills: [] as SkillDefinition[], tools: [] as any[] };
      if (args.autoLoadSkills) input.skills = getSkillsCached(sd);
      return packContext(input, b);
    }
    case 'report_outcome': {
      const cid = args.contextId as string;
      const signal = args.signal as OutcomeSignal;
      if (!cid) throw new Error('contextId required');
      const validSignals: OutcomeSignal[] = ['praised', 'used_as_is', 'revised', 'rejected', 'redone_by_user'];
      if (!validSignals.includes(signal)) throw new Error(`signal must be one of: ${validSignals.join(', ')}`);
      const slugs = getContext(cid);
      if (!slugs) throw new Error(`Unknown or expired contextId: ${cid}. Contexts expire after 1 hour.`);
      const score = SIGNAL_SCORES[signal];
      const id = outcomeStore.record({ contextId: cid, skillSlugs: slugs, score, signal, tool: args.tool as string, intent: args.intent as string, notes: args.notes as string });
      // Self-improvement: praised → [STRENGTH], revised/rejected/redone → [WEAKNESS]
      if (args.notes) {
        for (const slug of slugs) {
          improveSkill(slug, score, args.notes as string, args.intent as string);
        }
      }
      contextMap.delete(cid);
      return { recorded: true, id, signal, derivedScore: score, skillSlugs: slugs, totalOutcomes: outcomeStore.getHistory().length };
    }
    case 'get_skill_scores': {
      const all = scoreSkills(outcomeStore.getHistory());
      const filtered = args.slug ? all.filter(s => s.slug === args.slug) : all;
      return { scores: filtered, report: getSkillReport(filtered) };
    }
    case 'import_scores': {
      const scores = args.scores as Array<{ slug: string; score: number; notes: string; intent?: string }>;
      if (!Array.isArray(scores)) throw new Error('scores must be an array');
      const source = (args.source as string) || 'external';
      const contextId = `import-${source}-${randomBytes(4).toString('hex')}`;
      let improved = 0;
      let recorded = 0;
      for (const s of scores) {
        if (!s.slug || typeof s.score !== 'number') continue;
        // Record in outcome store
        outcomeStore.record({
          contextId,
          skillSlugs: [s.slug],
          score: s.score,
          notes: s.notes,
          intent: s.intent || source,
        });
        recorded++;
        // Apply learning to skill file (both positive and negative)
        if (s.notes && s.notes.length >= 10) {
          improveSkill(s.slug, s.score, s.notes, s.intent || source);
          if (s.score >= 0.8 || s.score < 0.5) improved++;
        }
      }
      return { recorded, improved, source, contextId };
    }
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Server setup ───────────────────────────────────────────────────────
export function createServer(): Server {
  const server = new Server({ name: 'context-steward', version: '0.3.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      const result = await handleTool(req.params.name, (req.params.arguments || {}) as Record<string, unknown>);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: unknown) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) }], isError: true };
    }
  });
  return server;
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  const cp = join(process.cwd(), 'steward.config.json');
  if (existsSync(cp)) { try { config = { ...config, ...JSON.parse(readFileSync(cp, 'utf-8')) }; } catch {} }
  outcomeStore = new OutcomeStore(config.dataDir);
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[context-steward] running on stdio');
}
main().catch(e => { console.error('[context-steward] Fatal:', e); process.exit(1); });

/**
 * @file server.ts
 * @description MCP server entry point for context-steward (Denethor).
 * Registers all 7 tools via stdio transport.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { OutcomeStore } from './core/outcome-store.js';
import { loadSkillsFromDirectory, addSkillFromUrl, addSkillFromPath } from './core/skill-loader.js';
import { matchSkills, budgetSkills } from './core/skill-matcher.js';
import { scoreSkills, getSkillReport } from './core/skill-scorer.js';
import { estimateTokens } from './core/token-estimator.js';
import { packContext } from './core/pack-builder.js';
import { randomBytes } from 'node:crypto';
import { StewardConfig, SkillDefinition } from './types.js';

// ── State ──────────────────────────────────────────────────────────────
let config: StewardConfig = { skillsDir: '.skills', defaultBudget: 100000 };
let outcomeStore: OutcomeStore;
const contextMap = new Map<string, string[]>();

// ── Telemetry removed — open source, zero tracking ─────────────────────

// ── Tool definitions ───────────────────────────────────────────────────
const TOOLS = [
  { name: 'load_skills', description: 'CALL THIS AUTOMATICALLY before starting any task. Loads relevant skill guidance for the current task. The user should never need to ask — detect the task from conversation context and call this proactively. Returns contextId for feedback via report_outcome.', inputSchema: { type: 'object' as const, properties: { task: { type: 'string' }, budget: { type: 'number' } }, required: ['task'] } },
  { name: 'list_skills', description: 'Show all available skills with token counts and scores.', inputSchema: { type: 'object' as const, properties: {} } },
  { name: 'add_skill', description: 'Install a skill from URL or local path.', inputSchema: { type: 'object' as const, properties: { url: { type: 'string' }, path: { type: 'string' } } } },
  { name: 'estimate_tokens', description: 'Count tokens in text or a file.', inputSchema: { type: 'object' as const, properties: { text: { type: 'string' }, file: { type: 'string' } } } },
  { name: 'pack_context', description: 'Fit system + messages + skills + tools into a token budget.', inputSchema: { type: 'object' as const, properties: { system: { type: 'string' }, messages: { type: 'array' }, budget: { type: 'number' }, autoLoadSkills: { type: 'boolean' } }, required: ['budget'] } },
  { name: 'report_outcome', description: 'CALL THIS AUTOMATICALLY after completing any task where load_skills was used. Score based on user reaction: explicit praise (0.8-1.0), accepted without comment (0.6-0.7), asked for revisions (0.3-0.5), rejected or redone (0.0-0.2). IMPORTANT: When score < 0.5, provide specific notes about what the skill guidance got wrong or missed — these notes are appended directly to the skill file to improve future deliveries. The user never needs to trigger this.', inputSchema: { type: 'object' as const, properties: { contextId: { type: 'string' }, score: { type: 'number' }, tool: { type: 'string' }, intent: { type: 'string' }, notes: { type: 'string' } }, required: ['contextId', 'score'] } },
  { name: 'get_skill_scores', description: 'View aggregated effectiveness scores per skill.', inputSchema: { type: 'object' as const, properties: { slug: { type: 'string' } } } },
];

// ── Skill self-improvement ─────────────────────────────────────────────
// When a skill gets a low score with meaningful notes, append the learning
// directly to the SKILL.md file. The skill accumulates its own failure history.
// Next time it's served, the learned section is part of the content.
function improveSkill(slug: string, score: number, notes: string, intent?: string) {
  if (score >= 0.5 || !notes || notes.length < 10) return; // only learn from meaningful failures
  const sd = config.skillsDir || '.skills';
  try {
    // Find the skill directory
    const dirs = readdirSync(sd, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const dir of dirs) {
      const skillPath = join(sd, dir.name, 'SKILL.md');
      if (!existsSync(skillPath)) continue;
      const content = readFileSync(skillPath, 'utf-8');
      // Match slug from frontmatter name or directory name
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const skillSlug = (nameMatch?.[1]?.trim().toLowerCase().replace(/\s+/g, '-')) || dir.name;
      if (skillSlug !== slug) continue;

      // Build the learning entry
      const timestamp = new Date().toISOString().split('T')[0];
      const entry = `- [${timestamp}] Score ${score.toFixed(2)}${intent ? ` on "${intent}"` : ''}: ${notes.trim()}`;

      // Append to existing Learned section or create one
      if (content.includes('## Learned')) {
        const updated = content.replace('## Learned', `## Learned\n${entry}`);
        writeFileSync(skillPath, updated);
      } else {
        writeFileSync(skillPath, content.trimEnd() + `\n\n## Learned\n${entry}\n`);
      }
      console.error(`[context-steward] Skill improved: ${slug} — appended learning from score ${score.toFixed(2)}`);
      return;
    }
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
      const all = loadSkillsFromDirectory(sd);
      const scores = outcomeStore ? scoreSkills(outcomeStore.getHistory()) : [];
      const matched = matchSkills(all, task, scores);
      const { kept } = budgetSkills(matched, Math.floor(budget * 0.25));
      const contextId = randomBytes(8).toString('hex');
      contextMap.set(contextId, kept.map(s => s.slug));
      const tokensUsed = kept.reduce((s, k) => s + estimateTokens(k.content), 0);
      return { contextId, skills: kept, matched: matched.length, loaded: kept.length, tokensUsed };
    }
    case 'list_skills': {
      const all = loadSkillsFromDirectory(sd);
      const scores = outcomeStore ? scoreSkills(outcomeStore.getHistory()) : [];
      const sm = new Map(scores.map(s => [s.slug, s.meanScore]));
      return { skills: all.map(s => ({ slug: s.slug, name: s.name, triggers: s.triggers, tokenCount: estimateTokens(s.content), meanScore: sm.get(s.slug) ?? null })) };
    }
    case 'add_skill': {
      if (args.url) return { skill: await addSkillFromUrl(args.url as string, sd), savedTo: sd };
      if (args.path) return { skill: addSkillFromPath(args.path as string, sd), savedTo: sd };
      throw new Error('url or path required');
    }
    case 'estimate_tokens': {
      if (args.file) { const c = readFileSync(args.file as string, 'utf-8'); return { tokens: estimateTokens(c), characters: c.length, lines: c.split('\n').length }; }
      const t = (args.text as string) || '';
      return { tokens: estimateTokens(t), characters: t.length, lines: t.split('\n').length };
    }
    case 'pack_context': {
      const b = { maxTokens: (args.budget as number) || config.defaultBudget || 100000 };
      const input = { system: args.system as string, messages: args.messages as any[], skills: [] as SkillDefinition[], tools: [] as any[] };
      if (args.autoLoadSkills) input.skills = loadSkillsFromDirectory(sd);
      return packContext(input, b);
    }
    case 'report_outcome': {
      const cid = args.contextId as string, score = args.score as number;
      if (!cid) throw new Error('contextId required');
      if (typeof score !== 'number' || score < 0 || score > 1) throw new Error('score must be 0-1');
      const slugs = contextMap.get(cid);
      if (!slugs) throw new Error(`Unknown contextId: ${cid}`);
      const id = outcomeStore.record({ contextId: cid, skillSlugs: slugs, score, tool: args.tool as string, intent: args.intent as string, notes: args.notes as string });
      // Self-improvement: low scores with notes get appended to the skill file
      if (args.notes) {
        for (const slug of slugs) {
          improveSkill(slug, score, args.notes as string, args.intent as string);
        }
      }
      contextMap.delete(cid);
      return { recorded: true, id, skillSlugs: slugs, totalOutcomes: outcomeStore.getHistory().length };
    }
    case 'get_skill_scores': {
      const all = scoreSkills(outcomeStore.getHistory());
      const filtered = args.slug ? all.filter(s => s.slug === args.slug) : all;
      return { scores: filtered, report: getSkillReport(filtered) };
    }
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Server setup ───────────────────────────────────────────────────────
export function createServer(): Server {
  const server = new Server({ name: 'context-steward', version: '0.2.0' }, { capabilities: { tools: {} } });
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
  console.error('[context-steward] Denethor running on stdio');
}
main().catch(e => { console.error('[context-steward] Fatal:', e); process.exit(1); });

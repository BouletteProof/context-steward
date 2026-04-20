/**
 * @file skill-loader.ts
 * @description Public barrel for skill-related operations.
 *
 * The previous monolithic implementation was split into cohesive modules
 * on 2026-04-20 to address the "file too large to review" finding from
 * the 2026-04-19 code review. Consumers import from here and never need
 * to know about the split.
 *
 * Modules:
 *   - `skill-parser.ts`  — pure parsing of the Anthropic v2 format
 *   - `skill-fs.ts`      — filesystem discovery + bulk load
 *   - `skill-fetch.ts`   — HTTP/HTTPS fetch helper
 *   - `skill-install.ts` — writes new skills into the managed directory
 *
 * If you are adding a new public export, prefer adding it to the
 * appropriate module and re-exporting here. Do NOT fold logic back into
 * this file — the split exists so each piece stays under the size
 * threshold where night-batch code review can actually parse it.
 *
 * @module context-steward/core/skill-loader
 */

export { loadSkillsFromDirectory } from './skill-fs.js';
export { addSkillFromUrl, addSkillFromPath } from './skill-install.js';

/**
 * @file skill-install.ts
 * @description Writes new skills into the managed skills directory.
 *
 * Two entry points:
 *   - `addSkillFromUrl`  — fetches SKILL.md over HTTP(S), writes to disk
 *   - `addSkillFromPath` — copies a local SKILL.md into the managed tree
 *
 * Both validate the content parses as Anthropic v2 before writing anything,
 * so a malformed input leaves the target directory untouched.
 *
 * Security note: URL/path validation (scheme allowlist, directory allowlist,
 * SSRF protection) happens one layer up in `server.ts`. By the time a path
 * or URL reaches this module it has already been checked; this module
 * trusts its inputs. Any changes here must preserve that contract — do NOT
 * add allowlist bypasses in install helpers.
 *
 * @module context-steward/core/skill-install
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SkillDefinition } from '../types.js';
import { parseSkillFile, slugify } from './skill-parser.js';
import { fetchUrl } from './skill-fetch.js';

/**
 * Fetches a `SKILL.md` file from the given URL and stores it under
 * `<targetDir>/<slug>/SKILL.md`, where `slug` is derived from the skill's
 * `name` frontmatter field (or the URL path segment if the name is absent).
 *
 * The target subdirectory is created automatically if it does not exist.
 *
 * @param url       - The fully-qualified URL to fetch the SKILL.md from (http or https).
 * @param targetDir - Absolute or relative path to the managed skills directory.
 * @returns A promise resolving to the parsed {@link SkillDefinition}.
 * @throws {Error} If either argument is invalid, the fetch fails, the HTTP status
 *                 indicates an error, or the fetched content is not a valid SKILL.md.
 *
 * @example
 * ```ts
 * const skill = await addSkillFromUrl(
 *   'https://example.com/skills/typescript/SKILL.md',
 *   './managed-skills'
 * );
 * console.log(skill.slug); // e.g. "typescript"
 * ```
 */
export async function addSkillFromUrl(url: string, targetDir: string): Promise<SkillDefinition> {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('addSkillFromUrl: url must be a non-empty string');
  }
  if (typeof targetDir !== 'string' || targetDir.trim() === '') {
    throw new Error('addSkillFromUrl: targetDir must be a non-empty string');
  }

  let rawText: string;
  try {
    rawText = await fetchUrl(url.trim());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`addSkillFromUrl: failed to fetch "${url}": ${message}`);
  }

  // Derive a fallback slug from the URL path before we parse
  const urlPathSegments = url.replace(/\/$/, '').split('/');
  const urlSlugFallback = slugify(urlPathSegments[urlPathSegments.length - 2] ?? urlPathSegments[urlPathSegments.length - 1] ?? 'skill');

  const skill = parseSkillFile(rawText, path.join(targetDir, urlSlugFallback, 'SKILL.md'));
  if (skill === null) {
    throw new Error(`addSkillFromUrl: content fetched from "${url}" is not a valid Anthropic v2 SKILL.md`);
  }

  const resolvedTargetDir = path.resolve(targetDir);
  const skillDir = path.join(resolvedTargetDir, skill.slug);
  const destPath = path.join(skillDir, 'SKILL.md');

  try {
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(destPath, rawText, 'utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`addSkillFromUrl: failed to write skill to "${destPath}": ${message}`);
  }

  return skill;
}

/**
 * Copies a local `SKILL.md` file into the managed skills directory under
 * `<targetDir>/<slug>/SKILL.md`, where `slug` is derived from the skill's
 * `name` frontmatter field.
 *
 * The target subdirectory is created automatically if it does not exist.
 * The source file is copied (not moved) so the original remains intact.
 *
 * @param sourcePath - Absolute or relative path to the source SKILL.md file.
 * @param targetDir  - Absolute or relative path to the managed skills directory.
 * @returns The parsed {@link SkillDefinition} for the copied skill.
 * @throws {Error} If either argument is invalid, the source file cannot be read,
 *                 the content is not a valid SKILL.md, or writing fails.
 *
 * @example
 * ```ts
 * const skill = addSkillFromPath('./my-skill/SKILL.md', './managed-skills');
 * console.log(skill.name); // "My Skill"
 * ```
 */
export function addSkillFromPath(sourcePath: string, targetDir: string): SkillDefinition {
  if (typeof sourcePath !== 'string' || sourcePath.trim() === '') {
    throw new Error('addSkillFromPath: sourcePath must be a non-empty string');
  }
  if (typeof targetDir !== 'string' || targetDir.trim() === '') {
    throw new Error('addSkillFromPath: targetDir must be a non-empty string');
  }

  const resolvedSource = path.resolve(sourcePath.trim());

  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`addSkillFromPath: source file not found: "${resolvedSource}"`);
  }

  let rawText: string;
  try {
    rawText = fs.readFileSync(resolvedSource, 'utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`addSkillFromPath: failed to read "${resolvedSource}": ${message}`);
  }

  const skill = parseSkillFile(rawText, resolvedSource);
  if (skill === null) {
    throw new Error(`addSkillFromPath: "${resolvedSource}" is not a valid Anthropic v2 SKILL.md`);
  }

  const resolvedTargetDir = path.resolve(targetDir.trim());
  const skillDir = path.join(resolvedTargetDir, skill.slug);
  const destPath = path.join(skillDir, 'SKILL.md');

  try {
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(destPath, rawText, 'utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`addSkillFromPath: failed to write skill to "${destPath}": ${message}`);
  }

  return skill;
}

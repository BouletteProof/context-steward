/**
 * @file skill-fs.ts
 * @description Filesystem-facing skill operations: recursive SKILL.md discovery
 * and bulk loading from a directory tree.
 *
 * This module only reads from disk. Writes (installing new skills) live in
 * skill-install.ts. Parsing lives in skill-parser.ts. Keeping the read side
 * isolated makes it cheap to mock for tests and keeps the I/O surface small.
 *
 * @module context-steward/core/skill-fs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SkillDefinition } from '../types.js';
import { parseSkillFile } from './skill-parser.js';

/**
 * Recursively collects all absolute file paths whose basename matches `SKILL.md`
 * starting from the given root directory.
 *
 * Errors on individual entries (permission denied, broken symlink) are
 * swallowed so a single unreadable subtree does not prevent discovery of
 * the remaining skills.
 *
 * @param rootDir - The absolute or relative directory to start scanning from.
 * @returns An array of absolute paths to discovered SKILL.md files.
 */
export function findSkillFiles(rootDir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(rootDir)) {
    return results;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = findSkillFiles(fullPath);
      for (const p of nested) {
        results.push(p);
      }
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Recursively scans a directory tree for `SKILL.md` files conforming to the
 * Anthropic v2 format and returns parsed {@link SkillDefinition} objects.
 *
 * Malformed or unreadable files are silently skipped rather than throwing,
 * so the caller always receives all successfully parsed skills.
 *
 * @param dir - Absolute or relative path to the root directory to scan.
 * @returns An array of {@link SkillDefinition} objects for every valid SKILL.md found.
 * @throws {Error} If `dir` is not a non-empty string.
 *
 * @example
 * ```ts
 * const skills = loadSkillsFromDirectory('./skills');
 * console.log(skills.map(s => s.name));
 * ```
 */
export function loadSkillsFromDirectory(dir: string): SkillDefinition[] {
  if (typeof dir !== 'string' || dir.trim() === '') {
    throw new Error('loadSkillsFromDirectory: dir must be a non-empty string');
  }

  const resolvedDir = path.resolve(dir);
  const skillFiles = findSkillFiles(resolvedDir);
  const skills: SkillDefinition[] = [];

  for (const filePath of skillFiles) {
    try {
      const rawText = fs.readFileSync(filePath, 'utf8');
      const skill = parseSkillFile(rawText, filePath);
      if (skill !== null) {
        skills.push(skill);
      }
    } catch {
      // Unreadable files are silently skipped
    }
  }

  return skills;
}

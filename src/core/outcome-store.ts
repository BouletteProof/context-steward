/**
 * @file outcome-store.ts
 * @description SQLite-backed persistence for the context-steward feedback loop.
 * Provides a robust mechanism for recording and querying skill outcomes.
 *
 * @module context-steward/core/outcome-store
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { OutcomeRecord, SkillScore } from '../types.js';
import { createRequire } from 'node:module';

/**
 * OutcomeStore manages persistence of skill outcomes.
 * Falls back to an in-memory Map if better-sqlite3 is unavailable.
 */
export class OutcomeStore {
  private db: any = null;
  private memoryStore: Map<string, OutcomeRecord> = new Map();
  private useMemory: boolean = false;

  /**
   * Initializes the outcome store.
   * @param dbPath Optional filesystem path for the SQLite database.
   */
  constructor(dbPath?: string, persistent: boolean = true) {
    if (!persistent) {
      // Explicit opt-out: no disk access, no warning, session-only.
      this.useMemory = true;
      return;
    }

    const resolvedPath = dbPath || path.join(os.homedir(), '.context-steward', 'outcomes.db');

    try {
      const esmRequire = createRequire(import.meta.url);
      const Database = esmRequire('better-sqlite3');
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(resolvedPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS outcomes (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
          context_id TEXT NOT NULL,
          skill_slugs TEXT NOT NULL,
          tool TEXT,
          intent TEXT,
          score REAL NOT NULL CHECK(score >= 0 AND score <= 1),
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_outcomes_skill ON outcomes(skill_slugs);
        CREATE INDEX IF NOT EXISTS idx_outcomes_tool ON outcomes(tool);
      `);
    } catch (error) {
      console.warn('OutcomeStore: better-sqlite3 unavailable, falling back to in-memory storage.', error);
      this.useMemory = true;
    }
  }

  /**
   * Records an outcome in the store.
   * @param outcome The outcome record to persist.
   * @returns The ID of the created record.
   */
  public record(outcome: OutcomeRecord): string {
    if (!outcome.contextId || typeof outcome.score !== 'number') {
      throw new Error('Invalid OutcomeRecord: contextId and score are required.');
    }

    if (this.useMemory) {
      const id = outcome.id || Math.random().toString(36).substring(2);
      this.memoryStore.set(id, { ...outcome, id });
      return id;
    }

    const stmt = this.db.prepare(`
      INSERT INTO outcomes (context_id, skill_slugs, tool, intent, score, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      outcome.contextId,
      Array.isArray(outcome.skillSlugs) ? outcome.skillSlugs.join(',') : '',
      outcome.tool || null,
      outcome.intent || null,
      outcome.score,
      outcome.notes || null
    );
    return info.lastInsertRowid as string;
  }

  /**
   * Retrieves historical outcomes.
   * @param slug Optional filter by skill slug.
   * @param limit Maximum number of records to return.
   * @returns Array of matching outcomes.
   */
  public getHistory(slug?: string, limit: number = 100): OutcomeRecord[] {
    if (this.useMemory) {
      return Array.from(this.memoryStore.values()).slice(0, limit);
    }

    const query = slug
      ? 'SELECT * FROM outcomes WHERE skill_slugs LIKE ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM outcomes ORDER BY created_at DESC LIMIT ?';
    
    const params = slug ? [`%${slug}%`, limit] : [limit];
    return this.db.prepare(query).all(...params);
  }

  /**
   * Calculates average scores per skill.
   * @returns Array of skill scores.
   */
  public getScores(): SkillScore[] {
    if (this.useMemory) return []; // Implementation omitted for memory fallback
    
    return this.db.prepare(`
      SELECT skill_slugs as slug, AVG(score) as averageScore, COUNT(*) as count
      FROM outcomes
      GROUP BY skill_slugs
    `).all();
  }

  /**
   * Resets the store.
   */
  public reset(): void {
    if (this.useMemory) {
      this.memoryStore.clear();
    } else {
      this.db.exec('DELETE FROM outcomes');
    }
  }

  /**
   * Closes the database connection.
   */
  public close(): void {
    if (!this.useMemory && this.db) {
      this.db.close();
    }
  }
}
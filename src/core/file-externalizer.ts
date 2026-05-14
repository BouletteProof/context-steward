/**
 * File Externalizer - Store large results outside context
 * 
 * Large tool results are:
 * 1. Saved to temp files
 * 2. Summarized for context
 * 3. Available for recall if needed
 */

import { writeFile, readFile, mkdir, unlink, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type {
  ExternalizeParams,
  ExternalizeResult,
  LLMAdapter
} from '../types';

export class FileExternalizer {
  private tempDir: string;
  private maxFileSizeMB: number;
  private cleanupAfterHours: number;
  private adapter?: LLMAdapter;
  private fileRegistry: Map<string, { path: string; expiresAt: Date; toolName: string }>;

  constructor(config?: {
    tempDir?: string;
    maxFileSizeMB?: number;
    cleanupAfterHours?: number;
    adapter?: LLMAdapter;
  }) {
    this.tempDir = config?.tempDir || '/tmp/context-steward';
    this.maxFileSizeMB = config?.maxFileSizeMB || 10;
    this.cleanupAfterHours = config?.cleanupAfterHours || 24;
    this.adapter = config?.adapter;
    this.fileRegistry = new Map();
  }

  /**
   * Initialize temp directory
   */
  async init(): Promise<void> {
    if (!existsSync(this.tempDir)) {
      await mkdir(this.tempDir, { recursive: true });
    }
  }

  /**
   * Externalize a large result
   */
  async externalize(params: ExternalizeParams): Promise<ExternalizeResult> {
    await this.init();

    const {
      toolName,
      result,
      filter,
      summaryPrompt,
      maxSummaryTokens = 500,
      ttlHours = this.cleanupAfterHours
    } = params;

    // Convert result to string
    const resultString = typeof result === 'string' 
      ? result 
      : JSON.stringify(result, null, 2);

    const originalBytes = Buffer.byteLength(resultString, 'utf8');

    // Check size limit
    if (originalBytes > this.maxFileSizeMB * 1024 * 1024) {
      throw new Error(`Result too large: ${(originalBytes / 1024 / 1024).toFixed(2)}MB exceeds ${this.maxFileSizeMB}MB limit`);
    }

    // Apply filter if provided
    let filteredResult = result;
    if (filter && typeof result === 'object' && Array.isArray(result)) {
      filteredResult = this.applyFilter(result, filter);
    }

    // Generate file path
    const fileId = randomUUID().slice(0, 8);
    const fileName = `${toolName}_${fileId}.json`;
    const filePath = join(this.tempDir, fileName);

    // Save to file
    await writeFile(filePath, resultString, 'utf8');

    // Generate summary
    const summary = await this.generateSummary(
      filteredResult,
      toolName,
      summaryPrompt,
      maxSummaryTokens
    );

    // Calculate tokens saved
    const originalTokens = this.countTokens(resultString);
    const summaryTokens = this.countTokens(summary);
    const tokensSaved = originalTokens - summaryTokens;

    // Set expiry
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    // Register file
    this.fileRegistry.set(filePath, { path: filePath, expiresAt, toolName });

    return {
      summary,
      filePath,
      originalBytes,
      summaryTokens,
      tokensSaved,
      expiresAt
    };
  }

  /**
   * Recall full data from externalized file
   */
  async recall(filePath: string): Promise<unknown> {
    const content = await readFile(filePath, 'utf8');
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  /**
   * Check if a file exists and is valid
   */
  async exists(filePath: string): Promise<boolean> {
    const entry = this.fileRegistry.get(filePath);
    if (!entry) return false;
    
    if (new Date() > entry.expiresAt) {
      await this.delete(filePath);
      return false;
    }

    return existsSync(filePath);
  }

  /**
   * Delete an externalized file
   */
  async delete(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
      this.fileRegistry.delete(filePath);
    } catch {
      // File may already be deleted
    }
  }

  /**
   * Cleanup expired files
   */
  async cleanup(): Promise<number> {
    await this.init();
    
    let cleaned = 0;
    const now = new Date();

    // Clean from registry
    for (const [path, entry] of this.fileRegistry.entries()) {
      if (now > entry.expiresAt) {
        await this.delete(path);
        cleaned++;
      }
    }

    // Also scan directory for orphaned files
    try {
      const files = await readdir(this.tempDir);
      for (const file of files) {
        const filePath = join(this.tempDir, file);
        const fileStat = await stat(filePath);
        const ageHours = (now.getTime() - fileStat.mtime.getTime()) / (1000 * 60 * 60);
        
        if (ageHours > this.cleanupAfterHours && !this.fileRegistry.has(filePath)) {
          await unlink(filePath);
          cleaned++;
        }
      }
    } catch {
      // Directory may not exist
    }

    return cleaned;
  }

  /**
   * Apply filter to array results
   */
  private applyFilter(data: unknown[], filter: Record<string, unknown>): unknown[] {
    return data.filter(item => {
      if (typeof item !== 'object' || item === null) return true;
      
      for (const [key, value] of Object.entries(filter)) {
        const itemValue = (item as Record<string, unknown>)[key];
        if (itemValue !== value) return false;
      }
      return true;
    });
  }

  /**
   * Generate summary of externalized data
   */
  private async generateSummary(
    data: unknown,
    toolName: string,
    customPrompt?: string,
    maxTokens: number = 500
  ): Promise<string> {
    // If adapter has summary capability, use it
    if (this.adapter?.generateSummary && typeof data === 'object') {
      const dataStr = JSON.stringify(data, null, 2);
      const prompt = customPrompt || `Summarize this ${toolName} result concisely:`;
      return await this.adapter.generateSummary(`${prompt}\n\n${dataStr}`, maxTokens);
    }

    // Fallback: generate basic summary
    return this.generateBasicSummary(data, toolName);
  }

  /**
   * Generate basic summary without LLM
   */
  private generateBasicSummary(data: unknown, toolName: string): string {
    if (Array.isArray(data)) {
      const count = data.length;
      const sample = data.slice(0, 3);
      
      // Try to detect common patterns
      if (count > 0 && typeof data[0] === 'object' && data[0] !== null) {
        const keys = Object.keys(data[0]);
        const statusKey = keys.find(k => ['status', 'state', 'type'].includes(k.toLowerCase()));
        
        if (statusKey) {
          // Group by status
          const groups: Record<string, number> = {};
          for (const item of data) {
            const status = String((item as Record<string, unknown>)[statusKey] || 'unknown');
            groups[status] = (groups[status] || 0) + 1;
          }
          
          const groupSummary = Object.entries(groups)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          
          return `${toolName}: ${count} items. By ${statusKey}: ${groupSummary}. Sample: ${JSON.stringify(sample[0]).slice(0, 100)}...`;
        }
      }
      
      return `${toolName}: ${count} items. Sample: ${JSON.stringify(sample).slice(0, 200)}...`;
    }

    if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data);
      return `${toolName}: Object with ${keys.length} properties: ${keys.slice(0, 10).join(', ')}${keys.length > 10 ? '...' : ''}`;
    }

    if (typeof data === 'string') {
      return `${toolName}: ${data.length} characters. Preview: ${data.slice(0, 200)}...`;
    }

    return `${toolName}: ${typeof data} value`;
  }

  /**
   * Count tokens in text
   */
  private countTokens(text: string): number {
    if (this.adapter) {
      return this.adapter.countTokens(text);
    }
    // Fallback estimate
    return Math.ceil(text.length / 4);
  }

  /**
   * Get registry stats
   */
  getStats(): { files: number; totalBytes: number; oldestFile: Date | null } {
    let totalBytes = 0;
    let oldestFile: Date | null = null;

    for (const [, entry] of this.fileRegistry) {
      // Would need to stat files for actual size
      if (!oldestFile || entry.expiresAt < oldestFile) {
        oldestFile = entry.expiresAt;
      }
    }

    return {
      files: this.fileRegistry.size,
      totalBytes,
      oldestFile
    };
  }
}

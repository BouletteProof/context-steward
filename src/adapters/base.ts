/**
 * Base Adapter - Abstract class for LLM adapters
 */

import type { LLMAdapter, Message, AdapterConfig } from '../types';

export abstract class BaseAdapter implements LLMAdapter {
  abstract name: string;
  model: string;
  protected baseUrl?: string;
  protected apiKey?: string;
  protected timeout: number;

  constructor(config: AdapterConfig) {
    this.model = config.model;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000;
  }

  /**
   * Count tokens in text - must be implemented by subclass
   */
  abstract countTokens(text: string): number;

  /**
   * Count tokens in messages
   */
  countMessageTokens(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      // Add overhead for role and structure
      total += 4; // Approximate overhead per message
      total += this.countTokens(msg.content);
      if (msg.name) {
        total += this.countTokens(msg.name);
      }
    }
    return total;
  }

  /**
   * Get model's max context length - should be overridden
   */
  abstract getMaxContext(): number;

  /**
   * Get pricing per 1K tokens - should be overridden
   */
  abstract getPricing(): { input: number; output: number };

  /**
   * Generate summary using the LLM
   */
  async generateSummary(text: string, maxTokens: number): Promise<string> {
    // Default implementation - can be overridden
    // This is a fallback that just truncates
    const tokens = this.countTokens(text);
    if (tokens <= maxTokens) {
      return text;
    }

    // Simple truncation
    const ratio = maxTokens / tokens;
    const chars = Math.floor(text.length * ratio);
    return text.slice(0, chars) + '...';
  }

  /**
   * Make API request - helper for subclasses
   */
  protected async makeRequest(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

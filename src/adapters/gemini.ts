/**
 * Gemini Adapter - Google's Gemini models
 */

import { BaseAdapter } from './base';
import type { AdapterConfig } from '../types';

// Model context limits
const MODEL_CONTEXTS: Record<string, number> = {
  'gemini-1.5-pro': 2097152,    // 2M tokens
  'gemini-1.5-flash': 1048576,  // 1M tokens
  'gemini-2.0-flash': 1048576,
  'gemini-2.5-pro': 1048576,
  'gemini-3-pro': 1048576,
  'gemini-pro': 32760,
  'gemini-pro-vision': 16384
};

// Model pricing per 1K tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  'gemini-2.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-3-pro': { input: 0.00125, output: 0.005 },
  'gemini-pro': { input: 0.0005, output: 0.0015 },
  'gemini-pro-vision': { input: 0.0005, output: 0.0015 }
};

export class GeminiAdapter extends BaseAdapter {
  name = 'gemini';

  constructor(config: AdapterConfig) {
    super({
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      ...config
    });
  }

  /**
   * Count tokens - Gemini uses similar tokenization
   */
  countTokens(text: string): number {
    // Gemini tokenization is similar to other models
    // Could use their countTokens API but keeping it simple
    return Math.ceil(text.length / 4);
  }

  /**
   * Count tokens using Gemini API
   */
  async countTokensAsync(text: string): Promise<number> {
    if (!this.apiKey) {
      return this.countTokens(text);
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/models/${this.model}:countTokens?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }]
          })
        }
      );

      if (response.ok) {
        const data = await response.json() as any;
        return data.totalTokens || this.countTokens(text);
      }
    } catch {
      // Fall back to estimate
    }

    return this.countTokens(text);
  }

  /**
   * Get max context for model
   */
  getMaxContext(): number {
    for (const [prefix, context] of Object.entries(MODEL_CONTEXTS)) {
      if (this.model.includes(prefix)) {
        return context;
      }
    }
    return 32760; // Default
  }

  /**
   * Get pricing for model
   */
  getPricing(): { input: number; output: number } {
    for (const [prefix, pricing] of Object.entries(MODEL_PRICING)) {
      if (this.model.includes(prefix)) {
        return pricing;
      }
    }
    return { input: 0.0005, output: 0.0015 }; // Default
  }

  /**
   * Generate summary using Gemini
   */
  async generateSummary(text: string, maxTokens: number): Promise<string> {
    if (!this.apiKey) {
      return super.generateSummary(text, maxTokens);
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Summarize this in ${maxTokens} tokens or less. Be extremely concise:\n\n${text}`
              }]
            }],
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature: 0.3
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json() as any;
      return data.candidates?.[0]?.content?.parts?.[0]?.text || text.slice(0, maxTokens * 4);
    } catch (error) {
      console.debug('Gemini summary failed:', error);
      return super.generateSummary(text, maxTokens);
    }
  }
}

/**
 * Anthropic Adapter - Claude models
 */

import { BaseAdapter } from './base';
import type { AdapterConfig } from '../types';

// Model context limits
const MODEL_CONTEXTS: Record<string, number> = {
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  'claude-3-5-sonnet': 200000,
  'claude-3-5-haiku': 200000,
  'claude-sonnet-4': 200000,
  'claude-opus-4': 200000,
  'claude-2.1': 200000,
  'claude-2': 100000,
  'claude-instant': 100000
};

// Model pricing per 1K tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-5-haiku': { input: 0.0008, output: 0.004 },
  'claude-sonnet-4': { input: 0.003, output: 0.015 },
  'claude-opus-4': { input: 0.015, output: 0.075 },
  'claude-2.1': { input: 0.008, output: 0.024 },
  'claude-2': { input: 0.008, output: 0.024 },
  'claude-instant': { input: 0.0008, output: 0.0024 }
};

export class AnthropicAdapter extends BaseAdapter {
  name = 'anthropic';

  constructor(config: AdapterConfig) {
    super({
      baseUrl: 'https://api.anthropic.com/v1',
      ...config
    });
  }

  /**
   * Count tokens - Anthropic uses similar tokenization to GPT
   */
  countTokens(text: string): number {
    // Try to use tiktoken if available (Claude uses similar tokenization)
    try {
      const { encoding_for_model } = require('tiktoken');
      const encoder = encoding_for_model('gpt-4');
      return encoder.encode(text).length;
    } catch {
      // Fallback: rough estimate
      return Math.ceil(text.length / 4);
    }
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
    return 200000; // Default for Claude 3+
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
    return { input: 0.003, output: 0.015 }; // Default Sonnet pricing
  }

  /**
   * Generate summary using Anthropic API
   */
  async generateSummary(text: string, maxTokens: number): Promise<string> {
    if (!this.apiKey) {
      return super.generateSummary(text, maxTokens);
    }

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          messages: [
            {
              role: 'user',
              content: `Summarize this in ${maxTokens} tokens or less. Be extremely concise:\n\n${text}`
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const data = await response.json() as any;
      return data.content?.[0]?.text || text.slice(0, maxTokens * 4);
    } catch (error) {
      console.debug('Anthropic summary failed:', error);
      return super.generateSummary(text, maxTokens);
    }
  }
}

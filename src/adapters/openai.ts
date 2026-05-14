/**
 * OpenAI Adapter - Works with OpenAI API and compatible APIs
 */

import { BaseAdapter } from './base';
import type { AdapterConfig } from '../types';

// Model context limits
const MODEL_CONTEXTS: Record<string, number> = {
  'gpt-4': 8192,
  'gpt-4-32k': 32768,
  'gpt-4-turbo': 128000,
  'gpt-4-turbo-preview': 128000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-3.5-turbo': 16385,
  'gpt-3.5-turbo-16k': 16385,
  'o1': 200000,
  'o1-mini': 128000,
  'o1-preview': 128000
};

// Model pricing per 1K tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-32k': { input: 0.06, output: 0.12 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'gpt-3.5-turbo-16k': { input: 0.003, output: 0.004 },
  'o1': { input: 0.015, output: 0.06 },
  'o1-mini': { input: 0.003, output: 0.012 },
  'o1-preview': { input: 0.015, output: 0.06 }
};

export class OpenAIAdapter extends BaseAdapter {
  name = 'openai';
  private encoder: any; // tiktoken encoder

  constructor(config: AdapterConfig) {
    super({
      baseUrl: 'https://api.openai.com/v1',
      ...config
    });
  }

  /**
   * Count tokens using tiktoken
   */
  countTokens(text: string): number {
    // Try to use tiktoken if available
    try {
      if (!this.encoder) {
        // Dynamic import would be better but keeping it simple
        const { encoding_for_model } = require('tiktoken');
        this.encoder = encoding_for_model(this.model as any);
      }
      return this.encoder.encode(text).length;
    } catch {
      // Fallback: rough estimate
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Get max context for model
   */
  getMaxContext(): number {
    // Try exact match first
    if (MODEL_CONTEXTS[this.model]) {
      return MODEL_CONTEXTS[this.model];
    }

    // Try prefix match
    for (const [prefix, context] of Object.entries(MODEL_CONTEXTS)) {
      if (this.model.startsWith(prefix)) {
        return context;
      }
    }

    // Default
    return 8192;
  }

  /**
   * Get pricing for model
   */
  getPricing(): { input: number; output: number } {
    // Try exact match first
    if (MODEL_PRICING[this.model]) {
      return MODEL_PRICING[this.model];
    }

    // Try prefix match
    for (const [prefix, pricing] of Object.entries(MODEL_PRICING)) {
      if (this.model.startsWith(prefix)) {
        return pricing;
      }
    }

    // Default
    return { input: 0.01, output: 0.03 };
  }

  /**
   * Generate summary using OpenAI API
   */
  async generateSummary(text: string, maxTokens: number): Promise<string> {
    if (!this.apiKey) {
      return super.generateSummary(text, maxTokens);
    }

    try {
      const response = await this.makeRequest(`${this.baseUrl}/chat/completions`, {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a concise summarizer. Summarize the given content in as few words as possible while preserving key information.'
          },
          {
            role: 'user',
            content: `Summarize this in ${maxTokens} tokens or less:\n\n${text}`
          }
        ],
        max_tokens: maxTokens,
        temperature: 0.3
      }) as any;

      return response.choices?.[0]?.message?.content || text.slice(0, maxTokens * 4);
    } catch (error) {
      console.debug('OpenAI summary failed:', error);
      return super.generateSummary(text, maxTokens);
    }
  }
}

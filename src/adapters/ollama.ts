/**
 * Ollama Adapter - Local models via Ollama
 */

import { BaseAdapter } from './base';
import type { AdapterConfig } from '../types';

// Common model context sizes
const MODEL_CONTEXTS: Record<string, number> = {
  'llama3': 8192,
  'llama3.1': 131072,
  'llama3.2': 131072,
  'llama2': 4096,
  'mistral': 32768,
  'mixtral': 32768,
  'codellama': 16384,
  'deepseek': 16384,
  'deepseek-coder': 16384,
  'deepseek-coder-v2': 131072,
  'qwen': 32768,
  'qwen2': 131072,
  'phi': 2048,
  'phi3': 128000,
  'gemma': 8192,
  'gemma2': 8192,
  'nomic-embed-text': 8192
};

export class OllamaAdapter extends BaseAdapter {
  name = 'ollama';

  constructor(config: AdapterConfig & { host?: string }) {
    super({
      baseUrl: config.host || config.baseUrl || 'http://localhost:11434',
      ...config
    });
  }

  /**
   * Count tokens - use Ollama's tokenize endpoint if available
   */
  countTokens(text: string): number {
    // Ollama doesn't have a sync tokenize, so use estimate
    // Different models have different tokenizers, but ~4 chars/token is reasonable
    return Math.ceil(text.length / 4);
  }

  /**
   * Count tokens async using Ollama API
   */
  async countTokensAsync(text: string): Promise<number> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tokenize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: text
        })
      });

      if (response.ok) {
        const data = await response.json() as any;
        return data.tokens?.length || Math.ceil(text.length / 4);
      }
    } catch {
      // Tokenize endpoint may not be available
    }

    return Math.ceil(text.length / 4);
  }

  /**
   * Get max context for model
   */
  getMaxContext(): number {
    // Try to match model name
    for (const [prefix, context] of Object.entries(MODEL_CONTEXTS)) {
      if (this.model.toLowerCase().includes(prefix)) {
        return context;
      }
    }
    return 4096; // Safe default
  }

  /**
   * Get pricing - Ollama is free/local
   */
  getPricing(): { input: number; output: number } {
    // Local models have no API cost (but compute cost exists)
    return { input: 0, output: 0 };
  }

  /**
   * Generate summary using Ollama
   */
  async generateSummary(text: string, maxTokens: number): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: `Summarize this in ${maxTokens} tokens or less. Be extremely concise:\n\n${text}\n\nSummary:`,
          stream: false,
          options: {
            num_predict: maxTokens,
            temperature: 0.3
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json() as any;
      return data.response || text.slice(0, maxTokens * 4);
    } catch (error) {
      console.debug('Ollama summary failed:', error);
      return super.generateSummary(text, maxTokens);
    }
  }

  /**
   * Check if Ollama is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];
      
      const data = await response.json() as any;
      return data.models?.map((m: any) => m.name) || [];
    } catch {
      return [];
    }
  }
}

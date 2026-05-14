/**
 * Context Manager - Smart conversation history management
 * 
 * Manages context window with:
 * 1. Sliding window pruning
 * 2. Smart summarization
 * 3. Token budget enforcement
 */

import type {
  Message,
  GetContextParams,
  ContextResult,
  PruneStrategy,
  LLMAdapter
} from '../types';

export class ContextManager {
  private messages: Message[];
  private systemMessage: Message | null;
  private maxContextTokens: number;
  private reserveTokens: number;
  private pruneStrategy: PruneStrategy;
  private adapter?: LLMAdapter;
  private prunedSummary: string | null;
  private totalPruned: number;

  constructor(config?: {
    maxContextTokens?: number;
    reserveTokens?: number;
    pruneStrategy?: PruneStrategy;
    adapter?: LLMAdapter;
    systemMessage?: string;
  }) {
    this.messages = [];
    this.systemMessage = config?.systemMessage 
      ? { role: 'system', content: config.systemMessage, timestamp: new Date() }
      : null;
    this.maxContextTokens = config?.maxContextTokens || 4000;
    this.reserveTokens = config?.reserveTokens || 1000;
    this.pruneStrategy = config?.pruneStrategy || 'smart';
    this.adapter = config?.adapter;
    this.prunedSummary = null;
    this.totalPruned = 0;
  }

  /**
   * Add a message to the context
   */
  addMessage(message: Omit<Message, 'timestamp' | 'tokens'>): void {
    const tokens = this.countTokens(message.content);
    this.messages.push({
      ...message,
      timestamp: new Date(),
      tokens
    });
  }

  /**
   * Set or update system message
   */
  setSystemMessage(content: string): void {
    this.systemMessage = {
      role: 'system',
      content,
      timestamp: new Date(),
      tokens: this.countTokens(content)
    };
  }

  /**
   * Get optimized context that fits within token budget
   */
  async getOptimizedContext(params?: GetContextParams): Promise<ContextResult> {
    const {
      maxTokens = this.maxContextTokens - this.reserveTokens,
      includeSystem = true,
      minMessages = 2,
      preserveFirstN = 1
    } = params || {};

    let availableTokens = maxTokens;
    const resultMessages: Message[] = [];
    let prunedCount = 0;
    let prunedSummary: string | undefined;

    // Include system message first
    if (includeSystem && this.systemMessage) {
      const systemTokens = this.systemMessage.tokens || this.countTokens(this.systemMessage.content);
      if (systemTokens < availableTokens) {
        resultMessages.push(this.systemMessage);
        availableTokens -= systemTokens;
      }
    }

    // Include any existing pruned summary
    if (this.prunedSummary) {
      const summaryTokens = this.countTokens(this.prunedSummary);
      if (summaryTokens < availableTokens * 0.2) { // Max 20% for summary
        resultMessages.push({
          role: 'system',
          content: `[Previous conversation summary: ${this.prunedSummary}]`,
          timestamp: new Date(),
          tokens: summaryTokens
        });
        availableTokens -= summaryTokens;
      }
    }

    // Apply pruning strategy
    const { kept, pruned, summary } = await this.applyPruneStrategy(
      this.messages,
      availableTokens,
      minMessages,
      preserveFirstN
    );

    // Add kept messages
    for (const msg of kept) {
      resultMessages.push(msg);
    }

    prunedCount = pruned.length;

    // Update internal pruned summary if we pruned messages
    if (summary) {
      this.prunedSummary = summary;
      prunedSummary = summary;
    }

    // Calculate total tokens
    const totalTokens = resultMessages.reduce(
      (sum, msg) => sum + (msg.tokens || this.countTokens(msg.content)),
      0
    );

    return {
      messages: resultMessages,
      totalTokens,
      prunedCount,
      prunedSummary
    };
  }

  /**
   * Apply pruning strategy to messages
   */
  private async applyPruneStrategy(
    messages: Message[],
    availableTokens: number,
    minMessages: number,
    preserveFirstN: number
  ): Promise<{ kept: Message[]; pruned: Message[]; summary?: string }> {
    switch (this.pruneStrategy) {
      case 'fifo':
        return this.fifoPrune(messages, availableTokens, minMessages);
      
      case 'summarize':
        return this.summarizePrune(messages, availableTokens, minMessages, preserveFirstN);
      
      case 'smart':
      default:
        return this.smartPrune(messages, availableTokens, minMessages, preserveFirstN);
    }
  }

  /**
   * FIFO pruning - remove oldest messages first
   */
  private fifoPrune(
    messages: Message[],
    availableTokens: number,
    minMessages: number
  ): { kept: Message[]; pruned: Message[]; summary?: string } {
    const kept: Message[] = [];
    const pruned: Message[] = [];
    let usedTokens = 0;

    // Work backwards from newest messages
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgTokens = msg.tokens || this.countTokens(msg.content);

      if (usedTokens + msgTokens <= availableTokens || kept.length < minMessages) {
        kept.unshift(msg);
        usedTokens += msgTokens;
      } else {
        pruned.unshift(msg);
      }
    }

    return { kept, pruned };
  }

  /**
   * Smart pruning - prioritize important messages
   */
  private smartPrune(
    messages: Message[],
    availableTokens: number,
    minMessages: number,
    preserveFirstN: number
  ): { kept: Message[]; pruned: Message[]; summary?: string } {
    // Score messages by importance
    const scored = messages.map((msg, index) => ({
      msg,
      index,
      score: this.scoreMessageImportance(msg, index, messages.length)
    }));

    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);

    const kept: Message[] = [];
    const pruned: Message[] = [];
    let usedTokens = 0;

    // Always preserve first N messages
    const preservedIndices = new Set<number>();
    for (let i = 0; i < Math.min(preserveFirstN, messages.length); i++) {
      const msg = messages[i];
      kept.push(msg);
      usedTokens += msg.tokens || this.countTokens(msg.content);
      preservedIndices.add(i);
    }

    // Add messages by importance score
    for (const { msg, index } of scored) {
      if (preservedIndices.has(index)) continue;

      const msgTokens = msg.tokens || this.countTokens(msg.content);

      if (usedTokens + msgTokens <= availableTokens || kept.length < minMessages) {
        kept.push(msg);
        usedTokens += msgTokens;
      } else {
        pruned.push(msg);
      }
    }

    // Sort kept messages by original order
    kept.sort((a, b) => {
      const aIdx = messages.indexOf(a);
      const bIdx = messages.indexOf(b);
      return aIdx - bIdx;
    });

    return { kept, pruned };
  }

  /**
   * Summarize pruning - summarize old messages
   */
  private async summarizePrune(
    messages: Message[],
    availableTokens: number,
    minMessages: number,
    preserveFirstN: number
  ): Promise<{ kept: Message[]; pruned: Message[]; summary?: string }> {
    // First do smart prune
    const { kept, pruned } = this.smartPrune(messages, availableTokens, minMessages, preserveFirstN);

    // If we pruned messages and have an adapter, generate summary
    let summary: string | undefined;
    if (pruned.length > 0 && this.adapter?.generateSummary) {
      const prunedContent = pruned
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');
      
      summary = await this.adapter.generateSummary(
        `Summarize this conversation context concisely:\n${prunedContent}`,
        200 // Max tokens for summary
      );
    }

    return { kept, pruned, summary };
  }

  /**
   * Score message importance
   */
  private scoreMessageImportance(msg: Message, index: number, total: number): number {
    let score = 0;

    // Recent messages are more important
    score += (index / total) * 0.3;

    // User messages are important
    if (msg.role === 'user') score += 0.2;

    // Tool results are important
    if (msg.role === 'tool') score += 0.15;

    // Messages with code blocks
    if (msg.content.includes('```')) score += 0.1;

    // Messages with errors/warnings
    if (/error|warning|fail|exception/i.test(msg.content)) score += 0.15;

    // Questions are important
    if (msg.content.includes('?')) score += 0.1;

    // Short messages are less valuable (might be acknowledgments)
    const tokens = msg.tokens || this.countTokens(msg.content);
    if (tokens < 20) score -= 0.1;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.messages = [];
    this.prunedSummary = null;
    this.totalPruned = 0;
  }

  /**
   * Get message count
   */
  getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * Get total tokens in context
   */
  getTotalTokens(): number {
    let total = 0;
    
    if (this.systemMessage) {
      total += this.systemMessage.tokens || this.countTokens(this.systemMessage.content);
    }
    
    for (const msg of this.messages) {
      total += msg.tokens || this.countTokens(msg.content);
    }
    
    return total;
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
}

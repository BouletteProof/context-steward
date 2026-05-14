/**
 * Context Steward - Main class that orchestrates all optimization
 * 
 * Combines:
 * - TextOptimizer
 * - FileExternalizer
 * - ToolConsolidator
 * - ContextManager
 * - Telemetry
 */

import { TextOptimizer } from './text-optimizer';
import { FileExternalizer } from './file-externalizer';
import { ToolConsolidator } from './tool-consolidator';
import { ContextManager } from './context-manager';
import { Telemetry } from './telemetry';
import type {
  ContextStewardConfig,
  OptimizeParams,
  OptimizationResult,
  ExternalizeParams,
  ExternalizeResult,
  ConsolidateToolsParams,
  ConsolidatedTools,
  Message,
  GetContextParams,
  ContextResult,
  ToolDefinition,
  TelemetryStats,
  LLMAdapter
} from '../types';

export class ContextSteward {
  private textOptimizer: TextOptimizer;
  private fileExternalizer: FileExternalizer;
  private toolConsolidator: ToolConsolidator;
  private contextManager: ContextManager;
  private telemetry: Telemetry;
  private adapter?: LLMAdapter;
  private config: ContextStewardConfig;

  constructor(config: ContextStewardConfig = {}) {
    this.config = {
      strategy: 'balanced',
      maxContextTokens: 4000,
      reserveTokens: 1000,
      tempDir: '/tmp/context-steward',
      maxFileSizeMB: 10,
      cleanupAfterHours: 24,
      preserveTerms: [],
      preservePatterns: [],
      pruneStrategy: 'smart',
      systemMessageBudget: 500,
      consolidateTools: true,
      maxToolTokens: 300,
      telemetry: true,
      ...config
    };

    this.adapter = config.adapter;

    // Initialize components
    this.textOptimizer = new TextOptimizer({
      adapter: this.adapter,
      preserveTerms: this.config.preserveTerms,
      preservePatterns: this.config.preservePatterns
    });

    this.fileExternalizer = new FileExternalizer({
      tempDir: this.config.tempDir,
      maxFileSizeMB: this.config.maxFileSizeMB,
      cleanupAfterHours: this.config.cleanupAfterHours,
      adapter: this.adapter
    });

    this.toolConsolidator = new ToolConsolidator({
      adapter: this.adapter,
      maxTokensPerTool: this.config.maxToolTokens
    });

    this.contextManager = new ContextManager({
      maxContextTokens: this.config.maxContextTokens,
      reserveTokens: this.config.reserveTokens,
      pruneStrategy: this.config.pruneStrategy,
      adapter: this.adapter
    });

    this.telemetry = new Telemetry({
      enabled: this.config.telemetry,
      endpoint: this.config.telemetryEndpoint,
      adapter: this.adapter
    });
  }

  // ============================================
  // Text Optimization
  // ============================================

  /**
   * Optimize text to reduce token count
   */
  async optimize(params: OptimizeParams): Promise<OptimizationResult> {
    const paramsWithStrategy = {
      ...params,
      strategy: params.strategy || this.config.strategy
    };

    const result = await this.textOptimizer.optimize(paramsWithStrategy);

    // Record telemetry
    this.telemetry.record({
      type: 'optimize',
      timestamp: new Date(),
      tokensOriginal: result.originalTokens,
      tokensOptimized: result.optimizedTokens,
      strategy: result.strategy
    });

    return result;
  }

  /**
   * Optimize text to fit within token limit
   */
  async optimizeToLimit(
    text: string,
    tokenLimit: number,
    preserveTerms: string[] = []
  ): Promise<OptimizationResult> {
    return this.optimize({
      text,
      maxTokens: tokenLimit,
      preserveTerms,
      strategy: this.config.strategy
    });
  }

  // ============================================
  // File Externalization
  // ============================================

  /**
   * Externalize large result to file, return summary
   */
  async externalize(params: ExternalizeParams): Promise<ExternalizeResult> {
    const result = await this.fileExternalizer.externalize(params);

    // Record telemetry
    this.telemetry.record({
      type: 'externalize',
      timestamp: new Date(),
      tokensOriginal: result.tokensSaved + result.summaryTokens,
      tokensOptimized: result.summaryTokens,
      toolName: params.toolName,
      filePath: result.filePath
    });

    return result;
  }

  /**
   * Recall full data from externalized file
   */
  async recall(filePath: string): Promise<unknown> {
    return this.fileExternalizer.recall(filePath);
  }

  /**
   * Check if externalized file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    return this.fileExternalizer.exists(filePath);
  }

  /**
   * Cleanup expired externalized files
   */
  async cleanupFiles(): Promise<number> {
    return this.fileExternalizer.cleanup();
  }

  // ============================================
  // Tool Consolidation
  // ============================================

  /**
   * Consolidate tools to reduce schema overhead
   */
  consolidateTools(
    tools: ToolDefinition[],
    params?: Partial<ConsolidateToolsParams>
  ): ConsolidatedTools {
    const result = this.toolConsolidator.consolidate({
      tools,
      maxTokensPerTool: this.config.maxToolTokens,
      ...params
    });

    // Record telemetry
    this.telemetry.record({
      type: 'consolidate',
      timestamp: new Date(),
      tokensOriginal: result.originalTokens,
      tokensOptimized: result.consolidatedTokens,
      metadata: {
        originalCount: result.originalCount,
        consolidatedCount: result.consolidatedCount
      }
    });

    return result;
  }

  // ============================================
  // Context Management
  // ============================================

  /**
   * Add message to context
   */
  addMessage(message: Omit<Message, 'timestamp' | 'tokens'>): void {
    this.contextManager.addMessage(message);
  }

  /**
   * Set system message
   */
  setSystemMessage(content: string): void {
    this.contextManager.setSystemMessage(content);
  }

  /**
   * Get optimized context that fits token budget
   */
  async getOptimizedContext(params?: GetContextParams): Promise<ContextResult> {
    const result = await this.contextManager.getOptimizedContext(params);

    // Record telemetry if messages were pruned
    if (result.prunedCount > 0) {
      this.telemetry.record({
        type: 'prune',
        timestamp: new Date(),
        metadata: {
          prunedCount: result.prunedCount,
          totalTokens: result.totalTokens
        }
      });
    }

    return result;
  }

  /**
   * Clear conversation context
   */
  clearContext(): void {
    this.contextManager.clear();
  }

  /**
   * Get current context token count
   */
  getContextTokens(): number {
    return this.contextManager.getTotalTokens();
  }

  // ============================================
  // Utilities
  // ============================================

  /**
   * Count tokens in text
   */
  countTokens(text: string): number {
    if (this.adapter) {
      return this.adapter.countTokens(text);
    }
    return Math.ceil(text.length / 4);
  }

  /**
   * Count tokens in messages
   */
  countMessageTokens(messages: Message[]): number {
    if (this.adapter) {
      return this.adapter.countMessageTokens(messages);
    }
    return messages.reduce(
      (sum, msg) => sum + this.countTokens(msg.content),
      0
    );
  }

  // ============================================
  // Telemetry
  // ============================================

  /**
   * Get telemetry statistics
   */
  getStats(): TelemetryStats {
    return this.telemetry.getStats();
  }

  /**
   * Reset telemetry
   */
  resetStats(): void {
    this.telemetry.reset();
  }

  // ============================================
  // High-level Convenience Methods
  // ============================================

  /**
   * Optimize a complete request (messages + tools + new input)
   */
  async optimizeRequest(request: {
    messages?: Message[];
    tools?: ToolDefinition[];
    userInput: string;
    maxTotalTokens?: number;
  }): Promise<{
    messages: Message[];
    tools: ToolDefinition[];
    userInput: string;
    stats: {
      originalTokens: number;
      optimizedTokens: number;
      reduction: string;
    };
  }> {
    const maxTokens = request.maxTotalTokens || this.config.maxContextTokens!;
    let originalTokens = 0;
    let optimizedTokens = 0;

    // Optimize user input
    originalTokens += this.countTokens(request.userInput);
    const optimizedInput = await this.optimize({
      text: request.userInput,
      strategy: this.config.strategy
    });
    optimizedTokens += optimizedInput.optimizedTokens;

    // Consolidate tools if provided
    let finalTools: ToolDefinition[] = [];
    if (request.tools && request.tools.length > 0) {
      const toolsStr = JSON.stringify(request.tools);
      originalTokens += this.countTokens(toolsStr);
      
      if (this.config.consolidateTools) {
        const consolidated = this.consolidateTools(request.tools);
        finalTools = consolidated.tools;
        optimizedTokens += consolidated.consolidatedTokens;
      } else {
        finalTools = request.tools;
        optimizedTokens += this.countTokens(toolsStr);
      }
    }

    // Optimize context if messages provided
    let finalMessages: Message[] = [];
    if (request.messages && request.messages.length > 0) {
      originalTokens += this.countMessageTokens(request.messages);
      
      // Add messages to context manager
      for (const msg of request.messages) {
        this.contextManager.addMessage(msg);
      }
      
      // Get optimized context
      const toolTokens = this.countTokens(JSON.stringify(finalTools));
      const inputTokens = optimizedInput.optimizedTokens;
      const availableForContext = maxTokens - toolTokens - inputTokens - this.config.reserveTokens!;
      
      const context = await this.getOptimizedContext({ maxTokens: availableForContext });
      finalMessages = context.messages;
      optimizedTokens += context.totalTokens;
    }

    const reduction = originalTokens > 0 
      ? ((1 - optimizedTokens / originalTokens) * 100).toFixed(1) + '%'
      : '0%';

    return {
      messages: finalMessages,
      tools: finalTools,
      userInput: optimizedInput.optimizedText,
      stats: {
        originalTokens,
        optimizedTokens,
        reduction
      }
    };
  }

  /**
   * Process a tool result - externalize if large, otherwise return as-is
   */
  async processToolResult(
    toolName: string,
    result: unknown,
    options?: {
      externalizeThreshold?: number; // Tokens above which to externalize
      summaryPrompt?: string;
    }
  ): Promise<{
    content: string;
    externalized: boolean;
    filePath?: string;
  }> {
    const threshold = options?.externalizeThreshold || 1000;
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    const tokens = this.countTokens(resultStr);

    if (tokens > threshold) {
      // Externalize large result
      const externalized = await this.externalize({
        toolName,
        result,
        summaryPrompt: options?.summaryPrompt
      });

      return {
        content: externalized.summary,
        externalized: true,
        filePath: externalized.filePath
      };
    }

    return {
      content: resultStr,
      externalized: false
    };
  }
}

/**
 * Telemetry - Track optimization metrics and savings
 */

import type {
  TelemetryStats,
  TelemetryEvent,
  OptimizationStrategy,
  LLMAdapter
} from '../types';

export class Telemetry {
  private enabled: boolean;
  private endpoint?: string;
  private adapter?: LLMAdapter;
  private events: TelemetryEvent[];
  private sessionStart: Date;
  private stats: {
    totalRequests: number;
    tokensOriginal: number;
    tokensOptimized: number;
    cacheHits: number;
    externalizedResults: number;
    toolsConsolidated: number;
    messagesPruned: number;
    byStrategy: Record<OptimizationStrategy, {
      requests: number;
      tokensSaved: number;
    }>;
  };

  constructor(config?: {
    enabled?: boolean;
    endpoint?: string;
    adapter?: LLMAdapter;
  }) {
    this.enabled = config?.enabled ?? true;
    this.endpoint = config?.endpoint;
    this.adapter = config?.adapter;
    this.events = [];
    this.sessionStart = new Date();
    this.stats = {
      totalRequests: 0,
      tokensOriginal: 0,
      tokensOptimized: 0,
      cacheHits: 0,
      externalizedResults: 0,
      toolsConsolidated: 0,
      messagesPruned: 0,
      byStrategy: {
        conservative: { requests: 0, tokensSaved: 0 },
        balanced: { requests: 0, tokensSaved: 0 },
        aggressive: { requests: 0, tokensSaved: 0 }
      }
    };
  }

  /**
   * Record a telemetry event
   */
  record(event: TelemetryEvent): void {
    if (!this.enabled) return;

    this.events.push(event);
    this.stats.totalRequests++;

    // Update aggregate stats
    if (event.tokensOriginal !== undefined) {
      this.stats.tokensOriginal += event.tokensOriginal;
    }
    if (event.tokensOptimized !== undefined) {
      this.stats.tokensOptimized += event.tokensOptimized;
    }

    // Track by type
    switch (event.type) {
      case 'optimize':
        if (event.strategy) {
          const strategyStats = this.stats.byStrategy[event.strategy];
          strategyStats.requests++;
          strategyStats.tokensSaved += (event.tokensOriginal || 0) - (event.tokensOptimized || 0);
        }
        break;
      
      case 'externalize':
        this.stats.externalizedResults++;
        break;
      
      case 'consolidate':
        this.stats.toolsConsolidated++;
        break;
      
      case 'prune':
        if (event.metadata?.prunedCount) {
          this.stats.messagesPruned += event.metadata.prunedCount as number;
        }
        break;
      
      case 'cache_hit':
        this.stats.cacheHits++;
        break;
    }

    // Send to endpoint if configured
    if (this.endpoint) {
      this.sendToEndpoint(event).catch(console.error);
    }
  }

  /**
   * Get aggregated statistics
   */
  getStats(): TelemetryStats {
    const tokensSaved = this.stats.tokensOriginal - this.stats.tokensOptimized;
    const reductionPercent = this.stats.tokensOriginal > 0
      ? Math.round((tokensSaved / this.stats.tokensOriginal) * 100)
      : 0;

    // Calculate estimated cost saved
    const estimatedCostSaved = this.calculateCostSaved(tokensSaved);

    // Calculate average reduction per strategy
    const byStrategy: TelemetryStats['byStrategy'] = {
      conservative: {
        requests: this.stats.byStrategy.conservative.requests,
        tokensSaved: this.stats.byStrategy.conservative.tokensSaved,
        avgReduction: this.calculateAvgReduction('conservative')
      },
      balanced: {
        requests: this.stats.byStrategy.balanced.requests,
        tokensSaved: this.stats.byStrategy.balanced.tokensSaved,
        avgReduction: this.calculateAvgReduction('balanced')
      },
      aggressive: {
        requests: this.stats.byStrategy.aggressive.requests,
        tokensSaved: this.stats.byStrategy.aggressive.tokensSaved,
        avgReduction: this.calculateAvgReduction('aggressive')
      }
    };

    return {
      totalRequests: this.stats.totalRequests,
      tokensOriginal: this.stats.tokensOriginal,
      tokensOptimized: this.stats.tokensOptimized,
      tokensSaved,
      reductionPercent,
      estimatedCostSaved,
      cacheHits: this.stats.cacheHits,
      externalizedResults: this.stats.externalizedResults,
      toolsConsolidated: this.stats.toolsConsolidated,
      messagesPruned: this.stats.messagesPruned,
      byStrategy,
      sessionStart: this.sessionStart
    };
  }

  /**
   * Get recent events
   */
  getEvents(limit: number = 100): TelemetryEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Reset telemetry
   */
  reset(): void {
    this.events = [];
    this.sessionStart = new Date();
    this.stats = {
      totalRequests: 0,
      tokensOriginal: 0,
      tokensOptimized: 0,
      cacheHits: 0,
      externalizedResults: 0,
      toolsConsolidated: 0,
      messagesPruned: 0,
      byStrategy: {
        conservative: { requests: 0, tokensSaved: 0 },
        balanced: { requests: 0, tokensSaved: 0 },
        aggressive: { requests: 0, tokensSaved: 0 }
      }
    };
  }

  /**
   * Export telemetry data
   */
  export(): {
    stats: TelemetryStats;
    events: TelemetryEvent[];
    sessionDuration: number;
  } {
    return {
      stats: this.getStats(),
      events: this.events,
      sessionDuration: Date.now() - this.sessionStart.getTime()
    };
  }

  /**
   * Calculate cost saved based on adapter pricing
   */
  private calculateCostSaved(tokensSaved: number): string {
    if (this.adapter) {
      const pricing = this.adapter.getPricing();
      // Assume 50/50 split between input and output
      const inputSaved = tokensSaved * 0.7;
      const outputSaved = tokensSaved * 0.3;
      const costSaved = (inputSaved / 1000) * pricing.input + (outputSaved / 1000) * pricing.output;
      return `$${costSaved.toFixed(2)}`;
    }

    // Default estimate based on GPT-4 pricing
    const costPer1k = 0.03; // Rough average
    const costSaved = (tokensSaved / 1000) * costPer1k;
    return `$${costSaved.toFixed(2)}`;
  }

  /**
   * Calculate average reduction for a strategy
   */
  private calculateAvgReduction(strategy: OptimizationStrategy): number {
    const strategyEvents = this.events.filter(
      e => e.type === 'optimize' && e.strategy === strategy
    );

    if (strategyEvents.length === 0) return 0;

    let totalReduction = 0;
    for (const event of strategyEvents) {
      if (event.tokensOriginal && event.tokensOptimized) {
        totalReduction += (event.tokensOriginal - event.tokensOptimized) / event.tokensOriginal;
      }
    }

    return Math.round((totalReduction / strategyEvents.length) * 100);
  }

  /**
   * Send event to remote endpoint
   */
  private async sendToEndpoint(event: TelemetryEvent): Promise<void> {
    if (!this.endpoint) return;

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      });
    } catch (error) {
      // Silently fail - telemetry should not break the app
      console.debug('Telemetry send failed:', error);
    }
  }
}

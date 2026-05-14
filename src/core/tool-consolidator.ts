/**
 * Tool Consolidator - Compress and group tool schemas
 * 
 * Reduces tool overhead by:
 * 1. Compressing verbose descriptions
 * 2. Grouping related tools
 * 3. Removing redundant examples
 */

import type {
  ToolDefinition,
  ConsolidateToolsParams,
  ConsolidatedTools,
  LLMAdapter
} from '../types';

// Common prefixes that indicate tool groups
const COMMON_PREFIXES = ['get_', 'list_', 'create_', 'update_', 'delete_', 'search_', 'fetch_'];

export class ToolConsolidator {
  private adapter?: LLMAdapter;
  private maxTokensPerTool: number;

  constructor(config?: {
    adapter?: LLMAdapter;
    maxTokensPerTool?: number;
  }) {
    this.adapter = config?.adapter;
    this.maxTokensPerTool = config?.maxTokensPerTool || 300;
  }

  /**
   * Consolidate tools to reduce token overhead
   */
  consolidate(params: ConsolidateToolsParams): ConsolidatedTools {
    const {
      tools,
      groupBy = 'category',
      groupFn,
      maxTokensPerTool = this.maxTokensPerTool,
      keepExamples = false
    } = params;

    // Calculate original tokens
    const originalTokens = this.countToolsTokens(tools);

    // Group tools
    const groups = this.groupTools(tools, groupBy, groupFn);

    // Consolidate each group
    const consolidatedTools: ToolDefinition[] = [];
    const mapping = new Map<string, string>();

    for (const [groupName, groupTools] of Object.entries(groups)) {
      if (groupTools.length === 1) {
        // Single tool, just compress
        const compressed = this.compressTool(groupTools[0], maxTokensPerTool, keepExamples);
        consolidatedTools.push(compressed);
        mapping.set(groupTools[0].name, compressed.name);
      } else {
        // Multiple tools, merge into one
        const merged = this.mergeTools(groupName, groupTools, maxTokensPerTool, keepExamples);
        consolidatedTools.push(merged);
        for (const tool of groupTools) {
          mapping.set(tool.name, merged.name);
        }
      }
    }

    const consolidatedTokens = this.countToolsTokens(consolidatedTools);

    return {
      tools: consolidatedTools,
      originalCount: tools.length,
      consolidatedCount: consolidatedTools.length,
      originalTokens,
      consolidatedTokens,
      mapping
    };
  }

  /**
   * Compress a single tool definition
   */
  compressTool(
    tool: ToolDefinition,
    maxTokens: number,
    keepExamples: boolean
  ): ToolDefinition {
    const compressed: ToolDefinition = {
      name: tool.name,
      description: this.compressDescription(tool.description, maxTokens / 3)
    };

    if (tool.parameters) {
      compressed.parameters = this.compressParameters(
        tool.parameters,
        keepExamples
      );
    }

    if (tool.category) {
      compressed.category = tool.category;
    }

    return compressed;
  }

  /**
   * Merge multiple tools into one
   */
  private mergeTools(
    groupName: string,
    tools: ToolDefinition[],
    maxTokens: number,
    keepExamples: boolean
  ): ToolDefinition {
    // Create combined description
    const toolNames = tools.map(t => t.name);
    const description = `Unified ${groupName} tool. Actions: ${toolNames.join(', ')}. ` +
      `Specify 'action' parameter to choose operation.`;

    // Merge parameters
    const actionParam = {
      type: 'string',
      enum: toolNames,
      description: `Action to perform: ${toolNames.join(' | ')}`
    };

    // Collect all unique parameters across tools
    const allParams: Record<string, unknown> = { action: actionParam };
    
    for (const tool of tools) {
      if (tool.parameters && typeof tool.parameters === 'object') {
        const params = tool.parameters as Record<string, unknown>;
        const properties = params.properties as Record<string, unknown> || {};
        
        for (const [key, value] of Object.entries(properties)) {
          if (key !== 'action' && !allParams[key]) {
            allParams[key] = this.compressParamDef(value, keepExamples);
          }
        }
      }
    }

    return {
      name: groupName,
      description: this.compressDescription(description, maxTokens / 3),
      parameters: {
        type: 'object',
        properties: allParams,
        required: ['action']
      },
      category: tools[0].category
    };
  }

  /**
   * Group tools by category, prefix, or custom function
   */
  private groupTools(
    tools: ToolDefinition[],
    groupBy: 'category' | 'prefix' | 'custom',
    groupFn?: (tool: ToolDefinition) => string
  ): Record<string, ToolDefinition[]> {
    const groups: Record<string, ToolDefinition[]> = {};

    for (const tool of tools) {
      let group: string;

      switch (groupBy) {
        case 'category':
          group = tool.category || 'general';
          break;
        
        case 'prefix':
          group = this.extractPrefix(tool.name) || 'general';
          break;
        
        case 'custom':
          group = groupFn ? groupFn(tool) : 'general';
          break;
        
        default:
          group = 'general';
      }

      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(tool);
    }

    return groups;
  }

  /**
   * Extract prefix from tool name
   */
  private extractPrefix(name: string): string | null {
    for (const prefix of COMMON_PREFIXES) {
      if (name.startsWith(prefix)) {
        // Return the noun part after the prefix
        const rest = name.slice(prefix.length);
        const parts = rest.split('_');
        return parts[0] || prefix.slice(0, -1);
      }
    }
    
    // Try splitting by underscore and taking first part
    const parts = name.split('_');
    if (parts.length > 1) {
      return parts[0];
    }

    return null;
  }

  /**
   * Compress a description to fit token budget
   */
  private compressDescription(description: string, maxTokens: number): string {
    let compressed = description;

    // Remove filler words
    const fillers = ['very', 'really', 'basically', 'essentially', 'typically'];
    for (const filler of fillers) {
      compressed = compressed.replace(new RegExp(`\\b${filler}\\s+`, 'gi'), '');
    }

    // Simplify phrases
    compressed = compressed
      .replace(/in order to/gi, 'to')
      .replace(/that is to say/gi, '')
      .replace(/for the purpose of/gi, 'for')
      .replace(/\s+/g, ' ')
      .trim();

    // Truncate if still too long
    const tokens = this.countTokens(compressed);
    if (tokens > maxTokens) {
      // Estimate chars per token and truncate
      const charsPerToken = compressed.length / tokens;
      const maxChars = Math.floor(maxTokens * charsPerToken);
      compressed = compressed.slice(0, maxChars) + '...';
    }

    return compressed;
  }

  /**
   * Compress parameters object
   */
  private compressParameters(
    parameters: Record<string, unknown>,
    keepExamples: boolean
  ): Record<string, unknown> {
    const compressed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(parameters)) {
      if (key === 'properties' && typeof value === 'object' && value !== null) {
        const props: Record<string, unknown> = {};
        for (const [propKey, propValue] of Object.entries(value as Record<string, unknown>)) {
          props[propKey] = this.compressParamDef(propValue, keepExamples);
        }
        compressed[key] = props;
      } else {
        compressed[key] = value;
      }
    }

    return compressed;
  }

  /**
   * Compress a single parameter definition
   */
  private compressParamDef(param: unknown, keepExamples: boolean): unknown {
    if (typeof param !== 'object' || param === null) {
      return param;
    }

    const paramObj = param as Record<string, unknown>;
    const compressed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(paramObj)) {
      // Skip examples unless requested
      if (!keepExamples && ['example', 'examples', 'default'].includes(key)) {
        continue;
      }

      // Compress description
      if (key === 'description' && typeof value === 'string') {
        compressed[key] = this.compressDescription(value, 50);
      } else {
        compressed[key] = value;
      }
    }

    return compressed;
  }

  /**
   * Count tokens for array of tools
   */
  private countToolsTokens(tools: ToolDefinition[]): number {
    const str = JSON.stringify(tools);
    return this.countTokens(str);
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

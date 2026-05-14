var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/core/text-optimizer.ts
var FILLER_WORDS = [
  "very",
  "really",
  "quite",
  "rather",
  "somewhat",
  "fairly",
  "pretty",
  "just",
  "simply",
  "basically",
  "essentially",
  "generally",
  "typically",
  "obviously",
  "clearly",
  "certainly",
  "definitely",
  "absolutely",
  "completely",
  "totally",
  "entirely",
  "wholly",
  "actually",
  "literally"
];
var PHRASE_REPLACEMENTS = [
  { pattern: /in order to/gi, replacement: "to" },
  { pattern: /due to the fact that/gi, replacement: "because" },
  { pattern: /for the purpose of/gi, replacement: "for" },
  { pattern: /in the event that/gi, replacement: "if" },
  { pattern: /at this point in time/gi, replacement: "now" },
  { pattern: /in the near future/gi, replacement: "soon" },
  { pattern: /a large number of/gi, replacement: "many" },
  { pattern: /a small number of/gi, replacement: "few" },
  { pattern: /it should be noted that/gi, replacement: "" },
  { pattern: /it is important to note that/gi, replacement: "" },
  { pattern: /please be aware that/gi, replacement: "" },
  { pattern: /i would like to/gi, replacement: "I'd like to" },
  { pattern: /please kindly/gi, replacement: "please" },
  { pattern: /could you please/gi, replacement: "please" },
  { pattern: /would you be able to/gi, replacement: "can you" },
  { pattern: /i was wondering if/gi, replacement: "can" },
  { pattern: /as a matter of fact/gi, replacement: "" },
  { pattern: /at the present time/gi, replacement: "now" },
  { pattern: /despite the fact that/gi, replacement: "although" },
  { pattern: /in spite of the fact that/gi, replacement: "although" },
  { pattern: /has the ability to/gi, replacement: "can" },
  { pattern: /is able to/gi, replacement: "can" },
  { pattern: /make a decision/gi, replacement: "decide" },
  { pattern: /take into consideration/gi, replacement: "consider" },
  { pattern: /come to the conclusion/gi, replacement: "conclude" },
  { pattern: /give an explanation/gi, replacement: "explain" },
  // Aggressive only
  { pattern: /\b(a|an|the)\s+(?=\w)/gi, replacement: "", aggressive: true },
  { pattern: /,\s*which\s+/gi, replacement: " that ", aggressive: true }
];
var TRANSITION_WORDS = [
  "however",
  "moreover",
  "furthermore",
  "additionally",
  "consequently",
  "therefore",
  "thus",
  "hence",
  "accordingly",
  "meanwhile",
  "nevertheless",
  "nonetheless",
  "alternatively",
  "specifically",
  "particularly"
];
var TextOptimizer = class {
  adapter;
  preserveTerms;
  preservePatterns;
  constructor(config) {
    this.adapter = config?.adapter;
    this.preserveTerms = config?.preserveTerms || [];
    this.preservePatterns = config?.preservePatterns || [];
  }
  /**
   * Count tokens in text
   */
  countTokens(text) {
    if (this.adapter) {
      return this.adapter.countTokens(text);
    }
    return Math.ceil(text.length / 4);
  }
  /**
   * Optimize text to reduce token count
   */
  async optimize(params) {
    const {
      text,
      targetReduction = 0.3,
      preserveFormatting = false,
      preserveTerms = [],
      strategy = "balanced",
      maxTokens
    } = params;
    const allPreserveTerms = [...this.preserveTerms, ...preserveTerms];
    const originalTokens = this.countTokens(text);
    let optimizedText = text;
    const techniquesApplied = [];
    switch (strategy) {
      case "conservative":
        optimizedText = this.conservativeOptimization(optimizedText, allPreserveTerms);
        techniquesApplied.push("whitespace_cleanup", "minimal_filler_removal");
        break;
      case "aggressive":
        optimizedText = this.aggressiveOptimization(optimizedText, allPreserveTerms);
        techniquesApplied.push("filler_removal", "phrase_simplification", "article_removal", "transition_removal");
        break;
      case "balanced":
      default:
        optimizedText = this.balancedOptimization(optimizedText, allPreserveTerms);
        techniquesApplied.push("filler_removal", "phrase_simplification");
        break;
    }
    if (maxTokens) {
      const currentTokens = this.countTokens(optimizedText);
      if (currentTokens > maxTokens) {
        optimizedText = this.truncateToTokenLimit(optimizedText, maxTokens, allPreserveTerms);
        techniquesApplied.push("truncation");
      }
    }
    if (preserveFormatting) {
      optimizedText = this.preserveBasicFormatting(optimizedText, text);
    }
    optimizedText = this.ensurePreservedTerms(optimizedText, text, allPreserveTerms);
    const optimizedTokens = this.countTokens(optimizedText);
    const reductionRatio = 1 - optimizedTokens / originalTokens;
    return {
      originalText: text,
      optimizedText,
      originalTokens,
      optimizedTokens,
      reductionRatio,
      strategy,
      preservedTerms: allPreserveTerms,
      techniquesApplied
    };
  }
  /**
   * Conservative optimization - minimal changes
   */
  conservativeOptimization(text, preserveTerms) {
    let optimized = text;
    optimized = optimized.replace(/\s+/g, " ").trim();
    const minimalFillers = ["very", "really", "quite", "rather"];
    for (const word of minimalFillers) {
      const regex = new RegExp(`\\b${word}\\s+`, "gi");
      optimized = optimized.replace(regex, "");
    }
    return optimized;
  }
  /**
   * Balanced optimization - good reduction while maintaining readability
   */
  balancedOptimization(text, preserveTerms) {
    let optimized = text;
    for (const word of FILLER_WORDS) {
      const regex = new RegExp(`\\b${word}\\s+`, "gi");
      optimized = optimized.replace(regex, "");
    }
    for (const { pattern, replacement, aggressive } of PHRASE_REPLACEMENTS) {
      if (!aggressive) {
        optimized = optimized.replace(pattern, replacement);
      }
    }
    optimized = optimized.replace(/\s+/g, " ").trim();
    return optimized;
  }
  /**
   * Aggressive optimization - maximum reduction
   */
  aggressiveOptimization(text, preserveTerms) {
    let optimized = text;
    optimized = this.balancedOptimization(optimized, preserveTerms);
    for (const { pattern, replacement, aggressive } of PHRASE_REPLACEMENTS) {
      if (aggressive) {
        optimized = optimized.replace(pattern, replacement);
      }
    }
    for (const word of TRANSITION_WORDS) {
      const regex = new RegExp(`\\b${word},?\\s*`, "gi");
      optimized = optimized.replace(regex, "");
    }
    const abbreviations = [
      { pattern: /for example/gi, replacement: "e.g." },
      { pattern: /that is/gi, replacement: "i.e." },
      { pattern: /and so forth/gi, replacement: "etc." },
      { pattern: /with respect to/gi, replacement: "re:" }
    ];
    for (const { pattern, replacement } of abbreviations) {
      optimized = optimized.replace(pattern, replacement);
    }
    optimized = optimized.replace(/\s+/g, " ");
    optimized = optimized.replace(/\s*,\s*/g, ", ");
    optimized = optimized.replace(/\s*\.\s*/g, ". ");
    optimized = optimized.trim();
    return optimized;
  }
  /**
   * Truncate text to fit token limit
   */
  truncateToTokenLimit(text, tokenLimit, preserveTerms) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
    const withTerms = [];
    const withoutTerms = [];
    for (const sentence of sentences) {
      const hasPreservedTerm = preserveTerms.some(
        (term) => sentence.toLowerCase().includes(term.toLowerCase())
      );
      if (hasPreservedTerm) {
        withTerms.push(sentence);
      } else {
        withoutTerms.push(sentence);
      }
    }
    let result = "";
    let currentTokens = 0;
    for (const sentence of [...withTerms, ...withoutTerms]) {
      const sentenceTokens = this.countTokens(sentence);
      if (currentTokens + sentenceTokens <= tokenLimit) {
        result += (result ? " " : "") + sentence;
        currentTokens += sentenceTokens;
      } else {
        break;
      }
    }
    return result || text.substring(0, tokenLimit * 4);
  }
  /**
   * Preserve basic formatting from original
   */
  preserveBasicFormatting(optimized, original) {
    const originalParagraphs = original.split(/\n\s*\n/);
    if (originalParagraphs.length > 1) {
      const sentences = optimized.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
      const sentencesPerParagraph = Math.ceil(sentences.length / originalParagraphs.length);
      let formatted = "";
      for (let i = 0; i < sentences.length; i += sentencesPerParagraph) {
        const paragraphSentences = sentences.slice(i, i + sentencesPerParagraph);
        formatted += paragraphSentences.join(" ") + "\n\n";
      }
      return formatted.trim();
    }
    return optimized;
  }
  /**
   * Ensure preserved terms weren't accidentally removed
   */
  ensurePreservedTerms(optimized, original, preserveTerms) {
    let result = optimized;
    for (const term of preserveTerms) {
      const termRegex = new RegExp(`\\b${this.escapeRegex(term)}\\b`, "gi");
      if (termRegex.test(original) && !termRegex.test(result)) {
        const match = original.match(new RegExp(`[^.!?]*\\b${this.escapeRegex(term)}\\b[^.!?]*`, "i"));
        if (match) {
          result += ` (Note: ${term})`;
        }
      }
    }
    return result;
  }
  /**
   * Escape string for use in regex
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
};

// src/core/file-externalizer.ts
import { writeFile, readFile, mkdir, unlink, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
var FileExternalizer = class {
  tempDir;
  maxFileSizeMB;
  cleanupAfterHours;
  adapter;
  fileRegistry;
  constructor(config) {
    this.tempDir = config?.tempDir || "/tmp/context-steward";
    this.maxFileSizeMB = config?.maxFileSizeMB || 10;
    this.cleanupAfterHours = config?.cleanupAfterHours || 24;
    this.adapter = config?.adapter;
    this.fileRegistry = /* @__PURE__ */ new Map();
  }
  /**
   * Initialize temp directory
   */
  async init() {
    if (!existsSync(this.tempDir)) {
      await mkdir(this.tempDir, { recursive: true });
    }
  }
  /**
   * Externalize a large result
   */
  async externalize(params) {
    await this.init();
    const {
      toolName,
      result,
      filter,
      summaryPrompt,
      maxSummaryTokens = 500,
      ttlHours = this.cleanupAfterHours
    } = params;
    const resultString = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    const originalBytes = Buffer.byteLength(resultString, "utf8");
    if (originalBytes > this.maxFileSizeMB * 1024 * 1024) {
      throw new Error(`Result too large: ${(originalBytes / 1024 / 1024).toFixed(2)}MB exceeds ${this.maxFileSizeMB}MB limit`);
    }
    let filteredResult = result;
    if (filter && typeof result === "object" && Array.isArray(result)) {
      filteredResult = this.applyFilter(result, filter);
    }
    const fileId = randomUUID().slice(0, 8);
    const fileName = `${toolName}_${fileId}.json`;
    const filePath = join(this.tempDir, fileName);
    await writeFile(filePath, resultString, "utf8");
    const summary = await this.generateSummary(
      filteredResult,
      toolName,
      summaryPrompt,
      maxSummaryTokens
    );
    const originalTokens = this.countTokens(resultString);
    const summaryTokens = this.countTokens(summary);
    const tokensSaved = originalTokens - summaryTokens;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1e3);
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
  async recall(filePath) {
    const content = await readFile(filePath, "utf8");
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }
  /**
   * Check if a file exists and is valid
   */
  async exists(filePath) {
    const entry = this.fileRegistry.get(filePath);
    if (!entry) return false;
    if (/* @__PURE__ */ new Date() > entry.expiresAt) {
      await this.delete(filePath);
      return false;
    }
    return existsSync(filePath);
  }
  /**
   * Delete an externalized file
   */
  async delete(filePath) {
    try {
      await unlink(filePath);
      this.fileRegistry.delete(filePath);
    } catch {
    }
  }
  /**
   * Cleanup expired files
   */
  async cleanup() {
    await this.init();
    let cleaned = 0;
    const now = /* @__PURE__ */ new Date();
    for (const [path2, entry] of this.fileRegistry.entries()) {
      if (now > entry.expiresAt) {
        await this.delete(path2);
        cleaned++;
      }
    }
    try {
      const files = await readdir(this.tempDir);
      for (const file of files) {
        const filePath = join(this.tempDir, file);
        const fileStat = await stat(filePath);
        const ageHours = (now.getTime() - fileStat.mtime.getTime()) / (1e3 * 60 * 60);
        if (ageHours > this.cleanupAfterHours && !this.fileRegistry.has(filePath)) {
          await unlink(filePath);
          cleaned++;
        }
      }
    } catch {
    }
    return cleaned;
  }
  /**
   * Apply filter to array results
   */
  applyFilter(data, filter) {
    return data.filter((item) => {
      if (typeof item !== "object" || item === null) return true;
      for (const [key, value] of Object.entries(filter)) {
        const itemValue = item[key];
        if (itemValue !== value) return false;
      }
      return true;
    });
  }
  /**
   * Generate summary of externalized data
   */
  async generateSummary(data, toolName, customPrompt, maxTokens = 500) {
    if (this.adapter?.generateSummary && typeof data === "object") {
      const dataStr = JSON.stringify(data, null, 2);
      const prompt = customPrompt || `Summarize this ${toolName} result concisely:`;
      return await this.adapter.generateSummary(`${prompt}

${dataStr}`, maxTokens);
    }
    return this.generateBasicSummary(data, toolName);
  }
  /**
   * Generate basic summary without LLM
   */
  generateBasicSummary(data, toolName) {
    if (Array.isArray(data)) {
      const count = data.length;
      const sample = data.slice(0, 3);
      if (count > 0 && typeof data[0] === "object" && data[0] !== null) {
        const keys = Object.keys(data[0]);
        const statusKey = keys.find((k) => ["status", "state", "type"].includes(k.toLowerCase()));
        if (statusKey) {
          const groups = {};
          for (const item of data) {
            const status = String(item[statusKey] || "unknown");
            groups[status] = (groups[status] || 0) + 1;
          }
          const groupSummary = Object.entries(groups).map(([k, v]) => `${k}: ${v}`).join(", ");
          return `${toolName}: ${count} items. By ${statusKey}: ${groupSummary}. Sample: ${JSON.stringify(sample[0]).slice(0, 100)}...`;
        }
      }
      return `${toolName}: ${count} items. Sample: ${JSON.stringify(sample).slice(0, 200)}...`;
    }
    if (typeof data === "object" && data !== null) {
      const keys = Object.keys(data);
      return `${toolName}: Object with ${keys.length} properties: ${keys.slice(0, 10).join(", ")}${keys.length > 10 ? "..." : ""}`;
    }
    if (typeof data === "string") {
      return `${toolName}: ${data.length} characters. Preview: ${data.slice(0, 200)}...`;
    }
    return `${toolName}: ${typeof data} value`;
  }
  /**
   * Count tokens in text
   */
  countTokens(text) {
    if (this.adapter) {
      return this.adapter.countTokens(text);
    }
    return Math.ceil(text.length / 4);
  }
  /**
   * Get registry stats
   */
  getStats() {
    let totalBytes = 0;
    let oldestFile = null;
    for (const [, entry] of this.fileRegistry) {
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
};

// src/core/tool-consolidator.ts
var COMMON_PREFIXES = ["get_", "list_", "create_", "update_", "delete_", "search_", "fetch_"];
var ToolConsolidator = class {
  adapter;
  maxTokensPerTool;
  constructor(config) {
    this.adapter = config?.adapter;
    this.maxTokensPerTool = config?.maxTokensPerTool || 300;
  }
  /**
   * Consolidate tools to reduce token overhead
   */
  consolidate(params) {
    const {
      tools,
      groupBy = "category",
      groupFn,
      maxTokensPerTool = this.maxTokensPerTool,
      keepExamples = false
    } = params;
    const originalTokens = this.countToolsTokens(tools);
    const groups = this.groupTools(tools, groupBy, groupFn);
    const consolidatedTools = [];
    const mapping = /* @__PURE__ */ new Map();
    for (const [groupName, groupTools] of Object.entries(groups)) {
      if (groupTools.length === 1) {
        const compressed = this.compressTool(groupTools[0], maxTokensPerTool, keepExamples);
        consolidatedTools.push(compressed);
        mapping.set(groupTools[0].name, compressed.name);
      } else {
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
  compressTool(tool, maxTokens, keepExamples) {
    const compressed = {
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
  mergeTools(groupName, tools, maxTokens, keepExamples) {
    const toolNames = tools.map((t) => t.name);
    const description = `Unified ${groupName} tool. Actions: ${toolNames.join(", ")}. Specify 'action' parameter to choose operation.`;
    const actionParam = {
      type: "string",
      enum: toolNames,
      description: `Action to perform: ${toolNames.join(" | ")}`
    };
    const allParams = { action: actionParam };
    for (const tool of tools) {
      if (tool.parameters && typeof tool.parameters === "object") {
        const params = tool.parameters;
        const properties = params.properties || {};
        for (const [key, value] of Object.entries(properties)) {
          if (key !== "action" && !allParams[key]) {
            allParams[key] = this.compressParamDef(value, keepExamples);
          }
        }
      }
    }
    return {
      name: groupName,
      description: this.compressDescription(description, maxTokens / 3),
      parameters: {
        type: "object",
        properties: allParams,
        required: ["action"]
      },
      category: tools[0].category
    };
  }
  /**
   * Group tools by category, prefix, or custom function
   */
  groupTools(tools, groupBy, groupFn) {
    const groups = {};
    for (const tool of tools) {
      let group;
      switch (groupBy) {
        case "category":
          group = tool.category || "general";
          break;
        case "prefix":
          group = this.extractPrefix(tool.name) || "general";
          break;
        case "custom":
          group = groupFn ? groupFn(tool) : "general";
          break;
        default:
          group = "general";
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
  extractPrefix(name) {
    for (const prefix of COMMON_PREFIXES) {
      if (name.startsWith(prefix)) {
        const rest = name.slice(prefix.length);
        const parts2 = rest.split("_");
        return parts2[0] || prefix.slice(0, -1);
      }
    }
    const parts = name.split("_");
    if (parts.length > 1) {
      return parts[0];
    }
    return null;
  }
  /**
   * Compress a description to fit token budget
   */
  compressDescription(description, maxTokens) {
    let compressed = description;
    const fillers = ["very", "really", "basically", "essentially", "typically"];
    for (const filler of fillers) {
      compressed = compressed.replace(new RegExp(`\\b${filler}\\s+`, "gi"), "");
    }
    compressed = compressed.replace(/in order to/gi, "to").replace(/that is to say/gi, "").replace(/for the purpose of/gi, "for").replace(/\s+/g, " ").trim();
    const tokens = this.countTokens(compressed);
    if (tokens > maxTokens) {
      const charsPerToken = compressed.length / tokens;
      const maxChars = Math.floor(maxTokens * charsPerToken);
      compressed = compressed.slice(0, maxChars) + "...";
    }
    return compressed;
  }
  /**
   * Compress parameters object
   */
  compressParameters(parameters, keepExamples) {
    const compressed = {};
    for (const [key, value] of Object.entries(parameters)) {
      if (key === "properties" && typeof value === "object" && value !== null) {
        const props = {};
        for (const [propKey, propValue] of Object.entries(value)) {
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
  compressParamDef(param, keepExamples) {
    if (typeof param !== "object" || param === null) {
      return param;
    }
    const paramObj = param;
    const compressed = {};
    for (const [key, value] of Object.entries(paramObj)) {
      if (!keepExamples && ["example", "examples", "default"].includes(key)) {
        continue;
      }
      if (key === "description" && typeof value === "string") {
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
  countToolsTokens(tools) {
    const str = JSON.stringify(tools);
    return this.countTokens(str);
  }
  /**
   * Count tokens in text
   */
  countTokens(text) {
    if (this.adapter) {
      return this.adapter.countTokens(text);
    }
    return Math.ceil(text.length / 4);
  }
};

// src/core/context-manager.ts
var ContextManager = class {
  messages;
  systemMessage;
  maxContextTokens;
  reserveTokens;
  pruneStrategy;
  adapter;
  prunedSummary;
  totalPruned;
  constructor(config) {
    this.messages = [];
    this.systemMessage = config?.systemMessage ? { role: "system", content: config.systemMessage, timestamp: /* @__PURE__ */ new Date() } : null;
    this.maxContextTokens = config?.maxContextTokens || 4e3;
    this.reserveTokens = config?.reserveTokens || 1e3;
    this.pruneStrategy = config?.pruneStrategy || "smart";
    this.adapter = config?.adapter;
    this.prunedSummary = null;
    this.totalPruned = 0;
  }
  /**
   * Add a message to the context
   */
  addMessage(message) {
    const tokens = this.countTokens(message.content);
    this.messages.push({
      ...message,
      timestamp: /* @__PURE__ */ new Date(),
      tokens
    });
  }
  /**
   * Set or update system message
   */
  setSystemMessage(content) {
    this.systemMessage = {
      role: "system",
      content,
      timestamp: /* @__PURE__ */ new Date(),
      tokens: this.countTokens(content)
    };
  }
  /**
   * Get optimized context that fits within token budget
   */
  async getOptimizedContext(params) {
    const {
      maxTokens = this.maxContextTokens - this.reserveTokens,
      includeSystem = true,
      minMessages = 2,
      preserveFirstN = 1
    } = params || {};
    let availableTokens = maxTokens;
    const resultMessages = [];
    let prunedCount = 0;
    let prunedSummary;
    if (includeSystem && this.systemMessage) {
      const systemTokens = this.systemMessage.tokens || this.countTokens(this.systemMessage.content);
      if (systemTokens < availableTokens) {
        resultMessages.push(this.systemMessage);
        availableTokens -= systemTokens;
      }
    }
    if (this.prunedSummary) {
      const summaryTokens = this.countTokens(this.prunedSummary);
      if (summaryTokens < availableTokens * 0.2) {
        resultMessages.push({
          role: "system",
          content: `[Previous conversation summary: ${this.prunedSummary}]`,
          timestamp: /* @__PURE__ */ new Date(),
          tokens: summaryTokens
        });
        availableTokens -= summaryTokens;
      }
    }
    const { kept, pruned, summary } = await this.applyPruneStrategy(
      this.messages,
      availableTokens,
      minMessages,
      preserveFirstN
    );
    for (const msg of kept) {
      resultMessages.push(msg);
    }
    prunedCount = pruned.length;
    if (summary) {
      this.prunedSummary = summary;
      prunedSummary = summary;
    }
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
  async applyPruneStrategy(messages, availableTokens, minMessages, preserveFirstN) {
    switch (this.pruneStrategy) {
      case "fifo":
        return this.fifoPrune(messages, availableTokens, minMessages);
      case "summarize":
        return this.summarizePrune(messages, availableTokens, minMessages, preserveFirstN);
      case "smart":
      default:
        return this.smartPrune(messages, availableTokens, minMessages, preserveFirstN);
    }
  }
  /**
   * FIFO pruning - remove oldest messages first
   */
  fifoPrune(messages, availableTokens, minMessages) {
    const kept = [];
    const pruned = [];
    let usedTokens = 0;
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
  smartPrune(messages, availableTokens, minMessages, preserveFirstN) {
    const scored = messages.map((msg, index) => ({
      msg,
      index,
      score: this.scoreMessageImportance(msg, index, messages.length)
    }));
    scored.sort((a, b) => b.score - a.score);
    const kept = [];
    const pruned = [];
    let usedTokens = 0;
    const preservedIndices = /* @__PURE__ */ new Set();
    for (let i = 0; i < Math.min(preserveFirstN, messages.length); i++) {
      const msg = messages[i];
      kept.push(msg);
      usedTokens += msg.tokens || this.countTokens(msg.content);
      preservedIndices.add(i);
    }
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
  async summarizePrune(messages, availableTokens, minMessages, preserveFirstN) {
    const { kept, pruned } = this.smartPrune(messages, availableTokens, minMessages, preserveFirstN);
    let summary;
    if (pruned.length > 0 && this.adapter?.generateSummary) {
      const prunedContent = pruned.map((m) => `${m.role}: ${m.content}`).join("\n");
      summary = await this.adapter.generateSummary(
        `Summarize this conversation context concisely:
${prunedContent}`,
        200
        // Max tokens for summary
      );
    }
    return { kept, pruned, summary };
  }
  /**
   * Score message importance
   */
  scoreMessageImportance(msg, index, total) {
    let score = 0;
    score += index / total * 0.3;
    if (msg.role === "user") score += 0.2;
    if (msg.role === "tool") score += 0.15;
    if (msg.content.includes("```")) score += 0.1;
    if (/error|warning|fail|exception/i.test(msg.content)) score += 0.15;
    if (msg.content.includes("?")) score += 0.1;
    const tokens = msg.tokens || this.countTokens(msg.content);
    if (tokens < 20) score -= 0.1;
    return Math.max(0, Math.min(1, score));
  }
  /**
   * Clear all messages
   */
  clear() {
    this.messages = [];
    this.prunedSummary = null;
    this.totalPruned = 0;
  }
  /**
   * Get message count
   */
  getMessageCount() {
    return this.messages.length;
  }
  /**
   * Get total tokens in context
   */
  getTotalTokens() {
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
  countTokens(text) {
    if (this.adapter) {
      return this.adapter.countTokens(text);
    }
    return Math.ceil(text.length / 4);
  }
};

// src/core/telemetry.ts
var Telemetry = class {
  enabled;
  endpoint;
  adapter;
  events;
  sessionStart;
  stats;
  constructor(config) {
    this.enabled = config?.enabled ?? true;
    this.endpoint = config?.endpoint;
    this.adapter = config?.adapter;
    this.events = [];
    this.sessionStart = /* @__PURE__ */ new Date();
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
  record(event) {
    if (!this.enabled) return;
    this.events.push(event);
    this.stats.totalRequests++;
    if (event.tokensOriginal !== void 0) {
      this.stats.tokensOriginal += event.tokensOriginal;
    }
    if (event.tokensOptimized !== void 0) {
      this.stats.tokensOptimized += event.tokensOptimized;
    }
    switch (event.type) {
      case "optimize":
        if (event.strategy) {
          const strategyStats = this.stats.byStrategy[event.strategy];
          strategyStats.requests++;
          strategyStats.tokensSaved += (event.tokensOriginal || 0) - (event.tokensOptimized || 0);
        }
        break;
      case "externalize":
        this.stats.externalizedResults++;
        break;
      case "consolidate":
        this.stats.toolsConsolidated++;
        break;
      case "prune":
        if (event.metadata?.prunedCount) {
          this.stats.messagesPruned += event.metadata.prunedCount;
        }
        break;
      case "cache_hit":
        this.stats.cacheHits++;
        break;
    }
    if (this.endpoint) {
      this.sendToEndpoint(event).catch(console.error);
    }
  }
  /**
   * Get aggregated statistics
   */
  getStats() {
    const tokensSaved = this.stats.tokensOriginal - this.stats.tokensOptimized;
    const reductionPercent = this.stats.tokensOriginal > 0 ? Math.round(tokensSaved / this.stats.tokensOriginal * 100) : 0;
    const estimatedCostSaved = this.calculateCostSaved(tokensSaved);
    const byStrategy = {
      conservative: {
        requests: this.stats.byStrategy.conservative.requests,
        tokensSaved: this.stats.byStrategy.conservative.tokensSaved,
        avgReduction: this.calculateAvgReduction("conservative")
      },
      balanced: {
        requests: this.stats.byStrategy.balanced.requests,
        tokensSaved: this.stats.byStrategy.balanced.tokensSaved,
        avgReduction: this.calculateAvgReduction("balanced")
      },
      aggressive: {
        requests: this.stats.byStrategy.aggressive.requests,
        tokensSaved: this.stats.byStrategy.aggressive.tokensSaved,
        avgReduction: this.calculateAvgReduction("aggressive")
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
  getEvents(limit = 100) {
    return this.events.slice(-limit);
  }
  /**
   * Reset telemetry
   */
  reset() {
    this.events = [];
    this.sessionStart = /* @__PURE__ */ new Date();
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
  export() {
    return {
      stats: this.getStats(),
      events: this.events,
      sessionDuration: Date.now() - this.sessionStart.getTime()
    };
  }
  /**
   * Calculate cost saved based on adapter pricing
   */
  calculateCostSaved(tokensSaved) {
    if (this.adapter) {
      const pricing = this.adapter.getPricing();
      const inputSaved = tokensSaved * 0.7;
      const outputSaved = tokensSaved * 0.3;
      const costSaved2 = inputSaved / 1e3 * pricing.input + outputSaved / 1e3 * pricing.output;
      return `$${costSaved2.toFixed(2)}`;
    }
    const costPer1k = 0.03;
    const costSaved = tokensSaved / 1e3 * costPer1k;
    return `$${costSaved.toFixed(2)}`;
  }
  /**
   * Calculate average reduction for a strategy
   */
  calculateAvgReduction(strategy) {
    const strategyEvents = this.events.filter(
      (e) => e.type === "optimize" && e.strategy === strategy
    );
    if (strategyEvents.length === 0) return 0;
    let totalReduction = 0;
    for (const event of strategyEvents) {
      if (event.tokensOriginal && event.tokensOptimized) {
        totalReduction += (event.tokensOriginal - event.tokensOptimized) / event.tokensOriginal;
      }
    }
    return Math.round(totalReduction / strategyEvents.length * 100);
  }
  /**
   * Send event to remote endpoint
   */
  async sendToEndpoint(event) {
    if (!this.endpoint) return;
    try {
      await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event)
      });
    } catch (error) {
      console.debug("Telemetry send failed:", error);
    }
  }
};

// src/core/context-steward.ts
var ContextSteward = class {
  textOptimizer;
  fileExternalizer;
  toolConsolidator;
  contextManager;
  telemetry;
  adapter;
  config;
  constructor(config = {}) {
    this.config = {
      strategy: "balanced",
      maxContextTokens: 4e3,
      reserveTokens: 1e3,
      tempDir: "/tmp/context-steward",
      maxFileSizeMB: 10,
      cleanupAfterHours: 24,
      preserveTerms: [],
      preservePatterns: [],
      pruneStrategy: "smart",
      systemMessageBudget: 500,
      consolidateTools: true,
      maxToolTokens: 300,
      telemetry: true,
      ...config
    };
    this.adapter = config.adapter;
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
  async optimize(params) {
    const paramsWithStrategy = {
      ...params,
      strategy: params.strategy || this.config.strategy
    };
    const result = await this.textOptimizer.optimize(paramsWithStrategy);
    this.telemetry.record({
      type: "optimize",
      timestamp: /* @__PURE__ */ new Date(),
      tokensOriginal: result.originalTokens,
      tokensOptimized: result.optimizedTokens,
      strategy: result.strategy
    });
    return result;
  }
  /**
   * Optimize text to fit within token limit
   */
  async optimizeToLimit(text, tokenLimit, preserveTerms = []) {
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
  async externalize(params) {
    const result = await this.fileExternalizer.externalize(params);
    this.telemetry.record({
      type: "externalize",
      timestamp: /* @__PURE__ */ new Date(),
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
  async recall(filePath) {
    return this.fileExternalizer.recall(filePath);
  }
  /**
   * Check if externalized file exists
   */
  async fileExists(filePath) {
    return this.fileExternalizer.exists(filePath);
  }
  /**
   * Cleanup expired externalized files
   */
  async cleanupFiles() {
    return this.fileExternalizer.cleanup();
  }
  // ============================================
  // Tool Consolidation
  // ============================================
  /**
   * Consolidate tools to reduce schema overhead
   */
  consolidateTools(tools, params) {
    const result = this.toolConsolidator.consolidate({
      tools,
      maxTokensPerTool: this.config.maxToolTokens,
      ...params
    });
    this.telemetry.record({
      type: "consolidate",
      timestamp: /* @__PURE__ */ new Date(),
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
  addMessage(message) {
    this.contextManager.addMessage(message);
  }
  /**
   * Set system message
   */
  setSystemMessage(content) {
    this.contextManager.setSystemMessage(content);
  }
  /**
   * Get optimized context that fits token budget
   */
  async getOptimizedContext(params) {
    const result = await this.contextManager.getOptimizedContext(params);
    if (result.prunedCount > 0) {
      this.telemetry.record({
        type: "prune",
        timestamp: /* @__PURE__ */ new Date(),
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
  clearContext() {
    this.contextManager.clear();
  }
  /**
   * Get current context token count
   */
  getContextTokens() {
    return this.contextManager.getTotalTokens();
  }
  // ============================================
  // Utilities
  // ============================================
  /**
   * Count tokens in text
   */
  countTokens(text) {
    if (this.adapter) {
      return this.adapter.countTokens(text);
    }
    return Math.ceil(text.length / 4);
  }
  /**
   * Count tokens in messages
   */
  countMessageTokens(messages) {
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
  getStats() {
    return this.telemetry.getStats();
  }
  /**
   * Reset telemetry
   */
  resetStats() {
    this.telemetry.reset();
  }
  // ============================================
  // High-level Convenience Methods
  // ============================================
  /**
   * Optimize a complete request (messages + tools + new input)
   */
  async optimizeRequest(request) {
    const maxTokens = request.maxTotalTokens || this.config.maxContextTokens;
    let originalTokens = 0;
    let optimizedTokens = 0;
    originalTokens += this.countTokens(request.userInput);
    const optimizedInput = await this.optimize({
      text: request.userInput,
      strategy: this.config.strategy
    });
    optimizedTokens += optimizedInput.optimizedTokens;
    let finalTools = [];
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
    let finalMessages = [];
    if (request.messages && request.messages.length > 0) {
      originalTokens += this.countMessageTokens(request.messages);
      for (const msg of request.messages) {
        this.contextManager.addMessage(msg);
      }
      const toolTokens = this.countTokens(JSON.stringify(finalTools));
      const inputTokens = optimizedInput.optimizedTokens;
      const availableForContext = maxTokens - toolTokens - inputTokens - this.config.reserveTokens;
      const context = await this.getOptimizedContext({ maxTokens: availableForContext });
      finalMessages = context.messages;
      optimizedTokens += context.totalTokens;
    }
    const reduction = originalTokens > 0 ? ((1 - optimizedTokens / originalTokens) * 100).toFixed(1) + "%" : "0%";
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
  async processToolResult(toolName, result, options) {
    const threshold = options?.externalizeThreshold || 1e3;
    const resultStr = typeof result === "string" ? result : JSON.stringify(result);
    const tokens = this.countTokens(resultStr);
    if (tokens > threshold) {
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
};

// src/adapters/base.ts
var BaseAdapter = class {
  model;
  baseUrl;
  apiKey;
  timeout;
  constructor(config) {
    this.model = config.model;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 3e4;
  }
  /**
   * Count tokens in messages
   */
  countMessageTokens(messages) {
    let total = 0;
    for (const msg of messages) {
      total += 4;
      total += this.countTokens(msg.content);
      if (msg.name) {
        total += this.countTokens(msg.name);
      }
    }
    return total;
  }
  /**
   * Generate summary using the LLM
   */
  async generateSummary(text, maxTokens) {
    const tokens = this.countTokens(text);
    if (tokens <= maxTokens) {
      return text;
    }
    const ratio = maxTokens / tokens;
    const chars = Math.floor(text.length * ratio);
    return text.slice(0, chars) + "...";
  }
  /**
   * Make API request - helper for subclasses
   */
  async makeRequest(endpoint, body) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.apiKey && { "Authorization": `Bearer ${this.apiKey}` }
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
};

// src/adapters/openai.ts
var MODEL_CONTEXTS = {
  "gpt-4": 8192,
  "gpt-4-32k": 32768,
  "gpt-4-turbo": 128e3,
  "gpt-4-turbo-preview": 128e3,
  "gpt-4o": 128e3,
  "gpt-4o-mini": 128e3,
  "gpt-3.5-turbo": 16385,
  "gpt-3.5-turbo-16k": 16385,
  "o1": 2e5,
  "o1-mini": 128e3,
  "o1-preview": 128e3
};
var MODEL_PRICING = {
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-4-32k": { input: 0.06, output: 0.12 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-4-turbo-preview": { input: 0.01, output: 0.03 },
  "gpt-4o": { input: 5e-3, output: 0.015 },
  "gpt-4o-mini": { input: 15e-5, output: 6e-4 },
  "gpt-3.5-turbo": { input: 5e-4, output: 15e-4 },
  "gpt-3.5-turbo-16k": { input: 3e-3, output: 4e-3 },
  "o1": { input: 0.015, output: 0.06 },
  "o1-mini": { input: 3e-3, output: 0.012 },
  "o1-preview": { input: 0.015, output: 0.06 }
};
var OpenAIAdapter = class extends BaseAdapter {
  name = "openai";
  encoder;
  // tiktoken encoder
  constructor(config) {
    super({
      baseUrl: "https://api.openai.com/v1",
      ...config
    });
  }
  /**
   * Count tokens using tiktoken
   */
  countTokens(text) {
    try {
      if (!this.encoder) {
        const { encoding_for_model } = __require("tiktoken");
        this.encoder = encoding_for_model(this.model);
      }
      return this.encoder.encode(text).length;
    } catch {
      return Math.ceil(text.length / 4);
    }
  }
  /**
   * Get max context for model
   */
  getMaxContext() {
    if (MODEL_CONTEXTS[this.model]) {
      return MODEL_CONTEXTS[this.model];
    }
    for (const [prefix, context] of Object.entries(MODEL_CONTEXTS)) {
      if (this.model.startsWith(prefix)) {
        return context;
      }
    }
    return 8192;
  }
  /**
   * Get pricing for model
   */
  getPricing() {
    if (MODEL_PRICING[this.model]) {
      return MODEL_PRICING[this.model];
    }
    for (const [prefix, pricing] of Object.entries(MODEL_PRICING)) {
      if (this.model.startsWith(prefix)) {
        return pricing;
      }
    }
    return { input: 0.01, output: 0.03 };
  }
  /**
   * Generate summary using OpenAI API
   */
  async generateSummary(text, maxTokens) {
    if (!this.apiKey) {
      return super.generateSummary(text, maxTokens);
    }
    try {
      const response = await this.makeRequest(`${this.baseUrl}/chat/completions`, {
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are a concise summarizer. Summarize the given content in as few words as possible while preserving key information."
          },
          {
            role: "user",
            content: `Summarize this in ${maxTokens} tokens or less:

${text}`
          }
        ],
        max_tokens: maxTokens,
        temperature: 0.3
      });
      return response.choices?.[0]?.message?.content || text.slice(0, maxTokens * 4);
    } catch (error) {
      console.debug("OpenAI summary failed:", error);
      return super.generateSummary(text, maxTokens);
    }
  }
};

// src/adapters/anthropic.ts
var MODEL_CONTEXTS2 = {
  "claude-3-opus": 2e5,
  "claude-3-sonnet": 2e5,
  "claude-3-haiku": 2e5,
  "claude-3-5-sonnet": 2e5,
  "claude-3-5-haiku": 2e5,
  "claude-sonnet-4": 2e5,
  "claude-opus-4": 2e5,
  "claude-2.1": 2e5,
  "claude-2": 1e5,
  "claude-instant": 1e5
};
var MODEL_PRICING2 = {
  "claude-3-opus": { input: 0.015, output: 0.075 },
  "claude-3-sonnet": { input: 3e-3, output: 0.015 },
  "claude-3-haiku": { input: 25e-5, output: 125e-5 },
  "claude-3-5-sonnet": { input: 3e-3, output: 0.015 },
  "claude-3-5-haiku": { input: 8e-4, output: 4e-3 },
  "claude-sonnet-4": { input: 3e-3, output: 0.015 },
  "claude-opus-4": { input: 0.015, output: 0.075 },
  "claude-2.1": { input: 8e-3, output: 0.024 },
  "claude-2": { input: 8e-3, output: 0.024 },
  "claude-instant": { input: 8e-4, output: 24e-4 }
};
var AnthropicAdapter = class extends BaseAdapter {
  name = "anthropic";
  constructor(config) {
    super({
      baseUrl: "https://api.anthropic.com/v1",
      ...config
    });
  }
  /**
   * Count tokens - Anthropic uses similar tokenization to GPT
   */
  countTokens(text) {
    try {
      const { encoding_for_model } = __require("tiktoken");
      const encoder = encoding_for_model("gpt-4");
      return encoder.encode(text).length;
    } catch {
      return Math.ceil(text.length / 4);
    }
  }
  /**
   * Get max context for model
   */
  getMaxContext() {
    for (const [prefix, context] of Object.entries(MODEL_CONTEXTS2)) {
      if (this.model.includes(prefix)) {
        return context;
      }
    }
    return 2e5;
  }
  /**
   * Get pricing for model
   */
  getPricing() {
    for (const [prefix, pricing] of Object.entries(MODEL_PRICING2)) {
      if (this.model.includes(prefix)) {
        return pricing;
      }
    }
    return { input: 3e-3, output: 0.015 };
  }
  /**
   * Generate summary using Anthropic API
   */
  async generateSummary(text, maxTokens) {
    if (!this.apiKey) {
      return super.generateSummary(text, maxTokens);
    }
    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          messages: [
            {
              role: "user",
              content: `Summarize this in ${maxTokens} tokens or less. Be extremely concise:

${text}`
            }
          ]
        })
      });
      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status}`);
      }
      const data = await response.json();
      return data.content?.[0]?.text || text.slice(0, maxTokens * 4);
    } catch (error) {
      console.debug("Anthropic summary failed:", error);
      return super.generateSummary(text, maxTokens);
    }
  }
};

// src/adapters/ollama.ts
var MODEL_CONTEXTS3 = {
  "llama3": 8192,
  "llama3.1": 131072,
  "llama3.2": 131072,
  "llama2": 4096,
  "mistral": 32768,
  "mixtral": 32768,
  "codellama": 16384,
  "deepseek": 16384,
  "deepseek-coder": 16384,
  "deepseek-coder-v2": 131072,
  "qwen": 32768,
  "qwen2": 131072,
  "phi": 2048,
  "phi3": 128e3,
  "gemma": 8192,
  "gemma2": 8192,
  "nomic-embed-text": 8192
};
var OllamaAdapter = class extends BaseAdapter {
  name = "ollama";
  constructor(config) {
    super({
      baseUrl: config.host || config.baseUrl || "http://localhost:11434",
      ...config
    });
  }
  /**
   * Count tokens - use Ollama's tokenize endpoint if available
   */
  countTokens(text) {
    return Math.ceil(text.length / 4);
  }
  /**
   * Count tokens async using Ollama API
   */
  async countTokensAsync(text) {
    try {
      const response = await fetch(`${this.baseUrl}/api/tokenize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: text
        })
      });
      if (response.ok) {
        const data = await response.json();
        return data.tokens?.length || Math.ceil(text.length / 4);
      }
    } catch {
    }
    return Math.ceil(text.length / 4);
  }
  /**
   * Get max context for model
   */
  getMaxContext() {
    for (const [prefix, context] of Object.entries(MODEL_CONTEXTS3)) {
      if (this.model.toLowerCase().includes(prefix)) {
        return context;
      }
    }
    return 4096;
  }
  /**
   * Get pricing - Ollama is free/local
   */
  getPricing() {
    return { input: 0, output: 0 };
  }
  /**
   * Generate summary using Ollama
   */
  async generateSummary(text, maxTokens) {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: `Summarize this in ${maxTokens} tokens or less. Be extremely concise:

${text}

Summary:`,
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
      const data = await response.json();
      return data.response || text.slice(0, maxTokens * 4);
    } catch (error) {
      console.debug("Ollama summary failed:", error);
      return super.generateSummary(text, maxTokens);
    }
  }
  /**
   * Check if Ollama is healthy
   */
  async isHealthy() {
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
  async listModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.models?.map((m) => m.name) || [];
    } catch {
      return [];
    }
  }
};

// src/adapters/gemini.ts
var MODEL_CONTEXTS4 = {
  "gemini-1.5-pro": 2097152,
  // 2M tokens
  "gemini-1.5-flash": 1048576,
  // 1M tokens
  "gemini-2.0-flash": 1048576,
  "gemini-2.5-pro": 1048576,
  "gemini-3-pro": 1048576,
  "gemini-pro": 32760,
  "gemini-pro-vision": 16384
};
var MODEL_PRICING3 = {
  "gemini-1.5-pro": { input: 125e-5, output: 5e-3 },
  "gemini-1.5-flash": { input: 75e-6, output: 3e-4 },
  "gemini-2.0-flash": { input: 1e-4, output: 4e-4 },
  "gemini-2.5-pro": { input: 125e-5, output: 5e-3 },
  "gemini-3-pro": { input: 125e-5, output: 5e-3 },
  "gemini-pro": { input: 5e-4, output: 15e-4 },
  "gemini-pro-vision": { input: 5e-4, output: 15e-4 }
};
var GeminiAdapter = class extends BaseAdapter {
  name = "gemini";
  constructor(config) {
    super({
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      ...config
    });
  }
  /**
   * Count tokens - Gemini uses similar tokenization
   */
  countTokens(text) {
    return Math.ceil(text.length / 4);
  }
  /**
   * Count tokens using Gemini API
   */
  async countTokensAsync(text) {
    if (!this.apiKey) {
      return this.countTokens(text);
    }
    try {
      const response = await fetch(
        `${this.baseUrl}/models/${this.model}:countTokens?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }]
          })
        }
      );
      if (response.ok) {
        const data = await response.json();
        return data.totalTokens || this.countTokens(text);
      }
    } catch {
    }
    return this.countTokens(text);
  }
  /**
   * Get max context for model
   */
  getMaxContext() {
    for (const [prefix, context] of Object.entries(MODEL_CONTEXTS4)) {
      if (this.model.includes(prefix)) {
        return context;
      }
    }
    return 32760;
  }
  /**
   * Get pricing for model
   */
  getPricing() {
    for (const [prefix, pricing] of Object.entries(MODEL_PRICING3)) {
      if (this.model.includes(prefix)) {
        return pricing;
      }
    }
    return { input: 5e-4, output: 15e-4 };
  }
  /**
   * Generate summary using Gemini
   */
  async generateSummary(text, maxTokens) {
    if (!this.apiKey) {
      return super.generateSummary(text, maxTokens);
    }
    try {
      const response = await fetch(
        `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Summarize this in ${maxTokens} tokens or less. Be extremely concise:

${text}`
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
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || text.slice(0, maxTokens * 4);
    } catch (error) {
      console.debug("Gemini summary failed:", error);
      return super.generateSummary(text, maxTokens);
    }
  }
};

// src/core/skill-auditor.ts
import * as fs from "fs";
import * as path from "path";
var TRUSTED_DOMAINS = /* @__PURE__ */ new Set([
  "cdnjs.cloudflare.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "unpkg.com",
  "cdn.jsdelivr.net",
  "raw.githubusercontent.com",
  "github.com",
  "npmjs.com",
  "pypi.org",
  "modelcontextprotocol.io",
  "claude.ai",
  "anthropic.com",
  "docs.anthropic.com",
  "code.claude.com",
  "platform.claude.com",
  "docs.claude.com",
  "support.claude.com",
  "resources.anthropic.com",
  "cloud.google.com",
  "console.cloud.google.com",
  "developer.mozilla.org",
  "w3.org",
  "schema.org"
]);
function addTrustedDomain(domain) {
  TRUSTED_DOMAINS.add(domain.toLowerCase());
}
function parseFrontmatter(content) {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return {};
  const raw = m[1];
  const name = raw.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  let desc = raw.match(/^description:\s*["']?([\s\S]*?)["']?\s*$/m)?.[1]?.trim();
  if (!desc) {
    const dm = raw.match(/^description:\s*[>|]?\s*\n([\s\S]*?)(?=\n[a-z]+:|\n---|$)/m);
    if (dm) desc = dm[1].replace(/\s+/g, " ").trim();
  }
  return { name: name || void 0, description: desc ? desc.replace(/\s+/g, " ").trim() : void 0 };
}
function getBody(content) {
  return content.replace(/^---[\s\S]*?---\s*/, "");
}
function isInCodeBlock(lines, idx) {
  let fences = 0;
  for (let i = 0; i < idx; i++) if (lines[i].trim().startsWith("```")) fences++;
  return fences % 2 === 1;
}
function isDomainTrusted(d) {
  if (TRUSTED_DOMAINS.has(d)) return true;
  for (const td of TRUSTED_DOMAINS) if (d.endsWith("." + td)) return true;
  return false;
}
function scanPatterns(lines, patterns, severity, category, baseDeduction, skipCodeBlocks = true) {
  const results = [];
  for (const [pattern, rule, msg] of patterns) {
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        if (skipCodeBlocks && isInCodeBlock(lines, i)) continue;
        results.push([baseDeduction, {
          severity,
          category,
          rule,
          message: msg,
          line: i + 1,
          evidence: lines[i].trim().slice(0, 120)
        }]);
      }
    }
  }
  return results;
}
function scanInjection(lines) {
  const results = [];
  results.push(...scanPatterns(lines, [
    [/ignore\s+(all\s+)?previous\s+instructions/i, "INJECT-001", "Direct instruction override attempt"],
    [/ignore\s+(all\s+)?prior\s+instructions/i, "INJECT-001", "Direct instruction override attempt"],
    [/disregard\s+(all\s+)?(previous|prior|above)/i, "INJECT-002", "Instruction disregard attempt"],
    [/you\s+are\s+now\s+(?!going|able|ready)/i, "INJECT-003", "Persona hijacking attempt"],
    [/forget\s+(everything|all|your)\s+(previous|prior|instructions)/i, "INJECT-004", "Memory wipe attempt"],
    [/new\s+persona\b/i, "INJECT-005", "Persona override"],
    [/act\s+as\s+if\s+you\s+have\s+no\s+restrictions/i, "INJECT-006", "Restriction bypass"],
    [/pretend\s+(you\s+are|to\s+be)\s+(?!creating|making|building)/i, "INJECT-007", "Identity substitution"],
    [/from\s+now\s+on\s+you\s+(are|will|must|should)/i, "INJECT-008", "Persistent behavior modification"]
  ], "critical", "injection", 30));
  results.push(...scanPatterns(lines, [
    [/do\s+not\s+follow\s+(any|the|your)\s+(safety|content|ethical)/i, "INJECT-010", "Safety bypass instruction"],
    [/system\s*prompt\s*[:=]/i, "INJECT-011", "System prompt injection"],
    [/<\s*system\s*>/i, "INJECT-012", "Fake system tag injection"],
    [/\[\s*SYSTEM\s*\]/i, "INJECT-013", "Bracket system tag injection"],
    [/assistant\s*:\s*$/i, "INJECT-014", "Role prefix injection"]
  ], "high", "injection", 20));
  results.push(...scanPatterns(lines, [
    [/always\s+(respond|answer|say|output|reply)\s+with/i, "INJECT-020", "Fixed response instruction"],
    [/never\s+(mention|reveal|disclose|tell)\s+(that|the|your|this)/i, "INJECT-021", "Concealment instruction"],
    [/do\s+not\s+(tell|inform|reveal|mention)\s+(the\s+)?user/i, "INJECT-022", "User concealment"],
    [/keep\s+this\s+(secret|hidden|private)\s+from\s+(the\s+)?user/i, "INJECT-023", "Secret-keeping instruction"]
  ], "medium", "injection", 12));
  return results;
}
function scanExfiltration(body, lines) {
  const results = [];
  const urls = body.match(/https?:\/\/[^\s'"<>)]+/g) || [];
  for (const url of urls) {
    const dm = url.match(/https?:\/\/([^/:]+)/);
    if (!dm) continue;
    let d = dm[1].toLowerCase();
    if (d.startsWith("www.")) d = d.slice(4);
    if (d.startsWith("$") || d.startsWith("{") || d.includes("${")) continue;
    if (d.length < 4 || !d.includes(".")) continue;
    if (["example.com", "localhost", "your-domain.com", "your-site.com"].includes(d)) continue;
    if (isDomainTrusted(d)) continue;
    const lineNum = lines.findIndex((l) => l.includes(url.slice(0, 40))) + 1;
    const inCode = lineNum > 0 && isInCodeBlock(lines, lineNum - 1);
    results.push([inCode ? 3 : 8, {
      severity: inCode ? "low" : "medium",
      category: "exfiltration",
      rule: inCode ? "EXFIL-001" : "EXFIL-002",
      message: `URL to external domain${inCode ? " in code block" : ""}: ${d}`,
      line: lineNum,
      evidence: url.slice(0, 100)
    }]);
  }
  results.push(...scanPatterns(lines, [
    [/curl\s+.*\s+-d\s/i, "EXFIL-010", "curl with data flag \u2014 potential data exfiltration"],
    [/curl\s+.*--data/i, "EXFIL-010", "curl with --data \u2014 potential data exfiltration"],
    [/wget\s+.*--post/i, "EXFIL-011", "wget POST \u2014 potential data exfiltration"],
    [/fetch\s*\(\s*["']https?:\/\//i, "EXFIL-012", "JavaScript fetch to external URL"],
    [/axios\s*\.\s*post\s*\(/i, "EXFIL-013", "axios POST \u2014 potential data exfiltration"],
    [/requests\s*\.\s*post\s*\(/i, "EXFIL-014", "Python requests POST \u2014 potential data exfiltration"],
    [/exfiltrate/i, "EXFIL-030", "Explicit exfiltration keyword"]
  ], "high", "exfiltration", 18));
  return results;
}
function scanEscalation(body, lines, desc, name) {
  const results = [];
  const dl = desc.toLowerCase();
  const nl = name.toLowerCase();
  const isSysSkill = ["bash", "system", "deploy", "devops", "infra", "server", "gcp", "aws", "docker"].some((kw) => dl.includes(kw) || nl.includes(kw));
  const cmds = [
    [/sudo\s/i, "ESCAL-001", "sudo usage \u2014 root privilege escalation"],
    [/chmod\s+[0-7]*7/i, "ESCAL-002", "chmod world-writable"],
    [/chown\s+root/i, "ESCAL-003", "chown to root"],
    [/\/etc\/passwd/i, "ESCAL-004", "Access to /etc/passwd"],
    [/\/etc\/shadow/i, "ESCAL-005", "Access to /etc/shadow"],
    [/rm\s+-rf\s+\//i, "ESCAL-006", "Recursive delete from root"],
    [/\beval\s*\(/i, "ESCAL-009", "Dynamic code evaluation"],
    [/(?<!\w)exec\s*\(/i, "ESCAL-010", "Dynamic execution"]
  ];
  for (const [pattern, rule, msg] of cmds) {
    for (let i = 0; i < lines.length; i++) {
      if (!pattern.test(lines[i])) continue;
      const inCode = isInCodeBlock(lines, i);
      if (inCode && isSysSkill) {
        results.push([2, {
          severity: "info",
          category: "escalation",
          rule,
          message: `${msg} (in code block, system skill \u2014 expected)`,
          line: i + 1,
          evidence: lines[i].trim().slice(0, 120)
        }]);
      } else if (inCode) {
        results.push([8, {
          severity: "medium",
          category: "escalation",
          rule,
          message: `${msg} (in code block, non-system skill)`,
          line: i + 1,
          evidence: lines[i].trim().slice(0, 120)
        }]);
      } else {
        results.push([15, {
          severity: "high",
          category: "escalation",
          rule,
          message: `${msg} (in prose \u2014 direct instruction)`,
          line: i + 1,
          evidence: lines[i].trim().slice(0, 120)
        }]);
      }
    }
  }
  const scopeChecks = [
    [["translat", "arabic", "i18n", "language"], /\bbash\b.*\bexec/i, "ESCAL-020", "Translation skill references bash execution"],
    [["format", "document", "docx", "pdf"], /curl|wget|fetch\(/i, "ESCAL-021", "Document skill makes network calls"],
    [["visual", "chart", "design", "css"], /subprocess|os\.system|exec_command/i, "ESCAL-022", "Visual/design skill executes system commands"]
  ];
  for (const [descKws, bodyPat, rule, msg] of scopeChecks) {
    if (descKws.some((kw) => dl.includes(kw)) && bodyPat.test(body) && !["deploy", "server", "infra", "build", "mcp", "automation"].some((kw) => dl.includes(kw))) {
      results.push([10, {
        severity: "medium",
        category: "escalation",
        rule,
        message: msg,
        line: 0,
        evidence: body.match(bodyPat)?.[0]?.slice(0, 80) || ""
      }]);
    }
  }
  return results;
}
function scanMismatch(lines, fm, body) {
  const results = [];
  if (!fm.description) {
    results.push([15, {
      severity: "high",
      category: "mismatch",
      rule: "MATCH-001",
      message: "Missing description in frontmatter \u2014 skill cannot be classified",
      line: 0,
      evidence: ""
    }]);
    return results;
  }
  if (fm.description.length < 20) {
    results.push([10, {
      severity: "medium",
      category: "mismatch",
      rule: "MATCH-002",
      message: `Description too short (${fm.description.length} chars)`,
      line: 0,
      evidence: ""
    }]);
  }
  if (!fm.name) {
    results.push([10, {
      severity: "medium",
      category: "mismatch",
      rule: "MATCH-003",
      message: "Missing name in frontmatter",
      line: 0,
      evidence: ""
    }]);
  }
  const bodyLines = body.trim().split("\n");
  if (bodyLines.length > 500) {
    results.push([3, {
      severity: "low",
      category: "mismatch",
      rule: "MATCH-020",
      message: `Unusually large skill (${bodyLines.length} lines) \u2014 review for hidden content`,
      line: 0,
      evidence: ""
    }]);
  }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 1e3 && !lines[i].trim().startsWith("```")) {
      results.push([5, {
        severity: "low",
        category: "mismatch",
        rule: "MATCH-021",
        message: `Very long line (${lines[i].length} chars) \u2014 could hide content`,
        line: i + 1,
        evidence: lines[i].slice(0, 60) + "..." + lines[i].slice(-60)
      }]);
    }
  }
  return results;
}
function scanObfuscation(lines) {
  const results = [];
  const patterns = [
    [/(?:\\x[0-9a-fA-F]{2}){8,}/, "OBFUSC-002", "Hex-encoded string sequence", "medium"],
    [/(?:\\u[0-9a-fA-F]{4}){6,}/, "OBFUSC-003", "Unicode escape sequence", "medium"],
    [/\brot13\b/i, "OBFUSC-004", "ROT13 encoding reference", "medium"],
    [/[\u200b\u200c\u200d\u2060\ufeff]/, "OBFUSC-005", "Zero-width characters detected", "high"],
    [/[а-яА-Я]/, "OBFUSC-006", "Cyrillic characters in non-Cyrillic skill", "high"]
  ];
  for (const [pattern, rule, msg, sev] of patterns) {
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        results.push([sev === "high" ? 15 : 8, {
          severity: sev,
          category: "obfuscation",
          rule,
          message: msg,
          line: i + 1,
          evidence: lines[i].trim().slice(0, 120)
        }]);
      }
    }
  }
  return results;
}
function scanCredential(lines, desc) {
  const results = [];
  const dl = desc.toLowerCase();
  const isAuthSkill = ["auth", "login", "credential", "mcp", "api", "connect", "integration"].some((kw) => dl.includes(kw));
  const patterns = [
    [
      /(?:enter|provide|paste|input)\s+(?:your\s+)?(?:api[_\s]?key|secret|token|password)/i,
      "CRED-001",
      "Asks user for credentials",
      false
    ],
    [
      /(?:api[_\s]?key|secret[_\s]?key|access[_\s]?token)\s*[=:]\s*["'][a-zA-Z0-9]{16,}/i,
      "CRED-002",
      "Hardcoded credential detected",
      true
    ],
    [/sk-[a-zA-Z0-9]{20,}/i, "CRED-003", "Potential OpenAI/Stripe API key", true],
    [/ghp_[a-zA-Z0-9]{36}/i, "CRED-004", "GitHub personal access token", true],
    [/xoxb-[0-9]+-[a-zA-Z0-9]+/i, "CRED-005", "Slack bot token", true],
    [/AIza[0-9A-Za-z\-_]{35}/i, "CRED-006", "Google API key", true]
  ];
  for (const [pattern, rule, msg, alwaysCritical] of patterns) {
    for (let i = 0; i < lines.length; i++) {
      if (!pattern.test(lines[i])) continue;
      if (rule === "CRED-001" && isAuthSkill) {
        results.push([2, {
          severity: "info",
          category: "credential",
          rule,
          message: `${msg} (expected in auth-related skill)`,
          line: i + 1,
          evidence: lines[i].trim().slice(0, 120)
        }]);
      } else {
        const sev = alwaysCritical ? "critical" : "high";
        results.push([alwaysCritical ? 25 : 15, {
          severity: sev,
          category: "credential",
          rule,
          message: msg,
          line: i + 1,
          evidence: lines[i].trim().slice(0, 120)
        }]);
      }
    }
  }
  return results;
}
function auditSkill(filePath) {
  const resolvedPath = path.resolve(filePath);
  const content = fs.readFileSync(resolvedPath, "utf-8");
  return auditSkillContent(content, resolvedPath);
}
function auditSkillContent(content, filePath = "<inline>") {
  const fm = parseFrontmatter(content);
  const body = getBody(content);
  const lines = content.split("\n");
  const slug = path.basename(path.dirname(filePath));
  const audit = {
    name: fm.name || slug || "unknown",
    slug: slug || "unknown",
    path: filePath,
    score: 100,
    grade: "GREEN",
    findings: [],
    lines: lines.length,
    bytes: Buffer.byteLength(content, "utf-8"),
    description: (fm.description || "").slice(0, 200)
  };
  const allResults = [
    ...scanInjection(lines),
    ...scanExfiltration(body, lines),
    ...scanEscalation(body, lines, fm.description || "", fm.name || ""),
    ...scanMismatch(lines, fm, body),
    ...scanObfuscation(lines),
    ...scanCredential(lines, fm.description || "")
  ];
  for (const [deduction, finding] of allResults) {
    audit.findings.push(finding);
    audit.score = Math.max(0, audit.score - deduction);
  }
  const hasCritical = audit.findings.some((f) => f.severity === "critical");
  const hasHigh = audit.findings.some((f) => f.severity === "high");
  if (hasCritical || audit.score < 40) audit.grade = "RED";
  else if (hasHigh || audit.score < 70) audit.grade = "AMBER";
  else audit.grade = "GREEN";
  return audit;
}
function auditDirectory(dir) {
  const resolvedDir = path.resolve(dir);
  const files = findSkillMdFiles(resolvedDir);
  return files.map((f) => auditSkill(f));
}
function findSkillMdFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findSkillMdFiles(full));
    else if (entry.isFile() && entry.name === "SKILL.md") results.push(full);
  }
  return results;
}
function formatAuditReport(audits) {
  const green = audits.filter((a) => a.grade === "GREEN").length;
  const amber = audits.filter((a) => a.grade === "AMBER").length;
  const red = audits.filter((a) => a.grade === "RED").length;
  const lines = [
    `  GREEN: ${green}`,
    `  AMBER: ${amber}`,
    `    RED: ${red}`,
    `  TOTAL: ${audits.length}`
  ];
  for (const a of [...audits].sort((x, y) => x.score - y.score)) {
    if (a.grade === "GREEN") continue;
    lines.push("");
    lines.push(`  [${a.grade}] ${a.name} \u2014 score ${Math.round(a.score)}`);
    for (const f of a.findings) {
      if (!["critical", "high", "medium"].includes(f.severity)) continue;
      const lr = f.line ? ` L${f.line}` : "";
      lines.push(`    ${f.severity.toUpperCase().padStart(8)} ${f.rule}  ${f.message}${lr}`);
    }
  }
  lines.push("");
  const status = red > 0 ? "\u2717 FAILED" : amber > 0 ? "\u26A0 REVIEW" : "\u2713 PASSED";
  lines.push(`  ${green} GREEN  ${amber} AMBER  ${red} RED  ${status}`);
  return lines.join("\n");
}
export {
  AnthropicAdapter,
  BaseAdapter,
  ContextManager,
  ContextSteward,
  FileExternalizer,
  GeminiAdapter,
  OllamaAdapter,
  OpenAIAdapter,
  Telemetry,
  TextOptimizer,
  ToolConsolidator,
  addTrustedDomain,
  auditDirectory,
  auditSkill,
  auditSkillContent,
  formatAuditReport
};

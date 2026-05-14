/**
 * @file skill-auditor.ts
 * @description Static security analysis for SKILL.md files.
 *
 * Checks for prompt injection, data exfiltration, privilege escalation,
 * metadata mismatch, obfuscation, and credential harvesting.
 *
 * Each skill receives a score (0–100) and a grade (GREEN / AMBER / RED).
 *
 * @module context-steward/core/skill-auditor
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Category = 'injection' | 'exfiltration' | 'escalation' | 'mismatch' | 'obfuscation' | 'credential';
export type Grade = 'GREEN' | 'AMBER' | 'RED';

export interface Finding {
  severity: Severity;
  category: Category;
  rule: string;
  message: string;
  line: number;
  evidence: string;
}

export interface SkillAudit {
  name: string;
  slug: string;
  path: string;
  score: number;
  grade: Grade;
  findings: Finding[];
  lines: number;
  bytes: number;
  description: string;
}

// ---------------------------------------------------------------------------
// Trusted domains — URLs pointing here are not suspicious
// ---------------------------------------------------------------------------

const TRUSTED_DOMAINS = new Set([
  'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com',
  'unpkg.com', 'cdn.jsdelivr.net', 'raw.githubusercontent.com',
  'github.com', 'npmjs.com', 'pypi.org',
  'modelcontextprotocol.io', 'claude.ai', 'anthropic.com',
  'docs.anthropic.com', 'code.claude.com', 'platform.claude.com',
  'docs.claude.com', 'support.claude.com', 'resources.anthropic.com',
  'cloud.google.com', 'console.cloud.google.com',
  'developer.mozilla.org', 'w3.org', 'schema.org',
]);

/** Add a domain to the trusted set (e.g. from config). */
export function addTrustedDomain(domain: string): void {
  TRUSTED_DOMAINS.add(domain.toLowerCase());
}

// ---------------------------------------------------------------------------
// Frontmatter parser (minimal, matches skill-loader.ts)
// ---------------------------------------------------------------------------

interface Frontmatter { name?: string; description?: string; }

function parseFrontmatter(content: string): Frontmatter {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return {};
  const raw = m[1];
  const name = raw.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
  let desc = raw.match(/^description:\s*["']?([\s\S]*?)["']?\s*$/m)?.[1]?.trim();
  if (!desc) {
    const dm = raw.match(/^description:\s*[>|]?\s*\n([\s\S]*?)(?=\n[a-z]+:|\n---|$)/m);
    if (dm) desc = dm[1].replace(/\s+/g, ' ').trim();
  }
  return { name: name || undefined, description: desc ? desc.replace(/\s+/g, ' ').trim() : undefined };
}

function getBody(content: string): string {
  return content.replace(/^---[\s\S]*?---\s*/, '');
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function isInCodeBlock(lines: string[], idx: number): boolean {
  let fences = 0;
  for (let i = 0; i < idx; i++) if (lines[i].trim().startsWith('```')) fences++;
  return fences % 2 === 1;
}

function isDomainTrusted(d: string): boolean {
  if (TRUSTED_DOMAINS.has(d)) return true;
  for (const td of TRUSTED_DOMAINS) if (d.endsWith('.' + td)) return true;
  return false;
}

type PatternRule = [RegExp, string, string]; // [pattern, ruleId, message]
type ScanResult = [number, Finding];         // [deduction, finding]

function scanPatterns(
  lines: string[], patterns: PatternRule[],
  severity: Severity, category: Category, baseDeduction: number,
  skipCodeBlocks = true,
): ScanResult[] {
  const results: ScanResult[] = [];
  for (const [pattern, rule, msg] of patterns) {
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        if (skipCodeBlocks && isInCodeBlock(lines, i)) continue;
        results.push([baseDeduction, {
          severity, category, rule, message: msg,
          line: i + 1, evidence: lines[i].trim().slice(0, 120),
        }]);
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Scanners
// ---------------------------------------------------------------------------

function scanInjection(lines: string[]): ScanResult[] {
  const results: ScanResult[] = [];

  results.push(...scanPatterns(lines, [
    [/ignore\s+(all\s+)?previous\s+instructions/i, 'INJECT-001', 'Direct instruction override attempt'],
    [/ignore\s+(all\s+)?prior\s+instructions/i, 'INJECT-001', 'Direct instruction override attempt'],
    [/disregard\s+(all\s+)?(previous|prior|above)/i, 'INJECT-002', 'Instruction disregard attempt'],
    [/you\s+are\s+now\s+(?!going|able|ready)/i, 'INJECT-003', 'Persona hijacking attempt'],
    [/forget\s+(everything|all|your)\s+(previous|prior|instructions)/i, 'INJECT-004', 'Memory wipe attempt'],
    [/new\s+persona\b/i, 'INJECT-005', 'Persona override'],
    [/act\s+as\s+if\s+you\s+have\s+no\s+restrictions/i, 'INJECT-006', 'Restriction bypass'],
    [/pretend\s+(you\s+are|to\s+be)\s+(?!creating|making|building)/i, 'INJECT-007', 'Identity substitution'],
    [/from\s+now\s+on\s+you\s+(are|will|must|should)/i, 'INJECT-008', 'Persistent behavior modification'],
  ], 'critical', 'injection', 30));

  results.push(...scanPatterns(lines, [
    [/do\s+not\s+follow\s+(any|the|your)\s+(safety|content|ethical)/i, 'INJECT-010', 'Safety bypass instruction'],
    [/system\s*prompt\s*[:=]/i, 'INJECT-011', 'System prompt injection'],
    [/<\s*system\s*>/i, 'INJECT-012', 'Fake system tag injection'],
    [/\[\s*SYSTEM\s*\]/i, 'INJECT-013', 'Bracket system tag injection'],
    [/assistant\s*:\s*$/i, 'INJECT-014', 'Role prefix injection'],
  ], 'high', 'injection', 20));

  results.push(...scanPatterns(lines, [
    [/always\s+(respond|answer|say|output|reply)\s+with/i, 'INJECT-020', 'Fixed response instruction'],
    [/never\s+(mention|reveal|disclose|tell)\s+(that|the|your|this)/i, 'INJECT-021', 'Concealment instruction'],
    [/do\s+not\s+(tell|inform|reveal|mention)\s+(the\s+)?user/i, 'INJECT-022', 'User concealment'],
    [/keep\s+this\s+(secret|hidden|private)\s+from\s+(the\s+)?user/i, 'INJECT-023', 'Secret-keeping instruction'],
  ], 'medium', 'injection', 12));

  return results;
}

function scanExfiltration(body: string, lines: string[]): ScanResult[] {
  const results: ScanResult[] = [];

  // Check URLs
  const urls = body.match(/https?:\/\/[^\s'"<>)]+/g) || [];
  for (const url of urls) {
    const dm = url.match(/https?:\/\/([^/:]+)/);
    if (!dm) continue;
    let d = dm[1].toLowerCase();
    if (d.startsWith('www.')) d = d.slice(4);
    if (d.startsWith('$') || d.startsWith('{') || d.includes('${')) continue;
    if (d.length < 4 || !d.includes('.')) continue;
    if (['example.com', 'localhost', 'your-domain.com', 'your-site.com'].includes(d)) continue;
    if (isDomainTrusted(d)) continue;

    const lineNum = lines.findIndex(l => l.includes(url.slice(0, 40))) + 1;
    const inCode = lineNum > 0 && isInCodeBlock(lines, lineNum - 1);

    results.push([inCode ? 3 : 8, {
      severity: inCode ? 'low' : 'medium',
      category: 'exfiltration',
      rule: inCode ? 'EXFIL-001' : 'EXFIL-002',
      message: `URL to external domain${inCode ? ' in code block' : ''}: ${d}`,
      line: lineNum, evidence: url.slice(0, 100),
    }]);
  }

  // Exfil patterns
  results.push(...scanPatterns(lines, [
    [/curl\s+.*\s+-d\s/i, 'EXFIL-010', 'curl with data flag — potential data exfiltration'],
    [/curl\s+.*--data/i, 'EXFIL-010', 'curl with --data — potential data exfiltration'],
    [/wget\s+.*--post/i, 'EXFIL-011', 'wget POST — potential data exfiltration'],
    [/fetch\s*\(\s*["']https?:\/\//i, 'EXFIL-012', 'JavaScript fetch to external URL'],
    [/axios\s*\.\s*post\s*\(/i, 'EXFIL-013', 'axios POST — potential data exfiltration'],
    [/requests\s*\.\s*post\s*\(/i, 'EXFIL-014', 'Python requests POST — potential data exfiltration'],
    [/exfiltrate/i, 'EXFIL-030', 'Explicit exfiltration keyword'],
  ], 'high', 'exfiltration', 18));

  return results;
}

function scanEscalation(body: string, lines: string[], desc: string, name: string): ScanResult[] {
  const results: ScanResult[] = [];
  const dl = desc.toLowerCase();
  const nl = name.toLowerCase();
  const isSysSkill = ['bash', 'system', 'deploy', 'devops', 'infra', 'server', 'gcp', 'aws', 'docker']
    .some(kw => dl.includes(kw) || nl.includes(kw));

  const cmds: [RegExp, string, string][] = [
    [/sudo\s/i, 'ESCAL-001', 'sudo usage — root privilege escalation'],
    [/chmod\s+[0-7]*7/i, 'ESCAL-002', 'chmod world-writable'],
    [/chown\s+root/i, 'ESCAL-003', 'chown to root'],
    [/\/etc\/passwd/i, 'ESCAL-004', 'Access to /etc/passwd'],
    [/\/etc\/shadow/i, 'ESCAL-005', 'Access to /etc/shadow'],
    [/rm\s+-rf\s+\//i, 'ESCAL-006', 'Recursive delete from root'],
    [/\beval\s*\(/i, 'ESCAL-009', 'Dynamic code evaluation'],
    [/(?<!\w)exec\s*\(/i, 'ESCAL-010', 'Dynamic execution'],
  ];

  for (const [pattern, rule, msg] of cmds) {
    for (let i = 0; i < lines.length; i++) {
      if (!pattern.test(lines[i])) continue;
      const inCode = isInCodeBlock(lines, i);
      if (inCode && isSysSkill) {
        results.push([2, { severity: 'info', category: 'escalation', rule,
          message: `${msg} (in code block, system skill — expected)`,
          line: i + 1, evidence: lines[i].trim().slice(0, 120) }]);
      } else if (inCode) {
        results.push([8, { severity: 'medium', category: 'escalation', rule,
          message: `${msg} (in code block, non-system skill)`,
          line: i + 1, evidence: lines[i].trim().slice(0, 120) }]);
      } else {
        results.push([15, { severity: 'high', category: 'escalation', rule,
          message: `${msg} (in prose — direct instruction)`,
          line: i + 1, evidence: lines[i].trim().slice(0, 120) }]);
      }
    }
  }

  // Scope mismatch checks
  const scopeChecks: [string[], RegExp, string, string][] = [
    [['translat', 'arabic', 'i18n', 'language'], /\bbash\b.*\bexec/i, 'ESCAL-020', 'Translation skill references bash execution'],
    [['format', 'document', 'docx', 'pdf'], /curl|wget|fetch\(/i, 'ESCAL-021', 'Document skill makes network calls'],
    [['visual', 'chart', 'design', 'css'], /subprocess|os\.system|exec_command/i, 'ESCAL-022', 'Visual/design skill executes system commands'],
  ];
  for (const [descKws, bodyPat, rule, msg] of scopeChecks) {
    if (descKws.some(kw => dl.includes(kw)) && bodyPat.test(body) &&
        !['deploy', 'server', 'infra', 'build', 'mcp', 'automation'].some(kw => dl.includes(kw))) {
      results.push([10, { severity: 'medium', category: 'escalation', rule, message: msg,
        line: 0, evidence: body.match(bodyPat)?.[0]?.slice(0, 80) || '' }]);
    }
  }

  return results;
}

function scanMismatch(lines: string[], fm: Frontmatter, body: string): ScanResult[] {
  const results: ScanResult[] = [];

  if (!fm.description) {
    results.push([15, { severity: 'high', category: 'mismatch', rule: 'MATCH-001',
      message: 'Missing description in frontmatter — skill cannot be classified',
      line: 0, evidence: '' }]);
    return results;
  }
  if (fm.description.length < 20) {
    results.push([10, { severity: 'medium', category: 'mismatch', rule: 'MATCH-002',
      message: `Description too short (${fm.description.length} chars)`,
      line: 0, evidence: '' }]);
  }
  if (!fm.name) {
    results.push([10, { severity: 'medium', category: 'mismatch', rule: 'MATCH-003',
      message: 'Missing name in frontmatter', line: 0, evidence: '' }]);
  }

  const bodyLines = body.trim().split('\n');
  if (bodyLines.length > 500) {
    results.push([3, { severity: 'low', category: 'mismatch', rule: 'MATCH-020',
      message: `Unusually large skill (${bodyLines.length} lines) — review for hidden content`,
      line: 0, evidence: '' }]);
  }

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 1000 && !lines[i].trim().startsWith('```')) {
      results.push([5, { severity: 'low', category: 'mismatch', rule: 'MATCH-021',
        message: `Very long line (${lines[i].length} chars) — could hide content`,
        line: i + 1, evidence: lines[i].slice(0, 60) + '...' + lines[i].slice(-60) }]);
    }
  }

  return results;
}

function scanObfuscation(lines: string[]): ScanResult[] {
  const results: ScanResult[] = [];
  const patterns: [RegExp, string, string, Severity][] = [
    [/(?:\\x[0-9a-fA-F]{2}){8,}/, 'OBFUSC-002', 'Hex-encoded string sequence', 'medium'],
    [/(?:\\u[0-9a-fA-F]{4}){6,}/, 'OBFUSC-003', 'Unicode escape sequence', 'medium'],
    [/\brot13\b/i, 'OBFUSC-004', 'ROT13 encoding reference', 'medium'],
    [/[\u200b\u200c\u200d\u2060\ufeff]/, 'OBFUSC-005', 'Zero-width characters detected', 'high'],
    [/[а-яА-Я]/, 'OBFUSC-006', 'Cyrillic characters in non-Cyrillic skill', 'high'],
  ];

  for (const [pattern, rule, msg, sev] of patterns) {
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        results.push([sev === 'high' ? 15 : 8, {
          severity: sev, category: 'obfuscation', rule, message: msg,
          line: i + 1, evidence: lines[i].trim().slice(0, 120),
        }]);
      }
    }
  }
  return results;
}

function scanCredential(lines: string[], desc: string): ScanResult[] {
  const results: ScanResult[] = [];
  const dl = desc.toLowerCase();
  const isAuthSkill = ['auth', 'login', 'credential', 'mcp', 'api', 'connect', 'integration']
    .some(kw => dl.includes(kw));

  const patterns: [RegExp, string, string, boolean][] = [
    [/(?:enter|provide|paste|input)\s+(?:your\s+)?(?:api[_\s]?key|secret|token|password)/i,
     'CRED-001', 'Asks user for credentials', false],
    [/(?:api[_\s]?key|secret[_\s]?key|access[_\s]?token)\s*[=:]\s*["'][a-zA-Z0-9]{16,}/i,
     'CRED-002', 'Hardcoded credential detected', true],
    [/sk-[a-zA-Z0-9]{20,}/i, 'CRED-003', 'Potential OpenAI/Stripe API key', true],
    [/ghp_[a-zA-Z0-9]{36}/i, 'CRED-004', 'GitHub personal access token', true],
    [/xoxb-[0-9]+-[a-zA-Z0-9]+/i, 'CRED-005', 'Slack bot token', true],
    [/AIza[0-9A-Za-z\-_]{35}/i, 'CRED-006', 'Google API key', true],
  ];

  for (const [pattern, rule, msg, alwaysCritical] of patterns) {
    for (let i = 0; i < lines.length; i++) {
      if (!pattern.test(lines[i])) continue;
      if (rule === 'CRED-001' && isAuthSkill) {
        results.push([2, { severity: 'info', category: 'credential', rule,
          message: `${msg} (expected in auth-related skill)`,
          line: i + 1, evidence: lines[i].trim().slice(0, 120) }]);
      } else {
        const sev: Severity = alwaysCritical ? 'critical' : 'high';
        results.push([alwaysCritical ? 25 : 15, {
          severity: sev, category: 'credential', rule, message: msg,
          line: i + 1, evidence: lines[i].trim().slice(0, 120) }]);
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Audit a single SKILL.md file. Returns the full audit with score and grade.
 */
export function auditSkill(filePath: string): SkillAudit {
  const resolvedPath = path.resolve(filePath);
  const content = fs.readFileSync(resolvedPath, 'utf-8');
  return auditSkillContent(content, resolvedPath);
}

/**
 * Audit SKILL.md content directly (for use with add_skill before writing).
 */
export function auditSkillContent(content: string, filePath: string = '<inline>'): SkillAudit {
  const fm = parseFrontmatter(content);
  const body = getBody(content);
  const lines = content.split('\n');
  const slug = path.basename(path.dirname(filePath));

  const audit: SkillAudit = {
    name: fm.name || slug || 'unknown',
    slug: slug || 'unknown',
    path: filePath,
    score: 100,
    grade: 'GREEN',
    findings: [],
    lines: lines.length,
    bytes: Buffer.byteLength(content, 'utf-8'),
    description: (fm.description || '').slice(0, 200),
  };

  // Run all scanners
  const allResults: ScanResult[] = [
    ...scanInjection(lines),
    ...scanExfiltration(body, lines),
    ...scanEscalation(body, lines, fm.description || '', fm.name || ''),
    ...scanMismatch(lines, fm, body),
    ...scanObfuscation(lines),
    ...scanCredential(lines, fm.description || ''),
  ];

  for (const [deduction, finding] of allResults) {
    audit.findings.push(finding);
    audit.score = Math.max(0, audit.score - deduction);
  }

  // Compute grade
  const hasCritical = audit.findings.some(f => f.severity === 'critical');
  const hasHigh = audit.findings.some(f => f.severity === 'high');
  if (hasCritical || audit.score < 40) audit.grade = 'RED';
  else if (hasHigh || audit.score < 70) audit.grade = 'AMBER';
  else audit.grade = 'GREEN';

  return audit;
}

/**
 * Discover and audit all SKILL.md files under a directory.
 */
export function auditDirectory(dir: string): SkillAudit[] {
  const resolvedDir = path.resolve(dir);
  const files = findSkillMdFiles(resolvedDir);
  return files.map(f => auditSkill(f));
}

function findSkillMdFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findSkillMdFiles(full));
    else if (entry.isFile() && entry.name === 'SKILL.md') results.push(full);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Text report (for CLI)
// ---------------------------------------------------------------------------

export function formatAuditReport(audits: SkillAudit[]): string {
  const green = audits.filter(a => a.grade === 'GREEN').length;
  const amber = audits.filter(a => a.grade === 'AMBER').length;
  const red = audits.filter(a => a.grade === 'RED').length;

  const lines: string[] = [
    `  GREEN: ${green}`,
    `  AMBER: ${amber}`,
    `    RED: ${red}`,
    `  TOTAL: ${audits.length}`,
  ];

  for (const a of [...audits].sort((x, y) => x.score - y.score)) {
    if (a.grade === 'GREEN') continue;
    lines.push('');
    lines.push(`  [${a.grade}] ${a.name} — score ${Math.round(a.score)}`);
    for (const f of a.findings) {
      if (!['critical', 'high', 'medium'].includes(f.severity)) continue;
      const lr = f.line ? ` L${f.line}` : '';
      lines.push(`    ${f.severity.toUpperCase().padStart(8)} ${f.rule}  ${f.message}${lr}`);
    }
  }

  lines.push('');
  const status = red > 0 ? '✗ FAILED' : amber > 0 ? '⚠ REVIEW' : '✓ PASSED';
  lines.push(`  ${green} GREEN  ${amber} AMBER  ${red} RED  ${status}`);

  return lines.join('\n');
}

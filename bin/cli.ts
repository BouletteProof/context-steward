#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync, readFileSync, cpSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cmd = args[0];

function usage() {
  console.log(`context-steward — Load skills dynamically. Learn what works.

  init              Create .skills/ and steward.config.json
  serve             Start MCP server (stdio)
  list              Show skills with token counts
  scores            Show skill effectiveness report
  estimate <file>   Estimate tokens for a file
  reset-scores      Clear all outcome data
  --help            Show this help
`);
}

async function main() {
  if (!cmd || cmd === '--help') { usage(); return; }

  switch (cmd) {
    case 'init': {
      const sd = resolve('.skills');
      const cp = resolve('steward.config.json');
      if (!existsSync(sd)) { mkdirSync(sd, { recursive: true }); console.log(`Created ${sd}/`); }
      if (!existsSync(cp)) {
        writeFileSync(cp, JSON.stringify({ skillsDir: '.skills', defaultBudget: 100000, verbose: false }, null, 2));
        console.log(`Created ${cp}`);
      }
      const bundled = join(__dirname, '..', 'skills');
      if (existsSync(bundled)) {
        for (const d of readdirSync(bundled, { withFileTypes: true }).filter(d => d.isDirectory())) {
          const t = join(sd, d.name);
          if (!existsSync(t)) { try { cpSync(join(bundled, d.name), t, { recursive: true }); console.log(`  Copied: ${d.name}`); } catch {} }
        }
      }
      console.log('\nDone. Add skills to .skills/<name>/SKILL.md');
      break;
    }
    case 'serve': {
      await import('../src/server.js');
      break;
    }
    case 'list': {
      const { loadSkillsFromDirectory } = await import('../src/core/skill-loader.js');
      const { estimateTokens } = await import('../src/core/token-estimator.js');
      let sd = '.skills';
      try { sd = JSON.parse(readFileSync('steward.config.json', 'utf-8')).skillsDir || sd; } catch {}
      const skills = loadSkillsFromDirectory(sd);
      if (!skills.length) { console.log('No skills found. Run `context-steward init`.'); break; }
      console.log(`\n  ${'slug'.padEnd(25)} ${'tokens'.padStart(8)}  triggers`);
      console.log(`  ${'─'.repeat(25)} ${'─'.repeat(8)}  ${'─'.repeat(30)}`);
      for (const s of skills) console.log(`  ${s.slug.padEnd(25)} ${String(estimateTokens(s.content)).padStart(8)}  ${s.triggers.slice(0,5).join(', ')}`);
      console.log(`\n  ${skills.length} skills\n`);
      break;
    }
    case 'scores': {
      const { OutcomeStore } = await import('../src/core/outcome-store.js');
      const { scoreSkills, getSkillReport } = await import('../src/core/skill-scorer.js');
      const store = new OutcomeStore();
      const h = store.getHistory();
      if (!h.length) { console.log('No outcome data yet.'); break; }
      console.log('\n' + getSkillReport(scoreSkills(h)) + '\n');
      store.close();
      break;
    }
    case 'estimate': {
      if (!args[1]) { console.error('Usage: context-steward estimate <file>'); process.exit(1); }
      const { estimateTokens } = await import('../src/core/token-estimator.js');
      const c = readFileSync(resolve(args[1]), 'utf-8');
      console.log(`${estimateTokens(c)} tokens (${c.length} chars, ${c.split('\n').length} lines)`);
      break;
    }
    case 'reset-scores': {
      const rl = (await import('node:readline')).createInterface({ input: process.stdin, output: process.stdout });
      const a = await new Promise<string>(r => rl.question('Delete all outcome data? [y/N] ', r));
      rl.close();
      if (a.toLowerCase() !== 'y') { console.log('Cancelled.'); break; }
      const { OutcomeStore } = await import('../src/core/outcome-store.js');
      const s = new OutcomeStore(); s.reset(); s.close();
      console.log('Cleared.');
      break;
    }
    default: console.error(`Unknown: ${cmd}`); usage(); process.exit(1);
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });

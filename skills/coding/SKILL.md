---
name: General Coding
description: Best practices for general software engineering.
triggers:
  - code
  - refactor
  - implement
---
# General Coding Skill

## Principles
- Keep it simple (KISS).
- Don't repeat yourself (DRY).
- Write code for humans first, machines second.

## Checklist
- [ ] Variable names are descriptive.
- [ ] Functions do one thing.
- [ ] Error handling is present for all I/O.
- [ ] No hardcoded secrets.

## Error Handling Pattern
Always wrap external calls in try/catch blocks to ensure graceful failure.

```javascript
try {
  const result = await externalCall();
  return result;
} catch (error) {
  logger.error('Operation failed: ' + error.message);
  throw new Error('Failed to complete operation');
}
```
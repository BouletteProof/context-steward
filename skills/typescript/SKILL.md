---
name: TypeScript Excellence
description: Strict typing and modern TS patterns.
triggers:
  - typescript
  - ts
  - interface
---
# TypeScript Excellence

## Guidelines
- Use unknown over any for safer type checking.
- Prefer interfaces for public APIs to allow declaration merging.
- Use discriminated unions for state management.

## Example: Discriminated Union
```typescript
type State = 
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success', data: string[] }
  | { status: 'error', error: Error };

function handle(state: State) {
  if (state.status === 'success') {
    console.log(state.data.length);
  }
}
```
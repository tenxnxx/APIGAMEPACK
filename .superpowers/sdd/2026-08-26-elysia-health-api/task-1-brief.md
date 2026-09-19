# Task 1: Scaffold and implement the health API

## Context

Build a new minimal Elysia project at `C:\getAPIprice packe game\elysia-api-package-app`. The existing `docs/` directory contains the approved design and plan and must be preserved. The sibling `reverse-skill` directory is out of scope.

## Global Constraints

- The project root is `elysia-api-package-app`.
- The only API route is `GET /health`.
- A successful response is HTTP `200` with JSON `{ "status": "ok" }`.
- Do not add a database, ORM, authentication, OpenAPI, CORS, telemetry, Docker, feature modules, or service abstractions.
- Use the global Codex Skill configuration; do not install project-local Skills, hooks, or commands.
- Do not initialize Git or commit.
- Do not dispatch subagents.

## Files

- Create `package.json`, `tsconfig.json`, `bun.lock`, `.gitignore`, `src/index.ts`, and `src/index.test.ts` under the project root.
- Preserve the existing `docs/` and `.superpowers/` directories.

## Required Workflow

1. From the workspace root, run `bun create elysia .elysia-health-reference` to obtain the current official starter configuration. Do not generate into the target project.
2. Use the generated configuration as the baseline. Set the package name to `elysia-api-package-app` and provide scripts named `dev`, `start`, `check`, and `test` for watching `src/index.ts`, running it, invoking `tsc --noEmit`, and invoking `bun test`.
3. Keep only dependencies required by the official Elysia TypeScript starter. Do not add plugins.
4. Run `bun install` in the target project to create `bun.lock`.
5. Before creating `src/index.ts`, create `src/index.test.ts` with the exact test below and run it. Record the expected failing output. A missing dependency is not an acceptable red state.
6. Create `src/index.ts` with the exact implementation below.
7. Run the focused test, full test suite, TypeScript check, and an HTTP smoke test.
8. Stop the smoke-test server.
9. Resolve and verify that the temporary directory is exactly `C:\getAPIprice packe game\.elysia-health-reference`, then remove only that directory.
10. Confirm the target `docs/`, `.superpowers/`, source, configuration, and lock files remain present.

## Test

Create `src/index.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { app } from './index'

describe('GET /health', () => {
  it('returns the service health', async () => {
    const response = await app.handle(
      new Request('http://localhost/health')
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })
})
```

## Implementation

Create `src/index.ts`:

```typescript
import { Elysia } from 'elysia'

export const app = new Elysia()
  .get('/health', () => ({ status: 'ok' }))

if (import.meta.main) {
  app.listen(3000)
  console.log(`Elysia is running at http://${app.server?.hostname}:${app.server?.port}`)
}
```

## Required Verification

- Focused red test before implementation: `bun test src/index.test.ts` fails because `src/index.ts` is missing or does not export `app`.
- Focused green test: one passing test, zero failures.
- `bun run check`: exit code 0.
- `bun test`: all tests pass.
- Running server returns `{"status":"ok"}` from `http://127.0.0.1:3000/health` with HTTP status 200.

## Report

Write the full implementation report to `C:\getAPIprice packe game\elysia-api-package-app\.superpowers\sdd\2026-08-26-elysia-health-api\task-1-report.md`. Include files created, dependency versions, RED and GREEN command/output, static check, full tests, smoke-test evidence, cleanup confirmation, self-review, and concerns.

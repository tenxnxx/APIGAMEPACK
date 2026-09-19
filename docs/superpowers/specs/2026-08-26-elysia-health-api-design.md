# Elysia Health API Design

Date: 2026-08-26
Status: Approved in chat; awaiting written-spec review

## Goal

Create a minimal, maintainable Elysia API starter using Bun and TypeScript. The initial API exposes only a health-check endpoint.

## Scope

### Included

- A new project at `elysia-api-package-app`
- Elysia running on Bun with TypeScript
- `GET /health`
- JSON response `{ "status": "ok" }` with HTTP status `200`
- One focused test covering the health endpoint status and body
- Standard scripts for development, start, and test

### Excluded

- Database and ORM
- Authentication and authorization
- OpenAPI or Swagger
- CORS configuration
- Logging or telemetry framework
- Docker and deployment configuration
- Feature modules or service abstractions
- Package/game-price endpoints

Excluded capabilities will be added only when a concrete requirement needs them.

## Approach

Use the official Elysia project generator so dependency and TypeScript configuration follow the current Elysia starter. Keep the generated project small and replace the example route with the required health route. Do not create domain layers for a single static endpoint.

## API Contract

### `GET /health`

- Authentication: none
- Request body: none
- Success status: `200`
- Content type: JSON
- Response body:

```json
{
  "status": "ok"
}
```

Unknown routes use Elysia's default not-found behavior.

## Structure

The implementation should use the generator's standard configuration and the fewest source files needed. The Elysia application must be exportable so the health route can be tested through `app.handle()` without opening a network port. The executable entry may listen only when run directly.

## Data Flow

1. A client sends `GET /health`.
2. Elysia matches the health route.
3. The handler returns the static health object.
4. Elysia serializes it as JSON with status `200`.

No external service or mutable state participates in this flow.

## Error Handling

The health handler has no expected failure path because it performs no I/O. Framework-default handling is sufficient for unsupported methods and unknown routes. Custom error middleware is out of scope until an endpoint introduces a real failure mode.

## Testing

Use Bun's built-in test runner. Construct a `Request` for `/health`, pass it to the exported Elysia application's `handle()` method, and verify:

- response status is `200`;
- parsed JSON equals `{ status: "ok" }`.

## Skill Use

The project inherits the user's global Codex Skill configuration. Skills are selected only when relevant. No Skill, hook, command, or duplicate project-local installation will be added to this repository.

## Acceptance Criteria

- Dependencies install successfully with Bun.
- Type checking/build checks pass using the generated project configuration.
- The health endpoint test passes.
- A running server returns HTTP `200` and `{ "status": "ok" }` from `/health`.
- No unrelated feature or abstraction is included.

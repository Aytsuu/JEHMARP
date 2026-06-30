# Server Boundaries

## Server-Side Surfaces

- Route frontmatter loads data for pages.
- Endpoints in `src/pages/` return `Response` objects for API-style routes and generated files.
- Middleware intercepts requests before route rendering.
- Actions handle structured server mutations from forms or client calls.
- Server islands render dynamic server components independently from the page shell.

## Endpoints

Endpoint routes are useful for:

- JSON APIs
- RSS or sitemap XML
- Open Graph images
- Webhooks
- Form fallback targets
- Server-only integrations with private credentials

Keep endpoint handlers small and delegate business logic to `src/lib/`.

## Middleware

Use middleware for cross-cutting request behavior:

- Auth/session checks
- Redirects and rewrites
- Locale negotiation
- Request context
- Security headers

Do not use middleware as a dumping ground for route-specific business logic.

## Actions And Mutations

Use server mutation boundaries for data changes. Validate every input at the boundary and return user-safe errors. Keep private credentials and privileged operations server-only.

## Architecture Rules

- Treat every request body, param, cookie, and header as untrusted input.
- Return explicit status codes and safe error messages from endpoints.
- Keep secrets out of client islands and public environment variables.
- Avoid silently swallowing server errors; log enough context server-side to debug.

# Rendering Model

## Available Modes

- Static generation builds HTML and assets ahead of time.
- Server rendering renders pages or endpoints on demand at request time.
- Hybrid architecture combines prerendered routes with request-time routes.
- Server islands isolate dynamic server-rendered components from the main page render.

## Decision Model

Use static rendering when:

- Content changes on deploy or on a predictable publishing workflow.
- Pages do not need per-request authentication, cookies, headers, or personalization.
- CDN caching is the main performance strategy.

Use server rendering when:

- A route depends on request-specific data.
- Auth, cookies, geolocation, or headers affect output.
- Data must be fresh at request time.

Use hybrid/prerender controls when:

- Most of the site is content-heavy and static.
- A few routes need runtime behavior.
- You want static performance without giving up server routes.

Use server islands when:

- Most of a page can be static or cached.
- A small component needs slow, personalized, or request-time data.
- The dynamic part should not block the main page shell.

## Architecture Rules

- Default to static until a route has a real request-time requirement.
- Do not turn an entire page into a client app to solve one interactive widget.
- Keep expensive dynamic work in server routes, server islands, or cached data functions.
- Pick the deployment adapter based on runtime needs, not after implementation.

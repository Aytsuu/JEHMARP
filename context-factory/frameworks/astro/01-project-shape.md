# Project Shape

## Standard Boundaries

- `src/pages/` owns URL routes and route-level data loading.
- `src/layouts/` owns page shells, shared document structure, and slots.
- `src/components/` owns reusable UI that is not directly routable.
- `src/content/` owns structured content entries when using content collections.
- `src/assets/` or `src/images/` owns processed images and imported static assets.
- `public/` owns static files served as-is, such as `robots.txt`, favicons, and downloads.
- `astro.config.mjs` owns integrations, adapters, output mode, Vite options, and build behavior.
- `src/middleware.ts` owns request interception and cross-cutting request logic.

## Architecture Rules

- Keep routes thin: compose layout, load route data, and delegate UI to components.
- Keep layouts stable: avoid business logic beyond document structure and shared metadata.
- Keep browser-only logic inside hydrated framework components, not in broad page scripts.
- Keep server-only logic behind endpoints, actions, middleware, or route frontmatter.
- Prefer feature folders inside `components/`, `content/`, or `lib/` when a domain grows.

## Suggested Small Project Layout

```text
src/
  pages/
  layouts/
  components/
  content/
  lib/
  styles/
  assets/
  middleware.ts
astro.config.mjs
content.config.ts
```

## Scaling Signal

When a file mixes route definition, domain logic, validation, and rendering, split it. Astro architecture stays maintainable when URLs remain in `pages/`, domain operations live in `lib/`, and UI composition stays in components/layouts.

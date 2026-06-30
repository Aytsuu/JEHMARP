# Data And Content

## Data Loading

Astro frontmatter runs on the server or at build time depending on the route rendering mode. Use it to fetch, validate, and transform data before rendering HTML.

```astro
---
const response = await fetch("https://example.com/api/posts");
const posts = await response.json();
---

{posts.map((post) => <a href={`/posts/${post.slug}`}>{post.title}</a>)}
```

## Content Collections

Use content collections for structured Markdown, MDX, JSON, or data-backed content. Collections centralize schema validation and make content querying explicit.

Good fits:

- Blog posts
- Documentation pages
- Marketing case studies
- Authors, changelogs, guides, and structured editorial content

## Asset Strategy

- Use imported assets for images that should be processed and optimized.
- Use `public/` for files that must keep a stable path and should not be transformed.
- Keep content images close to their content domain when that improves maintainability.

## Schema Boundary

Validate external and editorial data before it reaches rendering:

- Content schema for authored content.
- Runtime validation for external APIs.
- Typed domain models in `src/lib/` for shared transformations.

## Architecture Rules

- Fetch close to the route when the data is route-specific.
- Move data access to `src/lib/` when multiple routes need the same behavior.
- Separate raw external data from normalized view models.
- Avoid passing unvalidated external data directly into components.

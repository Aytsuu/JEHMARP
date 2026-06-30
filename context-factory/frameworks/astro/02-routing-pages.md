# Routing And Pages

## Route Ownership

Astro uses file-based routing from `src/pages/`. A file maps to a URL by its path and filename.

- `src/pages/index.astro` -> `/`
- `src/pages/about.astro` -> `/about`
- `src/pages/blog/[slug].astro` -> `/blog/:slug`
- `src/pages/feed.xml.ts` -> `/feed.xml`

## Page Types

- `.astro` files render HTML pages.
- `.md` and `.mdx` files can become content pages.
- `.js` and `.ts` files can become endpoints when they export HTTP method handlers.

## Dynamic Routes

Use bracket params for route variables.

```text
src/pages/products/[id].astro
src/pages/docs/[...slug].astro
```

For static output, dynamic pages need `getStaticPaths()` so Astro knows which paths to build. For server-rendered routes, params can be resolved at request time.

## Route Data Flow

Use route frontmatter for server-side loading and transformation:

```astro
---
import Layout from "../layouts/Layout.astro";

const title = "Architecture";
---

<Layout title={title}>
  <h1>{title}</h1>
</Layout>
```

## Architecture Rules

- Treat pages as route controllers, not general-purpose modules.
- Keep route params validated before use.
- Put canonical URL, title, and meta decisions close to the route or layout boundary.
- Use endpoint routes for non-HTML outputs like JSON, XML, RSS, and dynamic assets.

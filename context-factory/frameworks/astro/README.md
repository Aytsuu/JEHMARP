# Astro Framework Architecture

Doc-checked: 2026-06-28 against official Astro documentation.

This folder is a high-level architecture map for Astro projects. Each file is intentionally short so agents can load only the part of the framework context they need.

## File Map

- [01-project-shape.md](01-project-shape.md) - Source tree, ownership boundaries, and naming.
- [02-routing-pages.md](02-routing-pages.md) - File-based routes, dynamic routes, and route outputs.
- [03-rendering-model.md](03-rendering-model.md) - Static, server, hybrid, prerendering, and caching choices.
- [04-components-islands.md](04-components-islands.md) - Astro components, framework components, and islands.
- [05-data-content.md](05-data-content.md) - Data fetching, content collections, assets, and schema boundaries.
- [06-server-boundaries.md](06-server-boundaries.md) - Endpoints, middleware, actions, and request-time work.
- [07-integrations-assets.md](07-integrations-assets.md) - Integrations, adapters, images, CSS, and build tooling.
- [08-testing-deployment.md](08-testing-deployment.md) - Test layers, deployment shape, observability, and CI checks.
- [09-decision-checklist.md](09-decision-checklist.md) - Practical architecture decisions before implementation.

## Core Mental Model

Astro is a content-first web framework with a server-first rendering model. The default output is HTML and CSS with little or no browser JavaScript. Client JavaScript is opt-in through interactive islands, and server work is isolated through pages, endpoints, middleware, actions, and server islands.

Prefer static HTML for stable content, server rendering for request-specific data, and client islands only where browser interactivity is required.

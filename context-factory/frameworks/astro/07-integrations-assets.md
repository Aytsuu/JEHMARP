# Integrations And Assets

## Integrations

Astro integrations extend project behavior through `astro.config.mjs`.

Common integration categories:

- UI frameworks: React, Vue, Svelte, Preact, Solid.
- Styling: Tailwind or other CSS tooling.
- Content: MDX, sitemap, RSS, icons.
- Runtime: adapters for Node, serverless, edge, or static hosts.

## Adapters

Adapters define how server-rendered Astro output runs in production. Choose the adapter early when the project needs SSR, middleware behavior, server islands, or provider-specific deployment.

Static-only projects may not need a server adapter.

## CSS Strategy

- Use component-scoped styles for local component styling.
- Use global styles for reset, tokens, typography, and shared primitives.
- Keep design tokens centralized and avoid scattering one-off values across pages.
- Avoid shipping CSS frameworks by default unless they match project constraints.

## Image And Static Asset Strategy

- Use Astro image tooling for optimized, imported images.
- Use `public/` for pass-through files that should not be fingerprinted or transformed.
- Keep large binary assets out of source when a CDN or object storage is more appropriate.

## Architecture Rules

- Add integrations for clear capability gaps, not convenience alone.
- Keep `astro.config.mjs` readable; move complex config into named constants or helper files.
- Reassess bundle impact when adding UI frameworks or client-heavy libraries.
- Prefer platform-native deployment features only when they do not lock core app logic to one provider.

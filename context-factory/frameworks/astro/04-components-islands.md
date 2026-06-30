# Components And Islands

## Component Types

- Astro components (`.astro`) render templates and server-side markup.
- Framework components (`.jsx`, `.tsx`, `.vue`, `.svelte`, etc.) add UI-framework behavior.
- Client islands are framework components hydrated with `client:*` directives.
- Server islands are Astro components rendered separately with `server:defer`.

## Default Behavior

Astro renders UI to HTML by default and does not ship component JavaScript unless explicitly requested. This keeps the baseline page lightweight.

## Client Island Directives

- `client:load` for above-the-fold interactions needed immediately.
- `client:idle` for lower-priority interactions after initial load.
- `client:visible` for heavy widgets below the fold.
- `client:media` for interactions needed only under a media query.
- `client:only` when a component must render only in the browser.

## Server Island Directive

Use `server:defer` when a component should render independently on the server:

```astro
<UserAvatar server:defer />
```

## Architecture Rules

- Use `.astro` for structural UI, content layout, and mostly-static rendering.
- Hydrate only the smallest component that needs browser interactivity.
- Avoid making whole page sections client islands when a button, form, or widget is enough.
- Keep island state local unless there is a clear cross-island communication need.
- If several islands must share complex state, reassess whether that route is really an app surface.

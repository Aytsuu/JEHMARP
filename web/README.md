# JEHMARP Web

Astro + React foundation for the JEHMARP public, admin, and agent surfaces.

## Project Structure

Key foundation folders:

```text
/
|-- src/
|   |-- components/
|   |-- config/
|   |-- layouts/
|   |-- lib/
|   |-- pages/
|   |-- styles/
|   `-- test/
|-- astro.config.mjs
`-- package.json
```

## Environment

Copy `.env.example` to `.env` and provide the public Supabase values:

```text
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Do not place service-role keys or other secrets in public variables.

## Commands

All commands are run from the root of the web project:

| Command | Action |
| :-- | :-- |
| `npm install` | Installs dependencies |
| `npm run dev` | Starts Astro dev server in background mode |
| `npm run dev:foreground` | Starts Astro dev server in foreground mode |
| `npm run dev:status` | Shows background dev server status |
| `npm run dev:stop` | Stops background dev server |
| `npm run build` | Builds production output to `./dist/` |
| `npm run check` | Runs Astro type checks |
| `npm run lint` | Runs ESLint |
| `npm run test` | Runs Vitest |
| `npm run test:coverage` | Runs Vitest with coverage |
| `npm run preview` | Previews the built site locally |
| `npm run astro -- --help` | Shows Astro CLI help |

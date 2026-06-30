# TailwindCSS Usage Practice

Doc-checked: 2026-06-28 against official Tailwind CSS documentation.

This folder defines a clean TailwindCSS practice for production projects. Each file is intentionally short so agents and developers can load only the part of the styling guidance they need.

## File Map

- [boilerplate/](boilerplate/README.md) - Minimal reusable Tailwind starter structure.
- [01-class-strategy.md](01-class-strategy.md) - Where Tailwind classes should live.
- [02-reusable-components.md](02-reusable-components.md) - Component extraction and reusable class recipes.
- [03-design-tokens.md](03-design-tokens.md) - Theme tokens, CSS variables, and arbitrary values.
- [04-file-structure.md](04-file-structure.md) - Suggested folders for styles, UI primitives, and helpers.
- [05-repetition-rules.md](05-repetition-rules.md) - Thresholds for removing repeated class code.
- [06-static-detection.md](06-static-detection.md) - Static class rules Tailwind can detect at build time.
- [07-examples.md](07-examples.md) - Before-and-after cleanup examples.
- [08-review-checklist.md](08-review-checklist.md) - Review checklist for Tailwind-heavy changes.

## Core Mental Model

Use Tailwind utilities directly for local, one-off styling. Extract repeated visual decisions into design tokens, reusable components, or small class recipes. Use global CSS component classes only for stable primitives, content you do not fully control, or third-party markup.

Good Tailwind code should make the design system visible without forcing every element to carry the entire design system inline.


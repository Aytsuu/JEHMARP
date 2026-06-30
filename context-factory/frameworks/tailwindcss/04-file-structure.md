# File Structure

## Recommended Layout

```text
src/
  styles/
    globals.css
    theme.css
    components.css
  components/
    ui/
      button.tsx
      panel.tsx
      input.tsx
    layout/
      container.tsx
      section.tsx
  features/
    checkout/
      checkout-summary.tsx
      checkout-form.tsx
  lib/
    styles/
      cn.ts
      button.ts
      layout.ts
```

## Responsibilities

- `globals.css` imports Tailwind and project-wide CSS.
- `theme.css` owns Tailwind theme variables and design tokens.
- `components.css` owns rare `@layer components` classes.
- `components/ui/` owns reusable design-system primitives.
- `components/layout/` owns repeated layout wrappers.
- `features/` owns domain-specific UI composition.
- `lib/styles/` owns class merging helpers and small class recipes.

## Import Shape

Keep global CSS entry points short.

```css
@import "tailwindcss";
@import "./theme.css";
@import "./components.css";
```

Do not let `globals.css` become a dumping ground for every component style.

## Promotion Path

Start feature-specific styles inside the feature. Promote repeated patterns to `components/ui`, `components/layout`, or `lib/styles` only after reuse is real.


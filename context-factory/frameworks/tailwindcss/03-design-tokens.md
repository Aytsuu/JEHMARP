# Design Tokens

## Token First

When a value is part of the brand or design system, define it as a token instead of repeating raw values.

Token-worthy values:

- Brand colors.
- Surface and text colors.
- Spacing scale extensions.
- Border radius scale.
- Shadows.
- Font families.
- Motion durations and easing.

## Tailwind Theme Variables

Use Tailwind theme variables when a token should create utilities.

```css
@import "tailwindcss";

@theme {
  --color-brand-50: #f7f3ed;
  --color-brand-500: #0f766e;
  --color-brand-900: #134e4a;
  --radius-panel: 0.5rem;
  --shadow-panel: 0 20px 50px rgb(15 23 42 / 0.08);
}
```

This makes utilities such as `bg-brand-500`, `text-brand-900`, `rounded-panel`, and `shadow-panel` available where supported by the configured Tailwind version.

## Regular CSS Variables

Use regular CSS variables for runtime values or values that should not create utilities.

```css
:root {
  --app-header-height: 4rem;
}
```

## Arbitrary Values

Arbitrary values are acceptable for true exceptions.

```tsx
<div className="grid-cols-[minmax(0,1fr)_22rem]">
```

If the same arbitrary value appears three times, promote it to a named token or reusable recipe.

## Naming Rules

- Name tokens by role before raw color when possible: `brand`, `surface`, `muted`, `danger`.
- Avoid component-specific names unless the token is truly component-specific.
- Do not encode hex values into names.
- Keep the token set small enough to remember.


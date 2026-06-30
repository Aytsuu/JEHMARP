# Static Detection

## Core Rule

Tailwind scans source files as plain text. Reusable patterns only work when complete class names exist in the codebase.

Safe:

```tsx
const intentClass = {
  primary: "bg-slate-950 text-white hover:bg-slate-800",
  secondary: "bg-slate-100 text-slate-950 hover:bg-slate-200",
};
```

Unsafe:

```tsx
const tone = "slate";

<button className={`bg-${tone}-950 hover:bg-${tone}-800`}>Save</button>
```

## Reuse Without Breaking Detection

Prefer:

- Variant maps that point to complete class strings.
- Shared constants for repeated class clusters.
- Helper functions that combine static strings.
- `@theme` tokens that generate utilities.
- `@layer components` classes declared in CSS.

Avoid:

- String interpolation that constructs partial utility names.
- Prop values inserted directly into utility fragments.
- Runtime-generated color, spacing, or breakpoint suffixes.
- Helpers that accept raw Tailwind pieces and concatenate them.

## Review Rule

If a class name is not searchable as a full string in the repository, treat it as suspect. Reusable Tailwind patterns must still produce static build-time class tokens.


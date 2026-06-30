# Class Strategy

## Default Rule

Keep Tailwind utilities close to the markup when styling is local, obvious, and unlikely to repeat.

```tsx
<section className="mx-auto max-w-6xl px-6 py-16">
  ...
</section>
```

Inline utilities are appropriate for:

- Page-specific spacing and layout.
- Small responsive adjustments.
- One-off visual treatments.
- Composition around reusable components.

## Extract When Repeated

Move classes out of markup when the same pattern appears in multiple places or represents a named design decision.

Common extraction targets:

- Component props for controlled variants such as `intent`, `size`, or `tone`.
- Shared class recipes for repeated layout or surface patterns.
- Tailwind theme tokens for repeated design values.
- `@layer components` classes for stable primitives or uncontrolled markup.

## Avoid Weak Abstractions

Do not create helpers that only rename obvious utilities.

Weak:

```tsx
const titleClass = "text-xl font-semibold";
```

Useful:

```tsx
const panelTitleClass = "text-lg font-semibold tracking-tight text-slate-950";
```

The useful name describes a reusable UI role. The weak name just repeats CSS property intent.

## Class Ordering

Group class strings by purpose:

1. Layout and display.
2. Box model and sizing.
3. Border, radius, and shadow.
4. Background and foreground color.
5. Typography.
6. State variants.
7. Responsive variants.

```tsx
className="
  flex items-center justify-between gap-4
  rounded-lg border border-slate-200 p-5 shadow-sm
  bg-white text-slate-950
  hover:border-slate-300
  md:p-6
"
```


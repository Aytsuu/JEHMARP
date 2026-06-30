# Reusable Components

## Preferred Extraction

For application UI, extract repeated Tailwind into components before creating global CSS classes.

```tsx
type PanelProps = {
  title: string;
  children: React.ReactNode;
};

export function Panel({ title, children }: PanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
      <div className="mt-4 text-sm leading-6 text-slate-600">{children}</div>
    </section>
  );
}
```

This keeps structure, semantics, and styling together.

## Variant Maps

Use variant props when a component has a small, controlled set of visual states.

```tsx
const buttonBase =
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2";

const buttonIntent = {
  primary: "bg-slate-950 text-white hover:bg-slate-800 focus-visible:ring-slate-400",
  secondary: "bg-slate-100 text-slate-950 hover:bg-slate-200 focus-visible:ring-slate-300",
};

const buttonSize = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-sm",
};
```

Variant maps must contain complete class names. Do not build partial utilities from props.

## Global Component Classes

Use `@layer components` when a class represents a stable primitive or when markup is not controlled by your component system.

```css
@layer components {
  .prose-callout {
    @apply rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-700;
  }
}
```

Good use cases:

- CMS or markdown content.
- Third-party widgets.
- Legacy HTML that cannot be converted quickly.
- Shared primitives used across multiple renderers.

Feature-specific styling should stay with the feature component.


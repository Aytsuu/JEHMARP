# Examples

## Repeated Panel Classes

Before:

```tsx
<section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">...</section>
<aside className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">...</aside>
<div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">...</div>
```

After:

```tsx
const panelClass = "rounded-lg border border-slate-200 bg-white p-6 shadow-sm";

<section className={panelClass}>...</section>
<aside className={panelClass}>...</aside>
<div className={panelClass}>...</div>
```

If the markup structure also repeats, extract a `Panel` component instead of only extracting the class string.

## Button Drift

Before:

```tsx
<button className="rounded-md bg-slate-950 px-5 py-2 text-white hover:bg-slate-800">Save</button>
<button className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">Continue</button>
```

After:

```tsx
<Button intent="primary" size="md">Save</Button>
<Button intent="primary" size="sm">Continue</Button>
```

The component prevents accidental drift between buttons that should share the same design rule.

## Arbitrary Value Promotion

Before:

```tsx
<div className="shadow-[0_20px_50px_rgb(15_23_42_/_0.08)]">...</div>
```

After:

```css
@theme {
  --shadow-panel: 0 20px 50px rgb(15 23 42 / 0.08);
}
```

```tsx
<div className="shadow-panel">...</div>
```

Promote repeated arbitrary values because they are hard to search, compare, and update safely.

## Feature-Local Composition

Keep feature-specific combinations local until they prove reusable.

```tsx
const summaryRowClass = "flex items-start justify-between gap-6 border-b border-slate-200 py-4";
```

Do not promote this to a global `.summary-row` unless multiple features use the same pattern.


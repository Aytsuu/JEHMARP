# Repetition Rules

## Extraction Thresholds

Use these thresholds to decide when repeated Tailwind should be extracted.

- Repeated twice: check whether the pattern is intentional.
- Repeated three times: extract into a component, variant, token, or helper.
- Repeated across features: promote to shared UI or layout.
- Repeated with small differences: use explicit variants.
- Repeated arbitrary values: promote to named tokens.

## What To Extract

Extract repeated UI structure:

```tsx
<Panel title="Billing">...</Panel>
```

Extract controlled variants:

```tsx
<Button intent="primary" size="md">Save</Button>
```

Extract shared layout recipes:

```tsx
const pageShell = "mx-auto w-full max-w-7xl px-6 py-10 md:px-8";
```

Extract design values:

```css
@theme {
  --color-accent: #0f766e;
}
```

## What Not To Extract

Avoid extracting classes that:

- Are used only once.
- Hide important responsive behavior behind vague names.
- Mix unrelated layout, typography, and feature state.
- Create global naming conflicts.
- Make developers jump across files for obvious one-off styling.

## Duplication Review

Search for duplicated class clusters rather than individual utilities.

Useful clusters to watch:

- `rounded-* border bg-* p-* shadow-*`
- `text-sm leading-* text-*`
- `inline-flex items-center justify-center`
- `mx-auto max-w-* px-*`
- `focus-visible:*`

The problem is repeated UI intent without a shared abstraction, not one repeated utility.


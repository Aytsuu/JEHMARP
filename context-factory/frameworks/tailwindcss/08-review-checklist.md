# Review Checklist

Use this checklist before merging Tailwind-heavy changes.

## Reusability

- Are repeated class clusters extracted after the third use?
- Are repeated UI structures components instead of copied markup?
- Are variants represented with explicit props or maps?
- Are global component classes limited to stable primitives or uncontrolled markup?

## Token Discipline

- Are brand and system values defined as tokens?
- Are repeated arbitrary values promoted to named tokens?
- Are token names based on design role instead of raw value?
- Are regular CSS variables used only when Tailwind utilities are not needed?

## Readability

- Are long class strings grouped by purpose?
- Are responsive and state variants easy to scan?
- Are helper names semantic rather than property-based?
- Is feature-specific styling kept near the feature?

## Maintainability

- Can a design change be made in one obvious place?
- Does the abstraction reduce repetition without hiding simple markup?
- Is `globals.css` kept short?
- Are class helpers small, focused, and easy to delete when no longer useful?

## Safety

- Are focus-visible states preserved for interactive elements?
- Are disabled, loading, error, and hover states covered where relevant?
- Are color combinations accessible against their backgrounds?
- Are generated class names static enough for Tailwind to detect?


# Architecture Decision Checklist

Use this checklist before implementing a new Astro feature.

## Route Decision

- Is this a page, endpoint, action, middleware concern, or island?
- Can the route be static, or does it need request-time data?
- Are dynamic params validated before use?
- Does the route need SEO metadata or canonical URL handling?

## Rendering Decision

- What content can be prerendered?
- What must be rendered per request?
- Can a server island isolate the dynamic part?
- What cache behavior should the page or endpoint have?

## Interactivity Decision

- Does this require browser JavaScript?
- What is the smallest component that needs hydration?
- Which `client:*` directive matches the priority?
- Does the page still provide useful content before hydration?

## Data Decision

- Is data internal, external, editorial, or user-submitted?
- Where is validation enforced?
- Is the data transformed into a stable view model?
- Are secrets kept on the server?

## Deployment Decision

- Is a static host enough?
- Which adapter is required for server rendering?
- Are environment variables validated before runtime?
- Are build, tests, and preview checks part of CI?

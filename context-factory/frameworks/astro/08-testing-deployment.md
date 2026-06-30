# Testing And Deployment

## Test Layers

- Unit tests for pure utilities, schema parsing, data normalization, and small components.
- Integration tests for endpoints, actions, middleware, and route-level data behavior.
- End-to-end tests for critical user flows, navigation, forms, auth paths, and purchase/contact flows.
- Accessibility checks for rendered pages and interactive islands.

## What To Verify

- Static routes build successfully.
- Dynamic routes handle valid, missing, and invalid params.
- Endpoints return correct status codes, headers, and response bodies.
- Forms and actions validate input and expose safe errors.
- Hydrated islands work without breaking non-JavaScript page content where progressive enhancement is expected.
- Metadata, canonical URLs, sitemap, and robots rules match deployment URLs.

## Deployment Shape

- Static output can be deployed to static hosting and CDNs.
- Server output requires a runtime adapter and compatible host.
- Hybrid output needs clear route-level decisions for what is prerendered and what runs on demand.

## CI Checklist

- Install dependencies from lockfile.
- Run formatting and lint checks.
- Run unit and integration tests.
- Run build.
- Run E2E smoke tests against the built preview when feasible.
- Validate environment variables before deploy.

## Architecture Rules

- Treat `astro build` as a required architecture verification step.
- Test server-only behavior in an environment that matches the selected adapter.
- Keep deployment configuration documented near the app or in the existing project docs.
- Monitor build output for unexpected JavaScript growth.

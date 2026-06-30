---
description: Guidelines for Query Hooks
globs: **/hooks/query/**/*.ts, **/_hooks/query/**/*.ts
alwaysApply: false
---
# Guidelines for Query Hooks

## Purpose and Overview
Query hooks abstract data fetching operations using TanStack Query to provide optimized caching, loading states, error handling, and refetching strategies. They connect UI components to the data access layer, making components cleaner and more focused on presentation rather than data fetching logic.

## Structure and Organization

### Query Hooks Module Structure
```
src/
├── hooks/                  # Shared hooks module
│   └── query/              # Shared query hooks
│       └── [entity]/
│           ├── use-[entity]-query.ts                    # Read single entity
│           ├── use-search-[entity]s-query.ts            # Search with regular pagination
│           └── use-search-[entity]s-infinite-query.ts   # Search with infinite scroll
└── features/
    └── [feature-name]/
        └── _hooks/         # Feature-specific hooks
            └── query/      # Feature-specific query hooks
                └── [entity]/
                    ├── use-[entity]-query.ts
                    ├── use-search-[entity]s-query.ts
                    └── use-search-[entity]s-infinite-query.ts
```

## Naming Conventions

### Files
- `use-[entity]-query.ts`: For querying a single entity by ID
- `use-search-[entity]s-query.ts`: For searching entities with regular pagination
- `use-search-[entity]s-infinite-query.ts`: For searching entities with infinite scroll

### Functions
- `use[Entity]Query`: For querying a single entity
- `useSearch[Entity]sQuery`: For searching entities with regular pagination
- `useSearch[Entity]sInfiniteQuery`: For searching entities with infinite scroll

### Types
- `Use[Entity]QueryArgs`: Arguments for single entity query
- `UseSearch[Entity]sQueryArgs`: Arguments for regular search query
- `UseSearch[Entity]sInfiniteQueryArgs`: Arguments for infinite search query

## Implementation Guidelines

### Query Hooks
- Use TanStack Query's `useQuery` hook for regular queries
- Use `useInfiniteQuery` for paginated/infinite scroll queries
- Import data fetching functions directly from `@/data`
- Define appropriate query keys for proper caching
- Structure the hook to handle loading, success, and error states
- Use TypeScript's `UseQueryOptions` or `Omit<UseQueryOptions, 'queryKey' | 'queryFn'>` for args type
- Spread additional args to allow overriding default options

### Query Key Structure
- Use descriptive and hierarchical query keys
- Follow REST-like patterns: `['/[entity]', ...params]`
- Include relevant parameters in query keys for proper cache invalidation
- For infinite queries, include `/infinite` segment to differentiate from regular search queries
- Include parent identifiers (e.g., `groupId`) as separate key segments for granular cache invalidation
- Examples:
  - Single entity: `['/[entity]s', entityId]`
  - Multiple entities: `['/[entity]s']`
  - Search: `['/[entity]s', '/search', searchParams]`
  - Infinite search: `['/[entity]s', '/search', '/infinite', parentId, { ...payload }]`

## CRUD Query Examples

### 1. Single Entity Query (Read)
```typescript
// use-[entity]-query.ts
import { useQuery } from '@tanstack/react-query';
import { get[Entity]sBy[Entity]Id, type Get[Entity]sBy[Entity]IdData } from '@/data';

export type Use[Entity]QueryArgs = Get[Entity]sBy[Entity]IdData;

export function use[Entity]Query(args: Use[Entity]QueryArgs) {
  return useQuery({
    queryKey: ['/[entity]s', args.[entity]Id],
    queryFn: () => get[Entity]sBy[Entity]Id(args),
  });
}
```

### 2. Search Query with Regular Pagination (Read Multiple)
```typescript
// use-search-[entity]s-query.ts
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { type ApiError, search[Entity]s, type Search[Entity]sData, type Search[Entity]sResponse } from '@/data';

export type UseSearch[Entity]sQueryArgs = Omit<
  UseQueryOptions<Search[Entity]sResponse, ApiError>,
  'queryKey' | 'queryFn'
> & {
  payload: Search[Entity]sData;
};

export function useSearch[Entity]sQuery({ payload,  ...args }: UseSearch[Entity]sQueryArgs) {
  return useQuery({
    ...args,
    queryKey: ['/[entity]s', '/search', payload],
    queryFn: () => search[Entity]s(payload),
  });
}
```

### 3. Search Query with Infinite Scroll (Read Multiple)

Use this pattern for infinite scroll queries. The query key includes `/infinite` to differentiate from regular search queries, and parent identifiers (e.g., `groupId`) are extracted as separate segments for granular cache invalidation.

```typescript
// use-search-[entity]s-infinite-query.ts
import { get[Entity]sSearch, type Get[Entity]sSearchData, type Get[Entity]sSearchResponse } from '@/data';
import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryOptions,
} from '@tanstack/react-query';

export type UseSearch[Entity]sInfiniteQueryArgs = Omit<
  UseInfiniteQueryOptions<
    Get[Entity]sSearchResponse,
    Error,
    InfiniteData<Get[Entity]sSearchResponse>,
    Get[Entity]sSearchResponse,
    readonly unknown[],
    number
  >,
  'queryKey' | 'queryFn' | 'initialPageParam' | 'getNextPageParam' | 'getPreviousPageParam'
> & {
  payload: Get[Entity]sSearchData;
};

export function useSearch[Entity]sInfiniteQuery({
  payload,
  ...options
}: UseSearch[Entity]sInfiniteQueryArgs) {
  return useInfiniteQuery({
    ...options,
    queryKey: ['/[entity]s', '/search', '/infinite', payload.[parentId], { ...payload }] as const,
    queryFn: ({ pageParam }) => get[Entity]sSearch({ ...payload, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: lastPage => lastPage.next_page,
    getPreviousPageParam: firstPage => firstPage.previous_page,
  });
}
```

**Query Key Structure Explained:**
- `'/[entity]s'`: Entity namespace
- `'/search'`: Operation type
- `'/infinite'`: Differentiates from regular search queries (important for cache separation)
- `payload.[parentId]`: Parent identifier extracted for granular invalidation (e.g., `payload.groupId`)
- `{ ...payload }`: Spread payload object for complete cache key uniqueness

**Type Parameters Explained:**
- `TQueryFnData`: Response type from the API (`Get[Entity]sSearchResponse`)
- `TError`: Error type (`Error`)
- `TData`: Transformed data type (`InfiniteData<Get[Entity]sSearchResponse>`)
- `TQueryData`: Data type stored in cache (`Get[Entity]sSearchResponse`)
- `TQueryKey`: Query key type (`readonly unknown[]`)
- `TPageParam`: Page parameter type (`number`) - Required for proper `pageParam` typing in `queryFn`

### Complete CRUD Query Folder Structure Example
```
src/hooks/query/[entity]/
├── use-[entity]-query.ts                    # Read single entity
├── use-search-[entity]s-query.ts            # Search with regular pagination
└── use-search-[entity]s-infinite-query.ts   # Search with infinite scroll
```

## Best Practices

### Performance Considerations
- Implement appropriate staleTime and cacheTime based on data volatility
- Use suspense mode when applicable for concurrent rendering
- Consider implementing placeholderData or initialData for better UX

### Error Handling
- Implement appropriate error handling strategies
- Consider using onError callbacks for specific error handling logic
- Document possible error scenarios

### Dependent Queries
- Use the enabled option to control when a query should run
- Chain queries using the data from one query as input for another

### Prefetching
- Implement prefetching strategies for predictable user interactions
- Use queryClient.prefetchQuery for anticipated data needs

### Infinite Queries
- Use useInfiniteQuery for pagination or infinite scrolling scenarios
- Structure the response data to include necessary pagination metadata
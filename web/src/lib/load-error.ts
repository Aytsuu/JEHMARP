export class LoadError extends Error {
  readonly kind = "load-error" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LoadError";
  }
}

export function isLoadError(error: unknown): error is LoadError {
  return error instanceof LoadError;
}

export function throwLoadError(message: string, cause?: unknown): never {
  throw new LoadError(message, cause ? { cause } : undefined);
}

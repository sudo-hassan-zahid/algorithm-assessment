export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred";
}

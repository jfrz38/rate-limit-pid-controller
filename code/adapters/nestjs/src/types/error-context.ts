export interface ErrorContext {
    message?: string;
    retryAfter?: number,
    code?: number,
    response?: object,
    title?: string
  };

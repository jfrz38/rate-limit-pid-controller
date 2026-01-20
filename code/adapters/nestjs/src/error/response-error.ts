export interface ResponseError {
  message?: string;
  retryAfter?: number,
  code?: number,
  response?: object,
  title?: string,
  hideError?: boolean
};

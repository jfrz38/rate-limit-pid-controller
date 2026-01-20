/**
 * Configuration for the error response sent when a request is rejected 
 * by the PID Controller.
 */
export interface ResponseError {
  /**
   * A custom descriptive message for the error.
   * If `hideError` is false, this may be used as the message sent to the client.
   * @default 'Too many requests, please try again later.'
   */
  message?: string;
  /**
   * The value in seconds for the 'Retry-After' HTTP header.
   * Tells the client how long to wait before retrying the request (seconds).
   * If no value is provided, the header will not be included in the response.
   */
  retryAfter?: number,
  /**
   * The HTTP status code to return.
   * @default 429 (Too Many Requests)
   */
  code?: number,
  /**
   * The custom JSON body object to be sent to the client.
   * If provided, this replaces the default error payload.
   * * @default { "error": (value from {@link title}), "message": (value from {@link message}) }
   */
  response?: object,
  /**
   * A short string representing the error title or category.
   * Useful for standardized error responses (e.g., "Rate Limit Exceeded").
   * @default 'RATE_LIMIT_EXCEEDED'
   */
  title?: string,
  /**
   * If true, prevents the internal PID exception message from being 
   * included in the final response.
   * PID message shows current priority and current admission threshold.
   * @default true
   */
  hideError?: boolean
};

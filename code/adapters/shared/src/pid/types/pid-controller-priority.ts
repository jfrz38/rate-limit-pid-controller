export interface PidControllerPriority<Request = any> {
  /**
   * Extracts a priority tier from an adapter-specific request.
   * Lower numbers represent higher priority in the admission queue.
   */
  getPriority?: (request: Request) => number | string | undefined;
}

/** @deprecated Use PidControllerPriority. */
export type PidControllerMiddlewarePriority<Request = any> = PidControllerPriority<Request>;

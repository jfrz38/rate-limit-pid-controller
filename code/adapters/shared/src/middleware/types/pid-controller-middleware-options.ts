export interface PidControllerMiddlewarePriority {
    /**
     * Optional function to extract priority from the incoming request.
     * Lower numbers represent higher priority in the PID queue.
     * @param req - The incoming Express request object.
     * @returns A number representing the priority. Undefined will generate the lowest priority
     * @example
     * ```ts
     * getPriority: (req) => req.get('x-priority')
     * ```
     */
    getPriority?: (req: any) => number;
}

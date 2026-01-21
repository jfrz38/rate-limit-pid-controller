import { RequestMethod } from "@nestjs/common";

export interface PidRoutesConfig {
    /**
     * List of specific routes to be ignored by the PID Controller.
     * Useful for health checks, metrics, or internal endpoints that should 
     * never be throttled.
     * * @example ['/health', '/metrics']
     */
    excludeRoutes?: string[];
    /**
     * Defines the scope of the routes that the PID Controller will protect.
     * If not provided, it defaults to protecting all routes ('*').
     */
    allowedRoutes?: {
        /**
         * The path or paths to be protected. 
         * Supports single strings, arrays, or wildcards.
         * @default '*' 
         */
        paths?: any,
        /**
         * The HTTP method to which the protection applies.
         * @default RequestMethod.ALL
         * @see {@link RequestMethod}
         */
        method?: RequestMethod
    }
}

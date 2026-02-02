import { PidHttpRules } from "../../filter/error/pid-http-rules";
import { PidControllerOptions } from "./pid-controller-options";

/**
 * Configuration options for the HTTP-based PID controller adapter.
 * This interface serves as the primary entry point for customizing how the controller 
 * interacts with the HTTP layer.
 */
export interface HttpPidControllerOptions {
    /**
     * Core configuration for the PID algorithm and statistics engine.
     * * @see {@link PidControllerOptions} from the `@core` package for detailed parameter descriptions.
     */
    pid?: PidControllerOptions;

    /**
     * Set of HTTP-specific policies that govern the controller's behavior.
     * Includes custom error handling for rejected or evicted requests.
     * * @see {@link PidHttpRules}
     */
    rules?: PidHttpRules;
}

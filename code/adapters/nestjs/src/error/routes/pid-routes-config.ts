import { RequestMethod } from "@nestjs/common";

export interface PidRoutesConfig {
    excludeRoutes?: string[];
    allowedRoutes?: {
        paths?: any,
        method?: RequestMethod
    }
}

import { RequestMethod } from "@nestjs/common";
import { PidRoutesConfig } from "./pid-routes-config";

export class PidRoutes implements PidRoutesConfig {

    private static readonly DEFAULTS: Required<PidRoutesConfig> = {
        excludeRoutes: [],
        allowedRoutes: {
            paths: '*',
            method: RequestMethod.ALL
        }
    };

    static generate(config: PidRoutesConfig = {}): Required<PidRoutesConfig> {
        return {
            excludeRoutes: config.excludeRoutes ?? this.DEFAULTS.excludeRoutes,
            allowedRoutes: {
                paths: config.allowedRoutes?.paths ?? this.DEFAULTS.allowedRoutes.paths,
                method: config.allowedRoutes?.method ?? this.DEFAULTS.allowedRoutes.method,
            },
        };
    }
}

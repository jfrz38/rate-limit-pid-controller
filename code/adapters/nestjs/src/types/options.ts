import { Parameters } from "@jfrz38/pid-controller-core";
import { ErrorContext } from "./error-context";

export interface PidModuleOptions {
  config?: Parameters;
  errorContext?: ErrorContext;
  priority?: (req: any) => number;
  excludeRoutes?: string[],
  forRoutes?: any
}

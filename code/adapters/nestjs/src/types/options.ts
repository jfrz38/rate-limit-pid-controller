import { Parameters } from "@jfrz38/pid-controller-core";
import { PidErrorResponse as PidResponse } from "../error/pid-error-response";

export interface PidModuleOptions {
  pidConfig?: Parameters;
  response?: PidResponse;
  getPriority?: (req: any) => number;
}

import { Priority } from '@jfrz38/adaptive-admission-node';

import type { PidControllerPriority } from './types/pid-controller-priority';

export function normalizePriority<Request>(
  request: Request,
  priority?: PidControllerPriority<Request>,
): Priority {
  if (priority?.getPriority) {
    try {
      const value = Number(priority.getPriority(request));
      if (Number.isFinite(value)) {
        return Priority.fromTier(value);
      }
    } catch {
      // Invalid application priorities use the default tier.
    }
  }

  return Priority.default();
}

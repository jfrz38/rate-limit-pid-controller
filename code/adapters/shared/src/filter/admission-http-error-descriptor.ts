import { adaptiveAdmissionHttpError } from './adaptive-admission-http-error';
import type { ResponseError } from './error/response-error';

export interface AdmissionHttpErrorDescriptor {
  statusCode: number;
  headers: Record<string, string>;
  body: object;
}

export function admissionHttpErrorDescriptor(
  exception: unknown,
  responseError?: ResponseError,
): AdmissionHttpErrorDescriptor | undefined {
  const policy = adaptiveAdmissionHttpError(exception);
  if (!policy) {
    return undefined;
  }

  const title = responseError?.title ?? policy.title;
  const message = responseError?.message ?? policy.message;
  const body: Record<string, unknown> = responseError?.response
    ? { ...responseError.response }
    : { error: title, message };

  if (responseError?.hideError === false && exception instanceof Error) {
    body.message = exception.message;
  }

  const headers: Record<string, string> = {};
  if (responseError?.retryAfter !== undefined) {
    headers['Retry-After'] = String(responseError.retryAfter);
  }

  return {
    statusCode: responseError?.code ?? policy.code,
    headers,
    body,
  };
}

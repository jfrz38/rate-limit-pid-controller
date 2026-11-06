import type { AdmissionOutcome, AdmissionPermit } from '@jfrz38/adaptive-admission-node';
import type { FastifyReply, FastifyRequest } from 'fastify';

type LifecyclePhase = 'queued' | 'acquired' | 'terminal';

export class RequestLifecycle {
  readonly abortController = new AbortController();

  private phase: LifecyclePhase = 'queued';
  private permit: AdmissionPermit | undefined;

  private readonly onRequestAborted = () => this.fail();
  private readonly onSocketClose = () => this.fail();
  private readonly onResponseFinish = () => this.succeed();
  private readonly onResponseClose = () => {
    if (this.reply.raw.writableFinished) {
      this.succeed();
    } else {
      this.fail();
    }
  };
  private readonly onResponseError = () => this.fail();

  constructor(
    private readonly request: FastifyRequest,
    private readonly reply: FastifyReply,
  ) {
    request.raw.once('aborted', this.onRequestAborted);
    request.raw.socket.once('close', this.onSocketClose);
    reply.raw.once('finish', this.onResponseFinish);
    reply.raw.once('close', this.onResponseClose);
    reply.raw.once('error', this.onResponseError);

    if (request.raw.aborted || request.raw.socket.destroyed || reply.raw.destroyed) {
      this.fail();
    }
  }

  admit(permit: AdmissionPermit): boolean {
    if (this.phase === 'terminal') {
      this.completePermit(permit, 'failure');
      return false;
    }

    this.phase = 'acquired';
    this.permit = permit;
    return true;
  }

  succeed(): void {
    this.terminate('success');
  }

  fail(): void {
    this.terminate('failure');
  }

  release(): void {
    if (this.phase === 'terminal') {
      return;
    }
    this.phase = 'terminal';
    this.abortController.abort();
    this.cleanup();
  }

  private terminate(outcome: AdmissionOutcome): void {
    if (this.phase === 'terminal') {
      return;
    }

    const permit = this.permit;
    this.phase = 'terminal';
    this.abortController.abort();
    this.cleanup();

    if (permit) {
      this.completePermit(permit, outcome);
    }
  }

  private completePermit(permit: AdmissionPermit, outcome: AdmissionOutcome): void {
    try {
      permit.complete(outcome);
    } catch (error) {
      this.request.log.error({ err: error }, 'failed to complete admission permit');
    }
  }

  private cleanup(): void {
    this.request.raw.removeListener('aborted', this.onRequestAborted);
    this.request.raw.socket.removeListener('close', this.onSocketClose);
    this.reply.raw.removeListener('finish', this.onResponseFinish);
    this.reply.raw.removeListener('close', this.onResponseClose);
    this.reply.raw.removeListener('error', this.onResponseError);
  }
}

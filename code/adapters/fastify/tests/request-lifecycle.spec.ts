import { EventEmitter } from 'node:events';

import type { AdmissionPermit } from '@jfrz38/adaptive-admission-node';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, test, vi } from 'vitest';

import { RequestLifecycle } from '../src/request-lifecycle';

describe('RequestLifecycle', () => {
  test('completes a finished response once and removes every listener', () => {
    const fixture = lifecycleFixture();
    const complete = vi.fn();

    expect(fixture.lifecycle.admit({ complete })).toBe(true);
    fixture.replyRaw.writableFinished = true;
    fixture.replyRaw.emit('finish');
    fixture.replyRaw.emit('close');

    expect(complete).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith('success');
    expect(fixture.requestRaw.listenerCount('aborted')).toBe(0);
    expect(fixture.socket.listenerCount('close')).toBe(0);
    expect(fixture.replyRaw.listenerCount('finish')).toBe(0);
    expect(fixture.replyRaw.listenerCount('close')).toBe(0);
    expect(fixture.replyRaw.listenerCount('error')).toBe(0);
  });

  test('completes a premature response close as failure', () => {
    const fixture = lifecycleFixture();
    const complete = vi.fn();
    fixture.lifecycle.admit({ complete });

    fixture.replyRaw.emit('close');

    expect(complete).toHaveBeenCalledWith('failure');
  });

  test('completes a response error as failure', () => {
    const fixture = lifecycleFixture();
    const complete = vi.fn();
    fixture.lifecycle.admit({ complete });

    fixture.replyRaw.emit('error', new Error('socket failed'));

    expect(complete).toHaveBeenCalledWith('failure');
  });

  test('aborts queued acquisition and fails a permit delivered after the abort race', () => {
    const fixture = lifecycleFixture();
    const complete = vi.fn();

    fixture.requestRaw.aborted = true;
    fixture.requestRaw.emit('aborted');

    expect(fixture.lifecycle.abortController.signal.aborted).toBe(true);
    expect(fixture.lifecycle.admit({ complete })).toBe(false);
    expect(complete).toHaveBeenCalledWith('failure');
  });

  test('logs completion errors instead of throwing from a socket event', () => {
    const fixture = lifecycleFixture();
    const completionError = new Error('protocol failure');
    const permit: AdmissionPermit = {
      complete: () => {
        throw completionError;
      },
    };
    fixture.lifecycle.admit(permit);

    expect(() => fixture.replyRaw.emit('finish')).not.toThrow();
    expect(fixture.logError).toHaveBeenCalledWith(
      { err: completionError },
      'failed to complete admission permit',
    );
  });
});

function lifecycleFixture() {
  const socket = Object.assign(new EventEmitter(), { destroyed: false });
  const requestRaw = Object.assign(new EventEmitter(), { aborted: false, socket });
  const replyRaw = Object.assign(new EventEmitter(), {
    destroyed: false,
    writableFinished: false,
  });
  const logError = vi.fn();
  const request = {
    raw: requestRaw,
    log: { error: logError },
  } as unknown as FastifyRequest;
  const reply = { raw: replyRaw } as unknown as FastifyReply;

  return {
    lifecycle: new RequestLifecycle(request, reply),
    requestRaw,
    socket,
    replyRaw,
    logError,
  };
}

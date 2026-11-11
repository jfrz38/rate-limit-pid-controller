import {
  AdaptiveAdmissionController,
  CancelledRequestError,
} from '@jfrz38/adaptive-admission-node';
import {
  admissionHttpErrorDescriptor,
  type HttpPidControllerOptions,
  normalizePriority,
} from '@jfrz38/pid-controller-shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import { RequestLifecycle } from './request-lifecycle';

export type PidControllerPluginOptions = HttpPidControllerOptions<FastifyRequest>;

const adaptiveAdmissionPlugin: FastifyPluginAsync<PidControllerPluginOptions> = async (
  fastify,
  options,
) => {
  const controller = new AdaptiveAdmissionController(options.pid?.config);
  const lifecycles = new WeakMap<FastifyRequest, RequestLifecycle>();

  fastify.addHook('onRequest', async (request, reply) => {
    const lifecycle = new RequestLifecycle(request, reply);
    lifecycles.set(request, lifecycle);

    try {
      const permit = await controller.acquire(
        normalizePriority(request, options.pid?.priority),
        { signal: lifecycle.abortController.signal },
      );

      if (!lifecycle.admit(permit)) {
        stopPipeline(reply);
        return reply;
      }
    } catch (error) {
      lifecycle.release();

      if (isDisconnected(request, reply) && error instanceof CancelledRequestError) {
        stopPipeline(reply);
        return reply;
      }

      const descriptor = admissionHttpErrorDescriptor(error, options.http?.error);
      if (!descriptor) {
        throw error;
      }
      if (isDisconnected(request, reply) || reply.sent) {
        stopPipeline(reply);
        return reply;
      }

      void reply.headers(descriptor.headers).code(descriptor.statusCode).send(descriptor.body);
      return reply;
    }
  });

  fastify.addHook('onResponse', async (request) => {
    lifecycles.get(request)?.succeed();
    lifecycles.delete(request);
  });

  fastify.addHook('onRequestAbort', async (request) => {
    lifecycles.get(request)?.fail();
    lifecycles.delete(request);
  });

  fastify.addHook('onTimeout', async (request) => {
    lifecycles.get(request)?.fail();
    lifecycles.delete(request);
  });

  fastify.addHook('onClose', async () => {
    controller.shutdown();
  });
};

function isDisconnected(request: FastifyRequest, reply: FastifyReply): boolean {
  return request.raw.aborted || request.raw.socket.destroyed || reply.raw.destroyed;
}

function stopPipeline(reply: FastifyReply): void {
  if (!reply.sent) {
    reply.hijack();
  }
}

export const pidControllerPlugin = fastifyPlugin(adaptiveAdmissionPlugin, {
  fastify: '5.x',
  name: '@jfrz38/pid-controller-fastify',
});

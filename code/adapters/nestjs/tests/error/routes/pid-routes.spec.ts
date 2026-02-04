import { RequestMethod } from "@nestjs/common";
import { describe, expect, test } from 'vitest';
import { PidRoutes } from '../../../src/error/routes/pid-routes';

describe('PidRoutes', () => {
    const defaultAllowedPaths = '*';
    const defaultAllowedMethods = RequestMethod.ALL;
    const defaultExcludedRoutes: string[] = [];

    describe('generate', () => {
        test('when no config is provided should return all default values', () => {
            const result = PidRoutes.generate(undefined);

            expect(result).toEqual({
                excludeRoutes: defaultExcludedRoutes,
                allowedRoutes: {
                    paths: defaultAllowedPaths,
                    method: defaultAllowedMethods
                }
            });
        });

        test('when empty object is provided should return all default values', () => {
            const result = PidRoutes.generate({});

            expect(result).toEqual({
                excludeRoutes: defaultExcludedRoutes,
                allowedRoutes: {
                    paths: defaultAllowedPaths,
                    method: defaultAllowedMethods
                }
            });
        });

        test('when partial config is provided should merge with defaults', () => {
            const expectedRoutes = ['health'];
            const expectedPaths = '/api';

            const config = {
                excludeRoutes: expectedRoutes,
                allowedRoutes: { paths: expectedPaths }
            };

            const result = PidRoutes.generate(config);

            expect(result.excludeRoutes).toEqual(expectedRoutes);
            expect(result.allowedRoutes.paths).toBe(expectedPaths);
            expect(result.allowedRoutes.method).toBe(defaultAllowedMethods);
        });

        test('when specific method is provided should override the default method', () => {
            const config = {
                allowedRoutes: { method: RequestMethod.POST }
            };

            const result = PidRoutes.generate(config);

            expect(result.allowedRoutes.method).toBe(RequestMethod.POST);
            expect(result.allowedRoutes.paths).toBe(defaultAllowedPaths);
            expect(result.excludeRoutes).toEqual(defaultExcludedRoutes);
        });

        test('when excludeRoutes is an empty array should respect it and not use default', () => {
            const expectedExcludedRoutes: string[] = [];
            const config = { excludeRoutes: expectedExcludedRoutes };

            const result = PidRoutes.generate(config);

            expect(result.excludeRoutes).toEqual(expectedExcludedRoutes);
        });
    });
});

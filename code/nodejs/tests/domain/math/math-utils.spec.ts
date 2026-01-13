import { MathUtils } from "../../../src/domain/math/math-utils";

describe('Math utils tests', () => {
    describe('Covariance tests', () => {
        describe('invalid input', () => {
            test('should throw when vectors have different lengths', () => {
                expect(() => MathUtils.covariance([1, 2], [1])).toThrow(
                    'Vectors must have the same length'
                );
            });

            test('should return 0 when vectors are empty', () => {
                expect(MathUtils.covariance([], [])).toBe(0);
            });

            test('should return 0 when vectors have length 1', () => {
                expect(MathUtils.covariance([5], [10])).toBe(0);
            });
        });

        describe('population covariance (default)', () => {

            test('should compute positive covariance', () => {
                const x = [1, 2, 3];
                const y = [2, 4, 6];

                expect(MathUtils.covariance(x, y)).toBeCloseTo(1.333, 3);
            });

            test('should compute negative covariance', () => {
                const x = [1, 2, 3];
                const y = [6, 4, 2];

                expect(MathUtils.covariance(x, y)).toBeCloseTo(-1.333, 3);
            });

            test('should be 0 when no correlation', () => {
                const x = [1, 2, 3];
                const y = [4, 4, 4];

                expect(MathUtils.covariance(x, y)).toBe(0);
            });
        });

        describe('sample covariance', () => {
            test('should compute sample covariance correctly', () => {
                const x = [1, 2, 3];
                const y = [2, 4, 6];

                expect(MathUtils.covariance(x, y, true)).toBe(2);
            });

            test('should compute sample covariance correctly', () => {
                const x = [1, 2, 3, 4, 5];
                const y = [2, 4, 6, 4, 3];

                expect(MathUtils.covariance(x, y, true)).toBe(0.5);
            });

            test('should compute negative covariance', () => {
                const x = [1, 2, 3];
                const y = [6, 4, 2];

                expect(MathUtils.covariance(x, y, true)).toBe(-2);
            });

            test('should be 0 when no correlation', () => {
                const x = [1, 2, 3];
                const y = [4, 4, 4];

                expect(MathUtils.covariance(x, y, true)).toBe(0);
            });
        });
    });

    describe('Percentile tests', () => {

        const cohort = 128;

        test('when no existing values should return 0', () => {
            expect(MathUtils.percentile([], 10)).toBe(0);
        });

        test('when exists only one value should calculate expected cumulative priority', () => {
            const priority = cohort;

            const values = createValues(1);

            expect(MathUtils.percentile(values, 10)).toBe(priority);
            expect(MathUtils.percentile(values, 20)).toBe(priority);
            expect(MathUtils.percentile(values, 30)).toBe(priority);
            expect(MathUtils.percentile(values, 40)).toBe(priority);
            expect(MathUtils.percentile(values, 50)).toBe(priority);
            expect(MathUtils.percentile(values, 60)).toBe(priority);
            expect(MathUtils.percentile(values, 70)).toBe(priority);
            expect(MathUtils.percentile(values, 80)).toBe(priority);
            expect(MathUtils.percentile(values, 90)).toBe(priority);
            expect(MathUtils.percentile(values, 100)).toBe(priority);
        });

        test('when exists unordered values should calculate expected cumulative priority', () => {
            const max = 3;
            const middle = 2;
            const min = 1;

            const values = createValues(middle, max, min);

            expect(MathUtils.percentile(values, 100)).toBe(max * cohort);
            expect(MathUtils.percentile(values, 90)).toBe(358);
            expect(MathUtils.percentile(values, 50)).toBe(middle * cohort);
            expect(MathUtils.percentile(values, 0)).toBe(min * cohort);
        });

        test('when exists ordered values should calculate expected cumulative priority', () => {
            const max = 3;
            const middle = 2;
            const min = 1;

            const values = createValues(max, middle, min);

            expect(MathUtils.percentile(values, 100)).toBe(max * cohort);
            expect(MathUtils.percentile(values, 90)).toBe(358);
            expect(MathUtils.percentile(values, 50)).toBe(middle * cohort);
            expect(MathUtils.percentile(values, 0)).toBe(min * cohort);
        });

        test('when exists same value should calculate expected cumulative priority', () => {
            const priority = 3;
            const expectedPriority = priority * cohort;

            const values = createValues(priority, priority, priority);

            expect(MathUtils.percentile(values, 90)).toBe(expectedPriority);
            expect(MathUtils.percentile(values, 50)).toBe(expectedPriority);
            expect(MathUtils.percentile(values, 0)).toBe(expectedPriority);
        });

        test('when exists multiple values should calculate expected cumulative priority', () => {
            const values = createValues(3, 2, 5, 4, 4, 5, 4, 1, 4, 3);

            expect(MathUtils.percentile(values, 100)).toBe(5 * cohort);
            expect(MathUtils.percentile(values, 90)).toBe(5 * cohort);
            expect(MathUtils.percentile(values, 80)).toBe(537);
            expect(MathUtils.percentile(values, 70)).toBe(4 * cohort);
            expect(MathUtils.percentile(values, 60)).toBe(4 * cohort);
            expect(MathUtils.percentile(values, 50)).toBe(4 * cohort);
            expect(MathUtils.percentile(values, 40)).toBe(460);
            expect(MathUtils.percentile(values, 30)).toBe(3 * cohort);
            expect(MathUtils.percentile(values, 20)).toBe(358);
            expect(MathUtils.percentile(values, 10)).toBe(243);
            expect(MathUtils.percentile(values, 0)).toBe(1 * cohort);
        });

        test('should not mutate the original array', () => {
            const values = [30, 10, 20];
            const valuesCopy = [...values];
            MathUtils.percentile(values, 50);
            expect(values).toEqual(valuesCopy);
        });

        test('should return exactly the min value for percentile 0 and max for 100', () => {
            const values = [10, 20, 30];
            expect(MathUtils.percentile(values, 0)).toBe(10);
            expect(MathUtils.percentile(values, 100)).toBe(30);
        });

        function createValues(...values: number[]): number[] {
            return values.map(value => value * cohort);
        }
    });

    describe('Average tests', () => {
        test('when no values should return 0', () => {
            expect(MathUtils.average([])).toBe(0);
        });

        test('when values exist should return expected average', () => {
            const values = [10, 20, 30, 40, 50];
            const expectedAverage = 30;

            const result = MathUtils.average(values);

            expect(result).toBe(expectedAverage);
        });

        test('when requests have varying times should calculate precise average', () => {
            const values = [100, 200, 300, 400, 500];
            const expectedAverage = 300;

            const result = MathUtils.average(values);

            expect(result).toBe(expectedAverage);
        });

        test('should handle floating point results in average', () => {
            expect(MathUtils.average([1, 2])).toBe(1.5);
            expect(MathUtils.average([1, 1, 2])).toBeCloseTo(1.333, 3);
        });
    });
});

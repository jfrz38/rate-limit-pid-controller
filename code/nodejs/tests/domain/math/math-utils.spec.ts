import { MathUtils } from "../../../src/domain/math/math-utils";

describe('Math utils tests', () => {

    describe('Percentile tests', () => {

        const cohort = 128;

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
        })

        test('when exists unordered values should calculate expected cumulative priority', () => {
            const max = 3;
            const middle = 2;
            const min = 1;

            const values = createValues(middle, max, min);

            expect(MathUtils.percentile(values, 100)).toBe(max * cohort);
            expect(MathUtils.percentile(values, 90)).toBe(358);
            expect(MathUtils.percentile(values, 50)).toBe(middle * cohort);
            expect(MathUtils.percentile(values, 0)).toBe(min * cohort);
        })

        test('when exists ordered values should calculate expected cumulative priority', () => {
            const max = 3;
            const middle = 2;
            const min = 1;

            const values = createValues(max, middle, min);

            expect(MathUtils.percentile(values, 100)).toBe(max * cohort);
            expect(MathUtils.percentile(values, 90)).toBe(358);
            expect(MathUtils.percentile(values, 50)).toBe(middle * cohort);
            expect(MathUtils.percentile(values, 0)).toBe(min * cohort);
        })

        test('when exists same value should calculate expected cumulative priority', () => {
            const priority = 3;
            const expectedPriority = priority * cohort;

            const values = createValues(priority, priority, priority);

            expect(MathUtils.percentile(values, 90)).toBe(expectedPriority);
            expect(MathUtils.percentile(values, 50)).toBe(expectedPriority);
            expect(MathUtils.percentile(values, 0)).toBe(expectedPriority);
        });

        test('when exists multiple values should calculate expected cumulative priority', () => {
            const values = createValues(3, 2, 5, 4, 4, 5, 4, 1, 4, 3)

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

        function createValues(...values: number[]): number[] {
            return values.map(value => value * cohort);
        }
    })

})

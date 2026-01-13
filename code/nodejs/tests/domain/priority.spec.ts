import { Priority } from "../../src/domain/priority";

describe('Priority', () => {

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {

        test('should use default priority and random cohort if none provided', () => {
            const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5); // 0.5 * 128 = 64

            const priority = new Priority();
            expect(priority.value).toBe(5 * 128 + 64);

            randomSpy.mockRestore();
        });

        test('should set value correctly when priority is given', () => {
            const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.2); // 0.2 * 128 ≈ 25
            const priority = new Priority(2);
            expect(priority.value).toBe(2 * 128 + 25);

            randomSpy.mockRestore();
        });

        test('should set value correctly when priority and cohort are given', () => {
            const priority = new Priority(1, 42);
            expect(priority.value).toBe(1 * 128 + 42);
        });

        test('should handle lower boundary values of Math.random', () => {
            jest.spyOn(Math, 'random').mockReturnValue(0);
            expect(new Priority(5).value % 128).toBe(0);
        });

        test('should handle higher boundary values of Math.random', () => {

            jest.spyOn(Math, 'random').mockReturnValue(0.999999);
            expect(new Priority(5).value % 128).toBe(127);
        });

        test('should clamp priority to LOWEST_PRIORITY (5) if provided value is higher', () => {
            const priority = new Priority(10, 0);
            expect(priority.value).toBe(640);
        });

        test('should clamp priority to 0 if provided value is negative', () => {
            const priority = new Priority(-1, 50);
            expect(priority.value).toBe(50);
        });

        test('should apply modulo to cohort if it exceeds 127', () => {
            const priority = new Priority(1, 128);
            expect(priority.value).toBe(128 + 0);

            const priority2 = new Priority(1, 130);
            expect(priority2.value).toBe(128 + 2);
        });

        test('should ensure cohort is non-negative', () => {
            const priority = new Priority(1, -10);
            expect(priority.value).toBe(128);
        });

        test('should handle decimal cohorts by flooring them', () => {
            const priority = new Priority(2, 10.9);
            expect(priority.value).toBe(2 * 128 + 10);
        });

    });

    describe('value getter', () => {
        test('should return the correct value', () => {
            const priority = new Priority(3, 10);
            expect(priority.value).toBe(3 * 128 + 10);
        });

        
    });

    describe('Priority Hierarchy (Integrity)', () => {

        test('any cohort of a higher priority should be lower value than any cohort of a lower priority', () => {
            const priority0WorstCohort = new Priority(0, 127); // 127

            const priority1BestCohort = new Priority(1, 0);   // 128

            expect(priority0WorstCohort.value).toBeLessThan(priority1BestCohort.value);
        });

        test('any cohort of priority N must be smaller than any cohort of priority N+1', () => {
            const p2Worst = new Priority(2, 127); // 383

            const p3Best = new Priority(3, 0);    // 384

            expect(p2Worst.value).toBeLessThan(p3Best.value);
        });
    });

});

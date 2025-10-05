import { Priority } from "../../src/domain/priority";

describe('Priority', () => {

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

    });

    describe('value getter', () => {
        test('should return the correct value', () => {
            const priority = new Priority(3, 10);
            expect(priority.value).toBe(3 * 128 + 10);
        });
    });

});

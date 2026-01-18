import { RequestInterval } from "../../../src/domain/interval/request-interval";

describe('RequestInterval tests', () => {
    const MIN_INTERVAL = 10;
    const MAX_INTERVAL = 60;
    let requestInterval: RequestInterval;

    beforeEach(() => {
        requestInterval = new RequestInterval(MIN_INTERVAL, MAX_INTERVAL);
    });

    describe('isTimeInInterval', () => {
        const referenceTime = 1000000;

        test('should return true when time is exactly in the middle of interval', () => {
            const timeInMiddle = referenceTime - 30 * 1000;
            expect(requestInterval.isTimeInInterval(timeInMiddle, referenceTime)).toBe(true);
        });

        test('should return true for boundary values (start and end)', () => {
            const start = referenceTime - MAX_INTERVAL * 1000;
            const end = referenceTime - MIN_INTERVAL * 1000;

            expect(requestInterval.isTimeInInterval(start, referenceTime)).toBe(true);
            expect(requestInterval.isTimeInInterval(end, referenceTime)).toBe(true);
        });

        test('should return false when time is too old (before start)', () => {
            const tooOld = referenceTime - (MAX_INTERVAL + 1) * 1000;
            expect(requestInterval.isTimeInInterval(tooOld, referenceTime)).toBe(false);
        });

        test('should return false when time is too recent (after end)', () => {
            const tooRecent = referenceTime - (MIN_INTERVAL - 1) * 1000;
            expect(requestInterval.isTimeInInterval(tooRecent, referenceTime)).toBe(false);
        });

        test('should use performance.now() as default reference when second argument is missing', () => {
            const now = performance.now();
            const timeInWindow = now - (MIN_INTERVAL + 5) * 1000;

            expect(requestInterval.isTimeInInterval(timeInWindow)).toBe(true);
        });

        test('should return false if time is exactly referenceTime (too recent)', () => {
            expect(requestInterval.isTimeInInterval(referenceTime, referenceTime)).toBe(false);
        });
    });

    describe('getIntervalTime', () => {
        test('should return the correct difference between two timestamps', () => {
            const high = 5000;
            const low = 2000;
            expect(requestInterval.getIntervalTime(high, low)).toBe(3000);
        });
    });
});

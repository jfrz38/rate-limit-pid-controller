export class RequestInterval {

    constructor(
        private readonly minIntervalTime: number,
        private readonly maxIntervalTime: number
    ) { }

    public getIntervalTime(highTime: number, lowTime: number): number {
        return highTime - lowTime;
    }

    public isTimeInInterval(time: number, referenceTime: number = Date.now()): boolean {
        const { start, end } = this.getWindowRange(referenceTime);

        return time >= start && time <= end;
    }

    private getWindowRange(referenceTime: number) {
        return {
            start: referenceTime - (this.maxIntervalTime * 1000),
            end: referenceTime - (this.minIntervalTime * 1000)
        };
    }
}

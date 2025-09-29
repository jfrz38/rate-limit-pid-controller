import { MathUtils } from "../../domain/math/math-utils";
import { Statistics } from "../statistics";

export class LatencyController {
    private _targetLatency = 100;
    private maxInflights: number[] = [];
    private intervalThroughputs: number[] = [];

    constructor(private readonly statistics: Statistics) { }

    get targetLatency(): number {
        return this._targetLatency;
    }

    update(): void {
        const intervalEnd = new Date();
        const factor = 0.8;

        const minLatency = this.statistics.getLowestLatencyForInterval(intervalEnd);
        this._targetLatency = minLatency;

        if (this.maxInflights.length < 10) {
            console.info('new targetLatency: ', this._targetLatency);
            return;
        }

        const covariance = MathUtils.covariance(this.maxInflights, this.intervalThroughputs);

        if (covariance > 0) {
            this._targetLatency = minLatency;
        } else if (covariance < 0) {
            this._targetLatency = Math.round(this._targetLatency * factor);
        }

        console.info('new targetLatency: ', this._targetLatency);
    }
}

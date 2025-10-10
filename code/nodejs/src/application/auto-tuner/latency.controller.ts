import { getLogger } from "../../core/logging/logger";
import { MathUtils } from "../../domain/math/math-utils";
import { Statistics } from "../statistics";

export class LatencyController {
    private _targetLatency = 100;
    private maxInflights: number[] = [];
    private intervalThroughputs: number[] = [];

    private logger = getLogger();

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
            this.logger.info(`New targetLatency: ${this._targetLatency}`);
            return;
        }

        const covariance = MathUtils.covariance(this.maxInflights, this.intervalThroughputs);

        if (covariance > 0) {
            this._targetLatency = minLatency;
        } else if (covariance < 0) {
            this._targetLatency = Math.round(this._targetLatency * factor);
        }

        this.logger.info(`New targetLatency: ${this._targetLatency}`);
    }
}

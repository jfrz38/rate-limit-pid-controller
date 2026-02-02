import { getLogger } from "../../core/logging/logger";
import { MathUtils } from "../../domain/math/math-utils";
import { Statistics } from "../../domain/statistics/statistics";
import { ControllerHistory } from "./controller-history";

export class LatencyController {
    private readonly UPDATE_FACTOR = 0.8;
    private _targetLatency = 100;

    private logger = getLogger();

    constructor(
        private readonly statistics: Statistics,
        private readonly history: ControllerHistory
    ) { }

    get targetLatency(): number {
        return this._targetLatency;
    }

    update(): void {

        const minLatency = this.statistics.getLowestLatencyForInterval();

        if (this.history.length < 10) {
            this._targetLatency = minLatency;
            this.logger.info(`New targetLatency: ${this._targetLatency}`);
            return;
        }

        const covariance = MathUtils.covariance(this.history.maxInflights, this.history.intervalThroughputs);

        if (covariance > 0) {
            this._targetLatency = Math.round((this._targetLatency * 0.9) + (minLatency * 0.1));
        } else if (covariance < 0) {
            this._targetLatency = Math.round(this._targetLatency * this.UPDATE_FACTOR);
        }

        this.logger.info(`New targetLatency: ${this._targetLatency}`);
    }
}

import { getLogger } from "../../core/logging/logger";
import { MathUtils } from "../../domain/math/math-utils";
import { Statistics } from "../../domain/statistics/statistics";
import { ControllerHistory } from "./controller-history";

export class LatencyController {
    private readonly UPDATE_FACTOR = 0.8;
    private readonly samples: number[] = [];
    private filteredLatency?: number;
    private lastSnapshotId?: number;
    private _targetLatency = 100;

    private logger = getLogger();

    constructor(
        private readonly statistics: Statistics,
        private readonly history: ControllerHistory
    ) { }

    get targetLatency(): number {
        return this._targetLatency;
    }

    aggregate(sample: number): number {
        if (!Number.isFinite(sample) || sample <= 0) {
            return this.filteredLatency ?? this._targetLatency;
        }
        this.samples.push(sample);
        if (this.samples.length > 5) {
            this.samples.shift();
        }
        const sorted = [...this.samples].sort((a, b) => a - b);
        const median = sorted[Math.floor((sorted.length - 1) / 2)];
        this.filteredLatency = this.filteredLatency === undefined
            ? median
            : (this.filteredLatency * 0.8) + (median * 0.2);
        return this.filteredLatency;
    }

    reset(): void {
        this._targetLatency = 100;
        this.samples.length = 0;
        this.filteredLatency = undefined;
        this.lastSnapshotId = undefined;
    }

    update(): void {

        const snapshot = this.statistics.getLatestSnapshot();
        if (!snapshot || snapshot.id === this.lastSnapshotId) {
            return;
        }
        this.lastSnapshotId = snapshot.id;
        const safeMinLatency = Math.max(1, snapshot.minimumLatency);

        if (this.history.length < 10) {
            this._targetLatency = safeMinLatency;
            this.logger.info(`New targetLatency: ${this._targetLatency}`);
            return;
        }

        const covariance = MathUtils.covariance(this.history.maxInflights, this.history.intervalThroughputs);

        if (covariance > 0) {
            this._targetLatency = Math.round((this._targetLatency * 0.9) + (safeMinLatency * 0.1));
        } else if (covariance < 0) {
            this._targetLatency = Math.round(this._targetLatency * this.UPDATE_FACTOR);
        }

        this._targetLatency = Math.max(1, this._targetLatency);

        this.logger.info(`New targetLatency: ${this._targetLatency}`);
    }
}

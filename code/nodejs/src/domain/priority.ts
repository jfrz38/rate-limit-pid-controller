/**
 * Priority levels are from lower to higher, so maximum priority is 0 and lower is 5
 */
export class Priority {

    // TODO: 
    private readonly LOWEST_PRIORITY = 5;
    private readonly DEFAULT_PRIORITY = this.LOWEST_PRIORITY;
    private readonly RANDOM_COHORT = Math.floor(Math.random() * 128)
    private readonly _value: number;
    constructor(
        private readonly priority: number = this.DEFAULT_PRIORITY,
        private readonly cohort: number = this.RANDOM_COHORT) {
            this._value = priority * 128 + cohort;
        }

    get value(): number {
        return this._value;
    }
}

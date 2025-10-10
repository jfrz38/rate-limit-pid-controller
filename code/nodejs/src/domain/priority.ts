/**
 * Priority levels are from lower to higher, so maximum priority is 0 and lower is 5
 */
export class Priority {

    private static readonly LOWEST_PRIORITY = 5;
    private static readonly DEFAULT_PRIORITY = Priority.LOWEST_PRIORITY;

    private readonly _value: number;

    constructor(
        priority: number = Priority.DEFAULT_PRIORITY,
        cohort: number = Math.floor(Math.random() * 128)
    ) {
        this._value = priority * 128 + cohort;
    }

    get value(): number {
        return this._value;
    }
}

/**
 * Priority levels are from lower to higher, so maximum priority is 0 and lower is 5
 */
export class Priority {

    private static readonly LOWEST_PRIORITY = 5;
    private static readonly DEFAULT_PRIORITY = Priority.LOWEST_PRIORITY;
    private static readonly COHORT_VALUE = 128;

    private readonly _value: number;

    constructor(
        priority: number = Priority.DEFAULT_PRIORITY,
        cohort: number = Math.floor(Math.random() * 128)
    ) {
        const safePriority = Math.max(0, Math.min(priority, Priority.LOWEST_PRIORITY));
        const safeCohort = Math.floor(Math.max(0, cohort)) % 128;

        this._value = safePriority * Priority.COHORT_VALUE + safeCohort;
    }

    get value(): number {
        return this._value;
    }
}

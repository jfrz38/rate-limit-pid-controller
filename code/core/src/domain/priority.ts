/**
 * Priority levels are from lower to higher, so maximum priority is 0 and lower is 5
 */
export class Priority {

    public static readonly LOWEST_PRIORITY = 5;
    public static readonly HIGHEST_PRIORITY = 0;
    public static readonly COHORT_VALUE = 128;
    public static readonly MAX_VALUE = ((Priority.LOWEST_PRIORITY + 1) * Priority.COHORT_VALUE) - 1;
    public static readonly ALLOW_ALL_THRESHOLD = Priority.MAX_VALUE + 1;

    private static readonly DEFAULT_PRIORITY = Priority.LOWEST_PRIORITY;

    private readonly _value: number;

    constructor(
        priority: number = Priority.DEFAULT_PRIORITY,
        cohort: number = Math.floor(Math.random() * 128)
    ) {
        const safePriority = Math.max(0, Math.min(priority, Priority.LOWEST_PRIORITY));
        const safeCohort = Math.floor(Math.max(0, cohort)) % 128;

        this._value = safePriority * Priority.COHORT_VALUE + safeCohort;
    }

    static default(): Priority {
        return new Priority(Priority.DEFAULT_PRIORITY);
    }

    static fromTier(tier: number, cohort?: number): Priority {
        return new Priority(tier, cohort);
    }

    static fromValue(value: number): Priority {
        const priority = Object.create(Priority.prototype) as Priority;
        const safeValue = Math.floor(Math.max(0, Math.min(value, Priority.MAX_VALUE)));
        Object.defineProperty(priority, '_value', {
            value: safeValue,
            writable: false,
            enumerable: false,
            configurable: false,
        });

        return priority;
    }

    get value(): number {
        return this._value;
    }
}

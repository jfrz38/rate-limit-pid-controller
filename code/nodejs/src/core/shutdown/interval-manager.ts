class IntervalManagerImpl {
  private intervals = new Set<NodeJS.Timeout>();

  add(interval: NodeJS.Timeout): void {
    this.intervals.add(interval);
  }

  addAll(intervals: NodeJS.Timeout[]): void {
    intervals?.forEach(interval => this.add(interval));
  }

  clearAll(): void {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }
}

export const intervalManager = new IntervalManagerImpl();

export interface IntervalManager {
    add(interval: NodeJS.Timeout): void
    addAll(intervals: NodeJS.Timeout[]): void
    clearAll(): void
}

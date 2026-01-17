export class ControllerHistory {
    private readonly maxSize = 50;
    
    public intervalThroughputs: number[] = [];
    public maxInflights: number[] = [];

    public push(inflight: number, throughput: number): void {
        if (this.maxInflights.length >= this.maxSize) {
            this.maxInflights.shift();
            this.intervalThroughputs.shift();
        }

        this.maxInflights.push(inflight);
        this.intervalThroughputs.push(throughput);
    }

    public get length(): number {
        return this.maxInflights.length;
    }
}

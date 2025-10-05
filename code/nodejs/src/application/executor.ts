import PQueue from "p-queue";

export class Executor extends PQueue {
    private readonly MAX_CONCURRENT_REQUESTS: number = 10;

    constructor(maxConcurrentRequests?: number) {
        super()
        this.concurrency = maxConcurrentRequests ?? this.MAX_CONCURRENT_REQUESTS;
        this.start();
    }
} 

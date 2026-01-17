import PQueue from "p-queue";

export class Executor extends PQueue {
    constructor(maxConcurrentRequests: number) {
        super();
        this.concurrency = maxConcurrentRequests;
        this.start();
    }
} 

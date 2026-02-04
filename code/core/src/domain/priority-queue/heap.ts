import { Comparator, Heap as HeapJs } from "heap-js";
import { Request } from "../request";

export class Heap<T = Request> extends HeapJs<T> {

    constructor(comparator: Comparator<T>) {
        super(comparator);
    }
}

export class MathUtils {
  static covariance(x: number[], y: number[], sample = false): number {
    if (x.length !== y.length) throw new Error("Vectors must have the same length");
    const length = x.length;
    if (length <= 1) return 0;

    const meanX = x.reduce((a, b) => a + b, 0) / length;
    const meanY = y.reduce((a, b) => a + b, 0) / length;

    const covarianceSum = x.reduce((sum, xi, i) => sum + (xi - meanX) * (y[i] - meanY), 0);
    return covarianceSum / (sample ? length - 1 : length);
  }

  static percentile(values: number[], percentile: number): number {
    if (!values.length) return 0;

    const sorted = values.sort((a, b) => a - b);
    console.log({sorted})
    const index = (percentile / 100) * (sorted.length - 1);
    const lowerIndex = Math.floor(index);
    const upperIndex = Math.ceil(index);

    if (lowerIndex === upperIndex) {
      return Math.floor(sorted[lowerIndex]);
    }

    const valueAtPercentile = sorted[lowerIndex] + (index - lowerIndex) * (sorted[upperIndex] - sorted[lowerIndex]);
    return Math.floor(valueAtPercentile);
  }

}

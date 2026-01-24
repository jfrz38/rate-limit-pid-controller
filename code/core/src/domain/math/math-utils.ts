import { mean, quantileSeq, variance, subtract } from 'mathjs';

export class MathUtils {

  // TODO: Use variance

  static covariance(x: number[], y: number[], sample = false): number {
    if (x.length !== y.length) {
      return 0;
    }
    if (x.length <= 1) {
      return 0;
    };

    const muX = mean(x);
    const muY = mean(y);
    
    const devX = subtract(x, muX) as number[];
    const devY = subtract(y, muY) as number[];
    const sum = devX.reduce((acc, val, i) => acc + val * devY[i], 0);

    return sum / (sample ? x.length - 1 : x.length);
  }

  static percentile(values: number[], percentile: number): number {
    if (!values.length) {
      return 0;
    }

    return Math.floor(quantileSeq(values, percentile / 100));
  }

  static average(values: number[]): number {
    if (!values.length) {
      return 0;
    }
    return mean(values);
  }
}

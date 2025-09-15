// TODO: esto no es application
export function covariance(x: number[], y: number[], sample = false): number {
  if (x.length !== y.length) throw new Error("Vectors must have the same length");
  const length = x.length;
  if (length <= 1) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / length;
  const meanY = y.reduce((a, b) => a + b, 0) / length;

  const covarianceSum = x.reduce((sum, xi, i) => sum + (xi - meanX) * (y[i] - meanY), 0);
  return covarianceSum / (sample ? length - 1 : length);
}

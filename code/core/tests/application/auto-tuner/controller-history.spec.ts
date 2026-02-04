import { ControllerHistory } from "../../../src/application/auto-tuner/controller-history";

describe('ControllerHistory', () => {
  let history: ControllerHistory;

  beforeEach(() => {
    history = new ControllerHistory();
  });

  test('should initialize with empty arrays', () => {
    expect(history.intervalThroughputs).toEqual([]);
    expect(history.maxInflights).toEqual([]);
    expect(history.length).toBe(0);
  });

  test('should add elements correctly', () => {
    history.push(10, 100);
    expect(history.maxInflights).toContain(10);
    expect(history.intervalThroughputs).toContain(100);
    expect(history.length).toBe(1);
  });

  test('should maintain a maximum size of 50 (sliding window)', () => {
    const maxSize = 50;
    for (let i = 0; i < 60; i++) {
      history.push(i, i * 2);
    }

    expect(history.length).toBe(maxSize);
    expect(history.maxInflights.length).toBe(maxSize);
    expect(history.maxInflights[0]).toBe(10);
    expect(history.maxInflights[maxSize - 1]).toBe(59);
  });

  test('should shift both arrays simultaneously to keep them synchronized', () => {
    for (let i = 0; i < 50; i++) {
      history.push(i, i);
    }

    history.push(999, 999);

    expect(history.maxInflights[0]).toBe(1);
    expect(history.intervalThroughputs[0]).toBe(1);
    expect(history.maxInflights[49]).toBe(999);
    expect(history.intervalThroughputs[49]).toBe(999);
  });
});

import { mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.config';

export default mergeConfig(baseConfig, {
  test: {
    name: 'adaptive-admission-node',
  },
});

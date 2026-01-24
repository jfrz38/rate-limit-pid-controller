const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  target: 'node',
  mode: 'development',
  entry: './app.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js'
  },
  externals: [nodeExternals()],
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        options: {
          transpileOnly: true 
        }
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@jfrz38/pid-controller-express': path.resolve(__dirname, '../../../code/adapters/express/src/index.ts'),
      '@jfrz38/pid-controller-core': path.resolve(__dirname, '../../../code/core/src/index.ts'),
      '@jfrz38/pid-controller-shared': path.resolve(__dirname, '../../../code/adapters/shared/src/index.ts'),
    }
  }
};

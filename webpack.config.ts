import path from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import { Configuration, WebpackOptionsNormalized } from 'webpack';
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import ESLintPlugin from 'eslint-webpack-plugin';
import 'webpack-dev-server';

const config = (env: Record<string, unknown>, argv: WebpackOptionsNormalized): Configuration => {
  const isProduction = argv.mode === 'production';

  return {
    // Режим сборки: development или production
    mode: isProduction ? 'production' : 'development',

    // Точка входа приложения
    entry: './src/index.ts',

    // Выходные файлы
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'bundle.js', // Всё в одном файле
      clean: true, // Очистка папки dist перед новой сборкой
    },

    // Специально убираем source map для production
    devtool: isProduction ? false : 'cheap-source-map',

    // Настройка devServer для локальной разработки
    devServer: {
      static: {
        directory: path.resolve(__dirname, 'dist'),
      },
      port: 3000,
      hot: true, // Включить Hot Module Replacement
      historyApiFallback: true, // Для работы с React Router
    },

    // Модули и загрузчики
    module: {
      rules: [
        {
          test: /\.(ts|tsx|js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env', '@babel/preset-react', '@babel/preset-typescript'],
            },
          },
        },
        {
          test: /\.css$/,
          use: [
            'style-loader', // Встраивает CSS в JS
            'css-loader',
          ],
        },
        {
          test: /\.(png|jpe?g|gif|svg)$/i,
          type: 'asset/inline', // Встраивает ресурсы в JS
        },
      ],
    },

    // Оптимизация для production
    optimization: isProduction
      ? {
        minimize: true,
        minimizer: [
          new TerserPlugin(),
        ],
      }
      : {},

    // Плагины
    plugins: [
      new ForkTsCheckerWebpackPlugin(),
      new HtmlWebpackPlugin({
        template: './public/index.html', // Шаблон HTML
        minify: isProduction
          ? {
            collapseWhitespace: true,
            removeComments: true,
            removeRedundantAttributes: true,
            useShortDoctype: true,
            removeEmptyAttributes: true,
            removeStyleLinkTypeAttributes: true,
            keepClosingSlash: true,
            minifyJS: true,
            minifyCSS: true,
            minifyURLs: true,
          }
          : false,
      }),
      new ESLintPlugin({
        eslintPath: path.resolve(__dirname, '.eslintrc.js'),
        // context: path.resolve(__dirname, 'src/'),
        extensions: ['js', 'ts', 'jsx', 'tsx'], // Укажите расширения файлов, которые будут проверяться
        emitWarning: false,  // Показывать предупреждения в консоли (по умолчанию false)
        emitError: true,    // Генерировать ошибки при нарушении правил (по умолчанию false)
        failOnError: true,  // Остановить сборку при ошибках ESLint (по умолчанию false)
        lintDirtyModulesOnly: true, // Проверка только изменённых файлов
      }),
    ],

    // Расширения, которые можно не указывать при импорте
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
  };
};

export default config;

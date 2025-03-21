import * as dotenv from 'dotenv';
import ESLintPlugin from 'eslint-webpack-plugin';
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import path from 'path';
import TerserPlugin from 'terser-webpack-plugin';
import { Configuration, WebpackOptionsNormalized, DefinePlugin } from 'webpack';
import 'webpack-dev-server';

enum Entries {
  main = 'index',
  platforms = 'platforms',
}

const config = (env: Record<string, unknown>, argv: WebpackOptionsNormalized): Configuration => {
  const mode = argv.mode === 'production' ? 'production' : 'development';
  const isProduction = argv.mode === 'production';

  const dotenvParsed = dotenv.config({ path: path.resolve(__dirname, `.env.${mode}`) }).parsed || {};

  return {
    // Режим сборки: development или production
    mode,

    // Точка входа приложения
    entry: {
      [Entries.main]: './src/pages/main/index.ts',
      [Entries.platforms]: './src/pages/platforms/index.ts',
    },

    // Выходные файлы
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].[contenthash].js', // [name] — это имя ключа из entry
      clean: true, // Очистка папки dist перед новой сборкой
      publicPath: '',
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
            'postcss-loader',
          ],
          exclude: /\.module\.css$/,
        },
        {
          test: /\.module\.css$/,
          use: [
            'style-loader', // Встраивает CSS в JS
            {
              loader: 'css-loader',
              options: {
                modules: {
                  namedExport: true,
                  localIdentName: '[name]__[local]___[hash:base64:5]',
                  exportLocalsConvention: 'asIs',
                },
              },
            },
            'postcss-loader',
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
          minimizer: [new TerserPlugin()],
        }
      : {},

    // Плагины
    plugins: [
      new DefinePlugin({
        'process.env': JSON.stringify(dotenvParsed),
      }),
      new ForkTsCheckerWebpackPlugin(),
      // Для главной страницы (index.html)
      new HtmlWebpackPlugin({
        filename: `${Entries.main}.html`, // Имя файла HTML для main страницы
        template: './public/template.html', // Шаблон для страницы
        chunks: [Entries.main], // Указываем, что для этой страницы будет использован только main.js
      }),
      // Для страницы admin (admin.html)
      new HtmlWebpackPlugin({
        filename: `${Entries.platforms}.html`, // Имя файла HTML для admin страницы
        template: './public/template.html', // Используем тот же шаблон, или можно указать другой
        chunks: [Entries.platforms], // Указываем, что для этой страницы будет использован только admin.js
      }),
      new ESLintPlugin({
        extensions: ['js', 'ts', 'jsx', 'tsx'], // Укажите расширения файлов, которые будут проверяться
        emitWarning: false, // Показывать предупреждения в консоли (по умолчанию false)
        emitError: true, // Генерировать ошибки при нарушении правил (по умолчанию false)
        failOnError: true, // Остановить сборку при ошибках ESLint (по умолчанию false)
        lintDirtyModulesOnly: true, // Проверка только изменённых файлов
        configType: 'eslintrc',
      }),
    ],

    // Расширения, которые можно не указывать при импорте
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
  };
};

export default config;

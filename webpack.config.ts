import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import * as dotenv from 'dotenv';
import ESLintPlugin from 'eslint-webpack-plugin';
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import path from 'path';
import TerserPlugin from 'terser-webpack-plugin';
import { Configuration, WebpackOptionsNormalized, DefinePlugin } from 'webpack';
import 'webpack-dev-server';

// Определяем точки входа для разных страниц
enum Entries {
  main = 'index',
  platforms = 'platforms',
}

const config = (env: Record<string, unknown>, argv: WebpackOptionsNormalized): Configuration => {
  // Определяем режим работы Webpack: development или production
  const mode = argv.mode === 'production' ? 'production' : 'development';
  const isProduction = argv.mode === 'production';

  // Загружаем переменные окружения из файла .env.
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
            isProduction ? MiniCssExtractPlugin.loader : 'style-loader', // В продакшене выносим CSS в отдельные файлы
            'css-loader',
            'postcss-loader',
          ],
          exclude: /\.module\.css$/,
        },
        {
          test: /\.module\.css$/,
          use: [
            isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
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
          type: 'asset', // Webpack сам решает, инлайнить или выносить в файл
          parser: {
            dataUrlCondition: {
              maxSize: 8192, // Картинки до 8KB будут инлайниться, остальные — выноситься в файлы
            },
          },
        },
      ],
    },

    // Оптимизация сборки
    optimization: isProduction
      ? {
          minimize: true, // Включаем минимизацию
          minimizer: [new TerserPlugin(), new CssMinimizerPlugin()], // Минифицируем JS и CSS
          splitChunks: {
            chunks: 'all', // Разбиваем код на чанки
          },
        }
      : {},

    // Подключаем плагины
    plugins: [
      new DefinePlugin({
        'process.env': JSON.stringify(dotenvParsed),
      }),
      new ForkTsCheckerWebpackPlugin(), // Проверка типов в отдельном процессе
      new HtmlWebpackPlugin({
        filename: `${Entries.main}.html`, // Имя файла HTML для main страницы
        template: './public/template.html', // Шаблон для страницы
        chunks: [Entries.main], // Указываем, что для этой страницы будет использован только main.js
      }),
      new HtmlWebpackPlugin({
        filename: `${Entries.platforms}.html`,
        template: './public/template.html',
        chunks: [Entries.platforms],
      }),
      new MiniCssExtractPlugin({
        filename: '[name].[contenthash].css', // Генерация отдельных CSS-файлов
      }),
      new ESLintPlugin({
        extensions: ['js', 'ts', 'jsx', 'tsx'],
        emitWarning: false, // Показывать предупреждения в консоли (по умолчанию false)
        emitError: true, // Генерировать ошибки при нарушении правил (по умолчанию false)
        failOnError: true, // Останавливаем сборку при ошибках ESLint
        lintDirtyModulesOnly: true, // Проверяем только изменённые файлы
        configType: 'eslintrc',
      }),
    ],

    // Разрешенные расширения для импортов
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
  };
};

export default config;

import path from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import { Configuration, WebpackOptionsNormalized } from 'webpack';
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import ESLintPlugin from 'eslint-webpack-plugin';
import 'webpack-dev-server';

enum Entries {
  main = 'main',
  platforms = 'platforms',
}

const config = (env: Record<string, unknown>, argv: WebpackOptionsNormalized): Configuration => {
  const isProduction = argv.mode === 'production';

  return {
    // Режим сборки: development или production
    mode: isProduction ? 'production' : 'development',

    // Точка входа приложения
    entry: {
      [Entries.main]: './src/pages/main/index.ts',
      [Entries.platforms]: './src/pages/platforms/index.ts',
    },

    // Выходные файлы
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].[contenthash].js',  // [name] — это имя ключа из entry
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
      // Для главной страницы (main.html)
      new HtmlWebpackPlugin({
        filename: `${Entries.main}.html`,   // Имя файла HTML для main страницы
        template: './public/template.html', // Шаблон для страницы
        chunks: [Entries.main],  // Указываем, что для этой страницы будет использован только main.js
      }),
      // Для страницы admin (admin.html)
      new HtmlWebpackPlugin({
        filename: `${Entries.platforms}.html`,  // Имя файла HTML для admin страницы
        template: './public/template.html',  // Используем тот же шаблон, или можно указать другой
        chunks: [Entries.platforms], // Указываем, что для этой страницы будет использован только admin.js
      }),
      new ESLintPlugin({
        extensions: ['js', 'ts', 'jsx', 'tsx'], // Укажите расширения файлов, которые будут проверяться
        emitWarning: false,  // Показывать предупреждения в консоли (по умолчанию false)
        emitError: true,    // Генерировать ошибки при нарушении правил (по умолчанию false)
        failOnError: true,  // Остановить сборку при ошибках ESLint (по умолчанию false)
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

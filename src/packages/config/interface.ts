import { IConfig } from './types';

// Пока что реализую так конфиг, после сделаю нормальный инструмент
const config: IConfig = {
  get<T>(key: string, defaultValue?: T) {
    const value = process.env[key] as T;

    return value !== undefined ? value : defaultValue;
  },
  getStrict<T>(key: string) {
    const value = process.env[key];

    if (value === undefined) {
      throw new Error(`[Config error] key "${key}" not found`);
    }

    return value as T;
  },
};

export function getConfig() {
  return config;
}

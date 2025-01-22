export interface IConfig {
  // Пока что может возвращать только строки
  get<T extends string>(key: string, defaultValue?: T): T | undefined;
  // Пока что может возвращать только строки
  getStrict<T extends string>(key: string): T;
}

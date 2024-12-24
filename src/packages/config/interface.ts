// Пока что реализую так конфиг, после сделаю нормальный инструмент
const config = {
  get(key: string) {
    return process.env[key];
  },
};

export function getConfig() {
  return config;
}

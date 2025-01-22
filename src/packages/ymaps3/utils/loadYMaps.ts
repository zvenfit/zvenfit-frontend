import { getConfig } from '../../config';
import { type YMaps } from '../types';
import { loadScript } from './loadScript';

let loadPromise: Promise<YMaps>;

// TODO где-то сделать проверку чтобы не загружались карты дважды, если они хотя бы один раз были ранее загружены
export function loadYMapsApi() {
  const config = getConfig();
  const apiKey = config.getStrict('Y_MAPS_API_KEY');

  if (!loadPromise) {
    const requestUrl = getUrl({ apiKey });

    loadPromise = new Promise((resolve, reject) => {
      loadScript(requestUrl)
        .then(async () => {
          await ymaps3.ready;
          resolve(ymaps3);
        })
        .catch(e => {
          e.requestUrl = requestUrl;
          reject(e);
        });
    });
  }

  return loadPromise;
}

interface GetUrlParameters {
  apiKey: string;
}

function getUrl({ apiKey }: GetUrlParameters) {
  return `https://api-maps.yandex.ru/3.0/?apikey=${apiKey}&lang=ru_RU`;
}

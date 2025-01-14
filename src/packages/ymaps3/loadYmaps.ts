import { type Ymaps3 } from './types';
import { getConfig } from '../config';
import { loadScript } from './utils/loadScript';

let loadPromise: Promise<Ymaps3>;

// TODO где-то сделать проверку чтобы не загружались карты дважды, если они хотя бы один раз были ранее загружены
export function loadYmapsApi() {
  const config = getConfig();
  const apiKey = config.get('Y_MAPS_API_KEY');
  if (!apiKey) {
    throw new Error('YMaps Api Key is not defined');
  }

  if (loadPromise) {
    return loadPromise;
  }

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

interface GetUrlParameters {
  apiKey: string;
}

function getUrl({ apiKey }: GetUrlParameters) {
  return `https://api-maps.yandex.ru/3.0/?apikey=${apiKey}&lang=rus`;
}

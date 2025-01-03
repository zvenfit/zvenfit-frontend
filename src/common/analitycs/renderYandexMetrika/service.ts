import { getConfig } from '../../../packages/config';
import { getMetrika } from '../utils';

function getScriptContent(id: string): string {
  return `
    // Yandex.Metrika counter
     (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
     m[i].l=1*new Date();
     for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
     k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
     (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

     ym(${id}, "init", {
          clickmap:true,
          trackLinks:true,
          accurateTrackBounce:true,
          webvisor:true
     });
    // Yandex.Metrika counter
  `;
}

function getNoscriptContent(id: string) {
  return `
    <div><img src="https://mc.yandex.ru/watch/${id}" style="position:absolute; left:-9999px;" alt="" /></div>
  `;
}

export function renderYandexMetrika(): void {
  const config = getConfig();
  const counterId = config.get('YA_METRIKA_COUNTER_ID');
  if (!counterId) {
    console.error('Counter Id is not defined');

    return;
  }

  if (getMetrika()) {
    return;
  }

  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.textContent = getScriptContent(counterId);

  const noscript = document.createElement('noscript');
  noscript.innerHTML = getNoscriptContent(counterId);

  document.body.appendChild(script);
  document.body.appendChild(noscript);
}

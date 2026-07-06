(function () {
  'use strict';

  var config = window.ZVENFIT_MAPS;
  var ymapsLoadPromise;
  var yandexPhotoCache = {};
  var CAROUSEL_AUTOPLAY_MS = 4500;
  var MAX_YANDEX_PHOTOS = 12;

  var ICON_ZOOM_IN =
    '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3.5v11M3.5 9h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  var ICON_ZOOM_OUT =
    '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3.5 9h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  var ICON_FULLSCREEN =
    '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3.5 6.5V3.5h3M11.5 3.5h3v3M14.5 11.5v3h-3M6.5 14.5h-3v-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_FULLSCREEN_EXIT =
    '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M6.5 3.5H3.5v3M11.5 3.5h3v3M14.5 11.5v3h-3M3.5 11.5v3h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatPhone(telephone) {
    var digits = String(telephone || '').replace(/\D/g, '');
    if (digits.length === 11 && digits.charAt(0) === '7') {
      return (
        '+7 (' +
        digits.slice(1, 4) +
        ') ' +
        digits.slice(4, 7) +
        '-' +
        digits.slice(7, 9) +
        '-' +
        digits.slice(9, 11)
      );
    }
    return telephone || '';
  }

  function buildCarouselHtml(photos) {
    if (!photos.length) {
      return '';
    }

    var slides = photos
      .map(function (src) {
        return (
          '<div class="zvenfit-map-panel__carousel-slide">' +
          '<img src="' +
          escapeHtml(src) +
          '" alt="" loading="lazy" decoding="async">' +
          '</div>'
        );
      })
      .join('');

    var dots =
      photos.length > 1
        ? photos
            .map(function (_, index) {
              return (
                '<button type="button" class="zvenfit-map-panel__carousel-dot' +
                (index === 0 ? ' is-active' : '') +
                '" data-carousel-dot="' +
                index +
                '" aria-label="Фото ' +
                (index + 1) +
                '"></button>'
              );
            })
            .join('')
        : '';

    var nav =
      photos.length > 1
        ? '<button type="button" class="zvenfit-map-panel__carousel-nav zvenfit-map-panel__carousel-nav--prev" data-carousel-prev aria-label="Предыдущее фото">&lsaquo;</button>' +
          '<button type="button" class="zvenfit-map-panel__carousel-nav zvenfit-map-panel__carousel-nav--next" data-carousel-next aria-label="Следующее фото">&rsaquo;</button>'
        : '';

    return (
      '<div class="zvenfit-map-panel__carousel" data-carousel-count="' +
      photos.length +
      '">' +
      '<div class="zvenfit-map-panel__carousel-viewport">' +
      '<div class="zvenfit-map-panel__carousel-track" data-carousel-track>' +
      slides +
      '</div>' +
      '</div>' +
      nav +
      (dots ? '<div class="zvenfit-map-panel__carousel-dots">' + dots + '</div>' : '') +
      '</div>'
    );
  }

  function getOrgId(locationKey, location) {
    return (
      location.yandexOrganizationId ||
      (config.locationOrganizations && config.locationOrganizations[locationKey]) ||
      ''
    );
  }

  function getFallbackPhotos(location, locationKey) {
    return (
      (location.photos && location.photos.length && location.photos) ||
      (config.locationPhotos && config.locationPhotos[locationKey]) ||
      []
    );
  }

  function normalizeAltayPhotoUrl(url) {
    return String(url || '')
      .replace(/\)$/, '')
      .replace(/\{size\}/gi, 'L')
      .replace(/\/%s$/i, '/L')
      .replace(/\/(S|M|L[^/]*|XXL[^/]*|h\d+|orig)\)?$/i, '/L');
  }

  function extractAltayUrls(value, seen, urls) {
    if (!value) {
      return;
    }

    if (typeof value === 'string') {
      if (value.indexOf('avatars.mds.yandex.net/get-altay') === -1) {
        return;
      }

      var normalized = normalizeAltayPhotoUrl(value);
      if (seen.indexOf(normalized) !== -1) {
        return;
      }

      seen.push(normalized);
      urls.push(normalized);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(function (item) {
        extractAltayUrls(item, seen, urls);
      });
      return;
    }

    if (typeof value === 'object') {
      Object.keys(value).forEach(function (key) {
        extractAltayUrls(value[key], seen, urls);
      });
    }
  }

  function collectGeoObjectPhotoUrls(geoObject) {
    var urls = [];
    var seen = [];

    if (geoObject.properties && geoObject.properties.getAll) {
      extractAltayUrls(geoObject.properties.getAll(), seen, urls);
    }

    if (!urls.length && geoObject.properties) {
      extractAltayUrls(geoObject.properties.get('metaDataProperty'), seen, urls);
    }

    return urls.slice(0, MAX_YANDEX_PHOTOS);
  }

  function loadBalloonPhotoUrls(geoObject) {
    if (!geoObject.balloon) {
      return Promise.resolve([]);
    }

    var balloon = geoObject.balloon;
    var loadPromise = balloon.load ? balloon.load() : Promise.resolve();

    return Promise.resolve(loadPromise)
      .then(function () {
        return balloon.getContent ? balloon.getContent() : '';
      })
      .then(function (content) {
        var urls = [];
        var seen = [];
        extractAltayUrls(content, seen, urls);
        return urls.slice(0, MAX_YANDEX_PHOTOS);
      })
      .catch(function () {
        return [];
      });
  }

  function fetchYandexOrgPhotos(orgId) {
    if (Object.prototype.hasOwnProperty.call(yandexPhotoCache, orgId)) {
      return Promise.resolve(yandexPhotoCache[orgId]);
    }

    return window.ymaps
      .findOrganization(String(orgId))
      .then(function (geoObject) {
        var urls = collectGeoObjectPhotoUrls(geoObject);

        if (urls.length) {
          yandexPhotoCache[orgId] = urls;
          return urls;
        }

        return loadBalloonPhotoUrls(geoObject).then(function (balloonUrls) {
          yandexPhotoCache[orgId] = balloonUrls;
          return balloonUrls;
        });
      })
      .catch(function () {
        yandexPhotoCache[orgId] = [];
        return [];
      });
  }

  function resolvePhotos(location, locationKey) {
    var orgId = getOrgId(locationKey, location);
    var builtInPhotos =
      (location.photos && location.photos.length && location.photos) || [];

    if (!orgId || !window.ymaps || !window.ymaps.findOrganization) {
      return Promise.resolve(
        builtInPhotos.length ? builtInPhotos : getFallbackPhotos(location, locationKey),
      );
    }

    return fetchYandexOrgPhotos(orgId).then(function (livePhotos) {
      if (livePhotos.length) {
        return livePhotos;
      }
      if (builtInPhotos.length) {
        return builtInPhotos;
      }
      return getFallbackPhotos(location, locationKey);
    });
  }

  function buildCarouselPlaceholderHtml() {
    return (
      '<div class="zvenfit-map-panel__carousel zvenfit-map-panel__carousel--placeholder" data-carousel-placeholder>' +
      '<div class="zvenfit-map-panel__carousel-viewport">' +
      '<div class="zvenfit-map-panel__carousel-placeholder" aria-hidden="true"></div>' +
      '</div>' +
      '</div>'
    );
  }

  function removeCarouselPlaceholder(panel) {
    var placeholder = panel.querySelector('[data-carousel-placeholder]');
    if (placeholder) {
      placeholder.remove();
    }
  }

  function mountCarousel(panel, photos) {
    if (!photos.length) {
      removeCarouselPlaceholder(panel);
      panel.classList.remove('zvenfit-map-panel--with-carousel');
      return null;
    }

    var placeholder = panel.querySelector('[data-carousel-placeholder]');
    var carouselHtml = buildCarouselHtml(photos);

    if (placeholder) {
      placeholder.outerHTML = carouselHtml;
    } else {
      var body = panel.querySelector('.zvenfit-map-panel__body');
      if (!body) {
        return null;
      }

      body.insertAdjacentHTML('beforebegin', carouselHtml);
    }

    panel.classList.add('zvenfit-map-panel--with-carousel');
    return initCarousel(panel);
  }

  function initCarousel(panel) {
    var carousel = panel.querySelector('[data-carousel-count]');
    if (!carousel) {
      return null;
    }

    var track = carousel.querySelector('[data-carousel-track]');
    var slideNodes = Array.prototype.slice.call(
      carousel.querySelectorAll('.zvenfit-map-panel__carousel-slide'),
    );
    var dots = Array.prototype.slice.call(
      carousel.querySelectorAll('[data-carousel-dot]'),
    );
    var prev = carousel.querySelector('[data-carousel-prev]');
    var next = carousel.querySelector('[data-carousel-next]');
    var index = 0;
    var autoplayTimer = null;
    var reduceMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function applyTransform(animate) {
      if (!track) {
        return;
      }

      track.classList.toggle('zvenfit-map-panel__carousel-track--instant', !animate || reduceMotion);
      track.style.transform = 'translate3d(-' + index * 100 + '%, 0, 0)';
    }

    function showSlide(nextIndex, options) {
      options = options || {};

      if (!slideNodes.length) {
        return;
      }

      index = (nextIndex + slideNodes.length) % slideNodes.length;
      applyTransform(options.animate !== false);

      dots.forEach(function (dot, dotIndex) {
        dot.classList.toggle('is-active', dotIndex === index);
      });
    }

    function stopAutoplay() {
      if (autoplayTimer) {
        window.clearInterval(autoplayTimer);
        autoplayTimer = null;
      }
    }

    function startAutoplay() {
      stopAutoplay();
      if (slideNodes.length <= 1) {
        return;
      }

      autoplayTimer = window.setInterval(function () {
        showSlide(index + 1, { animate: true });
      }, CAROUSEL_AUTOPLAY_MS);
    }

    function restartAutoplay() {
      stopAutoplay();
      startAutoplay();
    }

    if (prev) {
      prev.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        showSlide(index - 1, { animate: true });
        restartAutoplay();
      });
    }

    if (next) {
      next.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        showSlide(index + 1, { animate: true });
        restartAutoplay();
      });
    }

    dots.forEach(function (dot) {
      dot.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        showSlide(Number(dot.getAttribute('data-carousel-dot')), { animate: true });
        restartAutoplay();
      });
    });

    carousel.addEventListener('mouseenter', stopAutoplay);
    carousel.addEventListener('mouseleave', startAutoplay);
    carousel.addEventListener('focusin', stopAutoplay);
    carousel.addEventListener('focusout', startAutoplay);

    showSlide(0, { animate: false });
    startAutoplay();

    return stopAutoplay;
  }

  function buildPanelHtml(location) {
    var phone = formatPhone(location.telephone);
    var phoneHref = 'tel:' + String(location.telephone || '').replace(/[^\d+]/g, '');
    var address = location.streetAddress + ', ' + location.addressLocality;
    var mapLink = location.mapUrl
      ? '<a class="zvenfit-map-panel__link" href="' +
        escapeHtml(location.mapUrl) +
        '" target="_blank" rel="noopener noreferrer">Яндекс Карты</a>'
      : '';

    return (
      '<button type="button" class="zvenfit-map-panel__close" aria-label="Закрыть">&times;</button>' +
      '<div class="zvenfit-map-panel__body">' +
      '<div class="zvenfit-map-panel__title">' +
      escapeHtml(location.name) +
      '</div>' +
      '<div class="zvenfit-map-panel__address">' +
      escapeHtml(address) +
      '</div>' +
      '<div class="zvenfit-map-panel__actions">' +
      '<a class="zvenfit-map-panel__phone" href="' +
      escapeHtml(phoneHref) +
      '">' +
      escapeHtml(phone) +
      '</a>' +
      mapLink +
      '</div>' +
      '</div>'
    );
  }

  function ensurePanel(container) {
    var panel = container.querySelector('.zvenfit-map-panel');
    if (panel) {
      return panel;
    }

    panel = document.createElement('div');
    panel.className = 'zvenfit-map-panel';
    panel.hidden = true;
    panel.addEventListener('click', function (event) {
      event.stopPropagation();
    });
    container.appendChild(panel);
    return panel;
  }

  function closePanel(panel) {
    if (panel._carouselCleanup) {
      panel._carouselCleanup();
      panel._carouselCleanup = null;
    }

    panel._panelGeneration = (panel._panelGeneration || 0) + 1;
    panel.hidden = true;
    panel.classList.remove('zvenfit-map-panel--with-carousel');
    panel.innerHTML = '';
  }

  function openPanel(panel, location, locationKey) {
    if (panel._carouselCleanup) {
      panel._carouselCleanup();
      panel._carouselCleanup = null;
    }

    panel._panelGeneration = (panel._panelGeneration || 0) + 1;
    var panelGeneration = panel._panelGeneration;

    panel.innerHTML = buildPanelHtml(location);
    panel.hidden = false;
    panel.classList.add('zvenfit-map-panel--with-carousel');

    var body = panel.querySelector('.zvenfit-map-panel__body');
    if (body) {
      body.insertAdjacentHTML('beforebegin', buildCarouselPlaceholderHtml());
    }

    var closeButton = panel.querySelector('.zvenfit-map-panel__close');
    if (closeButton) {
      closeButton.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        closePanel(panel);
      });
    }

    resolvePhotos(location, locationKey).then(function (photos) {
      if (panel.hidden || panel._panelGeneration !== panelGeneration) {
        return;
      }

      panel._carouselCleanup = mountCarousel(panel, photos);
    });
  }

  function createControlButton(className, label, iconHtml) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-label', label);
    button.innerHTML = iconHtml;
    return button;
  }

  function createMapControls(container, map, locations) {
    var mapUrl = (locations[0] && locations[0].mapUrl) || 'https://yandex.ru/maps/';

    var fullscreenWrap = document.createElement('div');
    fullscreenWrap.className = 'zvenfit-map__controls zvenfit-map__controls--fullscreen';
    fullscreenWrap.setAttribute('role', 'group');
    fullscreenWrap.setAttribute('aria-label', 'Полноэкранный режим');

    var fullscreen = createControlButton(
      'zvenfit-map__control',
      'Открыть карту на весь экран',
      ICON_FULLSCREEN,
    );

    var zoomWrap = document.createElement('div');
    zoomWrap.className = 'zvenfit-map__controls zvenfit-map__controls--zoom';
    zoomWrap.setAttribute('role', 'group');
    zoomWrap.setAttribute('aria-label', 'Масштаб карты');

    var zoomIn = createControlButton('zvenfit-map__control', 'Увеличить', ICON_ZOOM_IN);
    var zoomOut = createControlButton('zvenfit-map__control', 'Уменьшить', ICON_ZOOM_OUT);

    zoomIn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      map.setZoom(map.getZoom() + 1, { duration: 200, checkZoomRange: true });
    });

    zoomOut.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      map.setZoom(map.getZoom() - 1, { duration: 200, checkZoomRange: true });
    });

    fullscreen.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();

      if (document.fullscreenElement === container) {
        document.exitFullscreen();
        return;
      }

      var request = container.requestFullscreen || container.webkitRequestFullscreen;
      if (request) {
        request.call(container);
        return;
      }

      window.open(mapUrl, '_blank', 'noopener,noreferrer');
    });

    document.addEventListener('fullscreenchange', function () {
      var isFullscreen = document.fullscreenElement === container;
      container.classList.toggle('zvenfit-map--fullscreen', isFullscreen);
      fullscreen.innerHTML = isFullscreen ? ICON_FULLSCREEN_EXIT : ICON_FULLSCREEN;
      fullscreen.setAttribute(
        'aria-label',
        isFullscreen ? 'Выйти из полноэкранного режима' : 'Открыть карту на весь экран',
      );
      if (map.container && map.container.fitToViewport) {
        map.container.fitToViewport();
      }
    });

    zoomWrap.appendChild(zoomIn);
    zoomWrap.appendChild(zoomOut);
    fullscreenWrap.appendChild(fullscreen);
    container.appendChild(fullscreenWrap);
    container.appendChild(zoomWrap);
  }

  function showFallback(container, location) {
    container.dataset.mapReady = 'fallback';
    container.replaceChildren();

    var link = document.createElement('a');
    link.className = 'zvenfit-map__fallback';
    link.href = location.mapUrl || 'https://yandex.ru/maps/';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Открыть карту в Яндекс Картах';
    container.appendChild(link);
  }

  function loadYmaps() {
    if (!config || !config.apiKey) {
      return Promise.reject(new Error('Missing Yandex Maps API key'));
    }

    if (ymapsLoadPromise) {
      return ymapsLoadPromise;
    }

    ymapsLoadPromise = new Promise(function (resolve, reject) {
      if (window.ymaps) {
        window.ymaps.ready(resolve);
        return;
      }

      var script = document.createElement('script');
      script.src =
        'https://api-maps.yandex.ru/2.1/?apikey=' +
        encodeURIComponent(config.apiKey) +
        '&lang=ru_RU';
      script.async = true;
      script.onload = function () {
        if (!window.ymaps) {
          reject(new Error('Yandex Maps API failed to load'));
          return;
        }
        window.ymaps.ready(resolve);
      };
      script.onerror = function () {
        reject(new Error('Yandex Maps API script error'));
      };
      document.head.appendChild(script);
    });

    return ymapsLoadPromise;
  }

  function getLocationsForSet(setName) {
    var set = config.sets[setName] || config.sets[config.defaultSet];
    if (!set) {
      return [];
    }

    return set.locationKeys
      .map(function (key) {
        var location = config.locations[key];
        if (!location) {
          return null;
        }
        return { key: key, location: location };
      })
      .filter(Boolean);
  }

  function getPinOptions(locationKey, location) {
    var pinOverride = (config.locationPins && config.locationPins[locationKey]) || {};

    return {
      iconImageHref: location.pinIcon || pinOverride.pinIcon || config.pinIcon,
      iconImageSize: location.pinIconSize || pinOverride.pinIconSize || config.pinIconSize,
      iconImageOffset:
        location.pinIconOffset || pinOverride.pinIconOffset || config.pinIconOffset,
    };
  }

  function initMap(container) {
    if (container.dataset.mapReady) {
      return;
    }

    var setName = container.dataset.mapSet || config.defaultSet;
    var set = config.sets[setName] || config.sets[config.defaultSet];
    var locations = getLocationsForSet(setName);

    if (!locations.length) {
      return;
    }

    loadYmaps()
      .then(function () {
        var panel = ensurePanel(container);

        var placemarks = locations.map(function (entry) {
          var location = entry.location;
          var pin = getPinOptions(entry.key, location);
          var placemark = new window.ymaps.Placemark(
            [location.latitude, location.longitude],
            {
              hintContent: location.name,
            },
            {
              iconLayout: 'default#image',
              iconImageHref: pin.iconImageHref,
              iconImageSize: pin.iconImageSize,
              iconImageOffset: pin.iconImageOffset,
              openBalloonOnClick: false,
              hideIconOnBalloonOpen: false,
            },
          );

          placemark.events.add('click', function (event) {
            event.stopPropagation();
            openPanel(panel, location, entry.key);
            map.panTo([location.latitude, location.longitude], {
              flying: true,
              duration: 250,
            });
          });

          return placemark;
        });

        var map = new window.ymaps.Map(
          container,
          {
            center: [locations[0].location.latitude, locations[0].location.longitude],
            zoom: set.zoom || 14,
            controls: [],
          },
          {
            suppressMapOpenBlock: true,
            yandexMapDisablePoiInteractivity: true,
          },
        );

        map.behaviors.disable(['scrollZoom', 'dblClickZoom']);

        map.events.add('click', function () {
          closePanel(panel);
        });

        var collection = new window.ymaps.GeoObjectCollection({}, {});
        placemarks.forEach(function (placemark) {
          collection.add(placemark);
        });
        map.geoObjects.add(collection);

        if (locations.length > 1) {
          var bounds = collection.getBounds();
          if (bounds) {
            map.setBounds(bounds, {
              checkZoomRange: true,
              zoomMargin: set.zoomMargin || 40,
            });
          }
        }

        createMapControls(
          container,
          map,
          locations.map(function (entry) {
            return entry.location;
          }),
        );
        container.dataset.mapReady = 'true';
      })
      .catch(function () {
        showFallback(container, locations[0].location);
      });
  }

  function observeMaps() {
    var containers = Array.prototype.slice.call(
      document.querySelectorAll('.zvenfit-map:not([data-map-ready])'),
    );

    if (!containers.length) {
      return;
    }

    if (!('IntersectionObserver' in window)) {
      containers.forEach(initMap);
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) {
            return;
          }
          initMap(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '120px 0px', threshold: 0.01 },
    );

    containers.forEach(function (container) {
      observer.observe(container);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeMaps);
  } else {
    observeMaps();
  }
})();

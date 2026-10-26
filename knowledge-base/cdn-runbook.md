---
type: runbook
title: ZvenFit CDN cache runbook
updated: 2026-10-26
---

# CDN cache runbook

`zvenfit.ru` is served by Yandex CDN resource `bc8rubabuwzpqqp7rifz` in front of
the website endpoint of bucket `zvenfit-frontend`. Measured on 2026-10-26 after
release v3.0.12 for decision R12 in
[ADR 002](decisions/002-astro-migration.md).

## Settings that matter

- Cache key: the path plus the `v` query parameter only
  (`query_params_whitelist: v`). `/js/lead-config.js?v=159` and
  `/js/lead-config.js` are separate cache entries.
- Edge TTL: `edge_cache_settings.default_value = 86400` applies when the origin
  sends no `Cache-Control`; otherwise the origin headers are honoured and passed
  to browsers unchanged (`browser_cache_settings` is empty).
- gzip on, HTTP redirected to HTTPS, methods GET, HEAD and OPTIONS, cookies
  ignored. The edge adds no cache-status headers (`Age`, `X-Cache`): compare
  `Last-Modified` with the bucket object instead.

## Observed behaviour

- HTML and crawl files (`no-cache, must-revalidate`) were fresh at the edge
  immediately after the release.
- Objects uploaded with `public, max-age=31536000, immutable` stay cached for a
  year under their key. When `js/*-config.js` moved to the no-cache upload pass
  (v3.0.12), the `?v=` keys were fresh while the bare keys kept the old objects
  until they were purged.

## Purging paths

`yc` in the owner's profile authenticates through the browser, so run it from an
interactive terminal, not from an agent shell:

```bash
yc cdn cache purge --resource-id bc8rubabuwzpqqp7rifz --path /js/lead-config.js --path /js/schedule-config.js --path /js/traffic-config.js --path /js/maps-config.js
```

The API accepts the request at once. Verify with
`curl -sI https://zvenfit.ru/js/lead-config.js` and compare `Cache-Control` and
`Last-Modified` with
`https://storage.yandexcloud.net/zvenfit-frontend/js/lead-config.js`.

On 2026-10-26 two purges of the four bare config keys were accepted, yet the
edge still served the old `immutable` objects 15 minutes after the first one.
Open follow-up before release A: re-check the bare keys; if they stay stale,
consider a full purge of the resource (`yc cdn cache purge --resource-id
bc8rubabuwzpqqp7rifz` without `--path`), which only makes the edge refetch
from the bucket.

## Planned change

After release B no URL carries `?v=` any more and the `v` whitelist is removed
from the cache key (R16). No other CDN setting changes as part of the migration.

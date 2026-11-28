#!/usr/bin/env bash
set -euo pipefail

# Keep historical installs, builds and checks outside the credentialed runner.
# Use the same setup-node distribution as the release. Only dist/ is writable on the host.
checkout=${1:?expected a fresh checkout of the deployed SHA}
node_prefix=$(node -p "require('node:path').resolve(process.execPath, '../..')")
mkdir "$checkout/dist"
git -C "$checkout" archive HEAD | docker run --rm -i \
  --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges \
  --mount "type=bind,source=$node_prefix,target=/opt/node,readonly" \
  --mount "type=bind,source=$checkout/dist,target=/output" \
  --env HOME=/tmp --env PATH=/opt/node/bin:/usr/local/bin:/usr/bin:/bin \
  --env "BUILD_MODE=${NODE_ENV:?}" --env ASSET_VERSION --env Y_MAPS_API_KEY \
  --env LEAD_API_URL --env SCHEDULE_API_URL --env TRAFFIC_API_URL \
  ubuntu:24.04@sha256:562111b88caa79c71391c0c4d3c2114a7d5c35915c20561fd893cb1e07929e6b \
  bash -euo pipefail -c '
    cd "$(mktemp -d)"
    tar -xf -
    npm ci --no-audit --no-fund
    export NODE_ENV="$BUILD_MODE"
    npm run build
    node scripts/check-routes.cjs
    node scripts/check-build.cjs
    if [[ "$NODE_ENV" == staging ]]; then node scripts/check-staging-build.cjs; fi
    cp -R dist/. /output/
  '

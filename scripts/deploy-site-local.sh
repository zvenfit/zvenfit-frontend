#!/usr/bin/env bash
set -euo pipefail

temp=$(mktemp -d)
trap 'rm -rf -- "$temp"' EXIT
metadata=$(node scripts/prepare-local-site.mjs "$temp")
cd "$temp/site"
bucket="s3://${YC_S3_BUCKET:-zvenfit-frontend}"
storage=(--endpoint-url https://storage.yandexcloud.net --region ru-1)
fresh="no-cache, must-revalidate"
aws s3 sync ./dist "$bucket" --exclude "*.html" --exclude "robots.txt" --exclude "sitemap.xml" --exclude "js/*-config.js" --cache-control "public, max-age=31536000, immutable" "${storage[@]}"
aws s3 sync ./dist "$bucket" --delete --exclude "*" --include "robots.txt" --include "sitemap.xml" --cache-control "$fresh" "${storage[@]}"
aws s3 sync ./dist "$bucket" --delete --exclude "*" --include "js/*-config.js" --cache-control "$fresh" "${storage[@]}"
# sync may skip existing HTML with identical size/timestamps and leave stale metadata.
html=(--exclude "*" --include "*.html" --cache-control "$fresh" --metadata "$metadata")
aws s3 cp ./dist "$bucket/" --recursive "${html[@]}" "${storage[@]}"
aws s3 sync ./dist "$bucket" --delete --size-only "${html[@]}" "${storage[@]}"

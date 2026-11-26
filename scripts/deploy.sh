#!/usr/bin/env bash
# Build and publish dist/ to the gh-pages branch (GitHub Pages).
set -euo pipefail
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
npm run build
touch dist/.nojekyll
cd dist
rm -rf .git
git init -q -b gh-pages
git config user.name "$(git -C .. config user.name)"
git config user.email "$(git -C .. config user.email)"
git add -A
git commit -q -m "Deploy $(date +%F_%H%M)"
git push -q -f "$REMOTE" gh-pages
rm -rf .git
echo "Publicado: https://alvaromendieta-git.github.io/cumbre/"

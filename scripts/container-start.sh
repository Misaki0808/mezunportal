#!/bin/sh
set -eu
case "${1:-web}" in
  web)
    node node_modules/prisma/build/index.js migrate deploy
    exec node server.js
    ;;
  worker)
    exec node --import tsx src/server/jobs/worker.ts
    ;;
  *)
    exec "$@"
    ;;
esac

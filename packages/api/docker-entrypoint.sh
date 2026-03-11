#!/bin/sh
set -e

echo "Running Payload migrations..."
npx payload migrate || echo "Migration failed or no pending migrations"

echo "Starting server..."
exec node server.js

#!/usr/bin/env bash

set -euo pipefail

echo "Starting PostgreSQL with Docker Compose..."
docker compose up -d postgres

echo "Starting Next.js app (frontend + API routes)..."
npm run dev

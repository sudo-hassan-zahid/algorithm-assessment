$ErrorActionPreference = "Stop"

Write-Host "Starting PostgreSQL with Docker Compose..."
docker compose up -d postgres

Write-Host "Starting Next.js app (frontend + API routes)..."
npm run dev

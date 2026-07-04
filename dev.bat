@echo off
setlocal

echo Starting PostgreSQL with Docker Compose...
docker compose up -d postgres
if errorlevel 1 exit /b %errorlevel%

echo Starting Next.js app (frontend + API routes)...
npm run dev
exit /b %errorlevel%

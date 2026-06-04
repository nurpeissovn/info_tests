# Railway Setup

## App Structure

- Frontend: React + Vite
- Backend: Express API in `server/index.js`
- Database: PostgreSQL via `DATABASE_URL`

## Railway Services

1. Create a `PostgreSQL` service in Railway.
2. Create a `Web Service` for this repo.
3. Railway should expose `DATABASE_URL` automatically to the web service.

## Railway Commands

- Build command: `npm run build`
- Start command: `npm run start`

## Environment Variables

- `DATABASE_URL`
- `PORT`
- Optional for separate frontend deployments only: `VITE_API_BASE_URL`

For this repository on Railway, leave `VITE_API_BASE_URL` unset so the frontend uses the same-domain `/api` routes.

## Local Development

- Frontend only: `npm run dev`
- Backend only: `npm run dev:server`
- Frontend + backend together: `npm run dev:full`

When running `npm run dev`, Vite proxies `/api` requests to `http://localhost:8787`.

## API Endpoints

- `GET /api/health`
- `GET /api/results`
- `POST /api/results`

## Notes

- The backend creates the `test_attempts` table automatically on startup.
- Student results are still saved to localStorage as a fallback if the backend is unavailable.
- Teacher analytics prefer PostgreSQL results when the API is reachable.

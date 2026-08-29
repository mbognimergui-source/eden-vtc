# Multi-stage build: compile the frontend, then serve it from the backend.
# One image, one container, one public URL — no CORS between two domains.

FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install && npm rebuild
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS backend
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

EXPOSE 8000
CMD ["python", "main.py"]

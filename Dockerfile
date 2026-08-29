# Backend-only image. The frontend is deployed separately (e.g. Vercel) and
# talks to this service over VITE_API_BASE_URL — see frontend/src/lib/client.ts.
# (backend/main.py still serves frontend/dist if it happens to be present,
# so this same image also works for an all-in-one deployment if ever needed —
# it just has nothing to serve there in the split setup, and falls back to a
# plain JSON message at "/".)

FROM python:3.12-slim
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./

EXPOSE 8000
CMD ["python", "main.py"]

FROM node:22-bookworm AS frontend-build

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./frontend/
WORKDIR /app/frontend
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY pyproject.toml README.md ./
COPY backend ./backend
COPY config.yaml.example ./config.yaml.example
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

RUN pip install --no-cache-dir .

EXPOSE 8080
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080"]


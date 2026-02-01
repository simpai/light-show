# Build Stage for Frontend
FROM node:20-slim AS build-stage
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Final Stage
FROM python:3.11-slim
WORKDIR /app

# Minimal system requirements (if any needed, none for basic flask)
# Removed ffmpeg/libsndfile as backend logic is gone

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy only server script
COPY server.py ./

# Copy built frontend from build-stage
COPY --from=build-stage /app/dist ./dist

# Environments
ENV PORT=8080
ENV FLASK_APP=server.py

EXPOSE 8080

# Run with gunicorn
CMD gunicorn --bind 0.0.0.0:$PORT server:app

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

# Install system dependencies for librosa/soundfile
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend files
COPY generator.py server.py exporter.py ./
# Copy validator if user wants to play with it
COPY validator.py ./

# Copy built frontend from build-stage (vite builds to /app/dist via outDir: '../dist')
COPY --from=build-stage /app/dist ./dist

# Environments
ENV PORT=8080
ENV FLASK_APP=server.py

# Create upload/output dirs
RUN mkdir uploads outputs

EXPOSE 8080

# Run with gunicorn
CMD gunicorn --bind 0.0.0.0:$PORT server:app

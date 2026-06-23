# GameAd Insight - Render Dockerfile
# Multi-stage build: 前端编译 + 后端 + Chrome

# ===== Stage 1: 编译前端 =====
FROM node:22-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ===== Stage 2: 后端 + 静态文件 =====
FROM python:3.11-slim

# 安装 Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 安装 Python 依赖
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY backend/ .

# 从前端构建阶段复制编译产物
COPY --from=frontend-builder /frontend/dist/ ./static/

# 设置 Chrome 环境变量
ENV CHROME_BIN=/usr/bin/google-chrome-stable
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

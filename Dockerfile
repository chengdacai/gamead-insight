# GameAd Insight - Docker 部署
# 支持: Render / Railway / Fly.io

# ═══════ 第一阶段: 构建前端 ═══════
FROM node:22-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ═══════ 第二阶段: 运行后端 ═══════
FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl && \
    rm -rf /var/lib/apt/lists/*

# 复制后端依赖并安装
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY backend/ ./backend/

# 从第一阶段复制前端构建产物
COPY --from=frontend-builder /app/frontend/dist/ ./backend/static/

# 数据目录
RUN mkdir -p /app/backend/data/monitor_snapshots

EXPOSE 8000

# 启动 FastAPI
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]

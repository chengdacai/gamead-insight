# GameAd Insight - Docker 部署
# 支持: Render / Railway / Fly.io / 任意云服务器

FROM python:3.13-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl && \
    rm -rf /var/lib/apt/lists/*

# 复制后端代码和依赖
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY backend/ ./backend/
WORKDIR /app/backend

# 构建前端 (使用 node)
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm && \
    cd /app/frontend && npm ci && npm run build && \
    cp -r dist/* ../backend/static/ && \
    apt-get purge -y nodejs npm && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 数据目录 (持久化挂载点)
RUN mkdir -p /app/data /app/data/monitor_snapshots /app/data/app_history /app/data/gp_history

EXPOSE 8000

# 启动命令: FastAPI + 自动监控
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

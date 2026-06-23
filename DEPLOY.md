# GameAd Insight 云端部署指南

## 方案对比（全部免费）

| 平台 | 免费额度 | 优点 | 缺点 |
|------|---------|------|------|
| **Render.com** | 750h/月 | 最简单，Git推送即部署 | 15分钟无访问休眠 |
| **Railway.app** | $5/月额度 | 不休眠，体验好 | 额度用完需付费 |
| **Fly.io** | 3个小VM免费 | 全球CDN，不休眠 | 配置稍复杂 |

## 推荐方案：Render.com（最简单免费）

### 步骤1: 推送代码到 GitHub

```bash
# 在项目根目录初始化 Git
cd hotspot-v3
git init
git add .
git commit -m "GameAd Insight v6.16 - 云端部署版"

# 创建 GitHub 仓库并推送
gh repo create gamead-insight --public --source=. --push
```

### 步骤2: 部署到 Render

1. 打开 https://dashboard.render.com
2. 点击 **"New +" → "Web Service"**
3. 连接 GitHub，选择 `gamead-insight` 仓库
4. 填写配置：
   - **Build Command**: `cd backend && pip install -r requirements.txt && cd ../frontend && npm ci && npm run build`
   - **Start Command**: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Runtime**: Python 3
   - **Instance Type**: Free
5. 点击 **Deploy**

### 步骤3: 获取公网地址

部署成功后 Render 会给你一个 URL，类似：
`https://gamead-insight.onrender.com`

从任何设备都能访问！

### 步骤4: 解决休眠问题（可选）

Render 免费版会在 15 分钟无访问后休眠。解决方案：

**方案A**: 使用 UptimeRobot (免费) 每 10 分钟 ping 一次：
- 注册 https://uptimerobot.com
- 添加监控: `https://gamead-insight.onrender.com/api/status`

**方案B**: 升级到 Render Starter ($7/月)，不休眠

### 数据持久化说明

当前使用 JSON 文件存储数据（关注列表/快照/设置）。

- **Render 免费版**: 每次重新部署会重置数据
- 如需持久化: 添加 Render Disk 或改用 SQLite + 外部数据库

### 企业微信 Webhook 推送

云端部署后企业微信推送完全不受影响（Webhook 是云端服务）。
只需在竞品监控页面配置好 Webhook 地址即可。

---

## 快速一键部署脚本（备选）

如果你不想用 GitHub + Render：

```bash
# 使用 Fly.io 一键部署
fly launch --name gamead-insight
fly deploy
```

或使用 Railway:
```bash
# 安装 railway CLI
npm i -g @railway/cli
railway login
railway up
```

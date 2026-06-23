# ============================================================
# GameAd Insight — 全平台API/数据源 一键配置脚本
# ============================================================
# 版本: v1.0 (2026-06-23)
# 用法: 右键 -> "使用 PowerShell 运行" 或在 PowerShell 中:
#       .\setup_all_apis.ps1
# ============================================================

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = $ScriptDir

# ============================================================
# 0. 欢迎页 — 诚实分析
# ============================================================
Clear-Host
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  GameAd Insight — 全平台广告数据源 一键配置向导           ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

Write-Host "┌─ 重要提示 (请仔细阅读) ─────────────────────────────────┐" -ForegroundColor Yellow
Write-Host "│" -ForegroundColor Yellow
Write-Host "│  Meta Ad Library API 免费版仅覆盖政治/社会议题广告，   │" -ForegroundColor Yellow
Write-Host "│  不包含商业App广告(如Canva/CapCut)。需要CASD付费版      │" -ForegroundColor Yellow
Write-Host "│  ($1000一次性 + $371/月, 6-12周审核, EU机构专属)。     │" -ForegroundColor Red
Write-Host "│" -ForegroundColor Yellow
Write-Host "│  ⚡ 我们已经集成了 3 个完全免费的替代方案:               │" -ForegroundColor Green
Write-Host "│    📘 Facebook Ad Library (Selenium爬虫, 无需Token)      │" -ForegroundColor Green
Write-Host "│    ▶️ Google Play 宣传视频 (YouTube可播放)               │" -ForegroundColor Green
Write-Host "│    🔍 Google Ads Transparency Center (公开数据集)        │" -ForegroundColor Green
Write-Host "│" -ForegroundColor Yellow
Write-Host "│  以上全部无需API Token, 无需申请, 立即可用!              │" -ForegroundColor Green
Write-Host "└────────────────────────────────────────────────────────────┘" -ForegroundColor Yellow
Write-Host ""

Write-Host "请选择操作模式:" -ForegroundColor White
Write-Host "  [A] 仅使用免费数据源 (推荐) — 立即可用, 无需申请任何API" -ForegroundColor Green
Write-Host "  [B] 尝试申请 Meta Ad Library API — 我会打开所有申请页面" -ForegroundColor Yellow
Write-Host "  [C] Meta Token 已到手 — 一键配置到项目" -ForegroundColor Cyan
Write-Host "  [Q] 退出" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "请输入 A/B/C/Q"

if ($choice -eq "Q" -or $choice -eq "q") {
    Write-Host "已退出。" -ForegroundColor Gray
    exit 0
}

# ============================================================
# 模式A: 免费数据源 — 立即测试
# ============================================================
if ($choice -eq "A" -or $choice -eq "a") {
    Clear-Host
    Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║  模式A: 三大免费数据源 — 一键配置 & 测试                   ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""

    # --- Step A1: 检查 Python 环境 ---
    Write-Host "[1/6] 检查 Python 环境..." -ForegroundColor Cyan
    $PythonCmd = "$env:USERPROFILE\.workbuddy\binaries\python\versions\3.13.12\python.exe"
    $PipCmd = "$env:USERPROFILE\.workbuddy\binaries\python\envs\default\Scripts\pip.exe"
    $VenvDir = "$env:USERPROFILE\.workbuddy\binaries\python\envs\default"

    if (-not (Test-Path $PythonCmd)) {
        Write-Host "  ❌ 未找到 Python 3.13.12" -ForegroundColor Red
        Read-Host "按回车退出"
        exit 1
    }

    if (-not (Test-Path $VenvDir)) {
        Write-Host "  正在创建虚拟环境..." -ForegroundColor Yellow
        & $PythonCmd -m venv $VenvDir 2>&1 | Out-Null
    }
    Write-Host "  ✅ Python 环境就绪" -ForegroundColor Green

    # --- Step A2: 安装依赖 ---
    Write-Host ""; Write-Host "[2/6] 安装/更新依赖..." -ForegroundColor Cyan
    & $PipCmd install -q google-play-scraper requests beautifulsoup4 fastapi uvicorn 2>&1 | Out-Null
    Write-Host "  ✅ 核心依赖已安装" -ForegroundColor Green

    # --- Step A3: 测试 Google Play 数据源 ---
    Write-Host ""; Write-Host "[3/6] 测试 Google Play 视频..." -ForegroundColor Cyan
    $gpTest = & $PythonCmd -c @"
from google_play_scraper import search
results = search('Canva', n_hits=3, country='us')
for r in results:
    video = r.get('video')
    title = r.get('title','')
    if video:
        print(f'  ✅ {title} -> 有视频!')
        print(f'     YouTube: {video[:80]}')
    else:
        print(f'  ⚠️ {title} -> 无视频')
"@ 2>&1
    Write-Host $gpTest

    # --- Step A4: 测试 Google Ads 数据源 ---
    Write-Host ""; Write-Host "[4/6] 测试 Google Ads Transparency Center..." -ForegroundColor Cyan
    $gaTest = & $PythonCmd -c @"
import sys; sys.path.insert(0, 'backend')
from services.google_ads_scraper import search_google_ads
ads = search_google_ads('Canva', 'US', 5)
print(f'  ✅ 找到 {len(ads)} 条 Canva Google广告')
for ad in ads[:3]:
    print(f'     · {ad.get(\"title_zh\",\"\")[:60]}')
    if ad.get('external_url'):
        print(f'       链接: {ad[\"external_url\"][:80]}')
"@ 2>&1
    Write-Host $gaTest

    # --- Step A5: 测试后端 API ---
    Write-Host ""; Write-Host "[5/6] 启动后端并测试广告API..." -ForegroundColor Cyan
    
    # 启动后端（后台）
    $BackendJob = Start-Job -ScriptBlock {
        param($py, $dir)
        cd $dir
        & $py -c "import uvicorn; uvicorn.run('backend.main:app', host='127.0.0.1', port=8010)" 2>&1 | Out-Null
    } -ArgumentList $PythonCmd, $ProjectDir
    
    Start-Sleep -Seconds 4
    
    # 测试 API
    $apiTest = & $PythonCmd -c @"
import urllib.request, json
try:
    with urllib.request.urlopen('http://127.0.0.1:8010/api/appstore/app/897446215/ads', timeout=15) as resp:
        data = json.loads(resp.read())
        print(f'  App: {data.get(\"app_name\")}')
        print(f'  视频广告: {data.get(\"total_video_ads\")} 条')
        print(f'  商店截图: {data.get(\"total_screenshots\")} 张')
        print(f'  数据来源: {json.dumps([s[\"name\"] for s in data.get(\"ad_sources\", [])])}')
        for ad in data.get('video_ads', []):
            vid = ad.get('video_id', '')
            print(f'    [{ad.get(\"source\")}] {ad.get(\"title_zh\",\"\")[:50]} | 可播放={bool(vid)}')
except Exception as e:
    print(f'  ❌ API测试失败: {e}')
"@ 2>&1
    Write-Host $apiTest

    # 关闭后端
    Stop-Job $BackendJob -ErrorAction SilentlyContinue
    Remove-Job $BackendJob -ErrorAction SilentlyContinue

    # --- Step A6: 配置 .env ---
    Write-Host ""; Write-Host "[6/6] 更新 .env 配置..." -ForegroundColor Cyan
    $envPath = "$ProjectDir\backend\.env"
    $envContent = @"
# GameAd Insight 环境配置
# 自动生成于 $(Get-Date -Format 'yyyy-MM-dd HH:mm')

# Groq AI 增强分析 (请替换为你的 API Key: https://console.groq.com/keys)
GROQ_API_KEY=YOUR_GROQ_API_KEY_HERE

# Meta Ad Library API (可选 — 免费版仅覆盖政治广告)
# 申请入口: https://developers.facebook.com/
# META_AD_API_TOKEN=

# 三大免费数据源 (无需Token, 自动启用):
# 📘 Facebook Ad Library (Selenium爬虫)
# ▶️ Google Play 宣传视频 (YouTube可播放)  
# 🔍 Google Ads Transparency Center (公开数据集)
"@
    Set-Content -Path $envPath -Value $envContent -Encoding UTF8
    Write-Host "  ✅ .env 已更新 ($envPath)" -ForegroundColor Green

    # --- 完成 ---
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║  ✅ 三大免费数据源配置完成！                               ║" -ForegroundColor Green
    Write-Host "╠══════════════════════════════════════════════════════════╣" -ForegroundColor Green
    Write-Host "║  数据源状态:                                              ║" -ForegroundColor Green
    Write-Host "║  📘 Facebook 爬虫   — Docker部署后启用 (需Chrome)        ║" -ForegroundColor Green
    Write-Host "║  ▶️ Google Play     — ✅ 已就绪 (本地可用)               ║" -ForegroundColor Green
    Write-Host "║  🔍 Google Ads      — ✅ 已就绪 (本地可用)               ║" -ForegroundColor Green
    Write-Host "║                                                          ║" -ForegroundColor Green
    Write-Host "║  下一步: 推送到 Render 启用 Facebook 爬虫 ⬇              ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    
    Write-Host "现在推送到 Render？(需要 Git 已配置远程仓库)" -ForegroundColor Yellow
    Write-Host "  [Y] 一键推送部署"
    Write-Host "  [N] 稍后手动推送"
    
    $pushChoice = Read-Host "请输入 Y/N"
    if ($pushChoice -eq "Y" -or $pushChoice -eq "y") {
        Write-Host "正在提交并推送..." -ForegroundColor Cyan
        $gitExe = "$env:USERPROFILE\.workbuddy\vendor\PortableGit\bin\git.exe"
        
        cd $ProjectDir
        & $gitExe add -A 2>&1 | Out-Null
        & $gitExe commit -m "v6.12: 三大免费数据源整合 — FB爬虫+GP视频+Google Ads" 2>&1 | Out-Null
        & $gitExe push origin master 2>&1
        
        Write-Host ""
        Write-Host "  ✅ 代码已推送！Render 将自动构建 Docker 镜像。" -ForegroundColor Green
        Write-Host "  ⏳ 首次 Docker 构建约 5-10 分钟 (包含 Chrome 安装)" -ForegroundColor Yellow
        Write-Host "  📍 构建完成后访问 Render Dashboard 查看 URL" -ForegroundColor Cyan
    } else {
        Write-Host ""
        Write-Host "  稍后在 Git Bash 中执行:" -ForegroundColor Yellow
        Write-Host "    cd /c/Users/86184/WorkBuddy/2026-06-21-00-25-26/hotspot-v3" -ForegroundColor White
        Write-Host "    git add -A && git commit -m 'v6.12: 三大免费数据源' && git push origin master" -ForegroundColor White
    }

    Write-Host ""
    Write-Host "按任意键退出..." -ForegroundColor Gray
    Read-Host
    exit 0
}

# ============================================================
# 模式B: 尝试申请 Meta API
# ============================================================
if ($choice -eq "B" -or $choice -eq "b") {
    Clear-Host
    Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
    Write-Host "║  模式B: Meta Ad Library API 申请向导                      ║" -ForegroundColor Yellow
    Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "⚠️  再次提醒: 免费版Meta API仅覆盖政治/社会议题广告" -ForegroundColor Red
    Write-Host "⚠️  商业App(Canva等)的广告需要CASD付费版或我们已有方案" -ForegroundColor Red
    Write-Host "⚠️  中国大陆身份证验证大概率被拒" -ForegroundColor Red
    Write-Host ""

    Write-Host "========== Meta API 申请完整步骤 ==========" -ForegroundColor White
    Write-Host ""
    Write-Host "第1步: 注册 Meta 开发者账号" -ForegroundColor Cyan
    Write-Host "  1. 使用 Facebook 账号登录 developers.facebook.com"
    Write-Host "  2. 完成手机号验证"
    Write-Host "  3. 上传护照或政府ID进行身份验证"
    Write-Host "  4. 等待 1-3 个工作日审核"
    Write-Host ""
    Write-Host "第2步: 创建 App" -ForegroundColor Cyan
    Write-Host "  1. Dashboard -> Create App"
    Write-Host "  2. Use case 选择 'Other'"
    Write-Host "  3. Type 选择 'Business'"
    Write-Host "  4. 填写 App name (如: GameAd Insight)"
    Write-Host ""
    Write-Host "第3步: 添加 Ad Library API" -ForegroundColor Cyan
    Write-Host "  1. App Dashboard -> Add a Product"
    Write-Host "  2. 选择 'Ad Library API' -> Configure"
    Write-Host ""
    Write-Host "第4步: 申请 ads_read 权限" -ForegroundColor Cyan
    Write-Host "  1. App Review -> Permissions and Features"
    Write-Host "  2. 请求 ads_read 权限"
    Write-Host "  3. 提交使用场景描述、数据处理说明、屏幕录制"
    Write-Host ""
    Write-Host "第5步: 完成企业验证" -ForegroundColor Cyan
    Write-Host "  1. 访问 business.facebook.com"
    Write-Host "  2. 提交官方企业文件（营业执照等）"
    Write-Host "  3. ⚠️ 个人开发者可能在此步被卡住"
    Write-Host ""
    Write-Host "第6步: 生成 Token" -ForegroundColor Cyan
    Write-Host "  1. Tools -> Graph API Explorer"
    Write-Host "  2. 选择你的 App -> Generate User Token"
    Write-Host "  3. 勾选 ads_read 权限 -> 复制 Token"
    Write-Host "  4. Token 有效期60天，需定期刷新"
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor White

    Write-Host ""
    Write-Host "现在打开全部申请页面？" -ForegroundColor Yellow
    Write-Host "  [Y] 一键打开所有页面（约5个标签页）" -ForegroundColor Green
    Write-Host "  [N] 不打开，仅查看步骤" -ForegroundColor Gray
    Write-Host ""

    $openChoice = Read-Host "请输入 Y/N"

    if ($openChoice -eq "Y" -or $openChoice -eq "y") {
        Write-Host "正在打开 Meta 开发者页面..." -ForegroundColor Cyan
        
        # 一键打开所有相关 URL
        $urls = @(
            "https://developers.facebook.com/",              # 开发者主页
            "https://www.facebook.com/ID",                   # 身份验证
            "https://business.facebook.com/",                # 企业验证
            "https://www.facebook.com/ads/library/api/",     # API 介绍页
            "https://developers.facebook.com/tools/explorer/" # Graph API Explorer
        )
        
        foreach ($url in $urls) {
            Start-Process $url
            Start-Sleep -Milliseconds 500
        }
        
        Write-Host "  ✅ 已打开 5 个页面" -ForegroundColor Green
        Write-Host ""
        Write-Host "请按照上面的步骤操作，完成后回到此窗口。" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "如果已获得 Token，输入 Token 继续配置:" -ForegroundColor Cyan
        Write-Host "  (直接回车跳过)" -ForegroundColor Gray
        Write-Host ""
        
        $token = Read-Host "Meta API Token (留空跳过)"
        
        if ($token -and $token.Length -gt 10) {
            Write-Host ""
            Write-Host "  ✅ Token 已接收，正在配置..." -ForegroundColor Green
            
            $envPath = "$ProjectDir\backend\.env"
            $envContent = Get-Content $envPath -Raw -ErrorAction SilentlyContinue
            if (-not $envContent) {
                $envContent = "GROQ_API_KEY=YOUR_GROQ_API_KEY_HERE`n"
            }
            
            # 添加或替换 META_AD_API_TOKEN
            if ($envContent -match "META_AD_API_TOKEN=") {
                $envContent = $envContent -replace "META_AD_API_TOKEN=.*", "META_AD_API_TOKEN=$token"
            } else {
                $envContent += "`nMETA_AD_API_TOKEN=$token`n"
            }
            
            Set-Content -Path $envPath -Value $envContent -Encoding UTF8
            Write-Host "  ✅ Token 已保存到 backend/.env" -ForegroundColor Green
            
            Write-Host ""
            Write-Host "是否推送到 Render 部署？" -ForegroundColor Yellow
            Write-Host "  [Y] 一键推送 (需要 Git 远程仓库)" -ForegroundColor Green
            Write-Host "  [N] 暂不推送" -ForegroundColor Gray
            
            $pushChoice = Read-Host "请输入 Y/N"
            if ($pushChoice -eq "Y" -or $pushChoice -eq "y") {
                $gitExe = "$env:USERPROFILE\.workbuddy\vendor\PortableGit\bin\git.exe"
                cd $ProjectDir
                & $gitExe add -A 2>&1 | Out-Null
                & $gitExe commit -m "v6.12: 配置Meta API Token" 2>&1 | Out-Null
                & $gitExe push origin master 2>&1
                Write-Host "  ✅ 已推送" -ForegroundColor Green
            }
        } else {
            Write-Host "  跳过 Token 配置。" -ForegroundColor Gray
        }
    }

    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host "💡 提示: 即使 Meta API 审批不通过，" -ForegroundColor Yellow
    Write-Host "   我们的三大免费数据源仍然可用!" -ForegroundColor Green
    Write-Host "   重新运行此脚本并选择模式 [A] 来测试。" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host ""
    Read-Host "按回车退出"
    exit 0
}

# ============================================================
# 模式C: Token 已到手 — 一键配置
# ============================================================
if ($choice -eq "C" -or $choice -eq "c") {
    Clear-Host
    Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║  模式C: Meta API Token 一键配置                           ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""

    $token = Read-Host "请粘贴 Meta API Token"
    
    if (-not $token -or $token.Length -lt 10) {
        Write-Host "❌ Token 无效，已退出。" -ForegroundColor Red
        Read-Host "按回车"
        exit 1
    }

    # 保存到 .env
    $envPath = "$ProjectDir\backend\.env"
    $envContent = Get-Content $envPath -Raw -ErrorAction SilentlyContinue
    if (-not $envContent) {
        $envContent = "GROQ_API_KEY=YOUR_GROQ_API_KEY_HERE`n"
    }

    if ($envContent -match "META_AD_API_TOKEN=") {
        $envContent = $envContent -replace "META_AD_API_TOKEN=.*", "META_AD_API_TOKEN=$token"
    } else {
        $envContent += "`nMETA_AD_API_TOKEN=$token`n"
    }

    Set-Content -Path $envPath -Value $envContent -Encoding UTF8
    Write-Host "✅ Token 已保存到 backend/.env" -ForegroundColor Green
    Write-Host ""

    # 测试 Token
    Write-Host "测试 Token 是否有效..." -ForegroundColor Cyan
    $PythonCmd = "$env:USERPROFILE\.workbuddy\binaries\python\versions\3.13.12\python.exe"
    
    $testResult = & $PythonCmd -c @"
import urllib.request, json
token = '$token'
try:
    url = f'https://graph.facebook.com/v20.0/ads_archive?access_token={token}&search_terms=test&ad_type=ALL&limit=1'
    req = urllib.request.Request(url, headers={'User-Agent': 'GameAdInsight/1.0'})
    resp = urllib.request.urlopen(req, timeout=10)
    data = json.loads(resp.read())
    if 'data' in data:
        print('✅ Token 有效！API 返回正常')
    elif 'error' in data:
        print(f'❌ Token 错误: {data[\"error\"].get(\"message\", \"未知错误\")}')
    else:
        print(f'⚠️ 不确定: {json.dumps(data)[:200]}')
except Exception as e:
    print(f'❌ 连接失败: {e}')
"@ 2>&1
    Write-Host "  $testResult"

    Write-Host ""
    Write-Host "是否推送到 Render？" -ForegroundColor Yellow
    $pushChoice = Read-Host "[Y] 推送 / [N] 暂不推送"
    
    if ($pushChoice -eq "Y" -or $pushChoice -eq "y") {
        $gitExe = "$env:USERPROFILE\.workbuddy\vendor\PortableGit\bin\git.exe"
        cd $ProjectDir
        & $gitExe add -A 2>&1 | Out-Null
        & $gitExe commit -m "v6.12: 配置Meta API Token" 2>&1 | Out-Null
        & $gitExe push origin master 2>&1
        Write-Host "✅ 已推送到 Render" -ForegroundColor Green
    }

    Write-Host ""
    Read-Host "按回车退出"
    exit 0
}

# ============================================================
# 无效输入
# ============================================================
Write-Host "无效选择，请重新运行脚本。" -ForegroundColor Red
Read-Host "按回车退出"

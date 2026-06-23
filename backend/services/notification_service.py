"""
通知渠道服务 v2.1

唯一推送渠道：企业微信应用消息 — WeCom App Message API (corpid + agentid + secret)
消息直接推送到用户的企业微信消息列表，无需群聊，无需机器人。

使用方式：
    from services.notification_service import push_notification
    result = push_notification(title="发现新广告", body="Canva 更新了宣传视频")
"""

import json
import os
import requests as sync_requests
from typing import Optional

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
NOTIFY_SETTINGS_FILE = os.path.join(DATA_DIR, "monitor_settings.json")

# WeCom App 消息 token 缓存
_WECOM_ACCESS_TOKEN = None
_WECOM_TOKEN_EXPIRES = 0


def _load_json(path: str, default=None):
    if not os.path.exists(path):
        return default if default is not None else {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return default if default is not None else {}


def get_notify_channels() -> dict:
    """
    获取配置的通知渠道
    返回: {
        "wecom_app": {"enabled": bool, "corpid": str, "agentid": int, "configured": bool},
        "wecom": {"enabled": bool, "webhooks": [...]},
        "serverchan": {"enabled": bool, "send_keys": [...]},
    }
    """
    settings = _load_json(NOTIFY_SETTINGS_FILE, {})
    return {
        "wecom_app": {
            "enabled": settings.get("wecom_app_enabled", True),
            "corpid": settings.get("wecom_corpid", ""),
            "agentid": settings.get("wecom_agentid", 0),
            "configured": bool(settings.get("wecom_corpid") and settings.get("wecom_agentid") and settings.get("wecom_secret")),
        },
        "wecom": {
            "enabled": settings.get("wecom_enabled", True),
            "webhooks": settings.get("wecom_webhooks", []),
        },
        "serverchan": {
            "enabled": settings.get("serverchan_enabled", True),
            "send_keys": settings.get("serverchan_send_keys", []),
        },
    }


# ============ 渠道 1: 企业微信应用消息 (WeCom App Message API) ============

def _get_wecom_access_token() -> Optional[str]:
    """获取企业微信 access_token（带缓存）"""
    global _WECOM_ACCESS_TOKEN, _WECOM_TOKEN_EXPIRES
    import time

    # 缓存有效（提前 5 分钟刷新）
    if _WECOM_ACCESS_TOKEN and time.time() < _WECOM_TOKEN_EXPIRES - 300:
        return _WECOM_ACCESS_TOKEN

    settings = _load_json(NOTIFY_SETTINGS_FILE, {})
    corpid = settings.get("wecom_corpid", "")
    secret = settings.get("wecom_secret", "")

    if not corpid or not secret:
        print("[Notify] 企业微信应用未配置 corpid/secret")
        return None

    try:
        resp = sync_requests.get(
            f"https://qyapi.weixin.qq.com/cgi-bin/gettoken",
            params={"corpid": corpid, "corpsecret": secret},
            timeout=10,
        )
        data = resp.json()
        if data.get("errcode") == 0 and data.get("access_token"):
            _WECOM_ACCESS_TOKEN = data["access_token"]
            _WECOM_TOKEN_EXPIRES = time.time() + data.get("expires_in", 7200)
            return _WECOM_ACCESS_TOKEN
        else:
            print(f"[Notify] 获取 access_token 失败: {data}")
            return None
    except Exception as e:
        print(f"[Notify] 获取 access_token 异常: {e}")
        return None


def push_wecom_app(title: str, body: str) -> dict:
    """
    推送企业微信应用消息（直接发到用户的消息列表）
    使用 Markdown 格式

    配置方式：
    1. 企业微信管理后台 → 应用管理 → 创建应用
    2. 获取 corpid、agentid、secret
    3. 在设置中填入即可
    """
    settings = _load_json(NOTIFY_SETTINGS_FILE, {})
    corpid = settings.get("wecom_corpid", "")
    agentid = settings.get("wecom_agentid", 0)
    secret = settings.get("wecom_secret", "")

    if not corpid or not agentid or not secret:
        return {"success": 0, "total": 0, "results": [], "message": "企业微信应用未完整配置 (需 corpid + agentid + secret)"}

    token = _get_wecom_access_token()
    if not token:
        return {"success": 0, "total": 1, "results": [{"channel": "wecom_app", "status": "fail", "error": "获取 access_token 失败"}], "message": "无法获取 access_token"}

    # 构建 Markdown 消息
    content = f"## {title}\n{body}"

    try:
        payload = {
            "touser": "@all",
            "msgtype": "markdown",
            "agentid": agentid,
            "markdown": {
                "content": content,
            }
        }
        resp = sync_requests.post(
            f"https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token={token}",
            json=payload,
            timeout=10,
        )
        data = resp.json()
        if data.get("errcode") == 0:
            return {"success": 1, "total": 1, "results": [{"channel": "wecom_app", "status": "ok"}]}
        else:
            err_msg = data.get("errmsg", str(data))
            print(f"[Notify] 企业微信应用发送失败: {err_msg}")
            return {"success": 0, "total": 1, "results": [{"channel": "wecom_app", "status": "fail", "error": err_msg}]}
    except Exception as e:
        print(f"[Notify] 企业微信应用发送异常: {e}")
        return {"success": 0, "total": 1, "results": [{"channel": "wecom_app", "status": "fail", "error": str(e)}]}


# ============ 渠道 2: 企业微信机器人 (备用) ============

def push_wecom_webhook(title: str, body: str, webhooks: list[str]) -> dict:
    """推送企业微信群机器人 (Webhook 方式，备用)"""
    if not webhooks:
        return {"success": 0, "total": 0, "results": [], "message": "未配置 Webhook"}

    results = []
    success = 0

    for url in webhooks:
        try:
            payload = {
                "msgtype": "markdown",
                "markdown": {
                    "content": f"## {title}\n\n{body}",
                }
            }
            resp = sync_requests.post(url, json=payload, timeout=10)
            if resp.status_code == 200 and resp.json().get("errcode") == 0:
                success += 1
                results.append({"channel": "wecom_webhook", "status": "ok", "url": url[:60]})
            else:
                results.append({"channel": "wecom_webhook", "status": "fail", "url": url[:60], "error": str(resp.text[:100])})
        except Exception as e:
            results.append({"channel": "wecom_webhook", "status": "fail", "url": url[:60], "error": str(e)})

    return {"success": success, "total": len(webhooks), "results": results}


# ============ 渠道 3: Server酱 (普通微信可用) ============

SERVERCHAN_API = "https://sctapi.ftqq.com"


def push_serverchan(title: str, body: str, send_keys: list[str]) -> dict:
    """推送 Server酱"""
    if not send_keys:
        return {"success": 0, "total": 0, "results": [], "message": "未配置 SendKey"}

    results = []
    success = 0

    for key in send_keys:
        try:
            resp = sync_requests.post(
                f"{SERVERCHAN_API}/{key}.send",
                data={"title": title, "desp": body},
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == 0:
                    success += 1
                    results.append({"channel": "serverchan", "status": "ok", "key": key[:20] + "..."})
                else:
                    msg = data.get("message", data.get("info", ""))
                    if "success" in str(msg).lower() or data.get("code", 0) < 400:
                        success += 1
                        results.append({"channel": "serverchan", "status": "ok", "key": key[:20] + "...", "note": msg})
                    else:
                        results.append({"channel": "serverchan", "status": "fail", "key": key[:20] + "...", "error": msg})
            else:
                results.append({"channel": "serverchan", "status": "fail", "key": key[:20] + "...", "error": f"HTTP {resp.status_code}"})
        except Exception as e:
            results.append({"channel": "serverchan", "status": "fail", "key": key[:20] + "...", "error": str(e)})

    return {"success": success, "total": len(send_keys), "results": results}


# ============ 统一推送接口 ============

def push_notification(title: str, body: str, channels: list[str] = None) -> dict:
    """
    统一推送接口

    优先级：企业微信应用 > 企业微信Webhook > Server酱

    返回: {total_channels, success_channels, total_targets, success_targets, details: [...]}
    """
    notify = get_notify_channels()
    all_results = []

    if channels is None:
        channels = []
        # 仅使用企业微信应用消息
        if notify["wecom_app"]["enabled"] and notify["wecom_app"]["configured"]:
            channels.append("wecom_app")

    # 企业微信应用消息
    if "wecom_app" in channels and notify["wecom_app"]["enabled"]:
        r = push_wecom_app(title, body)
        all_results.append({"channel_type": "wecom_app", **r})

    # 企业微信 Webhook（备用）
    if "wecom_webhook" in channels and notify["wecom"]["enabled"]:
        r = push_wecom_webhook(title, body, notify["wecom"]["webhooks"])
        all_results.append({"channel_type": "wecom_webhook", **r})

    # Server酱
    if "serverchan" in channels and notify["serverchan"]["enabled"]:
        r = push_serverchan(title, body, notify["serverchan"]["send_keys"])
        all_results.append({"channel_type": "serverchan", **r})

    total_targets = sum(r.get("total", 0) for r in all_results)
    success_targets = sum(r.get("success", 0) for r in all_results)

    return {
        "total_channels": len(all_results),
        "success_channels": sum(1 for r in all_results if r.get("success", 0) > 0),
        "total_targets": total_targets,
        "success_targets": success_targets,
        "details": all_results,
    }


# ============ 测试推送 ============

def test_push(channel: str = None) -> dict:
    """测试推送"""
    test_body = (
        f"✅ **GameAd Insight 测试消息**\n\n"
        f"如果你收到这条消息，说明通知配置正确！\n\n"
        f"---\n"
        f"> 监控服务将在发现竞品新广告时自动推送通知\n"
    )

    if channel:
        return push_notification("🧪 GameAd Insight 测试", test_body, channels=[channel])

    return push_notification("🧪 GameAd Insight 测试", test_body)

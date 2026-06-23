"""
通知渠道服务 v1.0

支持的渠道：
1. 企业微信机器人 — 企业微信群机器人 Webhook
2. Server酱 (sct.ftqq.com) — 普通微信用户可用，扫码关注公众号即可
3. 邮件通知 — SMTP 邮件

使用方式：
    from services.notification_service import push_notification
    result = push_notification(title="发现新广告", body="Canva 更新了宣传视频", channels=["serverchan", "wecom"])
"""

import json
import os
import requests as sync_requests
from typing import Optional

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
NOTIFY_SETTINGS_FILE = os.path.join(DATA_DIR, "monitor_settings.json")


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
        "wecom": {"enabled": bool, "webhooks": [...]},
        "serverchan": {"enabled": bool, "send_keys": [...]},
        "email": {"enabled": bool, "addresses": [...]}
    }
    """
    settings = _load_json(NOTIFY_SETTINGS_FILE, {})
    return {
        "wecom": {
            "enabled": settings.get("wecom_enabled", True),
            "webhooks": settings.get("wecom_webhooks", []),
        },
        "serverchan": {
            "enabled": settings.get("serverchan_enabled", True),
            "send_keys": settings.get("serverchan_send_keys", []),
        },
    }


# ============ 渠道 1: 企业微信机器人 ============

def push_wecom(title: str, body: str, webhooks: list[str]) -> dict:
    """
    推送企业微信机器人
    body 支持 Markdown 格式
    """
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
                results.append({"channel": "wecom", "status": "ok", "url": url[:60]})
            else:
                results.append({"channel": "wecom", "status": "fail", "url": url[:60], "error": str(resp.text[:100])})
        except Exception as e:
            results.append({"channel": "wecom", "status": "fail", "url": url[:60], "error": str(e)})

    return {"success": success, "total": len(webhooks), "results": results}


# ============ 渠道 2: Server酱 (普通微信可用) ============

SERVERCHAN_API = "https://sctapi.ftqq.com"


def push_serverchan(title: str, body: str, send_keys: list[str]) -> dict:
    """
    推送 Server酱 (sct.ftqq.com)

    注册流程：
    1. 访问 https://sct.ftqq.com/ 微信扫码登录
    2. 在「消息通道」获取 SendKey
    3. 关注「方糖」公众号即可接收推送

    免费额度：每天 5 条
    """
    if not send_keys:
        return {"success": 0, "total": 0, "results": [], "message": "未配置 SendKey"}

    # body 转为纯文本（Server酱 desp 支持 Markdown 但标题用 title 参数）
    results = []
    success = 0

    for key in send_keys:
        try:
            resp = sync_requests.post(
                f"{SERVERCHAN_API}/{key}.send",
                data={
                    "title": title,
                    "desp": body,
                },
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == 0:
                    success += 1
                    results.append({"channel": "serverchan", "status": "ok", "key": key[:20] + "..."})
                else:
                    # code>0 表示成功但有警告（如超过免费额度）
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

    参数:
        title: 通知标题
        body: 通知正文 (支持 Markdown)
        channels: 要使用的渠道列表，默认使用所有已配置的渠道
                  可选: "wecom", "serverchan"

    返回:
        {total_channels: int, success_channels: int, total_targets: int, success_targets: int, details: [...]}
    """
    notify = get_notify_channels()
    all_results = []

    if channels is None:
        channels = []
        if notify["wecom"]["enabled"] and notify["wecom"]["webhooks"]:
            channels.append("wecom")
        if notify["serverchan"]["enabled"] and notify["serverchan"]["send_keys"]:
            channels.append("serverchan")

    # 企业微信
    if "wecom" in channels and notify["wecom"]["enabled"]:
        r = push_wecom(title, body, notify["wecom"]["webhooks"])
        all_results.append({"channel_type": "wecom", **r})

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
    """
    测试推送
    channel: "wecom" | "serverchan" | None (全部)
    """
    test_body = (
        f"✅ **GameAd Insight 测试消息**\n\n"
        f"如果你收到这条消息，说明通知配置正确！\n\n"
        f"---\n"
        f"> 监控服务将在发现竞品新广告时自动推送通知\n"
    )

    if channel:
        return push_notification("🧪 GameAd Insight 测试", test_body, channels=[channel])

    return push_notification("🧪 GameAd Insight 测试", test_body)

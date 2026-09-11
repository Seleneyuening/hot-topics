#!/usr/bin/env python3
"""60s 公共聚合 API 热榜抓取脚本（零依赖，仅标准库）。

用法:
    python3 fetch_60s.py [--max N] [--keyword 关键词] [--platform weibo,zhihu]

输出:
    每个成功平台一行 JSON: {"platform": "weibo", "items": [{"title","hot","url"}]}
    全部失败时: {"error": "..."}（诊断信息走 stderr）

注意:
    - 60s 官方实例（60s.viki.moe）2026-09 起限流严格、常返 403，本脚本会在
      官方 + 社区实例列表间自动故障转移，任一可用即停。
    - 实例全部失败时，微博/知乎/百度/B站四个平台回落到 tophub.today 板块抓取。
    - 热度口径: hot_value/score 为数值或字符串(如 "920.8w")，跨平台不可直接比较。
"""
import json
import sys
import urllib.request

TIMEOUT = 12
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# 60s 实例列表（官方 + 社区，社区名单与提交时间见 docs.60s-api.viki.moe/7306811m0）
INSTANCES = [
    "https://60s.viki.moe",            # 官方（限流严格，仅作首选尝试）
    "https://60s.superjeason.qzz.io",  # 社区 2026-06-08
    "https://60s.zellon.top",          # 社区 2026-05-30
    "https://api.cczo.cc/60s",         # 社区 2026-05-09
    "https://60s.mizhoubaobei.top",    # 社区 2025-11-07
    "https://60s.7se.cn",              # 社区 2025-09-28
    "https://api.elysiayanyu.top",     # 社区 2025-08-30
    "https://60s.crystelf.top",        # 社区 2025-08-29
]

PLATFORMS = {
    "weibo":   {"name": "微博",   "endpoint": "weibo",    "tophub": "KqndgxeLl9"},
    "zhihu":   {"name": "知乎",   "endpoint": "zhihu",    "tophub": "mproPpoq6O"},
    "baidu":   {"name": "百度",   "endpoint": "baidu/hot", "tophub": "Jb0vmloB1G"},
    "douyin":  {"name": "抖音",   "endpoint": "douyin"},
    "toutiao": {"name": "今日头条", "endpoint": "toutiao"},
    "rednote": {"name": "小红书", "endpoint": "rednote"},
    "bili":    {"name": "B站",    "endpoint": "bili",      "tophub": "74KvxwokxM"},
}
# tophub.today 榜单源（腾讯新闻/微信公众号）: 名称 -> (board_id, 展示名, 是否有热度)
TOTHUB_SOURCES = {
    "tencent_news": ("12owgX0oNV", "腾讯新闻", False),
    "wechat_gzh":   ("WnBe01o371", "微信公众号", True),
}

# 字段归一化：各平台响应字段 -> (title, hot, url)
def _norm(item: dict, pf: dict) -> dict:
    title = item.get("title") or item.get("word") or ""
    hot = item.get("hot_value") or item.get("score") or ""
    if hot is None:
        hot = ""
    url = item.get("link") or item.get("url") or ""
    if not url and title:
        url = f"https://s.weibo.com/weibo?q={title}" if pf["endpoint"] == "weibo" else ""
    return {"title": str(title).strip(), "hot": hot, "url": url}


# 本轮运行内记住最近一次成功的实例，后续平台优先用它（减少重试与限流风险）
_LAST_GOOD = {"base": None}


def fetch_platform(pf: dict) -> list:
    """按实例列表依次尝试，任一成功即返回；全部失败抛最后一个异常。"""
    bases = INSTANCES
    if _LAST_GOOD["base"]:
        bases = [_LAST_GOOD["base"]] + [b for b in INSTANCES if b != _LAST_GOOD["base"]]
    last_exc: Exception = ValueError("no instance tried")
    for base in bases:
        try:
            req = urllib.request.Request(f"{base}/v2/{pf['endpoint']}",
                                         headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8", "replace"))
            if data.get("code") != 200:
                raise ValueError(data.get("message", f"bad code {data.get('code')}"))
            items = [_norm(it, pf) for it in (data.get("data") or []) if it.get("title")]
            if not items:
                raise ValueError("empty list")
            _LAST_GOOD["base"] = base
            return items
        except Exception as exc:  # noqa: BLE001 - 换下一个实例
            last_exc = exc
    raise last_exc


# ------------------------------------------------------------------ tophub
def _clean_text(s: str) -> str:
    import re as _re
    import html as _html
    s = _re.sub(r"<[^>]+>", " ", s)
    s = _html.unescape(s)
    return _re.sub(r"\s+", " ", s).strip()


def _is_js_remnant(title: str) -> bool:
    """tophub 页面 script 里的行内模板残渣（如 "' + v.title + '"）。"""
    import re as _re
    return bool(_re.search(r"['`]\s*[+&]|item\.title|v\.title|&#[x0-9a-f]", title))


def fetch_tophub(board_id: str, name: str, has_heat: bool) -> list:
    """抓 tophub.today 板块榜。只解析第一个 <table>（榜单本体），
    标题/链接取自 <a>，热度只认纯数字(+万/亿)，天然避开 script 模板与图标字体。"""
    import re as _re
    req = urllib.request.Request(f"https://tophub.today/n/{board_id}",
                                 headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        doc = resp.read().decode("utf-8", "replace")
    m = _re.search(r"<table.*?</table>", doc, _re.S)
    if not m:
        raise ValueError("页面无榜单表格")
    table = m.group(0)

    out = []
    for row in _re.findall(r"<tr[^>]*>(.*?)</tr>", table, _re.S):
        a = _re.search(r'<a[^>]+href="(https?://[^"]+)"[^>]*>(.*?)</a>', row, _re.S)
        if not a:
            continue
        title = _clean_text(a.group(2))
        if not title or title == "API 开放平台" or _is_js_remnant(title):
            continue
        hot = ""
        if has_heat:
            for cell in _re.findall(r"<td[^>]*>(.*?)</td>", row, _re.S):
                cand = _clean_text(cell)
                # 热度：纯数字(+万/亿/K/W)且非行号（如 "1."、"52"），须含万/亿或 ≥3 位数字
                if _re.fullmatch(r"[\d.,]+\s*[万亿KkWw]?", cand) \
                        and not _re.fullmatch(r"\d{1,3}\.", cand):
                    if _re.search(r"[万亿KkWw]", cand) or len(_re.sub(r"\D", "", cand)) >= 3:
                        hot = cand
                        break
        out.append({"title": title, "hot": hot, "url": a.group(1), "source": name})
    if not out:
        raise ValueError("榜单解析为空")
    return out


def fetch_tophub_fallback(pf: dict) -> list:
    """60s 实例全挂时，用 tophub 同名板块兜底。"""
    board_id = pf.get("tophub")
    if not board_id:
        raise ValueError("无 tophub 兜底板块")
    return fetch_tophub(board_id, pf["name"], True)


# ------------------------------------------------------------------ main
def main() -> int:
    args = sys.argv[1:]
    max_n = 50
    keyword = ""
    platforms = None
    if "--max" in args:
        try:
            max_n = int(args[args.index("--max") + 1])
        except (ValueError, IndexError):
            pass
    if "--keyword" in args:
        try:
            keyword = args[args.index("--keyword") + 1]
        except IndexError:
            pass
    if "--platform" in args:
        try:
            platforms = [p.strip() for p in args[args.index("--platform") + 1].split(",")]
        except IndexError:
            pass

    def emit(key: str, items: list) -> None:
        nonlocal ok
        if keyword:
            items = [it for it in items if keyword in it["title"]]
        items = items[:max_n]
        if not items and not keyword:
            raise ValueError("empty list")
        print(json.dumps({"platform": key, "items": items}, ensure_ascii=False))
        ok += 1

    ok = failed = 0
    for key, pf in PLATFORMS.items():
        if platforms and key not in platforms:
            continue
        try:
            emit(key, fetch_platform(pf))
        except Exception as exc:  # noqa: BLE001 - 逐平台容错
            try:
                emit(key, fetch_tophub_fallback(pf))
                print(f"# {key}: 60s 全实例失败，已回落 tophub（{type(exc).__name__}: {exc}）",
                      file=sys.stderr)
            except Exception:  # noqa: BLE001
                print(json.dumps({"platform": key, "error": f"{type(exc).__name__}: {exc}"},
                                 ensure_ascii=False, default=str), file=sys.stderr)
                failed += 1

    # tophub 榜单源（腾讯新闻/微信公众号）
    for key, (board_id, name, has_heat) in TOTHUB_SOURCES.items():
        if platforms and key not in platforms:
            continue
        try:
            emit(key, fetch_tophub(board_id, name, has_heat))
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({"platform": key, "error": f"{type(exc).__name__}: {exc}"},
                             ensure_ascii=False, default=str), file=sys.stderr)
            failed += 1

    if ok == 0:
        print(json.dumps({"error": "all platforms failed"}, ensure_ascii=False))
    print(f"# summary: ok={ok} failed={failed}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""本地热榜抓取脚本（完全直连各平台原生官方接口，不依赖 60s/tophub 等第三方中间商）。

用法:
    python3 fetch_local.py [--max N] [--keyword 关键词] [--platform weibo,baidu,douyin,toutiao,bilibili,zhihu,ithome]
"""

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request

TIMEOUT = 8
UA_CHROME = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
UA_ZHIHU = "ZhihuHybrid DefaultPack/1.0.0 Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)"


def fetch_url(url, headers=None):
    h = {"User-Agent": UA_CHROME}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.read().decode("utf-8", "replace")


def get_weibo():
    txt = fetch_url("https://weibo.com/ajax/side/hotSearch", {"Referer": "https://weibo.com"})
    data = json.loads(txt)
    items = []
    for x in data.get("data", {}).get("realtime", []):
        w = x.get("word") or x.get("note") or ""
        if w:
            items.append({
                "title": w,
                "hot": str(x.get("num") or x.get("raw_hot") or ""),
                "url": f"https://s.weibo.com/weibo?q={urllib.parse.quote(w)}"
            })
    return items


def get_baidu():
    txt = fetch_url("https://top.baidu.com/api/board?platform=wise&tab=realtime", {"Referer": "https://top.baidu.com/board"})
    data = json.loads(txt)
    items = []
    cards = data.get("data", {}).get("cards", [])
    content = cards[0].get("content", []) if cards else []
    for x in content:
        w = x.get("word", "").strip()
        if w:
            items.append({
                "title": w,
                "hot": str(x.get("hotScore") or ""),
                "url": x.get("rawUrl") or x.get("url") or f"https://www.baidu.com/s?wd={urllib.parse.quote(w)}"
            })
    return items


def get_douyin():
    txt = fetch_url("https://aweme.snssdk.com/aweme/v1/hot/search/list/")
    data = json.loads(txt)
    items = []
    for x in data.get("data", {}).get("word_list", []):
        w = x.get("word", "").strip()
        if w:
            items.append({
                "title": w,
                "hot": str(x.get("hot_value") or ""),
                "url": f"https://www.douyin.com/search/{urllib.parse.quote(w)}"
            })
    return items


def get_toutiao():
    txt = fetch_url("https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc", {"Referer": "https://www.toutiao.com"})
    data = json.loads(txt)
    items = []
    for x in data.get("data", []):
        t = x.get("Title", "").strip()
        if t:
            items.append({
                "title": t,
                "hot": str(x.get("HotValue") or ""),
                "url": x.get("Url") or f"https://www.toutiao.com/trending/{x.get('ClusterIdStr', '')}"
            })
    return items


def get_bilibili():
    txt = fetch_url("https://api.bilibili.com/x/web-interface/ranking/v2", {"Referer": "https://www.bilibili.com"})
    data = json.loads(txt)
    items = []
    for x in data.get("data", {}).get("list", []):
        t = x.get("title", "").strip()
        if t:
            v = x.get("stat", {}).get("view", 0)
            hot_str = f"{round(v / 10000)}万播放" if v > 10000 else str(v)
            items.append({
                "title": t,
                "hot": hot_str,
                "url": x.get("short_link_v2") or f"https://www.bilibili.com/video/{x.get('bvid', '')}"
            })
    return items


def get_zhihu():
    txt = fetch_url("https://api.zhihu.com/topstory/hot-lists/total?limit=50", {
        "User-Agent": UA_ZHIHU,
        "Referer": "https://www.zhihu.com"
    })
    data = json.loads(txt)
    items = []
    for x in data.get("data", []):
        t = x.get("target", {})
        title = t.get("title", "").strip()
        qid = t.get("id", "")
        if title:
            items.append({
                "title": title,
                "hot": str(x.get("detail_text") or ""),
                "url": f"https://www.zhihu.com/question/{qid}" if qid else ""
            })
    return items


def get_ithome():
    txt = fetch_url("https://www.ithome.com/rss/")
    items = []
    for m in re.finditer(r"<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>", txt, re.I):
        t = m.group(1).strip()
        u = m.group(2).strip()
        if t:
            items.append({"title": t, "hot": "", "url": u})
    return items


FETCHERS = {
    "weibo": ("微博热搜", get_weibo),
    "baidu": ("百度热搜", get_baidu),
    "douyin": ("抖音热搜", get_douyin),
    "toutiao": ("今日头条", get_toutiao),
    "bilibili": ("B站热榜", get_bilibili),
    "zhihu": ("知乎热榜", get_zhihu),
    "ithome": ("IT之家", get_ithome)
}


def main():
    parser = argparse.ArgumentParser(description="原生官方直连热榜抓取")
    parser.add_argument("--max", type=int, default=20, help="每个平台最大条目数")
    parser.add_argument("--keyword", type=str, default=None, help="关键词过滤")
    parser.add_argument("--platform", type=str, default="weibo,baidu,douyin,toutiao,bilibili,zhihu",
                        help="逗号分隔的平台标识")
    args = parser.parse_args()

    req_platforms = [p.strip().lower() for p in args.platform.split(",") if p.strip()]

    for p in req_platforms:
        if p not in FETCHERS:
            continue
        name, fn = FETCHERS[p]
        try:
            items = fn()
            if args.keyword:
                items = [i for i in items if args.keyword.lower() in i["title"].lower()]
            items = items[:args.max]
            print(json.dumps({
                "platform": p,
                "name": name,
                "items": items
            }, ensure_ascii=False))
        except Exception as e:
            sys.stderr.write(f"[{p}] 抓取失败: {e}\n")


if __name__ == "__main__":
    main()

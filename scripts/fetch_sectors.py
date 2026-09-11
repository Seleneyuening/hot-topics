#!/usr/bin/env python3
"""六大板块精确热点抓取：全源聚合 + 板块打标 + 手机/电脑型号提取（零依赖）。

用法:
    python3 fetch_sectors.py [--max-per-source N]

数据源:
    - 60s 聚合热榜: weibo/zhihu/baidu/douyin/toutiao/rednote
    - 垂直媒体 RSS: ithome(IT之家) / 36kr / ifanr(爱范儿)

输出:
    - 每源一行 JSON: {"source": ..., "items": [...]}
    - 末尾 "### sector pools" 段落：六大板块候选池（标题/热度/来源/型号），
      供 agent 直接按 SKILL.md 规则组装各板块 TOP10。

打标逻辑:
    - 每条目可命中多个板块（sectors 列表），由 agent 按优先级归唯一板块。
    - models 字段用正则提取手机/电脑型号，实现"型号全量抓取"。
"""
import html as _html
import json
import re as _re
import sys
import urllib.request

TIMEOUT = 12
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
# 60s 实例列表（官方限流严格常 403，社区实例自动故障转移；名单见 docs.60s-api.viki.moe/7306811m0）
INSTANCES = [
    "https://60s.viki.moe",            # 官方
    "https://60s.superjeason.qzz.io",  # 社区 2026-06-08
    "https://60s.zellon.top",          # 社区 2026-05-30
    "https://api.cczo.cc/60s",         # 社区 2026-05-09
    "https://60s.mizhoubaobei.top",    # 社区 2025-11-07
    "https://60s.7se.cn",              # 社区 2025-09-28
    "https://api.elysiayanyu.top",     # 社区 2025-08-30
    "https://60s.crystelf.top",        # 社区 2025-08-29
]
BASE60_TPL = "{base}/v2"

# ---------------- 数据源 ----------------
HOT_SOURCES = {
    "weibo":   ("weibo",     "微博"),
    "zhihu":   ("zhihu",     "知乎"),
    "baidu":   ("baidu/hot", "百度"),
    "douyin":  ("douyin",    "抖音"),
    "toutiao": ("toutiao",   "今日头条"),
    "rednote": ("rednote",   "小红书"),
}
RSS_SOURCES = {
    "ithome": "https://www.ithome.com/rss/",
    "36kr":   "https://www.36kr.com/feed",
    "ifanr":  "https://www.ifanr.com/feed",
}
# tophub.today 榜单源: 名称 -> (board_id, 展示名, 是否有热度)
TOTHUB_SOURCES = {
    "tencent_news": ("12owgX0oNV", "腾讯新闻", False),
    "wechat_gzh":   ("WnBe01o371", "微信公众号", True),
}

# ---------------- 板块关键词规则 ----------------
# 每板块: (关键词列表, 正则列表)；命中任一即打标
SECTOR_RULES = {
    "手机": (
        ["手机", "智能手机", "折叠屏", "翻盖屏", "iPhone", "苹果", "华为", "荣耀", "小米",
         "红米", "REDMI", "OPPO", "vivo", "iQOO", "一加", "OnePlus", "三星", "Galaxy",
         "魅族", "努比亚", "中兴", "摩托罗拉", "moto", "谷歌", "Pixel", "索尼", "Xperia",
         "传音", "realme", "真我", "红魔", "ROG Phone", "黑鲨", "诺基亚", "蔚来手机",
         "iOS", "HarmonyOS", "鸿蒙", "澎湃OS", "HyperOS", "OriginOS", "MagicOS",
         "ColorOS", "Flyme", "MIUI", "影像旗舰", "游戏手机", "旗舰机", "新机发布",
         "手机市场", "智能手机销量", "Civi"],
        [r"iPhone\s?\d+", r"Galaxy\s?[A-Z]\d*", r"Mate\s?\d+", r"Pura\s?\d+",
         r"nova\s?\d+", r"Pocket\s?\d*", r"小米\s?\d+", r"小米\s?MIX[\w\s]*",
         r"Redmi\s?\w+", r"红米\s?\w+", r"K\d+(?:\s?(?:Pro|Ultra|至尊))?",
         r"Note\s?\d+", r"Turbo\s?\d+", r"Magic\d+(?:\s?系列)?", r"荣耀\s?[A-Za-z0-9]+",
         r"GT\d*", r"vivo\s?[A-Za-z]\d+", r"iQOO\s?(?:Neo\s?)?\d+", r"一加\s?\d+",
         r"OnePlus\s?\d+", r"Find\s?[A-Z0-9]+", r"Reno\s?\d+", r"Pixel\s?\d+",
         r"moto\s?\w+", r"Xperia\s?\w+", r"努比亚\s?\w+", r"红魔\s?\d+",
         r"ROG\s?Phone\s?\d+", r"魅族\s?\w*", r"中兴\s?\w*", r"华为\s?\w*手机",
         r"荣耀\s?\w*系列"],
    ),
    "电脑": (
        ["笔记本", "台式机", "迷你主机", "一体机", "掌机", "游戏本", "商务本", "工作站",
         "MacBook", "iMac", "Mac mini", "Mac Studio", "ThinkPad", "拯救者", "小新",
         "YOGA", "ROG", "玩家国度", "天选", "暗影精灵", "光影精灵", "外星人", "Alienware",
         "XPS", "灵越", "游匣", "戴尔", "Dell", "惠普", "HP", "联想", "华硕", "微星",
         "技嘉", "宏碁", "Acer", "雷神", "机械革命", "神舟", "七彩虹", "零刻", "极摩客",
         "铭凡", "Steam Deck", "ROG Ally", "CPU", "处理器", "酷睿", "Core", "锐龙",
         "Ryzen", "Threadripper", "Xeon", "显卡", "GPU", "RTX", "GTX", "RX 显卡",
         "主板", "内存", "DDR", "SSD", "固态", "硬盘", "机械键盘", "键盘", "鼠标",
         "鼠标垫", "显示器", "高刷", "散热", "水冷", "风冷", "机箱", "电源", "NAS",
         "PC", "Windows", "Win11", "Win12", "DirectX", "驱动", "电竞", "外设",
         "键帽", "轴体", "屏幕", "面板"],
        [r"MacBook\s?(?:Pro|Air)?\s?\d*", r"ThinkPad\s?\w*", r"拯救者\s?\w*",
         r"小新\s?\w*", r"YOGA\s?\w*", r"天选\s?\w*", r"ROG\s?\w*", r"暗影精灵\s?\w*",
         r"Alienware\s?\w*", r"XPS\s?\d+", r"灵越\s?\w*", r"Legion\s?\w*",
         r"Y\d{4}(?:\w*)?", r"RTX\s?\d+", r"RX\s?\d+", r"酷睿\s?[A-Za-z0-9]+",
         r"锐龙\s?[A-Za-z0-9]+", r"Ryzen\s?\w+", r"Core\s?i\d+", r"酷睿Ultra",
         r"骁龙X", r"Steam\s?Deck", r"ROG\s?Ally"],
    ),
    "AI": (
        ["大模型", "AI", "人工智能", "智能体", "Agent", "AIGC", "生成式", "LLM", "GPT",
         "OpenAI", "Anthropic", "Claude", "Gemini", "DeepSeek", "文心", "豆包", "通义",
         "Kimi", "Manus", "Seedance", "Sora", "Midjourney", "Stable Diffusion", "智谱",
         "GLM", "月之暗面", "讯飞", "星火", "商汤", "MiniMax", "百川", "零一万物",
         "阶跃星辰", "AI视频", "AI绘画", "AI写作", "AI搜索", "AI手机", "AI芯片",
         "NPU", "机器学习", "深度学习", "神经网络", "多模态", "大模型训练", "推理",
         "提示词", "ChatGPT", "AI伦理", "AI监管", "AI安全", "算力", "数据中心",
         "算力租赁", "GPU服务器", "智能体应用", "AI应用", "AI工具", "AI功能",
         "AI时代", "AI发展", "AI产业", "大模型公司", "AI基建", "AI投资", "AI融资"],
        [r"AI\s?视频", r"AI\s?模型", r"大模型\s?\w*", r"GPT-\d+", r"Claude\s?\w*",
         r"Gemini\s?\w*", r"DeepSeek\s?\w*", r"GLM-\d*"],
    ),
    "机器人": (
        ["机器人", "人形机器人", "宇树", "Unitree", "Optimus", "Figure", "波士顿动力",
         "Atlas", "机器狗", "四足", "机械臂", "具身", "具身智能", "服务机器人", "扫地机器人",
         "配送机器人", "灵巧手", "机器人关节", "机器人底盘", "优必选", "智元", "傅利叶",
         "众擎", "星尘", "银河通用", "开普勒", "CyberOne", "CyberDog", "机器人公司",
         "仿生", "机器人大赛", "机器人产业"],
        [r"人形机器人", r"具身智能", r"宇树\s?\w*", r"Unitree\s?\w*", r"Optimus",
         r"Figure\s?\w*", r"CyberOne", r"CyberDog", r"机器人\s?\w*"],
    ),
    "汽车": (
        ["汽车", "车企", "新能源车", "电动车", "EV", "纯电", "插混", "混动", "增程",
         "新车", "车展", "智能驾驶", "自动驾驶", "辅助驾驶", "智驾", "NOA", "电池",
         "续航", "充电桩", "换电", "充电", "汽车销量", "汽车出口", "特斯拉", "比亚迪",
         "蔚来", "理想", "小鹏", "小米汽车", "华为智选", "鸿蒙智行", "问界", "智界",
         "享界", "尊界", "阿维塔", "极氪", "领克", "长城", "吉利", "长安", "奇瑞",
         "上汽", "广汽", "一汽", "东风", "北汽", "大众", "丰田", "本田", "日产",
         "奔驰", "宝马", "奥迪", "BBA", "保时捷", "法拉利", "兰博基尼", "捷豹", "路虎",
         "通用", "福特", "现代", "起亚", "雷诺", "标致", "雪铁龙", "马自达", "三菱",
         "沃尔沃", "捷途", "星途", "埃安", "深蓝", "启源", "银河", "腾势", "方程豹",
         "仰望", "极狐", "岚图", "猛士", "零跑", "哪吒汽车", "高合", "车机", "座舱",
         "SUV", "MPV", "皮卡", "轿跑", "跑车", "发动机", "变速箱", "混动系统",
         "内燃机", "加油站", "油价", "汽车之家", "懂车帝", "试驾", "路测", "车企战略",
         "汽车品牌", "房车", "摩托车", "骑行"],
        [r"新能源车", r"电动汽车", r"智能驾驶", r"自动驾驶", r"小米\s?汽车", r"SU7",
         r"YU7", r"问界\s?\w*", r"智界\s?\w*", r"享界\s?\w*", r"尊界\s?\w*",
         r"阿维塔\d+(?:L)?", r"极氪\s?\d+X?", r"岚图\s?\w*", r"Model\s?[A-Z0-9]+",
         r"Cybertruck", r"仰望\s?U\d*", r"秦\s?[A-Z0-9]*", r"宋\s?[A-Z0-9]*",
         r"汉\s?[A-Z0-9]*", r"唐\s?[A-Z0-9]*", r"海豹\s?\d*", r"比亚迪海豚",
         r"理想L\d+", r"蔚来\s?(?:ET|ES|EC)\d+", r"小鹏\s?(?:P7|G6|G9|X9|MONA|G\d+[A-Z]?)",
         r"零跑[AC]\d+", r"智己L\d+", r"哪吒(?:汽车|L|S|\w*)", r"星愿",
         r"奕境X\d+", r"星海V\d+", r"风云T\d+", r"捷豹\s?Type\s?\d+", r"战舰\s?\d+",
         r"吉利银河[\w\s]{0,8}", r"坦克\d+", r"哈弗\s?\w+", r"捷途\s?\w+",
         r"卡罗拉锐放", r"沃尔沃\s?\w+", r"凯迪拉克\s?\w+"],
    ),
    "科技": (
        ["半导体", "芯片", "晶圆", "光刻", "制程", "纳米", "EUV", "DUV", "存储",
         "NAND", "DRAM", "长江存储", "长鑫", "中芯国际", "台积电", "英特尔", "AMD",
         "英伟达", "NVIDIA", "高通", "联发科", "海思", "航天", "卫星", "火箭",
         "空间站", "载人航天", "探月", "火星", "探测器", "天文", "宇宙", "黑洞",
         "流星雨", "日食", "月食", "星链", "量子", "核聚变", "可控核聚变", "SMR",
         "核能", "通信", "5G", "6G", "WiFi", "蓝牙", "物联网", "IoT", "消费电子",
         "耳机", "音箱", "平板", "电视", "手表", "手环", "AR眼镜", "VR眼镜",
         "头显", "增强现实", "虚拟现实", "混合现实", "无人机", "eVTOL", "飞行汽车",
         "机器视觉", "传感器", "新材料", "石墨烯",
         "超导", "生物科技", "基因", "脑机接口", "气候", "气温", "碳中和",
         "光伏", "风电", "储能", "云计算", "边缘计算", "数据中心", "开源",
         "编程", "服务器", "数据库", "科学", "科研", "实验室", "NASA", "SpaceX",
         "全景相机", "摄影", "天文望远镜"],
        [r"C919", r"长征\s?\d+", r"北斗", r"天宫", r"嫦娥", r"天问", r"神舟\s?\d*",
         r"Falcon\s?\d+", r"Starlink", r"RTX\s?\d+", r"Ryzen\s?\w+", r"酷睿\s?\w+",
         r"鸿蒙\s?[\w]*", r"Windows\s?\d*", r"iOS\s?\d+", r"Android\s?\d*"],
    ),
}

# 型号提取（手机/电脑），命中即记录，实现"型号全量抓取"
MODEL_PATTERNS = [
    # 手机型号
    r"iPhone\s?\d+(?:\s?(?:Pro\s?Max|Pro|Plus|Air|e))?",
    r"Galaxy\s?[A-Z]\d+(?:\s?(?:Ultra|Plus|FE))?",
    r"Mate\s?\d+(?:\s?(?:Pro|RS|保时捷))?",
    r"Pura\s?\d+(?:\s?(?:Pro|Ultra))?",
    r"nova\s?\d+(?:\s?(?:Pro|Ultra))?",
    r"Pocket\s?\d*",
    r"小米\s?(?:MIX\s?[A-Z0-9]+|Civi\s?\d*|\d+(?:\s?(?:Pro|Ultra|至尊))?)",
    r"Redmi\s?[A-Z0-9]+(?:\s?(?:Pro|Turbo|Ultra))?",
    r"红米\s?[A-Z0-9]+",
    r"K\d+(?:\s?(?:Pro|Ultra|至尊))?",
    r"Note\s?\d+(?:\s?(?:Pro|Turbo))?",
    r"Turbo\s?\d+",
    r"Magic\d+(?:\s?(?:Pro|至臻|系列))?",
    r"荣耀\s?[A-Za-z0-9]+(?:\s?(?:Pro|Plus))?",
    r"vivo\s?[A-Za-z]\d+(?:\s?(?:Pro|Ultra|影像))?",
    r"iQOO\s?(?:Neo\s?)?\d+(?:\s?(?:Pro|至尊版))?",
    r"一加\s?\d+(?:\s?(?:Pro|Ace))?",
    r"OnePlus\s?\d+",
    r"Find\s?[A-Z0-9]+",
    r"Reno\s?\d+(?:\s?(?:Pro|Ultra))?",
    r"Pixel\s?\d+(?:\s?(?:Pro|a))?",
    r"moto\s?\w+",
    r"Xperia\s?\w+",
    r"努比亚\s?\w*",
    r"红魔\s?\d+",
    r"ROG\s?Phone\s?\d+",
    r"魅族\s?(?:\d+|\w+)",
    # 电脑型号
    r"MacBook\s?(?:Pro|Air)?\s?\d*",
    r"Mac\s?(?:mini|Studio|Pro)?",
    r"ThinkPad\s?\w*",
    r"拯救者\s?\w*",
    r"小新\s?\w*",
    r"YOGA\s?\w*",
    r"天选\s?\w*",
    r"ROG\s?(?:Ally|Strix|Flow)?\s?\w*",
    r"暗影精灵\s?\w*",
    r"Alienware\s?\w*",
    r"XPS\s?\d+",
    r"灵越\s?\w*",
    r"Legion\s?\w*",
    r"Y\d{4}(?:\w*)?",
    r"Steam\s?Deck",
    r"RTX\s?\d+",
    r"RX\s?\d+",
    r"Ryzen\s?\w+",
    r"酷睿\s?[A-Za-z0-9]+",
    r"锐龙\s?[A-Za-z0-9]+",
    r"Core\s?i\d+",
]

_COMPILED = {sec: (_re.compile("|".join(_re.escape(k) for k in kws), _re.I),
                  [_re.compile(p, _re.I) for p in pats])
             for sec, (kws, pats) in SECTOR_RULES.items()}
_MODEL_RE = [_re.compile(p, _re.I) for p in MODEL_PATTERNS]

# 排除规则：某板块命中但标题含这些词时剔除（避免"机器人手机"进机器人等误伤）
_EXCLUDE_RULES = {
    "机器人": ["机器人手机", "Robot Phone", "Robots Phone"],
    "手机": ["电视", "米家", "双肩包", "家电", "冰箱", "洗衣机", "座舱", "智驾",
            "鸿蒙智行", "ADS", "Apple Watch", "手表", "智能手表"],
    "科技": ["ARPG", "RPG", "游戏", "手游", "电竞比赛"],
}


def tag_item(title: str) -> dict:
    sectors, models = [], set()
    for sec, (kw_re, pats) in _COMPILED.items():
        if kw_re.search(title) or any(p.search(title) for p in pats):
            if any(e in title for e in _EXCLUDE_RULES.get(sec, [])):
                continue
            sectors.append(sec)
    for p in _MODEL_RE:
        for m in p.findall(title):
            if isinstance(m, tuple):
                m = "".join(x for x in m if x)
            if m:
                models.add(m.strip())
    return {"sectors": sectors, "models": sorted(models)}


def _fetch(url: str, binary: bool = False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        data = resp.read()
    if binary:
        return data
    return data.decode("utf-8", "replace")


# 本轮运行内记住最近一次成功的实例，后续源优先用它（减少重试与限流风险）
_LAST_GOOD = {"base": None}


def fetch_hot(key: str, endpoint: str, pf_name: str) -> list:
    bases = INSTANCES
    if _LAST_GOOD["base"]:
        bases = [_LAST_GOOD["base"]] + [b for b in INSTANCES if b != _LAST_GOOD["base"]]
    last_exc: Exception = ValueError("no instance tried")
    for base in bases:
        try:
            data = json.loads(_fetch(f"{BASE60_TPL.format(base=base)}/{endpoint}"))
            if data.get("code") != 200:
                raise ValueError(data.get("message", f"bad code {data.get('code')}"))
            out = []
            for it in data.get("data") or []:
                title = (it.get("title") or "").strip()
                if not title:
                    continue
                out.append({
                    "title": title,
                    "hot": it.get("hot_value") or it.get("score") or "",
                    "url": it.get("link") or "",
                    "source": pf_name,
                })
            if not out:
                raise ValueError("empty list")
            _LAST_GOOD["base"] = base
            return out
        except Exception as exc:  # noqa: BLE001 - 换下一个实例
            last_exc = exc
    raise last_exc


def fetch_rss(name: str, url: str) -> list:
    xml = _fetch(url)
    titles = _re.findall(r"<title>(.*?)</title>", xml, _re.S)
    return [{"title": _html.unescape(_re.sub(r"<[^>]+>", "", t)).strip(),
             "hot": "", "url": "", "source": name} for t in titles[1:] if t.strip()]


def _clean_text(s: str) -> str:
    s = _re.sub(r"<[^>]+>", " ", s)
    s = _html.unescape(s)
    return _re.sub(r"\s+", " ", s).strip()


def _is_js_remnant(title: str) -> bool:
    """tophub 页面 script 里的行内模板残渣（如 "' + v.title + '"）。"""
    return bool(_re.search(r"['`]\s*[+&]|item\.title|v\.title|&#[x0-9a-f]", title))


def fetch_tophub(board_id: str, name: str, has_heat: bool) -> list:
    """抓 tophub.today 板块榜。只解析第一个 <table>（榜单本体），
    标题/链接取自 <a>，热度只认纯数字(+万/亿)，天然避开 script 模板与图标字体。"""
    doc = _fetch(f"https://tophub.today/n/{board_id}")
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
        if not title or title in ("API 开放平台",) or _is_js_remnant(title):
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


def main() -> int:
    max_n = 60
    args = sys.argv[1:]
    if "--max-per-source" in args:
        try:
            max_n = int(args[args.index("--max-per-source") + 1])
        except (ValueError, IndexError):
            pass

    all_items = []
    for key, (endpoint, pf_name) in HOT_SOURCES.items():
        try:
            items = fetch_hot(key, endpoint, pf_name)[:max_n]
            if not items:
                raise ValueError("empty")
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({"source": key, "error": f"{type(exc).__name__}: {exc}"},
                             ensure_ascii=False, default=str), file=sys.stderr)
            continue
        all_items.extend(items)
        print(json.dumps({"source": key, "count": len(items)}, ensure_ascii=False))

    for name, url in RSS_SOURCES.items():
        try:
            items = fetch_rss(name, url)[:max_n]
            if not items:
                raise ValueError("empty")
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({"source": name, "error": f"{type(exc).__name__}: {exc}"},
                             ensure_ascii=False, default=str), file=sys.stderr)
            continue
        all_items.extend(items)
        print(json.dumps({"source": name, "count": len(items)}, ensure_ascii=False))

    for key, (board_id, name, has_heat) in TOTHUB_SOURCES.items():
        try:
            items = fetch_tophub(board_id, name, has_heat)[:max_n]
            if not items:
                raise ValueError("empty")
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({"source": key, "error": f"{type(exc).__name__}: {exc}"},
                             ensure_ascii=False, default=str), file=sys.stderr)
            continue
        all_items.extend(items)
        print(json.dumps({"source": key, "count": len(items)}, ensure_ascii=False))

    # 打标
    tagged = []
    for it in all_items:
        tg = tag_item(it["title"])
        if tg["sectors"]:
            tagged.append({**it, **tg})

    # 输出六大板块候选池（去重：同标题同来源只留一条）
    seen, pools = set(), {s: [] for s in SECTOR_RULES}
    for it in tagged:
        dedupe_key = (it["title"], it["source"])
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        for sec in it["sectors"]:
            pools[sec].append(it)

    print("\n### sector pools")
    for sec in ["手机", "电脑", "科技", "AI", "机器人", "汽车"]:
        pool = pools[sec]
        print(f"\n== {sec} ({len(pool)}条候选) ==")
        for it in pool[:40]:
            hot = f"[{it['hot']}] " if it["hot"] else ""
            models = f" 型号:{'/'.join(it['models'])}" if it.get("models") else ""
            print(f"{hot}{it['title'][:60]} | {it['source']}{models}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

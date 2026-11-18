#!/usr/bin/env python3
"""同步带有 Scripting / Scriptable 相关主题或中文关键词的 GitHub 仓库：
下载 Release 中的脚本与资源文件，按 作者/仓库 分类保存；
检测仓库是否有中文文档，为英文简介生成中文参考译文（词典方式），
自动清理已失效的仓库和文件，并生成 index.json（机器可读索引）和 CATALOG.md（中文目录）。"""
import base64
import json
import os
import re
import shutil
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# GitHub 访问令牌（在 Actions 中由 secrets.GITHUB_TOKEN 提供，可提高 API 速率上限）
TOKEN = os.environ.get("GITHUB_TOKEN", "")

# 英文主题标签搜索
TOPICS = ["scriptable", "scripting", "ios-scripting", "scripting-app"]

# 中文关键词搜索：用于发现中文社区的 Scriptable / Scripting 脚本仓库
CN_QUERIES = [
    "Scriptable 脚本",
    "Scripting 脚本",
    "Scriptable 中文",
    "iOS 脚本 Scriptable",
    "签到脚本 Scriptable",
    "小组件 脚本 Scriptable",
]

# 每次搜索最多获取的仓库数量
MAX_REPOS_PER_QUERY = 30
# 每个仓库最多获取的 Release 数量
MAX_RELEASES = 5
# 单个文件的大小上限（超过则跳过），25 MB
MAX_ASSET_BYTES = 25 * 1024 * 1024
# README 摘要的最大字符数（只用于判断是否含中文）
README_SNIPPET_CHARS = 3000

ROOT = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.join(ROOT, "scripts-store")
# 允许下载的文件扩展名
ALLOWED_EXT = (".js", ".ts", ".tsx", ".jsx", ".zip", ".scripting", ".json", ".md")

# 中文字符（CJK 统一汉字）的正则
CJK_RE = re.compile(r"[\u4e00-\u9fff]")

# 英文常用词 -> 中文词典（用于生成中文参考译文，仅做词语替换，并非完整机器翻译）
GLOSSARY = [
    ("scriptable", "Scriptable"),
    ("scripting", "脚本"),
    ("script", "脚本"),
    ("scripts", "脚本"),
    ("widget", "小组件"),
    ("widgets", "小组件"),
    ("shortcut", "快捷指令"),
    ("shortcuts", "快捷指令"),
    ("automation", "自动化"),
    ("automate", "自动化"),
    ("tool", "工具"),
    ("tools", "工具"),
    ("utility", "实用工具"),
    ("collection", "合集"),
    ("library", "库"),
    ("helper", "辅助工具"),
    ("template", "模板"),
    ("templates", "模板"),
    ("example", "示例"),
    ("examples", "示例"),
    ("sample", "示例"),
    ("daily", "每日"),
    ("check-in", "签到"),
    ("checkin", "签到"),
    ("calendar", "日历"),
    ("reminder", "提醒"),
    ("reminders", "提醒"),
    ("weather", "天气"),
    ("music", "音乐"),
    ("photo", "照片"),
    ("photos", "照片"),
    ("notes", "备忘录"),
    ("note", "备忘录"),
    ("file", "文件"),
    ("files", "文件"),
    ("network", "网络"),
    ("api", "接口"),
    ("ui", "界面"),
    ("interface", "界面"),
    ("game", "游戏"),
    ("games", "游戏"),
    ("finance", "金融"),
    ("health", "健康"),
    ("fitness", "健身"),
    ("news", "新闻"),
    ("translate", "翻译"),
    ("translation", "翻译"),
    ("assistant", "助手"),
    ("ai", "AI"),
    ("openai", "OpenAI"),
    ("chatgpt", "ChatGPT"),
    ("for", "用于"),
    ("and", "和"),
    ("with", "配合"),
    ("the", ""),
    ("a", ""),
    ("an", ""),
    ("of", "的"),
    ("to", "到"),
    ("in", "中"),
    ("on", "上"),
    ("your", "你的"),
    ("my", "我的"),
    ("from", "来自"),
    ("based", "基于"),
    ("simple", "简单"),
    ("easy", "简易"),
    ("fast", "快速"),
    ("powerful", "强大"),
    ("open source", "开源"),
    ("open-source", "开源"),
    ("iOS", "iOS"),
    ("iphone", "iPhone"),
    ("ipad", "iPad"),
    ("mac", "Mac"),
    ("macos", "macOS"),
]

# 简单分类规则：按关键词归入大类（用于目录分组）
CATEGORY_RULES = [
    ("小组件", ["widget", "小组件"]),
    ("签到", ["check-in", "checkin", "签到"]),
    ("AI 与翻译", ["ai", "openai", "chatgpt", "translate", "translation", "assistant", "翻译"]),
    ("快捷指令与自动化", ["shortcut", "shortcuts", "automation", "automate", "快捷指令"]),
    ("工具", ["tool", "utility", "helper", "工具"]),
    ("模板与示例", ["template", "example", "sample", "模板", "示例"]),
]
DEFAULT_CATEGORY = "其他"

# 运行过程中的状态（用于判断清理是否安全）
SEARCH_FAILED = False  # 任一搜索失败时，为避免误删，本次跳过仓库级清理
EXPECTED_FILES = {}  # (作者目录, 仓库目录) -> 本次应保留的文件绝对路径集合
RELEASES_OK = set()  # 本次成功获取 Release 列表的 (作者目录, 仓库目录)


def api(url, accept="application/vnd.github+json"):
    """调用 GitHub REST API，并返回解析后的 JSON 数据。HTTP 错误会抛出异常。"""
    headers = {"Accept": accept, "User-Agent": "scripting-hub-sync"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def download(url, dest):
    """下载文件到 dest。若文件超过大小上限则放弃并返回 False。"""
    headers = {"User-Agent": "scripting-hub-sync"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read(MAX_ASSET_BYTES + 1)
    if len(data) > MAX_ASSET_BYTES:
        return False
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as f:
        f.write(data)
    return True


def safe(name):
    """把名称中的非法字符替换为下划线，确保可以安全地用作文件名或目录名。"""
    return re.sub(r"[^A-Za-z0-9._-]", "_", name)


def has_cjk(text):
    """判断文本中是否包含中文字符。"""
    return bool(text) and bool(CJK_RE.search(text))


def translate_desc(text):
    """用词典生成中文参考译文。若原文已含中文则直接返回原文。
    注意：这是逐词替换的参考译文，不是完整的机器翻译，仅供浏览参考。"""
    if not text:
        return ""
    if has_cjk(text):
        return text
    out = text
    # 先替换较长的词组，避免被短词打断
    for en, zh in sorted(GLOSSARY, key=lambda p: -len(p[0])):
        if not zh:
            continue
        pattern = r"(?<![A-Za-z])" + re.escape(en) + r"(?![A-Za-z])"
        out = re.sub(pattern, zh, out, flags=re.IGNORECASE)
    out = re.sub(r"\s+", " ", out).strip()
    return out


def categorize(name, desc):
    """按名称和简介中的关键词，把仓库归入一个大类。"""
    text = f"{name} {desc}".lower()
    for category, keywords in CATEGORY_RULES:
        for kw in keywords:
            if kw.lower() in text:
                return category
    return DEFAULT_CATEGORY


def fetch_readme_snippet(full_name):
    """获取仓库 README 的开头部分，用于检测是否有中文文档。失败时返回空字符串。"""
    try:
        data = api(f"https://api.github.com/repos/{full_name}/readme")
        content = base64.b64decode(data.get("content", "")).decode("utf-8", errors="ignore")
        return content[:README_SNIPPET_CHARS]
    except Exception as e:
        print(f"获取 {full_name} 的 README 失败：{e}")
        return ""


def search_repos(query, label, found):
    """执行一次仓库搜索，把结果合并进 found（按完整名称去重，并记录来源）。
    搜索失败时设置 SEARCH_FAILED，以便后续跳过仓库级清理。"""
    global SEARCH_FAILED
    q = urllib.parse.quote(f"{query} fork:false archived:false")
    url = f"https://api.github.com/search/repositories?q={q}&sort=updated&per_page={MAX_REPOS_PER_QUERY}"
    try:
        items = api(url).get("items", [])
    except Exception as e:
        SEARCH_FAILED = True
        print(f"搜索 {query} 失败：{e}")
        return
    for item in items:
        name = item["full_name"]
        if name not in found:
            found[name] = {"item": item, "sources": []}
        if label not in found[name]["sources"]:
            found[name]["sources"].append(label)


def find_repos():
    """依次执行英文主题搜索和中文关键词搜索，合并并去重。"""
    found = {}
    for topic in TOPICS:
        search_repos(f"topic:{topic}", f"topic:{topic}", found)
    for query in CN_QUERIES:
        search_repos(query, f"关键词:{query}", found)
    return found


def sync_repo(full_name, meta):
    """处理单个仓库：获取最近的 Release，下载符合扩展名的资源文件，并生成中文信息。
    同时记录本次应保留的文件，供后续清理使用。"""
    item = meta["item"]
    owner, repo = full_name.split("/", 1)
    key = (safe(owner), safe(repo))
    base = os.path.join(STORE, safe(owner), safe(repo))
    expected = EXPECTED_FILES.setdefault(key, set())
    entries = []
    try:
        releases = api(f"https://api.github.com/repos/{full_name}/releases?per_page={MAX_RELEASES}")
        RELEASES_OK.add(key)
    except Exception as e:
        # Release 获取失败时不清理该仓库已有文件，避免因临时错误误删
        print(f"获取 {full_name} 的 Release 失败，保留已有文件：{e}")
        releases = []
    for rel in releases:
        tag = safe(rel.get("tag_name") or "untagged")
        for asset in rel.get("assets", []):
            name = asset.get("name", "")
            # 跳过不在允许列表中的文件类型
            if not name.lower().endswith(ALLOWED_EXT):
                continue
            dest = os.path.join(base, "releases", tag, safe(name))
            # 文件已存在则跳过重复下载，但仍视为有效文件
            if os.path.exists(dest):
                entries.append(dest)
                expected.add(os.path.abspath(dest))
                continue
            try:
                if download(asset["browser_download_url"], dest):
                    entries.append(dest)
                    expected.add(os.path.abspath(dest))
            except Exception as e:
                # 下载失败：该文件不会被记为有效，若磁盘上存在旧残留则会被清理
                print(f"下载失败 {full_name} {name}：{e}")

    desc_en = item.get("description") or ""
    readme = fetch_readme_snippet(full_name)
    # 只要简介或 README 中出现中文，或者仓库来自中文关键词搜索，就标记为中文相关
    has_cn_docs = has_cjk(desc_en) or has_cjk(readme)
    from_cn_search = any(s.startswith("关键词:") for s in meta["sources"])
    return {
        "repo": full_name,
        "url": item["html_url"],
        "name_zh": full_name.split("/", 1)[1],
        "description_en": desc_en,
        "description_zh": translate_desc(desc_en),
        "category": categorize(full_name, desc_en),
        "has_chinese_docs": has_cn_docs,
        "chinese_related": has_cn_docs or from_cn_search,
        "sources": meta["sources"],
        "stars": item.get("stargazers_count", 0),
        "language": item.get("language") or "",
        "files": [os.path.relpath(p, ROOT) for p in entries],
    }


def check_repo_status(full_name):
    """查询仓库在 GitHub 上的当前状态，返回 (是否应删除, 原因)。
    只有明确的 404 或仓库不再符合条件时才返回应删除；其他错误（如限流、网络）返回不删除。"""
    try:
        info = api(f"https://api.github.com/repos/{full_name}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return True, "仓库已在 GitHub 上删除（404）"
        return False, f"无法确认仓库状态（HTTP {e.code}），本次保留"
    except Exception as e:
        return False, f"无法确认仓库状态（{e}），本次保留"
    if info.get("private"):
        return True, "仓库已改为私有"
    if info.get("archived"):
        return True, "仓库已归档"
    if info.get("fork"):
        return True, "仓库已变为 Fork"
    return True, "仓库不再符合搜索条件"


def prune_files(repo_path, expected, full_name, pruned_log, now):
    """删除仓库目录中本次不再有效的文件（例如 Release 已删除、资源已移除或下载失败的残留），
    并删除清理后留下的空目录。"""
    for root, dirs, files in os.walk(repo_path, topdown=False):
        for fn in files:
            p = os.path.abspath(os.path.join(root, fn))
            if p not in expected:
                os.remove(p)
                rel = os.path.relpath(p, ROOT)
                print(f"清理失效文件：{rel}")
                pruned_log.append({"type": "file", "target": rel, "reason": "Release 资源已失效或下载不完整", "time": now})
        for d in dirs:
            p = os.path.join(root, d)
            if os.path.isdir(p) and not os.listdir(p):
                os.rmdir(p)


def prune(results, pruned_log, now):
    """自动检查 scripts-store/ 中的内容，清理失效的仓库和文件。
    安全规则：
    1. 任一搜索失败时，本次跳过仓库级清理（避免因临时故障误删）。
    2. 仓库的 Release 获取失败时，保留该仓库已有文件。
    3. 仓库状态查询出现非 404 错误时，保留该仓库。"""
    if not os.path.isdir(STORE):
        return
    if SEARCH_FAILED:
        print("本次有搜索失败，为安全起见跳过仓库级清理。")
        return
    keep = {(safe(r["repo"].split("/", 1)[0]), safe(r["repo"].split("/", 1)[1])) for r in results}

    for owner_dir in sorted(os.listdir(STORE)):
        owner_path = os.path.join(STORE, owner_dir)
        if not os.path.isdir(owner_path):
            continue
        for repo_dir in sorted(os.listdir(owner_path)):
            repo_path = os.path.join(owner_path, repo_dir)
            if not os.path.isdir(repo_path):
                continue
            key = (owner_dir, repo_dir)
            full_name = f"{owner_dir}/{repo_dir}"
            if key not in keep:
                should_delete, reason = check_repo_status(full_name)
                if should_delete:
                    shutil.rmtree(repo_path)
                    print(f"移除仓库：{full_name}，原因：{reason}")
                    pruned_log.append({"type": "repo", "target": full_name, "reason": reason, "time": now})
                else:
                    print(f"保留仓库：{full_name}，{reason}")
            elif key not in RELEASES_OK:
                print(f"保留仓库：{full_name}，本次 Release 获取失败")
            else:
                prune_files(repo_path, EXPECTED_FILES.get(key, set()), full_name, pruned_log, now)
        if os.path.isdir(owner_path) and not os.listdir(owner_path):
            os.rmdir(owner_path)


def build_catalog(results, updated_at, pruned_log):
    """生成中文 Markdown 目录，按是否与中文相关、再按类别分组，并按 Star 数排序。"""
    lines = ["# 脚本中心目录", "", f"最近同步时间：{updated_at}", ""]
    lines.append("> 说明：中文简介为基于词典的参考译文，可能不够通顺；原文简介保留在表格的「原文简介」列中。")
    lines.append("")
    groups = [("中文相关仓库", [r for r in results if r["chinese_related"]]),
              ("其他仓库", [r for r in results if not r["chinese_related"]])]
    for title, items in groups:
        lines.append(f"## {title}（{len(items)}）")
        lines.append("")
        if not items:
            lines.append("暂无。")
            lines.append("")
            continue
        categories = sorted({r["category"] for r in items})
        for cat in categories:
            cat_items = sorted([r for r in items if r["category"] == cat], key=lambda r: -r["stars"])
            lines.append(f"### {cat}（{len(cat_items)}）")
            lines.append("")
            lines.append("| 仓库 | 中文简介 | 原文简介 | 中文文档 | Star | 文件数 |")
            lines.append("|---|---|---|---|---|---|")
            for r in cat_items:
                zh = (r["description_zh"] or "（无简介）").replace("|", "/")
                en = (r["description_en"] or "").replace("|", "/")
                docs = "有" if r["has_chinese_docs"] else "无"
                lines.append(f"| [{r['repo']}]({r['url']}) | {zh} | {en} | {docs} | {r['stars']} | {len(r['files'])} |")
            lines.append("")

    lines.append("## 清理记录")
    lines.append("")
    if not pruned_log:
        lines.append("本次没有需要清理的内容。")
    else:
        lines.append("| 时间 | 类型 | 对象 | 原因 |")
        lines.append("|---|---|---|---|")
        for p in pruned_log:
            kind = "仓库" if p["type"] == "repo" else "文件"
            lines.append(f"| {p['time']} | {kind} | {p['target']} | {p['reason']} |")
    lines.append("")
    return "\n".join(lines) + "\n"


def main():
    """主流程：搜索仓库 -> 同步文件 -> 自动清理失效内容 -> 写入 index.json 与 CATALOG.md。"""
    os.makedirs(STORE, exist_ok=True)
    repos = find_repos()
    results = []
    for full_name, meta in sorted(repos.items()):
        results.append(sync_repo(full_name, meta))

    updated_at = datetime.now(timezone.utc).isoformat()
    pruned_log = []
    prune(results, pruned_log, updated_at)

    index = {
        "updated_at": updated_at,
        "count": len(results),
        "chinese_related_count": sum(1 for r in results if r["chinese_related"]),
        "pruned_count": len(pruned_log),
        "pruned": pruned_log,
        "repos": results,
    }
    # 写入机器可读的 JSON 索引
    with open(os.path.join(ROOT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    # 写入中文 Markdown 目录
    with open(os.path.join(ROOT, "CATALOG.md"), "w", encoding="utf-8") as f:
        f.write(build_catalog(results, updated_at, pruned_log))
    print(f"共同步 {len(results)} 个仓库，其中中文相关 {index['chinese_related_count']} 个，清理 {len(pruned_log)} 项。")


if __name__ == "__main__":
    main()

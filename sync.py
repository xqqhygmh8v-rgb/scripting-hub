#!/usr/bin/env python3
"""同步带有 Scripting 相关主题标签的 GitHub 仓库：
下载 Release 中的脚本与资源文件，按 作者/仓库 分类保存，
并生成 index.json（机器可读索引）和 CATALOG.md（人类可读目录）。"""
import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# GitHub 访问令牌（在 Actions 中由 secrets.GITHUB_TOKEN 提供，可提高 API 速率上限）
TOKEN = os.environ.get("GITHUB_TOKEN", "")
# 需要搜索的仓库主题标签
TOPICS = ["scriptable", "scripting", "ios-scripting", "scripting-app"]
# 每个主题最多获取的仓库数量
MAX_REPOS_PER_TOPIC = 30
# 单个文件的大小上限（超过则跳过），25 MB
MAX_ASSET_BYTES = 25 * 1024 * 1024
# 脚本所在目录，以及保存脚本的目录
ROOT = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.join(ROOT, "scripts-store")
# 允许下载的文件扩展名
ALLOWED_EXT = (".js", ".ts", ".tsx", ".jsx", ".zip", ".scripting", ".json", ".md")


def api(url, accept="application/vnd.github+json"):
    """调用 GitHub REST API，并返回解析后的 JSON 数据。"""
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


def find_repos():
    """按每个主题搜索仓库（排除 fork 和已归档仓库），并按 完整名称 去重。"""
    seen = {}
    for topic in TOPICS:
        q = urllib.parse.quote(f"topic:{topic} fork:false archived:false")
        url = f"https://api.github.com/search/repositories?q={q}&sort=updated&per_page={MAX_REPOS_PER_TOPIC}"
        try:
            for item in api(url).get("items", []):
                seen[item["full_name"]] = {"topics": topic, "item": item}
        except Exception as e:
            print(f"主题 {topic} 搜索失败：{e}")
    return seen


def sync_repo(full_name, meta):
    """处理单个仓库：获取最近 5 个 Release，下载符合扩展名的资源文件。"""
    owner, repo = full_name.split("/", 1)
    base = os.path.join(STORE, safe(owner), safe(repo))
    entries = []
    try:
        releases = api(f"https://api.github.com/repos/{full_name}/releases?per_page=5")
    except Exception as e:
        print(f"获取 {full_name} 的 Release 失败：{e}")
        releases = []
    for rel in releases:
        tag = safe(rel.get("tag_name") or "untagged")
        for asset in rel.get("assets", []):
            name = asset.get("name", "")
            # 跳过不在允许列表中的文件类型
            if not name.lower().endswith(ALLOWED_EXT):
                continue
            dest = os.path.join(base, "releases", tag, safe(name))
            # 文件已存在则跳过重复下载
            if os.path.exists(dest):
                entries.append(dest)
                continue
            try:
                if download(asset["browser_download_url"], dest):
                    entries.append(dest)
            except Exception as e:
                print(f"下载失败 {full_name} {name}：{e}")
    return {
        "repo": full_name,
        "url": meta["item"]["html_url"],
        "description": meta["item"].get("description") or "",
        "topic": meta["topics"],
        "stars": meta["item"].get("stargazers_count", 0),
        "language": meta["item"].get("language") or "",
        "files": [os.path.relpath(p, ROOT) for p in entries],
    }


def main():
    """主流程：搜索仓库 -> 同步文件 -> 写入 index.json 与 CATALOG.md。"""
    os.makedirs(STORE, exist_ok=True)
    repos = find_repos()
    results = []
    for full_name, meta in sorted(repos.items()):
        results.append(sync_repo(full_name, meta))

    index = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(results),
        "repos": results,
    }
    # 写入机器可读的 JSON 索引
    with open(os.path.join(ROOT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    # 生成 Markdown 表格形式的目录
    lines = ["| 仓库 | 主题 | Star 数 | 文件数 | 简介 |", "|---|---|---|---|---|"]
    for r in results:
        lines.append(f"| [{r['repo']}]({r['url']}) | {r['topic']} | {r['stars']} | {len(r['files'])} | {r['description'].replace('|', '/')} |")
    with open(os.path.join(ROOT, "CATALOG.md"), "w", encoding="utf-8") as f:
        f.write("# 脚本目录\n\n最近同步时间：" + index["updated_at"] + "\n\n" + "\n".join(lines) + "\n")
    print(f"共同步 {len(results)} 个仓库。")


if __name__ == "__main__":
    main()

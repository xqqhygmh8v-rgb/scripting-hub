#!/usr/bin/env python3
"""Sync GitHub repos tagged with scripting topics: download release assets and
scripts, organize them by owner/repo, and write an index.json and README table."""
import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone

TOKEN = os.environ.get("GITHUB_TOKEN", "")
TOPICS = ["scriptable", "scripting", "ios-scripting", "scripting-app"]
MAX_REPOS_PER_TOPIC = 30
MAX_ASSET_BYTES = 25 * 1024 * 1024
ROOT = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.join(ROOT, "scripts-store")
ALLOWED_EXT = (".js", ".ts", ".tsx", ".jsx", ".zip", ".scripting", ".json", ".md")


def api(url, accept="application/vnd.github+json"):
    headers = {"Accept": accept, "User-Agent": "scripting-hub-sync"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def download(url, dest):
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
    return re.sub(r"[^A-Za-z0-9._-]", "_", name)


def find_repos():
    seen = {}
    for topic in TOPICS:
        q = urllib.parse.quote(f"topic:{topic} fork:false archived:false")
        url = f"https://api.github.com/search/repositories?q={q}&sort=updated&per_page={MAX_REPOS_PER_TOPIC}"
        try:
            for item in api(url).get("items", []):
                seen[item["full_name"]] = {"topics": topic, "item": item}
        except Exception as e:
            print(f"search failed for {topic}: {e}")
    return seen


def sync_repo(full_name, meta):
    owner, repo = full_name.split("/", 1)
    base = os.path.join(STORE, safe(owner), safe(repo))
    entries = []
    try:
        releases = api(f"https://api.github.com/repos/{full_name}/releases?per_page=5")
    except Exception as e:
        print(f"releases failed for {full_name}: {e}")
        releases = []
    for rel in releases:
        tag = safe(rel.get("tag_name") or "untagged")
        for asset in rel.get("assets", []):
            name = asset.get("name", "")
            if not name.lower().endswith(ALLOWED_EXT):
                continue
            dest = os.path.join(base, "releases", tag, safe(name))
            if os.path.exists(dest):
                entries.append(dest)
                continue
            try:
                if download(asset["browser_download_url"], dest):
                    entries.append(dest)
            except Exception as e:
                print(f"asset failed {full_name} {name}: {e}")
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
    with open(os.path.join(ROOT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    lines = ["| Repo | Topic | Stars | Files | Description |", "|---|---|---|---|---|"]
    for r in results:
        lines.append(f"| [{r['repo']}]({r['url']}) | {r['topic']} | {r['stars']} | {len(r['files'])} | {r['description'].replace('|', '/')} |")
    with open(os.path.join(ROOT, "CATALOG.md"), "w", encoding="utf-8") as f:
        f.write("# Catalog\n\nLast synced: " + index["updated_at"] + "\n\n" + "\n".join(lines) + "\n")
    print(f"Synced {len(results)} repos.")


if __name__ == "__main__":
    main()

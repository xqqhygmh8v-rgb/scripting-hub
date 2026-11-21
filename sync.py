#!/usr/bin/env python3
"""scripting-hub 同步脚本（重写版）

与原版的关键区别：
1. 判据：原版把 GitHub 搜索结果直接入库（Python / Shell / exe 全进来）。
   本版只有真正包含合法 script.json 的 Scripting App 项目才入库。
2. 来源：原版只抓 release 资产，漏掉绝大多数脚本。本版抓默认分支源码树 + 最新 release，
   两者都必须过 script.json 校验。
3. 版本：原版存 5 个历史版本（同一脚本重复 5 份）。本版只取最新 release，并按项目名去重。
4. 分类：原版子串匹配，"ai" 会命中 email / trainer。本版 ASCII 关键词按词边界匹配。
5. 简介：原版用 60 词条词典逐词替换（with -> 配合）。本版直接取 script.json 里的真实中文描述。
6. 清理：保留原版的安全策略（搜索失败跳过清理、非 404 不删、抓取失败保留旧文件）。
7. 安全：敏感文件名直接跳过；文本内容中的疑似密钥替换为 [REDACTED_SECRET]；
   含疑似密钥的 release 压缩包整包不收录。所有处理记录在运行摘要中。

运行环境：GitHub Actions，仅依赖标准库。设置 GITHUB_TOKEN 可把 API 限额提到 5000/小时。
设置 DRY_RUN=1 可只看结果不落盘。

逻辑优化（在上述版本基础上）：
8. 内容同步：旧版对已存在的文件只做脱敏检查、永不抓新版，上游改了同名文件永远同步不到。
   本版用源码树返回的 blob SHA 判断文件是否变化：未变零下载，变了才抓取并比对落盘；
   无 SHA 信息时退回抓取比对。抓取失败仍保留本地文件。
9. 抓取失败不连坐：源码树整体失败时仓库记为 error（保留全部文件、不发布）；
   单个项目 script.json 抓取失败时保留该项目已有文件，不再被清理误删。
10. zip 只开一次：敏感名检查、密钥扫描、script.json 提取合并为单次遍历；
    已下载的 release zip 若与线上体积不一致会重新下载；单个成员解压体积设上限防 zip 炸弹。
11. strip_html 先整段移除 script/style/注释，再用标准库 html.unescape 解码全部实体
    （含数字实体），不再手写 5 个实体替换、留下 <style> 正文。
"""
import fnmatch
import hashlib
import html
import io
import json
import os
import re
import shutil
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone

TOKEN = os.environ.get("GITHUB_TOKEN", "")
DRY_RUN = os.environ.get("DRY_RUN", "") not in ("", "0", "false", "False")

ROOT = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.join(ROOT, "scripts-store")
INDEX_PATH = os.path.join(ROOT, "index.json")
CATALOG_PATH = os.path.join(ROOT, "CATALOG.md")

SEARCH_QUERIES = [
    "topic:scripting",
    "topic:scriptable",
    "topic:ios-scripting",
    "topic:scripting-app",
    "scripting in:name,description",
    "scriptable in:name,description",
    "scripting 脚本 in:name,description",
    "scripting 小组件 in:name,description",
]

MAX_REPOS_PER_QUERY = 50
MAX_PROJECTS_PER_REPO = 40
MAX_FILES_PER_PROJECT = 250
MAX_FILE_BYTES = 4 * 1024 * 1024
MAX_ZIP_BYTES = 25 * 1024 * 1024
MAX_ZIP_MEMBER_BYTES = 64 * 1024 * 1024  # zip 单个成员解压后体积上限，防 zip 炸弹
MAX_REPO_BYTES = 40 * 1024 * 1024

ALLOWED_EXT = (
    ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt", ".css", ".html",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".plist", ".scripting", ".zip",
)

SKIP_DIRS = {".git", ".github", "node_modules", ".vscode", "__pycache__", ".idea", "dist", "build"}

# 敏感文件名（按文件名小写匹配，不看目录）。命中则整个文件不保存。
SENSITIVE_NAME_GLOBS = [
    ".env*", "*credential*", "*secret*", "*token*", "*password*", "*passwd*",
    "*.pem", "*.key", "*.p12", "*.pfx", "*.keystore", "*.mobileprovision",
    "id_rsa*", "id_ed25519*", "*auth*",
]

# 疑似密钥的高置信度模式。命中的内容替换为 REDACTED，而不是保存原文。
SECRET_PATTERNS = [re.compile(p) for p in (
    # 私钥整块（先匹配整段，避免只留下头尾）
    "-----BEGIN [A-Z ]*PRIVATE KEY-----[^-]*-----END [A-Z ]*PRIVATE KEY-----",
    # GitHub 令牌：ghp_ / gho_ / ghu_ / ghs_ / ghr_
    "gh[pousr]_[A-Za-z0-9]{36}",
    # GitHub 细粒度令牌
    "github_pat_[A-Za-z0-9_]{82}",
    # OpenAI / Anthropic 等 sk- 开头的密钥
    "sk-[A-Za-z0-9_-]{20,}",
    # AWS 访问密钥 ID
    "AKIA[0-9A-Z]{16}",
    # Telegram Bot Token：数字:35 位字符
    "(?<![0-9])[0-9]{8,10}:[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])",
    # Slack 令牌
    "xox[baprs]-[A-Za-z0-9-]{10,}",
    # Google API Key
    "AIza[0-9A-Za-z_-]{35}",
    # Google OAuth 客户端 ID（数字-哈希.apps.googleusercontent.com）
    "[0-9]{6,12}-[A-Za-z0-9_-]{10,}\\.apps\\.googleusercontent\\.com",
    # Google OAuth 客户端密钥（GOCSPX- 开头）
    "GOCSPX-[A-Za-z0-9_-]{10,}",
)]
REDACTED = "[REDACTED_SECRET]"

# 分类规则：ASCII 关键词按词边界匹配，中文关键词按子串匹配。
CATEGORY_RULES = [
    ("小组件", ["widget", "widgets", "小组件"]),
    ("签到", ["check-in", "checkin", "签到", "打卡"]),
    ("快捷指令与自动化", ["shortcut", "shortcuts", "automation", "automate", "快捷指令", "自动化"]),
    ("AI 与翻译", ["ai", "chatgpt", "openai", "llm", "translate", "translation", "translator", "翻译"]),
    ("媒体与下载", ["video", "player", "download", "downloader", "photo", "photos", "music",
                 "媒体", "下载", "照片", "相册"]),
    ("效率工具", ["tool", "tools", "utility", "helper", "manager", "editor",
                 "编辑器", "工具", "助手", "管理"]),
    ("模板与示例", ["template", "example", "sample", "demo", "模板", "示例"]),
]
DEFAULT_CATEGORY = "其他"

CJK_RE = re.compile("[\u4e00-\u9fff]")
HTML_TAG_RE = re.compile("<[^>]{1,400}>")
HTML_BLOCK_RE = re.compile(
    r"<!--.*?-->|<script\b[^>]*>.*?</script\s*>|<style\b[^>]*>.*?</style\s*>",
    re.IGNORECASE | re.DOTALL)
WS_RE = re.compile(r"\s+")
ILLEGAL_RE = re.compile(r'[\\/:*?"<>|\x00-\x1f]')

# 运行状态
STATUS = {}          # (owner, repo) -> "ok" | "empty" | "error"
EXPECTED_FILES = {}  # (owner, repo) -> set(绝对路径)
SECURITY_LOG = []    # 敏感文件跳过、密钥脱敏、压缩包跳过的记录
SEARCH_FAILED = False
RATE_LIMITED = False


def has_cjk(text):
    return bool(text) and bool(CJK_RE.search(text))


def scrub_text(text):
    """把疑似密钥替换为 REDACTED。返回 (新文本, 替换处数)。"""
    count = 0
    for pat in SECRET_PATTERNS:
        text, n = pat.subn(REDACTED, text)
        count += n
    return text, count


def sanitize_bytes(data):
    """对可按 UTF-8 解码的内容做脱敏。二进制文件原样返回。返回 (字节, 替换处数)。"""
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return data, 0
    new_text, n = scrub_text(text)
    if n == 0:
        return data, 0
    return new_text.encode("utf-8"), n


def is_sensitive_name(path):
    base = os.path.basename(path).lower()
    return any(fnmatch.fnmatch(base, g) for g in SENSITIVE_NAME_GLOBS)


def security_log(target, reason):
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    SECURITY_LOG.append({"target": target, "reason": reason, "time": now})
    print("安全过滤: {}（{}）".format(target, reason))


def strip_html(text):
    """去掉 HTML 标签与实体残留，用于清洗被误当作简介的整段网页。

    先整段移除 script/style/注释（否则 CSS/JS 正文会残留），再剥标签，
    最后用标准库解码全部实体（含 &#39; 这类数字实体）。"""
    if not text:
        return ""
    text = HTML_BLOCK_RE.sub(" ", text)
    text = HTML_TAG_RE.sub(" ", text)
    text = html.unescape(text)
    return WS_RE.sub(" ", text).strip()


def clean_text(text, limit=240):
    """压平空白、去 HTML、脱敏、截断。"""
    if not text:
        return ""
    text = scrub_text(strip_html(str(text)))[0]
    if len(text) > limit:
        text = text[:limit].rstrip() + "…"
    return text


def ascii_word_hit(keyword, text):
    """ASCII 关键词按词边界匹配，避免 "ai" 命中 email / trainer / detail。"""
    pattern = r"(?<![a-z0-9])" + re.escape(keyword) + r"(?![a-z0-9])"
    return re.search(pattern, text) is not None


def _compile_category_rules():
    """把分类关键词预编译一次：中文关键词走子串，ASCII 关键词走预编译的词边界正则。"""
    compiled = []
    for category, keywords in CATEGORY_RULES:
        matchers = []
        for kw in keywords:
            if has_cjk(kw):
                matchers.append(("substr", kw))
            else:
                pattern = r"(?<![a-z0-9])" + re.escape(kw) + r"(?![a-z0-9])"
                matchers.append(("re", re.compile(pattern)))
        compiled.append((category, matchers))
    return compiled


_CATEGORY_MATCHERS = _compile_category_rules()


def categorize(text):
    """按名称 / 描述归类。中文关键词用子串，英文关键词用词边界。"""
    low = (text or "").lower()
    for category, matchers in _CATEGORY_MATCHERS:
        for kind, kw in matchers:
            if kind == "substr":
                if kw in text:
                    return category
            elif kw.search(low):
                return category
    return DEFAULT_CATEGORY


def safe_name(name):
    """目录/文件名清洗。保留中文，仅替换路径非法字符。"""
    cleaned = ILLEGAL_RE.sub("_", str(name)).strip().strip(".")
    return cleaned or "_"


def skip_path(path):
    return any(part in SKIP_DIRS for part in path.split("/"))


def allowed_ext(path):
    return path.lower().endswith(ALLOWED_EXT)


def is_project_json(obj):
    """判定一份 script.json 是否像一个 Scripting App 项目配置。"""
    if not isinstance(obj, dict):
        return False
    name = obj.get("name")
    entry = obj.get("entry")
    has_name = isinstance(name, str) and name.strip() != ""
    has_entry = isinstance(entry, str) and entry.strip() != ""
    return has_name or has_entry


def group_project_files(blob_paths):
    """从源码树路径里找出所有含 script.json 的项目目录，并把文件归到最深的那一层。"""
    dirs = []
    for p in blob_paths:
        if p == "script.json":
            dirs.append("")
        elif p.endswith("/script.json"):
            dirs.append(p[: -len("/script.json")])
    dirs = [d for d in dict.fromkeys(dirs) if not skip_path(d)]
    # 按长度从长到短排：第一个命中即最深层项目，可提前结束，不再逐个比较。
    dirs.sort(key=len, reverse=True)

    groups = {d: [] for d in dirs}
    for p in blob_paths:
        if skip_path(p) or not allowed_ext(p):
            continue
        for d in dirs:
            if d == "" or p.startswith(d + "/"):
                groups[d].append(p)
                break
    return {d: sorted(files) for d, files in groups.items() if files}


def pick_description(meta):
    """优先取 script.json 的 localizedDescriptions.zh，其次 description。"""
    if not isinstance(meta, dict):
        return ""
    loc = meta.get("localizedDescriptions")
    if isinstance(loc, dict):
        zh = loc.get("zh")
        if isinstance(zh, str) and zh.strip():
            return zh.strip()
    desc = meta.get("description")
    return desc.strip() if isinstance(desc, str) else ""


def pick_zh_name(meta, fallback):
    if isinstance(meta, dict):
        loc = meta.get("localizedNames")
        if isinstance(loc, dict):
            zh = loc.get("zh")
            if isinstance(zh, str) and zh.strip():
                return zh.strip()
        name = meta.get("name")
        if isinstance(name, str) and name.strip():
            return name.strip()
    return fallback


class RateLimited(Exception):
    """API 限额用尽。触发后立即停止扫描，并且不做清理。"""


def api(url, accept="application/vnd.github+json"):
    headers = {"Accept": accept, "User-Agent": "scripting-hub-sync"}
    if TOKEN:
        headers["Authorization"] = "Bearer " + TOKEN
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        remaining = e.headers.get("X-RateLimit-Remaining") if e.headers else None
        if e.code in (403, 429) and remaining == "0":
            raise RateLimited(url)
        raise


def fetch_bytes(url, limit):
    headers = {"User-Agent": "scripting-hub-sync"}
    if TOKEN:
        headers["Authorization"] = "Bearer " + TOKEN
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read(limit + 1)
    if len(data) > limit:
        raise ValueError("over size limit")
    return data


def raw_url(full_name, branch, path):
    return "https://raw.githubusercontent.com/{}/{}/{}".format(
        full_name,
        urllib.parse.quote(branch, safe=""),
        urllib.parse.quote(path, safe="/"),
    )


def inspect_zip(src):
    """单次遍历 zip：敏感文件名检查 + 疑似密钥扫描 + script.json 提取。

    返回 (是否安全, 不安全原因, 项目 meta 或 None)。src 可传 bytes 或已存在的文件路径。
    旧版 zip_is_clean 与 zip_project_meta 各开一次包、每个成员各读一遍，这里合并为一遍。
    """
    meta = None
    try:
        z = zipfile.ZipFile(src)
        for info in z.infolist():
            n = info.filename
            if n.endswith("/"):
                continue
            if is_sensitive_name(n):
                return False, "压缩包内含敏感文件名 " + n, None
            if info.file_size > MAX_ZIP_MEMBER_BYTES:
                return False, "压缩包成员解压体积过大（{}）".format(n), None
            data = z.read(n)
            _, count = sanitize_bytes(data)
            if count:
                return False, "压缩包内含疑似密钥：" + n, None
            if meta is None and (n == "script.json" or n.endswith("/script.json")):
                try:
                    obj = json.loads(data.decode("utf-8", errors="ignore"))
                except Exception:
                    continue
                if is_project_json(obj):
                    meta = obj
        return True, "", meta
    except Exception as e:
        return False, "压缩包无法安全检查（{}）".format(e), None


def zip_is_clean(src):
    """压缩包内任一成员文件名敏感或内容含疑似密钥，则整包不收录。返回 (是否通过, 原因)。"""
    ok, why, _ = inspect_zip(src)
    return ok, why


def zip_project_meta(src):
    """校验 zip 内是否含合法 script.json。src 可传 bytes 或已存在的文件路径。"""
    return inspect_zip(src)[2]


def read_remote_project_json(full_name, branch, dirpath):
    path = (dirpath + "/" if dirpath else "") + "script.json"
    data = fetch_bytes(raw_url(full_name, branch, path), 256 * 1024)
    obj = json.loads(data.decode("utf-8", errors="ignore"))
    return obj if is_project_json(obj) else None


def git_blob_sha(data):
    """计算 Git blob 的 SHA-1，与源码树 API 返回的 blob sha 可直接比对。"""
    header = "blob {}\0".format(len(data)).encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def write_file(dest, data):
    parent = os.path.dirname(dest)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(dest, "wb") as f:
        f.write(data)


def apply_project_files(full_name, branch, files, dest_root, expected, blob_shas=None):
    """把项目目录里的文件同步到本地。返回写入（或计划写入）的文件数。

    已有文件不再是"只脱敏、永不更新"：先用 blob SHA 判断上游是否改过
    （blob_shas 为 path -> sha，来自源码树 API），没变就零下载跳过；
    变了或没有 SHA 信息时才抓取，抓到的内容脱敏后与本地比对，不同才落盘。
    抓取失败一律保留本地文件（沿用原版的保守策略）。
    """
    total = 0
    written = 0
    for rel in files[:MAX_FILES_PER_PROJECT]:
        target = full_name + "/" + rel
        if is_sensitive_name(rel):
            security_log(target, "文件名命中敏感规则，未保存")
            continue
        dest = os.path.join(dest_root, rel)
        local = None
        if os.path.exists(dest):
            with open(dest, "rb") as f:
                local = f.read()
            local, count = sanitize_bytes(local)
            if count:
                security_log(target, "已有文件含疑似密钥，已脱敏（{} 处）".format(count))
                if not DRY_RUN:
                    write_file(dest, local)
            remote_sha = (blob_shas or {}).get(rel)
            if remote_sha and git_blob_sha(local) == remote_sha:
                expected.add(os.path.abspath(dest))
                written += 1
                continue
        try:
            data = fetch_bytes(raw_url(full_name, branch, rel), MAX_FILE_BYTES)
        except RateLimited:
            raise
        except Exception as e:
            if local is not None:
                # 抓新版失败：保留本地文件，不让它被清理误删。
                print("  更新文件失败，保留本地版本 {} {}: {}".format(full_name, rel, e))
                expected.add(os.path.abspath(dest))
                written += 1
            else:
                print("  跳过文件 {} {}: {}".format(full_name, rel, e))
            continue
        data, count = sanitize_bytes(data)
        if count:
            security_log(target, "疑似密钥，已脱敏（{} 处）".format(count))
        if local is not None and data == local:
            expected.add(os.path.abspath(dest))
            written += 1
            continue
        total += len(data)
        if total > MAX_REPO_BYTES:
            print("  {} 超过单仓库体积上限，停止".format(full_name))
            break
        if not DRY_RUN:
            write_file(dest, data)
        expected.add(os.path.abspath(dest))
        written += 1
    return written


def scan_repo(full_name, item):
    """处理单个仓库：源码树 + 最新 release，两路都过 script.json 校验。"""
    owner, repo = full_name.split("/", 1)
    key = (safe_name(owner), safe_name(repo))
    expected = EXPECTED_FILES.setdefault(key, set())
    branch = item.get("default_branch") or "main"
    projects = {}
    errors = 0

    # ---- 1. 源码树 ----
    blobs = []
    blob_shas = {}
    tree_failed = False
    try:
        url = "https://api.github.com/repos/{}/git/trees/{}?recursive=1".format(
            full_name, urllib.parse.quote(branch, safe=""))
        tree = api(url)
        for t in tree.get("tree", []):
            if t.get("type") == "blob":
                p = t.get("path", "")
                blobs.append(p)
                if t.get("sha"):
                    blob_shas[p] = t["sha"]
        if tree.get("truncated"):
            print("  {} 源码树被截断，只处理可见部分".format(full_name))
    except RateLimited:
        raise
    except Exception as e:
        errors += 1
        tree_failed = True
        print("  {} 读取源码树失败: {}".format(full_name, e))

    if blobs:
        groups = group_project_files(blobs)
        for dirpath, files in list(groups.items())[:MAX_PROJECTS_PER_REPO]:
            fallback = dirpath.split("/")[-1] if dirpath else repo
            dest_root = os.path.join(STORE, key[0], key[1], "projects", safe_name(dirpath or fallback))
            try:
                meta = read_remote_project_json(full_name, branch, dirpath)
            except RateLimited:
                raise
            except Exception as e:
                errors += 1
                print("  读取 {}/script.json 失败: {}".format(dirpath or ".", e))
                # 抓取失败不连坐：该项目已有文件先标记保留，避免被清理误删。
                if os.path.isdir(dest_root):
                    for root, _dirs, fnames in os.walk(dest_root):
                        for fn in fnames:
                            expected.add(os.path.abspath(os.path.join(root, fn)))
                continue
            if meta is None:
                continue
            name = pick_zh_name(meta, fallback)
            count = apply_project_files(full_name, branch, files, dest_root, expected, blob_shas)
            if count == 0:
                continue
            projects[name.lower()] = {
                "name": name,
                "version": str(meta.get("version") or ""),
                "icon": meta.get("icon") if isinstance(meta.get("icon"), str) else None,
                "description": clean_text(pick_description(meta)),
                "entry": (meta.get("entry") if isinstance(meta.get("entry"), str) else "index.tsx"),
                "dir": os.path.relpath(dest_root, ROOT),
                "files": count,
                "source": "tree",
            }

    # ---- 2. 最新 release（只取一个版本，避免同一脚本存 5 份）----
    rel = None
    try:
        rel = api("https://api.github.com/repos/{}/releases/latest".format(full_name))
    except urllib.error.HTTPError as e:
        if e.code != 404:
            errors += 1
            print("  {} 获取 release 失败: HTTP {}".format(full_name, e.code))
    except RateLimited:
        raise
    except Exception as e:
        errors += 1
        print("  {} 获取 release 失败: {}".format(full_name, e))

    if rel:
        tag = safe_name(rel.get("tag_name") or "untagged")
        for asset in rel.get("assets", []):
            aname = asset.get("name") or ""
            if not aname.lower().endswith(".zip"):
                continue
            try:
                size = int(asset.get("size") or 0)
            except Exception:
                size = 0
            if size > MAX_ZIP_BYTES:
                continue
            stem = aname[:-4].lower()
            if stem in projects:
                continue
            target = full_name + "/" + aname
            if is_sensitive_name(aname):
                security_log(target, "文件名命中敏感规则，未保存")
                continue
            dest = os.path.join(STORE, key[0], key[1], "releases", tag, safe_name(aname))
            try:
                # 已下载的 zip 若体积与线上不一致（同 tag 资产被替换过），重新下载。
                have_local = os.path.exists(dest) and (
                    not size or os.path.getsize(dest) == size)
                if have_local:
                    ok, why, meta = inspect_zip(dest)
                    if not ok:
                        security_log(target, why)
                        continue
                else:
                    data = fetch_bytes(asset.get("browser_download_url", ""), MAX_ZIP_BYTES)
                    ok, why, meta = inspect_zip(io.BytesIO(data))
                    if not ok:
                        security_log(target, why)
                        continue
                    if meta is not None and not DRY_RUN:
                        write_file(dest, data)
            except RateLimited:
                raise
            except Exception as e:
                errors += 1
                print("  下载 {} {} 失败: {}".format(full_name, aname, e))
                continue
            if meta is None:
                continue
            expected.add(os.path.abspath(dest))
            name = pick_zh_name(meta, stem)
            if name.lower() in projects:
                continue
            projects[name.lower()] = {
                "name": name,
                "version": str(meta.get("version") or rel.get("tag_name") or ""),
                "icon": meta.get("icon") if isinstance(meta.get("icon"), str) else None,
                "description": clean_text(pick_description(meta)),
                "entry": (meta.get("entry") if isinstance(meta.get("entry"), str) else "index.tsx"),
                "dir": os.path.relpath(dest, ROOT),
                "files": 1,
                "source": "release",
            }

    if tree_failed:
        # 源码树整体失败：即使 release 有产出也记 error —— 本次不发布、清理时整仓保留，
        # 否则已同步的源码树文件会因为不在 expected 里被当作失效文件删掉。
        STATUS[key] = "error"
    elif projects:
        STATUS[key] = "ok"
    elif errors:
        STATUS[key] = "error"
    else:
        STATUS[key] = "empty"

    all_text = "{} {}".format(item.get("description") or "",
                               " ".join("{} {}".format(p["name"], p["description"]) for p in projects.values()))
    return {
        "repo": full_name,
        "url": item.get("html_url") or ("https://github.com/" + full_name),
        "stars": item.get("stargazers_count", 0),
        "language": item.get("language") or "",
        "branch": branch,
        "category": categorize(all_text),
        "status": STATUS[key],
        "projects": sorted(projects.values(), key=lambda p: p["name"]),
    }


def search_repos(query, found):
    global SEARCH_FAILED
    q = urllib.parse.quote(query + " fork:false archived:false")
    url = "https://api.github.com/search/repositories?q={}&sort=updated&per_page={}".format(
        q, MAX_REPOS_PER_QUERY)
    try:
        items = api(url).get("items", [])
    except RateLimited:
        raise
    except Exception as e:
        SEARCH_FAILED = True
        print("搜索 {} 失败: {}".format(query, e))
        return
    for item in items:
        name = item.get("full_name")
        if name and name not in found:
            found[name] = item


def find_repos():
    found = {}
    for query in SEARCH_QUERIES:
        search_repos(query, found)
    return found


def check_repo_status(full_name):
    """只对“确定没了”的仓库返回 True。其余情况一律保留，避免误删。"""
    try:
        info = api("https://api.github.com/repos/{}".format(full_name))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return True, "仓库已删除（404）"
        return False, "无法确认状态（HTTP {}）".format(e.code)
    except RateLimited:
        raise
    except Exception as e:
        return False, "无法确认状态（{}）".format(e)
    if info.get("private"):
        return True, "仓库已转为私有"
    if info.get("archived"):
        return True, "仓库已归档"
    return False, "仓库仍存在，但本次未产出项目"


def prune_files(repo_path, expected, pruned_log, now):
    for root, dirs, files in os.walk(repo_path, topdown=False):
        for fn in files:
            p = os.path.abspath(os.path.join(root, fn))
            if p not in expected:
                rel = os.path.relpath(p, ROOT)
                print("清理失效文件: {}".format(rel))
                if not DRY_RUN:
                    os.remove(p)
                pruned_log.append({"type": "file", "target": rel,
                                  "reason": "已不在任何有效项目中", "time": now})
        for d in dirs:
            p = os.path.join(root, d)
            if not DRY_RUN and os.path.isdir(p) and not os.listdir(p):
                os.rmdir(p)


def prune(pruned_log, now):
    """按 STATUS 清理。未扫过的仓库只在确定已删除/私有/归档时才删。"""
    if not os.path.isdir(STORE):
        return
    if SEARCH_FAILED or RATE_LIMITED:
        print("本次有搜索失败或限流，为安全起见跳过所有清理。")
        return
    for owner_dir in sorted(os.listdir(STORE)):
        owner_path = os.path.join(STORE, owner_dir)
        if not os.path.isdir(owner_path):
            continue
        for repo_dir in sorted(os.listdir(owner_path)):
            repo_path = os.path.join(owner_path, repo_dir)
            if not os.path.isdir(repo_path):
                continue
            key = (owner_dir, repo_dir)
            full_name = "{}/{}".format(owner_dir, repo_dir)
            status = STATUS.get(key)

            if status is None:
                gone, reason = check_repo_status(full_name)
                if gone:
                    if not DRY_RUN:
                        shutil.rmtree(repo_path)
                    print("移除仓库: {} ({})".format(full_name, reason))
                    pruned_log.append({"type": "repo", "target": full_name,
                                       "reason": reason, "time": now})
                else:
                    print("保留仓库: {} ({})".format(full_name, reason))
            elif status == "error":
                print("保留仓库: {}（本次抓取失败）".format(full_name))
            elif status == "empty":
                if not DRY_RUN:
                    shutil.rmtree(repo_path)
                print("移除仓库: {}（未发现 Scripting 项目）".format(full_name))
                pruned_log.append({"type": "repo", "target": full_name,
                                   "reason": "未发现合法 script.json 项目", "time": now})
            else:
                prune_files(repo_path, EXPECTED_FILES.get(key, set()), pruned_log, now)
        if os.path.isdir(owner_path) and not DRY_RUN and not os.listdir(owner_path):
            os.rmdir(owner_path)


def build_index(published, now):
    repos = []
    for r in published:
        repos.append({
            "repo": r["repo"],
            "url": r["url"],
            "stars": r["stars"],
            "language": r["language"],
            "branch": r["branch"],
            "category": r["category"],
            "projects": [
                {"name": p["name"], "version": p["version"], "description": p["description"],
                 "dir": p["dir"], "entry": p["entry"], "files": p["files"],
                 "icon": p["icon"], "source": p["source"]}
                for p in r["projects"]
            ],
        })
    repos.sort(key=lambda r: (-r["stars"], r["repo"].lower()))
    return {
        "updated_at": now,
        "count": len(repos),
        "project_count": sum(len(r["projects"]) for r in repos),
        "repos": repos,
    }


def build_catalog(index, pruned_log, now):
    lines = ["# 脚本中心目录", "", "最近同步时间：{}".format(now), ""]
    lines.append("收录 {} 个仓库 / {} 个可导入的 Scripting 项目。".format(
        index["count"], index["project_count"]))
    lines.append("")
    lines.append("> 只收录包含合法 `script.json` 的 Scripting App 项目；"
                 "说明文字优先取自脚本自带的 description。")
    lines.append("")

    by_cat = {}
    for r in index["repos"]:
        by_cat.setdefault(r["category"], []).append(r)

    for cat in sorted(by_cat):
        items = by_cat[cat]
        lines.append("### {}（{}）".format(cat, sum(len(r["projects"]) for r in items)))
        lines.append("")
        lines.append("| 脚本 | 版本 | 说明 | 仓库 | Star | 来源 |")
        lines.append("|---|---|---|---|---|---|")
        for r in items:
            for p in r["projects"]:
                desc = (p["description"] or "—").replace("|", "/")
                lines.append("| {} | {} | {} | [{}]({}) | {} | {} |".format(
                    p["name"].replace("|", "/"), p["version"] or "—", desc,
                    r["repo"], r["url"], r["stars"], p["source"]))
        lines.append("")

    lines.append("## 清理记录")
    lines.append("")
    if not pruned_log:
        lines.append("本次没有需要清理的内容。")
    else:
        lines.append("| 时间 | 类型 | 对象 | 原因 |")
        lines.append("|---|---|---|---|")
        for p in pruned_log:
            lines.append("| {} | {} | {} | {} |".format(
                p["time"], p["type"], p["target"], p["reason"]))
    lines.append("")
    return "\n".join(lines)


def build_summary(index, pruned_log):
    """生成 Actions 步骤摘要（Markdown）。"""
    removed_repos = [p for p in pruned_log if p["type"] == "repo"]
    removed_files = [p for p in pruned_log if p["type"] == "file"]
    lines = ["## 脚本中心同步结果", ""]
    lines.append("| 指标 | 数值 |")
    lines.append("|---|---|")
    lines.append("| 收录仓库 | {} |".format(index["count"]))
    lines.append("| 可导入项目 | {} |".format(index["project_count"]))
    lines.append("| 移除仓库 | {} |".format(len(removed_repos)))
    lines.append("| 清理文件 | {} |".format(len(removed_files)))
    lines.append("| 安全过滤 | {} |".format(len(SECURITY_LOG)))
    lines.append("")

    if index["repos"]:
        lines.append("<details><summary>项目数最多的仓库</summary>")
        lines.append("")
        lines.append("| 仓库 | 项目数 | Star |")
        lines.append("|---|---|---|")
        top = sorted(index["repos"], key=lambda r: -len(r["projects"]))[:10]
        for r in top:
            lines.append("| {} | {} | {} |".format(r["repo"], len(r["projects"]), r["stars"]))
        lines.append("")
        lines.append("</details>")
        lines.append("")

    if SECURITY_LOG:
        lines.append("### 安全过滤记录")
        lines.append("")
        for s in SECURITY_LOG[:20]:
            lines.append("- `{}` — {}".format(s["target"], s["reason"]))
        if len(SECURITY_LOG) > 20:
            lines.append("- …另有 {} 个".format(len(SECURITY_LOG) - 20))
        lines.append("")

    if removed_repos:
        lines.append("### 已移除的仓库")
        lines.append("")
        for p in removed_repos[:15]:
            lines.append("- `{}` — {}".format(p["target"], p["reason"]))
        if len(removed_repos) > 15:
            lines.append("- …另有 {} 个".format(len(removed_repos) - 15))
        lines.append("")

    if DRY_RUN:
        lines.append("> ⚠️ 本次为 DRY_RUN，未写入任何文件。")
        lines.append("")
    return "\n".join(lines)


def write_step_summary(index, pruned_log):
    """在 GitHub Actions 中把摘要写到步骤页面；非 Actions 环境自动跳过。"""
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return False
    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(build_summary(index, pruned_log))
        return True
    except Exception as e:
        print("写入 Actions 摘要失败: {}".format(e))
        return False


def main():
    global RATE_LIMITED, SEARCH_FAILED
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    print("开始同步（DRY_RUN={}）".format(DRY_RUN))

    try:
        found = find_repos()
    except RateLimited:
        print("搜索阶段就限流了，本次退出，不做任何修改。")
        return 1

    print("候选仓库 {} 个".format(len(found)))
    published = []
    pruned_log = []

    for full_name in sorted(found):
        try:
            rec = scan_repo(full_name, found[full_name])
        except RateLimited:
            RATE_LIMITED = True
            SEARCH_FAILED = True
            print("扫描中限流，停止。已完成 {} 个仓库。".format(len(STATUS)))
            break
        except Exception as e:
            owner, _, repo = full_name.partition("/")
            STATUS[(safe_name(owner), safe_name(repo))] = "error"
            print("{} 处理失败: {}".format(full_name, e))
            continue
        if rec["status"] == "ok":
            published.append(rec)
            print("✓ {}：{} 个项目".format(full_name, len(rec["projects"])))

    prune(pruned_log, now)
    index = build_index(published, now)
    write_step_summary(index, pruned_log)

    if DRY_RUN:
        print("\n[DRY_RUN] 将收录 {} 个仓库 / {} 个项目".format(
            index["count"], index["project_count"]))
        for r in index["repos"]:
            print("  {} ({})".format(r["repo"], len(r["projects"])))
        return 0

    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    with open(CATALOG_PATH, "w", encoding="utf-8") as f:
        f.write(build_catalog(index, pruned_log, now))

    print("完成：{} 个仓库 / {} 个项目，安全过滤 {} 条".format(
        index["count"], index["project_count"], len(SECURITY_LOG)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

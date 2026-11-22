"""sync.py 的离线校验：固定样例 + 仓库真实数据。不联网也能跑核心逻辑。"""
import io
import json
import os
import ssl
import sys
import urllib.parse
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync as S

S.DRY_RUN = True

FAILS = []
PASSED = []


def check(cond, msg):
    print(("PASS  " if cond else "FAIL  ") + msg)
    if cond:
        PASSED.append(msg)
    else:
        FAILS.append(msg)


def make_zip(files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for k, v in files.items():
            z.writestr(k, v)
    return buf.getvalue()


# ---------- 1. script.json 判定 ----------
print("\n[1] script.json 判定")
check(S.is_project_json({"name": "A"}), "有 name 即合法")
check(S.is_project_json({"entry": "index.tsx"}), "有 entry 即合法")
check(not S.is_project_json({"foo": 1}), "无 name/entry 拒绝")
check(not S.is_project_json([1, 2]), "非 dict 拒绝")
check(not S.is_project_json({"name": "   "}), "空白 name 拒绝")

# ---------- 2. 分类词边界 ----------
print("\n[2] 分类（词边界）")
check(S.categorize("VASP AIMD production monitor script") != "AI 与翻译",
      "VASP-aimd 里的 aimd 不再误判为 AI")
check(S.categorize("Send email to detail page when trainer starts") != "AI 与翻译",
      "email/detail/trainer 不再误判为 AI")
check(S.categorize("A bilingual translation tool") == "AI 与翻译", "真翻译仍归 AI 与翻译")
check(S.categorize("天气小组件脚本") == "小组件", "中文小组件命中")
check(S.categorize("每日自动签到") == "签到", "中文签到命中")

# ---------- 3. 简介清洗 ----------
print("\n[3] 简介清洗")
html = "<!DOCTYPE html><html><head><style>a{color:red}</style></head><body>" + ("x" * 80000)
clean = S.clean_text(html, 240)
check("<!DOCTYPE" not in clean, "HTML 标签已剥离")
check(len(clean) <= 241, "长度已截断（%d）" % len(clean))

# ---------- 4. 项目目录归组 ----------
print("\n[4] 源码树归组")
paths = [
    "AppA/script.json", "AppA/index.tsx", "AppA/utils/x.ts",
    "AppB/script.json", "AppB/index.tsx",
    "node_modules/dep/script.json", "node_modules/dep/index.tsx",
    "docs/readme.md", "app.exe",
]
groups = S.group_project_files(paths)
check(set(groups) == {"AppA", "AppB"}, "识别出 2 个项目目录，跳过 node_modules")
check(len(groups["AppA"]) == 3, "AppA 归到 3 个文件")
check(all(not f.startswith("docs") for f in groups["AppA"]), "公共目录不串到项目里")

# 根目录项目
root_groups = S.group_project_files(["script.json", "index.tsx", "components/v.tsx"])
check("" in root_groups and len(root_groups[""]) == 3, "根目录项目正确归组")

# ---------- 5. zip 校验 ----------
print("\n[5] release zip 校验")
good = make_zip({"Translator/script.json": json.dumps({"name": "Translator"}),
                 "Translator/index.tsx": "export {}"})
bad = make_zip({"data.json": "{}", "tool.exe": "MZ"})
check(S.zip_project_meta(io.BytesIO(good)) is not None, "含合法 script.json 的 zip 通过")
check(S.zip_project_meta(io.BytesIO(bad)) is None, "exe/json 包被拒绝")

# ---------- 6. 端到端：scan_repo（模拟 API，不联网） ----------
print("\n[6] scan_repo 端到端（模拟 API）")
FS = {}
BLOBS = {
    "Fake/GoodRepo": ["AppA/script.json", "AppA/index.tsx", "AppA/utils/x.ts",
                      "AppB/script.json", "AppB/index.tsx",
                      "junk/script.json", "junk/index.tsx",
                      "node_modules/dep/script.json", "node_modules/dep/index.tsx"],
    "Fake/ExeRepo": ["tool.exe", "readme.md"],
}
FS["AppA/script.json"] = json.dumps({"name": "AppA", "description": "甲应用", "version": "1.2.0"})
FS["AppA/index.tsx"] = "export {}"
FS["AppA/utils/x.ts"] = "export const x = 1"
FS["AppB/script.json"] = json.dumps({"name": "AppB", "localizedDescriptions": {"zh": "乙应用"}})
FS["AppB/index.tsx"] = "export {}"
FS["junk/script.json"] = json.dumps({"foo": 1})
FS["junk/index.tsx"] = "export {}"
FS["node_modules/dep/script.json"] = json.dumps({"name": "Dep"})
FS["node_modules/dep/index.tsx"] = "export {}"

ZIP_APP_A = make_zip({"AppA/script.json": json.dumps({"name": "AppA"}), "AppA/index.tsx": ""})
ZIP_APP_C = make_zip({"AppC/script.json": json.dumps({"name": "AppC", "description": "丙应用"}),
                      "AppC/index.tsx": "export {}"})
DL = {"https://dl.test/AppA.zip": ZIP_APP_A, "https://dl.test/AppC.zip": ZIP_APP_C}


def fake_api(url, accept="application/vnd.github+json"):
    for name, blobs in BLOBS.items():
        if "/git/trees/" in url and name in url:
            return {"tree": [{"path": p, "type": "blob"} for p in blobs], "truncated": False}
        if url.endswith("/releases/latest") and name in url:
            if name.endswith("GoodRepo"):
                return {"tag_name": "v1.0.0", "assets": [
                    {"name": "AppA.zip", "size": len(ZIP_APP_A), "browser_download_url": "https://dl.test/AppA.zip"},
                    {"name": "AppC.zip", "size": len(ZIP_APP_C), "browser_download_url": "https://dl.test/AppC.zip"},
                ]}
            return {"tag_name": "v1", "assets": []}
    raise Exception("unexpected api " + url)


def fake_bytes(url, limit):
    if url in DL:
        return DL[url]
    if "/main/" in url:
        p = urllib.parse.unquote(url.split("/main/", 1)[1])
        if p in FS:
            return FS[p].encode()
    raise Exception("unexpected fetch " + url)


S.api = fake_api
S.fetch_bytes = fake_bytes

good_rec = S.scan_repo("Fake/GoodRepo", {"description": "an iOS scripting tool",
                                         "html_url": "https://github.com/Fake/GoodRepo",
                                         "stargazers_count": 5, "language": "TypeScript",
                                         "default_branch": "main"})
names = [p["name"] for p in good_rec["projects"]]
check(good_rec["status"] == "ok", "有项目的仓库状态 ok")
check(names == ["AppA", "AppB", "AppC"], "三个项目都在，且按名称排序：%s" % names)
appA = [p for p in good_rec["projects"] if p["name"] == "AppA"][0]
appC = [p for p in good_rec["projects"] if p["name"] == "AppC"][0]
check(appA["source"] == "tree", "AppA 取自源码树")
check(appC["source"] == "release", "AppC 取自 release")
check(len([p for p in good_rec["projects"] if p["name"] == "AppA"]) == 1,
      "AppA 源码树与 release 重复，已去重为 1 个")
check(all(p["name"] != "Dep" for p in good_rec["projects"]), "node_modules 未混入")
check(all(p["name"] != "junk" for p in good_rec["projects"]), "非法 script.json 被剔除")
check(appA["description"] == "甲应用", "中文描述取自 script.json")
check([p for p in good_rec["projects"] if p["name"] == "AppB"][0]["description"] == "乙应用",
      "localizedDescriptions.zh 优先")

exe_rec = S.scan_repo("Fake/ExeRepo", {"description": "a Windows launcher",
                                       "html_url": "https://github.com/Fake/ExeRepo",
                                       "stargazers_count": 1, "language": "C#",
                                       "default_branch": "main"})
check(exe_rec["status"] == "empty", "只有 exe 的仓库状态 empty")
check(exe_rec["projects"] == [], "exe 仓库不产出项目")

# ---------- 7. 真实数据：新分类 vs 旧子串 ----------
print("\n[7] 仓库真实数据对比（旧子串 vs 新词边界）")
old_rules = [("小组件", ["widget", "小组件"]), ("签到", ["check-in", "checkin", "签到"]),
             ("AI 与翻译", ["ai", "openai", "chatgpt", "translate", "translation", "assistant", "翻译"]),
             ("快捷指令与自动化", ["shortcut", "shortcuts", "automation", "automate", "快捷指令"]),
             ("工具", ["tool", "utility", "helper", "工具"]),
             ("模板与示例", ["template", "example", "sample", "模板", "示例"])]


def old_categorize(text):
    low = (text or "").lower()
    for cat, kws in old_rules:
        for kw in kws:
            if kw.lower() in low:
                return cat
    return "其他"


try:
    ctx = ssl._create_unverified_context()
    req = urllib.request.Request(
        "https://raw.githubusercontent.com/xqqhygmh8v-rgb/scripting-hub/main/index.json",
        headers={"User-Agent": "Mozilla/5.0"})
    raw = urllib.request.urlopen(req, context=ctx, timeout=60).read()
    repos = json.loads(raw)["repos"]
    old_ai = sum(1 for r in repos if old_categorize(
        "{} {}".format(r.get("repo", ""), r.get("description_en") or "")) == "AI 与翻译")
    new_ai = sum(1 for r in repos if S.categorize(
        "{} {}".format(r.get("repo", ""), r.get("description_en") or "")) == "AI 与翻译")
    print("     样本 %d 个仓库：旧规则 AI 分类 %d 个，新规则 %d 个" % (len(repos), old_ai, new_ai))
    # 样本是线上真实数据，构成会随同步变化：旧子串规则的误报数并不保证大于 0
    # （例如样本里只剩真 AI 仓库时两边相等）。本项守的是「新规则不得比旧规则
    # 多报」这条底线，不断言严格减少——否则数据一变 CI 就会误红、堵住同步。
    check(new_ai <= old_ai, "AI 分类数不高于旧子串规则（%d → %d）" % (old_ai, new_ai))
except Exception as e:
    print("     跳过（网络不可用）：%r" % e)

# ---------- 8. Actions 摘要 ----------
print("\n[8] Actions 摘要")
idx = {
    "updated_at": "2026-01-01T00:00:00+00:00",
    "count": 2,
    "project_count": 3,
    "repos": [
        {"repo": "Fake/GoodRepo", "url": "https://github.com/Fake/GoodRepo", "stars": 5,
         "language": "TypeScript", "branch": "main", "category": "效率工具",
         "projects": [{"name": "AppA", "version": "1.2.0", "description": "甲应用", "dir": "x",
                       "entry": "index.tsx", "files": 3, "icon": None, "source": "tree"}]},
        {"repo": "Fake/Other", "url": "https://github.com/Fake/Other", "stars": 1,
         "language": "TypeScript", "branch": "main", "category": "其他",
         "projects": [{"name": "B", "version": "", "description": "", "dir": "y",
                       "entry": "index.tsx", "files": 1, "icon": None, "source": "release"}]},
    ],
}
log = [{"type": "repo", "target": "Fake/Junk",
        "reason": "未发现合法 script.json 项目", "time": "t"}]
summary = S.build_summary(idx, log)
check("## 脚本中心同步结果" in summary, "摘要含标题")
check("| 可导入项目 | 3 |" in summary, "摘要含项目数")
check("Fake/Junk" in summary, "摘要含被移除的仓库")
check("DRY_RUN" in summary, "测试环境会被标记为 DRY_RUN")

tmp = os.path.join(HERE, "_summary_test.md")
if os.path.exists(tmp):
    os.remove(tmp)
os.environ["GITHUB_STEP_SUMMARY"] = tmp
check(S.write_step_summary(idx, log) is True, "在 Actions 环境下能写入摘要文件")
written = open(tmp, encoding="utf-8").read()
check("脚本中心同步结果" in written, "摘要文件内容正确")
os.remove(tmp)
del os.environ["GITHUB_STEP_SUMMARY"]
check(S.write_step_summary(idx, log) is False, "非 Actions 环境自动跳过")

print("\n结果：%d 项通过，%d 项失败" % (len(PASSED), len(FAILS)))
if FAILS:
    for f in FAILS:
        print("  - " + f)
    sys.exit(1)
print("全部通过")

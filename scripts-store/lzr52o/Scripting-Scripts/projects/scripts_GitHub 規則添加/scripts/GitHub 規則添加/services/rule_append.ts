// 無界面的「追加規則」邏輯層，供 intent.tsx（分享菜單 / 快捷指令後台運行）使用。
//
// 這裡不含任何 UI（Dialog / Navigation），因為 intent.tsx 通過快捷指令的
// **Run Script** 動作執行時沒有前台界面，彈窗會永遠掛住使自動化卡死。
// 結果一律通過返回值傳出，由調用方決定是發通知還是 Script.exit(Intent.text(...))。
//
// App 內的交互式編輯（瀏覽目錄、逐條改規則、Diff 確認）仍留在 index.tsx，
// 兩邊共用同一份 github_config 與同樣的 GitHub Contents API 調用方式。

import { fetch } from "scripting"
import { t } from '../components/i18n'

export type RuleAppendConfig = {
  token: string
  owner: string
  repo: string
  path: string
  branch: string
}

/** 後台追加的目標檔案與預設規則類型，在 App 設定頁的挑選器裡選好後存下來。
 *  v2.0.1：除了 filePath（相對倉庫根的完整路徑；Gist 時為檔案名）與 ruleType，
 *  還存挑選時那個檔案的平台 / 用戶名 / 倉庫 / Gist，intent 才能找到對的檔案。
 *  舊版只存了 filePath + ruleType 的目標照舊兼容：缺的字段回退到 github_config。 */
export type IntentTarget = {
  filePath: string
  ruleType: string
  platform: string      // 'github' | 'gist'
  username: string      // 挑選時用的帳號用戶名
  owner: string
  repo: string          // full_name，如 KristenYT/Surge
  gistId: string
  gistTitle: string
  branch: string
}

const CONFIG_KEY = "github_config"
const INTENT_TARGET_KEY = "github_intent_target"
const ACCOUNTS_KEY = "rules_accounts"
const DEFAULT_RULE_TYPE = "DOMAIN-SUFFIX"

export function loadConfig(): RuleAppendConfig {
  const stored = Storage.get<Partial<RuleAppendConfig>>(CONFIG_KEY) ?? {}
  return {
    token: stored.token ?? "",
    owner: stored.owner ?? "",
    repo: stored.repo ?? "",
    path: stored.path ?? "",
    // 兼容舊版沒有 branch 字段的配置
    branch: stored.branch && stored.branch.trim() ? stored.branch : "main",
  }
}

export function loadIntentTarget(): IntentTarget {
  const stored = Storage.get<Partial<IntentTarget>>(INTENT_TARGET_KEY) ?? {}
  return {
    filePath: (stored.filePath ?? "").trim(),
    ruleType: (stored.ruleType ?? "").trim() || DEFAULT_RULE_TYPE,
    platform: stored.platform === "gist" ? "gist" : "github",
    username: (stored.username ?? "").trim(),
    owner: (stored.owner ?? "").trim(),
    repo: (stored.repo ?? "").trim(),
    gistId: (stored.gistId ?? "").trim(),
    gistTitle: (stored.gistTitle ?? "").trim(),
    branch: (stored.branch ?? "").trim(),
  }
}

export function saveIntentTarget(target: IntentTarget): void {
  Storage.set(INTENT_TARGET_KEY, {
    filePath: target.filePath.trim(),
    ruleType: target.ruleType.trim() || DEFAULT_RULE_TYPE,
    platform: target.platform === "gist" ? "gist" : "github",
    username: (target.username ?? "").trim(),
    owner: (target.owner ?? "").trim(),
    repo: (target.repo ?? "").trim(),
    gistId: (target.gistId ?? "").trim(),
    gistTitle: (target.gistTitle ?? "").trim(),
    branch: (target.branch ?? "").trim(),
  })
}

/** 多帳號列表（與 App 設定頁共用同一份 rules_accounts），用來找目標帳號的 Token */
function loadRulesAccounts(): { username: string; token: string }[] {
  try {
    const raw = Storage.get(ACCOUNTS_KEY) || ""
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((a: any) => a && a.token)
  } catch {
    return []
  }
}

function encodeURIPath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/")
}

function friendlyMessage(status: number, fallback?: string): string {
  if (status === 401) return t('鑑權失敗：token 無效或已過期', '鉴权失败：token 无效或已过期', 'Authentication failed: token is invalid or expired')
  if (status === 403) return t('權限不足：需要 token 對該倉庫有寫權限', '权限不足：需要 token 对该仓库有写权限', 'Insufficient permissions: the token needs write access to this repository')
  if (status === 404) return t('找不到檔案或倉庫（請檢查後台目標檔案路徑）', '找不到文件或仓库（请检查后台目标文件路径）', 'File or repository not found (check the background target file path)')
  if (status === 409) return t('遠端已變更，請重試', '远端已变更，请重试', 'Remote has changed, please try again')
  if (status === 422) return t('提交參數有誤', '提交参数有误', 'Invalid submit parameters')
  return fallback ?? t(`請求失敗 (${status})`, `请求失败 (${status})`, `Request failed (${status})`)
}

/**
 * 把輸入文本轉成規則行。
 *
 * 逐行處理，三種形態：
 *   1. 已是完整規則（`DOMAIN-SUFFIX,example.com` 等大寫類型開頭）→ 原樣使用；
 *   2. URL（含 `://` 或以 `www.` 起頭）→ 取主機名，套用預設類型；
 *   3. 其它非空、非註釋文本 → 視作域名，套用預設類型。
 * 註釋行與空行直接丟棄（分享來的文本常帶雜物，不該寫進規則檔案）。
 */
export function textToRuleLines(text: string, ruleType: string): string[] {
  const lines: string[] = []

  for (const raw of text.split(/[\r\n]+/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#") || line.startsWith(";") || line.startsWith("//")) continue

    // 形態 1：已帶大寫規則類型前綴
    const head = line.split(",")[0]?.trim() ?? ""
    if (/^[A-Z][A-Z0-9-]*$/.test(head) && line.includes(",")) {
      lines.push(line)
      continue
    }

    // 形態 2：URL —— 只取主機名，去掉協議 / 路徑 / 端口 / 用戶資訊
    let host = line
    if (host.includes("://")) host = host.slice(host.indexOf("://") + 3)
    host = host.split("/")[0].split("?")[0].split("#")[0]
    if (host.includes("@")) host = host.slice(host.indexOf("@") + 1)
    host = host.split(":")[0]
    host = host.replace(/^www\./, "").trim()

    // 形態 3 收口：留下的必須像個域名，否則寧可跳過也不寫髒資料
    if (!host || /\s/.test(host) || !host.includes(".")) continue
    lines.push(`${ruleType},${host}`)
  }

  return lines
}

async function ghGet(url: string, token: string) {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })
}

export type AppendResult = {
  ok: boolean
  /** 適合直接放進通知 body / 返回給快捷指令的一句話結果 */
  message: string
  /** 實際寫入的規則條數（去重後） */
  added: number
  /** 因已存在而跳過的條數 */
  skipped: number
}

/**
 * 後台追加規則：讀取目標檔案 → 過濾已存在的行 → 追加到末尾 → 提交。
 *
 * 全程不拋異常，失敗資訊通過返回值傳出。
 * 兩處保護：
 *   · 解析後沒有可用規則時不發起提交（避免產生空 commit）；
 *   · 逐行與現有內容比對去重，重複分享同一個域名不會寫入第二遍。
 */
/**
 * 後台追加規則：讀取目標檔案 → 過濾已存在的行 → 追加到末尾 → 提交。
 *
 * 全程不拋異常，失敗資訊通過返回值傳出。
 * Token 與倉庫優先用挑選目標時存下的帳號／倉庫（Gist 時用 gistId），
 * 找不到纔回退到 github_config（兼容舊版只存了路徑的目標）。
 * 兩處保護：
 *   · 解析後沒有可用規則時不發起提交（避免產生空 commit）；
 *   · 逐行與現有內容比對去重，重複分享同一個域名不會寫入第二遍。
 */
export async function appendRulesInBackground(text: string): Promise<AppendResult> {
  const empty = { added: 0, skipped: 0 }
  const cfg = loadConfig()
  const target = loadIntentTarget()
  if (!target.filePath) {
    return { ok: false, message: t('請先在 App 內設定「後台追加目標檔案」', '请先在 App 内设定「后台追加目标文件」', 'Please set the “Background Append Target File” in the App first'), ...empty }
  }

  // Token：優先用目標帳號的，找不到就回退到 github_config
  let token = cfg.token
  if (target.username) {
    const acc = loadRulesAccounts().find((a) => a.username === target.username)
    if (acc) token = acc.token
  }
  if (!token) {
    return { ok: false, message: t('請先在 App 內配置 GitHub Token', '请先在 App 内配置 GitHub Token', 'Please configure a GitHub Token in the App first'), ...empty }
  }

  const wanted = textToRuleLines(text, target.ruleType)
  if (wanted.length === 0) {
    return { ok: false, message: t('沒有從輸入中解析出可用的規則', '没有从输入中解析出可用的规则', 'No usable rules could be parsed from the input'), ...empty }
  }

  // 去重：按「類型,值」比對，忽略行尾註釋與首尾空白；返回 null 表示全部重複、無需提交
  const dedupe = (content: string): { fresh: string[]; skipped: number; newContent: string } | null => {
    const existing = new Set(
      content.split("\n").map(line => {
        const body = line.split("#")[0].trim()
        const parts = body.split(",")
        return parts.length >= 2 ? `${parts[0].trim()},${parts[1].trim()}` : body
      }),
    )
    const fresh = wanted.filter(line => {
      const parts = line.split(",")
      const key = parts.length >= 2 ? `${parts[0].trim()},${parts[1].trim()}` : line
      return !existing.has(key)
    })
    const skipped = wanted.length - fresh.length
    if (fresh.length === 0) return null
    const needsNewline = content.length > 0 && !content.endsWith("\n")
    return { fresh, skipped, newContent: content + (needsNewline ? "\n" : "") + fresh.join("\n") + "\n" }
  }
  const doneMessage = (fresh: number, skipped: number) => {
    const suffix = skipped > 0 ? t(`，${skipped} 條已存在`, `，${skipped} 条已存在`, `, ${skipped} already exist`) : ""
    return t(`已追加 ${fresh} 條規則${suffix}`, `已追加 ${fresh} 条规则${suffix}`, `Added ${fresh} rules${suffix}`)
  }

  try {
    // —— Gist 目標：GET 取內容 → 去重 → PATCH 寫回 ——
    if (target.platform === "gist" && target.gistId) {
      const getRes = await ghGet(`https://api.github.com/gists/${target.gistId}`, token)
      if (!getRes.ok) {
        return { ok: false, message: friendlyMessage(getRes.status), ...empty }
      }
      const gistData = await getRes.json()
      const gf = gistData.files ? gistData.files[target.filePath] : null
      if (!gf) {
        return { ok: false, message: t('Gist 裡找不到這個檔案', 'Gist 里找不到这个文件', 'File not found in this Gist'), ...empty }
      }
      let content = ""
      if (typeof gf.content === "string") {
        content = gf.content
      } else if (gf.raw_url) {
        const raw = await fetch(gf.raw_url)
        if (!raw.ok) {
          return { ok: false, message: t('讀取目標檔案失敗', '读取目标文件失败', 'Failed to read target file'), ...empty }
        }
        content = await raw.text()
      } else {
        return { ok: false, message: t('讀取目標檔案失敗', '读取目标文件失败', 'Failed to read target file'), ...empty }
      }
      const result = dedupe(content)
      if (!result) {
        return { ok: true, message: t(`${wanted.length} 條規則已存在，無需追加`, `${wanted.length} 条规则已存在，无需追加`, `${wanted.length} rules already exist, nothing to add`), added: 0, skipped: wanted.length }
      }
      const patchRes = await fetch(`https://api.github.com/gists/${target.gistId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files: { [target.filePath]: { content: result.newContent } } }),
      })
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => null)
        return { ok: false, message: friendlyMessage(patchRes.status, err?.message), ...empty }
      }
      return { ok: true, message: doneMessage(result.fresh.length, result.skipped), added: result.fresh.length, skipped: result.skipped }
    }

    // —— 倉庫目標：GET 取內容 → 去重 → PUT 提交 ——
    const owner = target.owner || cfg.owner
    const repoParts = target.repo ? target.repo.split("/") : []
    const repo = target.repo ? repoParts.slice(1).join("/") : cfg.repo
    const branch = target.branch || cfg.branch
    if (!owner || !repo) {
      return { ok: false, message: t('請先在 App 內配置 GitHub 用戶名 / 倉庫名', '请先在 App 内配置 GitHub 用户名 / 仓库名', 'Please configure a GitHub username / repository name in the App first'), ...empty }
    }

    const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIPath(target.filePath)}?ref=${encodeURIComponent(branch)}`
    const getRes = await ghGet(fileUrl, token)
    if (!getRes.ok) {
      return { ok: false, message: friendlyMessage(getRes.status), ...empty }
    }
    const fileData = await getRes.json()
    if (!fileData?.content) {
      return { ok: false, message: fileData?.message || t('讀取目標檔案失敗', '读取目标文件失败', 'Failed to read target file'), ...empty }
    }
    const content = Data.fromBase64String(String(fileData.content).replace(/\n/g, ""))?.toRawString() ?? ""

    const result = dedupe(content)
    if (!result) {
      return { ok: true, message: t(`${wanted.length} 條規則已存在，無需追加`, `${wanted.length} 条规则已存在，无需追加`, `${wanted.length} rules already exist, nothing to add`), added: 0, skipped: wanted.length }
    }

    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIPath(target.filePath)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Append ${result.fresh.length} rule(s) via Scripting`,
          content: Data.fromRawString(result.newContent, "utf-8")?.toBase64String() ?? "",
          sha: fileData.sha,
          branch,
        }),
      },
    )

    if (!putRes.ok) {
      const err = await putRes.json().catch(() => null)
      return { ok: false, message: friendlyMessage(putRes.status, err?.message), ...empty }
    }

    return { ok: true, message: doneMessage(result.fresh.length, result.skipped), added: result.fresh.length, skipped: result.skipped }
  } catch (error) {
    return { ok: false, message: t(`追加失敗：${error}`, `追加失败：${error}`, `Append failed: ${error}`), ...empty }
  }
}

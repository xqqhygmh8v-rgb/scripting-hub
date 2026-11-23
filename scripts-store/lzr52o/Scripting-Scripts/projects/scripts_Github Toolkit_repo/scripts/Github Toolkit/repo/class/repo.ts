import { t } from "./i18n";

// 注意：這裡刻意不從 "scripting" 匯入 fetch。
// v1.2 證據：帶 Token 與不帶 Token 都卡在「請求 GitHub 中…」，連 Promise.race 的
// 15 秒逾時都沒有翻成失敗，代表匯入版 fetch 那條路本身就沒有回來。
// Github_Action 腳本在同一台裝置上能正常讀寫 repo 端點，它用的是全域 fetch、
// Authorization: `token …`、Accept: v3，所以 v1.3 全部照那個寫法，變數只剩端點本身。
// Storage key：刻意與 Gist（gist）、Github_Action（github_token）、
// GitHubMonitor（github.monitor.token.v1）區分開，避免互相覆蓋。
export const TOKEN_KEY = "repo_editor_token";
export const USERNAME_KEY = "repo_editor_username";
export const RECENT_KEY = "repo_editor_recent";
// v1.13：多帳號清單，JSON 字串存在 Storage，格式 [{username, token}]。
// 使用中的帳號仍同步寫回 repo_editor_token / repo_editor_username，
// 所以瀏覽、編輯、上傳等原本用 repo.token 的程式碼不用改。
// Shared with GitHub Actions and Gist Editor in the combined script.
export const ACCOUNTS_KEY = "github_toolkit_accounts";

export interface RepoItem {
  name: string;
  path: string;
  type: "file" | "dir";
  sha: string;
  size: number;
}

export interface RepoInfo {
  full_name: string;
  private: boolean;
  default_branch: string;
  stargazers_count?: number;
  forks_count?: number;
  subscribers_count?: number;
  watchers_count?: number;
  description?: string | null;
  language?: string | null;
  fork?: boolean;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
  pushed_at?: string;
}

function encodePath(path: string): string {
  return path
    .split("/")
    .filter((p) => p.length > 0)
    .map((p) => encodeURIComponent(p))
    .join("/");
}

// 2.1.13：目錄清單短期快取。
// 每次點進／退回資料夾都要重打一次 contents API，行動網路單趟就好幾百
// 毫秒；同一份目錄 30 秒內再進出就直接沿用，返回上一層變成瞬間。
// 只快取「陣列」（目錄清單），不快取單一檔案：上傳覆蓋要靠檔案的 sha，
// 快取裡的 sha 可能已被別人改掉，PUT 會被 GitHub 以 409 拒絕。
// 寫入一律用 bustContents() 把整個倉庫的目錄快取清掉，不會顯示舊清單。
const CONTENTS_TTL_MS = 30000;
const CONTENTS_MAX = 160;
const contentsCache = new Map<string, { data: any; at: number }>();

function contentsKey(token: string, owner: string, repo: string, path: string, branch: string): string {
  return `${token}|${owner}/${repo}|${branch}|${path}`;
}

function readContentsCache(key: string): any | undefined {
  const hit = contentsCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CONTENTS_TTL_MS) {
    contentsCache.delete(key);
    return undefined;
  }
  return hit.data;
}

function writeContentsCache(key: string, data: any) {
  if (contentsCache.size >= CONTENTS_MAX) {
    // 簡單的 FIFO 淘汰：Map 保留插入順序，砍掉最舊的一筆就夠了。
    const oldest = contentsCache.keys().next();
    if (!oldest.done) contentsCache.delete(oldest.value);
  }
  contentsCache.set(key, { data, at: Date.now() });
}

/** 任何寫入後呼叫：該倉庫（不分 Token、不分分支）的目錄快取全部作廢。 */
export function bustContents(owner: string, repo: string) {
  const marker = `|${owner}/${repo}|`;
  for (const key of Array.from(contentsCache.keys())) {
    if (key.includes(marker)) contentsCache.delete(key);
  }
}

export function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "" : path.slice(0, i);
}

// 2026-11-20：唯讀檢視（收藏裡別人的倉庫）要能打開「沒有常見副檔名」的
// 純文字檔，例如 Surge 規則集的 adguard-mobile-ads.allow.domainset。
// 舊清單只有常見程式／設定副檔名，這類檔案一律被判成二進位，詳情頁
// 連「查看內容」都不長出來。這裡補上規則集／設定檔常見的副檔名，
// 另外再給一層內容判斷（looksLikeText）當後備，寧可誤判成文字也不要
// 漏開（誤判成文字只是顯示亂碼，誤判成二進位是根本看不到）。
const TEXT_EXTENSIONS = [
  "txt", "md", "markdown", "json", "yml", "yaml", "toml", "ini", "cfg", "conf", "config",
  "ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "css", "scss", "less", "html", "htm", "xml", "svg",
  "sh", "bash", "zsh", "py", "rb", "go", "rs", "java", "c", "h", "cpp", "hpp", "m", "swift", "kt", "kts", "cs", "php", "lua", "pl",
  "sql", "csv", "tsv", "lock", "gitignore", "gitattributes", "gitmodules", "editorconfig", "npmrc", "env",
  "log", "properties", "plist", "domainset", "list", "rules", "sgmodule", "snippet", "rst", "tex", "gradle",
];

// 沒有副檔名但一定是純文字的檔名（比對小寫檔名）。
const TEXT_FILENAMES = [
  "makefile", "dockerfile", "procfile", "readme", "license", "licence", "changelog", "authors", "notice", "brewfile", "gemfile", "rakefile",
];

export function isTextExtension(path: string): boolean {
  const name = (path.split("/").pop() || path).toLowerCase();
  if (!name) return false;
  if (TEXT_FILENAMES.includes(name)) return true;
  // 點開頭但沒有第二個點的隱藏檔（.gitignore、.env 這類）整串都是「副檔名」。
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return TEXT_EXTENSIONS.includes(name.slice(dot + 1));
}

// 2026-11-20：唯讀檢視與快速預覽共用的內容上限（使用者指定 5 MB）。
// 超過就不載入，直接提示改用「下載檔案」。
export const MAX_VIEW_BYTES = 5 * 1024 * 1024;

/** 內容判斷：解碼後若含 NUL 或大量控制字元，就當二進位。
 *  取樣前 8KB 就夠了（真正的二進位檔幾乎開頭就會命中）。 */
export function looksLikeText(data: Data): boolean {
  const bytes = data.toUint8Array();
  if (!bytes || bytes.length === 0) return true;
  const n = Math.min(bytes.length, 8192);
  let control = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) return false;
    // 允許 tab / LF / CR / FF，其餘 C0 控制字元算異常。
    if (b < 9 || (b > 13 && b < 32)) control++;
  }
  return control / n < 0.05;
}

export function textToBase64(text: string): string {
  const data = Data.fromRawString(text);
  if (!data) throw new Error(t("文字轉換失敗", "文字转换失败", "Failed to convert text"));
  return data.toBase64String();
}

export function editorExt(path: string): string {
  const ext = (path.split(".").pop() || "").toLowerCase();
  // Editor 官方支援的 ext 包含 ts、js、md、json、txt、css、html 等，
  // 不在清單內的一律用 txt，避免高亮判斷失敗。
  if (["tsx", "ts", "js", "jsx", "txt", "md", "css", "html", "json"].includes(ext)) return ext;
  return "txt";
}

// 2026-11-05 回饋：更名提示的第一段就是倉庫名。
// 提示預設是「倉庫名/路徑」，留著倉庫名就是同倉庫搬，改成別的
// 倉庫名就是跨倉庫搬，填到不存在的倉庫會在 moveFileToRepo 裡
// 先查倉庫、提示失敗，不會亂長資料夾。單一段（沒有斜線）沒有
// 倉庫段可以改，就當同倉庫路徑。
export function parseMoveTarget(raw: string, owner: string, sourceRepo: string): { repo: string; path: string } {
  const cleaned = String(raw || "").trim().split("/").filter((s) => s.length > 0 && s !== ".").join("/");
  if (!cleaned) return { repo: sourceRepo, path: "" };
  const parts = cleaned.split("/");
  if (parts.length === 1) return { repo: sourceRepo, path: cleaned };
  const first = parts[0];
  const rest = parts.slice(1).join("/");
  if (first === owner) {
    const sub = rest.split("/");
    if (sub[0] === sourceRepo) return { repo: sourceRepo, path: sub.slice(1).join("/") };
    if (sub.length > 1) return { repo: sub[0], path: sub.slice(1).join("/") };
    return { repo: sourceRepo, path: rest };
  }
  if (first === sourceRepo) return { repo: sourceRepo, path: rest };
  return { repo: first, path: rest };
}

class Repo {
  token: string = Storage.get(TOKEN_KEY) || "";

  saveToken() {
    if (this.token) Storage.set(TOKEN_KEY, this.token);
    else Storage.remove(TOKEN_KEY);
  }

  // --- api --- //
  // v1.4 關鍵改法：不再用 setTimeout / Promise.race / AbortController 做逾時。
  // 使用者回報「點了沒反應、一直顯示請求中」，連 JS 計時器都沒有翻成失敗，
  // 代表在這台裝置的 Scripting 執行環境裡，fetch 掛住時 JS 計時器也跟著不跑，
  // 用計時器守 fetch 根本守不住。官方 fetch 文件給的正是原生 timeout 選項
  // （單位是秒，逾時以 TypeError 拒絕），由原生層計時，不依賴 JS 計時器。
  // v1.7 再加一道：AbortSignal.timeout（官方文件寫明逾時以 TimeoutError 拒絕），
  // 因為 v1.6 證實單靠 timeout 選項，掛住的 fetch 在 15 秒後仍沒有翻成失敗。
  // 授權仍照 Github_Action 寫法：Authorization: `token …`、Accept: v3。
  // 2026-11-07：request 多接一個 token（只用在這一次請求）。清單頁要
  // 同時用兩個帳號的 Token 抓倉庫，之前是靠換共用的 repo.token 再換回來，
  // 所以只能一個一個循序抓；現在每個請求自己帶 Token，Promise.all 並行
  // 抓也不會互相打架。沒帶 token 時照舊用共用的 repo.token。
  private async request(
    url: string,
    init?: { method?: string; body?: string; token?: string },
    anonymous?: boolean,
  ): Promise<any> {
    const method = init?.method ?? "GET";
    const headers: any = {
      Accept: "application/vnd.github.v3+json",
    };
    if (method !== "GET") headers["Content-Type"] = "application/json";
    if (!anonymous) headers.Authorization = `token ${init?.token ?? this.token}`;
    try {
      // v1.8：GET 用跟診斷完全一樣的最小寫法（只有標頭 + timeout），
      // 不帶 method、body、signal，因為診斷用那個寫法在同一台裝置上秒回，
      // 而 Repository 編輯之前帶 method/body/signal 的寫法卻掛住超過兩分鐘。
      // PUT/DELETE 仍需要 method/body，保留原本寫法加 AbortSignal.timeout。
      // 2026-11-07 補（檔案頁 icon.json 一直卡載入中）：上面那個 GET 寫法
      // 沒有 AbortSignal，而 v1.6 早就證實單靠 timeout 選項，掛住的 fetch
      // 在 15 秒後仍不會翻成失敗——請求一掛住就永遠轉圈圈，重新整理也一樣。
      // Actions 模組 v1.3.6 已經修過同樣的問題：只在最小寫法上多加 signal
      // 一項（不帶 method、不帶 body），裝置上證實可行，執行紀錄就是用
      // 這個寫法在抓；v1.8 掛住的是 method/body/signal 三件套，signal 本身
      // 在 POST 分支和 Actions 都是現役寫法。所以 GET 也補上
      // AbortSignal.timeout(15000)，掛住 15 秒就翻成逾時錯誤（下面 catch
      // 會翻成「請按重新整理再試一次」），不再永遠轉圈圈。
      const timeoutMs = method === "GET" ? 15000 : 60000;
      const r =
        method === "GET"
          ? await fetch(url, {
              headers,
              timeout: 15,
              signal: (AbortSignal as any).timeout
                ? (AbortSignal as any).timeout(15000)
                : undefined,
            } as any)
          : await fetch(url, {
              method,
              headers,
              body: init?.body,
              timeout: timeoutMs / 1000,
              signal: (AbortSignal as any).timeout
                ? (AbortSignal as any).timeout(timeoutMs)
                : undefined,
            } as any);
      const text = await r.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {}
      if (!r.ok) {
        const msg = data?.message || r.statusText || "";
        if (String(msg).includes("rate limit")) {
          throw new Error(
            t(`GitHub API 額度已用完（${r.status}）：${anonymous ? "不帶 Token 時共用 IP 額度已耗盡，公開庫也請改回 Token 讀取" : "Token 的額度已用完，請稍後再試"}`, `GitHub API 额度已用完（${r.status}）：${anonymous ? "不带 Token 时共用 IP 额度已耗尽，公开库也请改回 Token 读取" : "Token 的额度已用完，请稍后再试"}`, `GitHub API quota exhausted (${r.status}): ${anonymous ? "The shared-IP quota without a Token is exhausted. Use Token access for public repositories too." : "Your Token quota is exhausted. Please try again later."}`),
          );
        }
        throw new Error(t(`GitHub API 失敗（${r.status}）：${msg}`, `GitHub API 失败（${r.status}）：${msg}`, `GitHub API failed (${r.status}): ${msg}`));
      }
      return data;
    } catch (err: any) {
      if (
        err?.name === "TimeoutError" ||
        err?.name === "AbortError" ||
        err?.name === "TypeError" ||
        String(err?.message || err).includes("TypeError")
      ) {
        throw new Error(t("請求逾時（15 秒）或網路問題：請按重新整理再試一次", "请求超时（15 秒）或网络问题：请按刷新再试一次", "Request timed out (15 seconds) or network issue. Tap Refresh and try again."));
      }
      throw err;
    }
  }

  // 分支與 PR 瀏覽固定攜帶來源帳號 Token，避免切換帳號後讀錯私人倉庫。
  async collaborationGet(owner: string, repoName: string, suffix: string, token: string): Promise<any> {
    return this.request(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/${suffix}`, { token }, !token);
  }

  async collaborationRequest(owner: string, repoName: string, suffix: string, token: string, method: string, body?: any): Promise<any> {
    return this.request(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/${suffix}`,
      { token, method, body: body === undefined ? undefined : JSON.stringify(body) },
      !token,
    );
  }

  async getUser(token?: string): Promise<any> {
    return await this.request("https://api.github.com/user", token ? { token } : undefined);
  }

  async listMyRepos(token?: string): Promise<RepoInfo[]> {
    return await this.request(
      "https://api.github.com/user/repos?per_page=100&sort=updated",
      token ? { token } : undefined,
    );
  }

  // v1.15：多帳號清單用。清單頁要逐一用每個帳號的 Token 抓該帳號的倉庫，
  // 不能只用使用中帳號的 Token。
  // 2026-11-07：改成把 Token 直接傳進請求，不再換共用的 repo.token 再換
  // 回來——這樣兩個帳號可以 Promise.all 並行抓，不會互相打架；循序抓
  // 時行為不變。
  async listReposForToken(token: string): Promise<RepoInfo[]> {
    return await this.listMyRepos(token);
  }

  // v1.17：手動只填用戶名用。抓該用戶的公開倉庫，不用先把他加成帳號。
  // 有 Token 時帶 Token 抓（避免共用 IP 額度被別人用完），沒 Token 才不帶 Token。
  // v1.18：說明寫的是「所有公開倉庫」，所以要分頁抓完，不能只抓第一頁 100 個；
  // 一頁不滿 100 個就代表到底了，否則繼續抓下一頁。
  async listUserRepos(username: string, token?: string): Promise<RepoInfo[]> {
    const all: RepoInfo[] = [];
    for (let page = 1; ; page++) {
      const batch: any = await this.request(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&type=public&page=${page}`,
        token ? { token } : undefined,
        !(token ?? this.token),
      );
      if (!Array.isArray(batch) || batch.length === 0) break;
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  }

  // v1.19：Fork 倉庫。POST /repos/{owner}/{repo}/forks，不帶 organization
  // 就是 Fork 到目前 Token 帳號下；GitHub 是非同步建立，回 202 也算成功，
  // 但 Fork 可能要等幾秒才出現在倉庫清單裡。
  async forkRepo(owner: string, repo: string): Promise<any> {
    return await this.request(
      `https://api.github.com/repos/${owner}/${repo}/forks`,
      { method: "POST", body: JSON.stringify({}) },
    );
  }

  // v1.50：Fork 到指定帳號。跟 createRepoForToken 同一個做法：先換成該帳號的
  // Token 再 POST，Fork 就會建立在那個帳號下，完成後換回來，不要改了
  // 瀏覽頁原本的 Token。沒有預設帳號之後，Fork 不再預設建在某個帳號下，
  // 而是點 Fork 後先選帳號，再用選到的帳號的 Token 來 Fork。
  async forkRepoForToken(token: string, owner: string, repo: string): Promise<any> {
    const prev = this.token;
    this.token = token;
    try {
      return await this.request(
        `https://api.github.com/repos/${owner}/${repo}/forks`,
        { method: "POST", body: JSON.stringify({}) },
      );
    } finally {
      this.token = prev;
    }
  }

  // 1.1.4：Star／Unstar。GitHub 的 Star 是針對目前 Token 的帳號：
  // 查 GET /user/starred/{owner}/{repo}，有 Star 回 204（沒內容）、沒 Star
  // 回 404；加 Star 是 PUT、取消是 DELETE，成功都回 204。跟 forkRepoForToken
  // 一樣先換成指定帳號的 Token 再打，完成後換回來，不動瀏覽頁原本的 Token。
  async isStarredForToken(token: string, owner: string, repo: string): Promise<boolean> {
    const prev = this.token;
    this.token = token;
    try {
      await this.request(`https://api.github.com/user/starred/${owner}/${repo}`);
      return true;
    } catch (e: any) {
      if (String(e?.message || e).includes("404")) return false;
      throw e;
    } finally {
      this.token = prev;
    }
  }

  async starRepoForToken(token: string, owner: string, repo: string): Promise<any> {
    const prev = this.token;
    this.token = token;
    try {
      return await this.request(
        `https://api.github.com/user/starred/${owner}/${repo}`,
        { method: "PUT" },
      );
    } finally {
      this.token = prev;
    }
  }

  async unstarRepoForToken(token: string, owner: string, repo: string): Promise<any> {
    const prev = this.token;
    this.token = token;
    try {
      return await this.request(
        `https://api.github.com/user/starred/${owner}/${repo}`,
        { method: "DELETE" },
      );
    } finally {
      this.token = prev;
    }
  }

  // v1.20：改倉庫公開／私人。PATCH /repos/{owner}/{repo}，private 欄位
  // true 是私人、false 是公開；開關開是公開、關是私人。
  // 2.1.1：首頁滑動也要能改公開／私人，所以多接一個 Token。
  // 不換共用的 repo.token，直接讓這次請求帶自己的 Token，避免多帳號並行時互撞。
  async updateRepoVisibility(owner: string, repo: string, isPrivate: boolean, token?: string): Promise<any> {
    return await this.request(
      `https://api.github.com/repos/${owner}/${repo}`,
      { method: "PATCH", body: JSON.stringify({ private: isPrivate }), token },
    );
  }

  // v2.1.0：刪除倉庫。DELETE /repos/{owner}/{repo}，成功回 204、沒有內容；
  // 需要 delete_repo 權限，而且只能刪自己的倉庫（擁有者），別人的會回 403/404。
  async deleteRepo(owner: string, repo: string, token?: string): Promise<any> {
    return await this.request(
      `https://api.github.com/repos/${owner}/${repo}`,
      { method: "DELETE", token },
    );
  }

  async getRepo(owner: string, repo: string): Promise<RepoInfo> {
    return await this.request(`https://api.github.com/repos/${owner}/${repo}`);
  }

  // 1.1.4：倉庫詳情用。跟 forkRepoForToken 同一個做法：先換成指定帳號的
  // Token 再打 GET /repos/{owner}/{repo}，完成後換回來。私人倉庫一定要
  // 用擁有者那個帳號的 Token 才讀得到，公開倉庫任何 Token 都可以。
  async getRepoForToken(token: string, owner: string, repo: string): Promise<RepoInfo> {
    const prev = this.token;
    this.token = token;
    try {
      return await this.request(`https://api.github.com/repos/${owner}/${repo}`);
    } finally {
      this.token = prev;
    }
  }

  // v1.3.0：依用戶名取公開資料（收藏頁顯示頭像用）。回傳含 login、avatar_url。
  async getUserByName(username: string): Promise<any> {
    return await this.request(
      `https://api.github.com/users/${encodeURIComponent(username)}`,
    );
  }

  // 3.1：改預設分支。PATCH /repos/{owner}/{repo} 的 default_branch 欄位，
  // 只改預設分支，其他設定不動；只有倉庫擁有者有權限，別人的會回 403/404。
  async setDefaultBranchForToken(token: string, owner: string, repoName: string, branch: string): Promise<any> {
    return await this.request(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`,
      { token, method: "PATCH", body: JSON.stringify({ default_branch: branch }) },
    );
  }

  // 3.1：Follow 清單。GET /user/following 只認「這個 Token 的帳號」，
  // 所以多帳號要各自帶自己的 Token 抓一次，不能共用使用中帳號的 Token。
  // 一頁 100 個，不滿 100 就是到底了。
  async listFollowingForToken(token: string): Promise<any[]> {
    const all: any[] = [];
    for (let page = 1; ; page++) {
      const batch: any = await this.request(
        `https://api.github.com/user/following?per_page=100&page=${page}`,
        { token },
      );
      if (!Array.isArray(batch) || batch.length === 0) break;
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  }

  // 3.1：Follow／取消 Follow。都打同一個端點，PUT 是 Follow、DELETE 是取消；
  // 成功回 204 沒有內容。只能操作自己的帳號，別人的 Token 會回 403/404。
  // 3.2：帳號名先 trim 再編碼。收藏裡若有前後空白，會變成 %20 而讓 GitHub 回 404。
  // 另外注意：Token 沒有 user:follow 權限時，GitHub 也是回 404（不是 403）。
  async followUserForToken(token: string, username: string): Promise<any> {
    return await this.request(
      `https://api.github.com/user/following/${encodeURIComponent(String(username).trim())}`,
      { token, method: "PUT" },
    );
  }

  async unfollowUserForToken(token: string, username: string): Promise<any> {
    return await this.request(
      `https://api.github.com/user/following/${encodeURIComponent(String(username).trim())}`,
      { token, method: "DELETE" },
    );
  }

  // 2.1.15：確認某個帳號是不是真的 Follow 了某人。
  // GitHub 對「Follow 自己」會回 204，但名單裡不會多出任何人（PUT 看起來
  // 成功、實際沒生效），所以寫入後要用這個端點驗一次：204 = 有、404 = 沒有。
  async isFollowingForToken(token: string, username: string): Promise<boolean> {
    try {
      await this.request(
        `https://api.github.com/user/following/${encodeURIComponent(String(username).trim())}`,
        { token },
      );
      return true;
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("404")) return false;
      throw e;
    }
  }

  // v1.3.0：Fork 跟上游比較。base 是上游（擁有者:分支），head 是 Fork 自己的分支；
  // 回傳含 ahead_by（超前）、behind_by（落後）。分支名裡的斜線要逐段編碼，
  // 但冒號跟 ... 要保持原樣，GitHub 才認得跨 Fork 的寫法。
  async compareFork(
    owner: string,
    repo: string,
    parentOwner: string,
    parentBranch: string,
    branch: string,
  ): Promise<any> {
    const encBranch = (b: string) =>
      b.split("/").map((seg) => encodeURIComponent(seg)).join("/");
    const base = `${encodeURIComponent(parentOwner)}:${encBranch(parentBranch)}`;
    const head = encBranch(branch);
    return await this.request(
      `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
    );
  }

  // v1.3.0：同步 Fork（GitHub 網頁的 Sync fork）。POST merge-upstream，
  // 把上游預設分支合併進 Fork 的指定分支；有衝突時 GitHub 回 409，
  // 錯誤直接交給呼叫端顯示。需要對該 Fork 有寫入權限。
  async syncFork(owner: string, repo: string, branch: string): Promise<any> {
    const r = await this.request(
      `https://api.github.com/repos/${owner}/${repo}/merge-upstream`,
      { method: "POST", body: JSON.stringify({ branch }) },
    );
    // 2.1.13：同步後檔案內容整個換掉，目錄快取不能留。
    bustContents(owner, repo);
    return r;
  }

  // 2.0.5：首頁工作狀態／左滑操作用。以下兩個 helper 跟 compareFork／
  // syncFork 同一個 URL 寫法，只差在把 Token 直接帶進 request，
  // 不換共用的 repo.token——首頁是多帳號並行抓，換共用 Token 會互相打架
  //（2026-11-07 listReposForToken 就是為此改成傳 Token）。
  async compareForkForToken(
    token: string,
    owner: string,
    repo: string,
    parentOwner: string,
    parentBranch: string,
    branch: string,
  ): Promise<any> {
    const encBranch = (b: string) =>
      b.split("/").map((seg) => encodeURIComponent(seg)).join("/");
    const base = `${encodeURIComponent(parentOwner)}:${encBranch(parentBranch)}`;
    const head = encBranch(branch);
    return await this.request(
      `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
      { token },
    );
  }

  async syncForkForToken(token: string, owner: string, repo: string, branch: string): Promise<any> {
    const r = await this.request(
      `https://api.github.com/repos/${owner}/${repo}/merge-upstream`,
      { method: "POST", body: JSON.stringify({ branch }), token },
    );
    bustContents(owner, repo);
    return r;
  }

  // v1.3.0：從 Fork 對上游開 Pull Request（Contribute）。
  // head 是「Fork 擁有者:分支」，base 是上游分支；title 必填，body 可空。
  async createPullRequest(
    parentOwner: string,
    parentRepo: string,
    args: { title: string; head: string; base: string; body?: string },
  ): Promise<any> {
    return await this.request(
      `https://api.github.com/repos/${parentOwner}/${parentRepo}/pulls`,
      {
        method: "POST",
        body: JSON.stringify({
          title: args.title,
          head: args.head,
          base: args.base,
          body: args.body || "",
        }),
      },
    );
  }

  // v1.47：新增倉庫。POST /user/repos，建立在目前 Token 的帳號下，
  // 所以多帳號時要先換成該帳號的 Token（跟 listReposForToken 同一個做法），
  // 完成後換回來，不要改了使用中帳號。auto_init 固定 false，
  // 新增的倉庫一開始就是空的，之後再用瀏覽頁上傳或新增檔案；
  // 名稱重複或格式不對時 GitHub 會回 422，錯誤直接交給呼叫端顯示。
  async createRepoForToken(
    token: string,
    args: { name: string; isPrivate: boolean; description: string },
  ): Promise<any> {
    const prev = this.token;
    this.token = token;
    try {
      return await this.request("https://api.github.com/user/repos", {
        method: "POST",
        body: JSON.stringify({
          name: args.name,
          private: args.isPrivate,
          description: args.description,
          auto_init: false,
        }),
      });
    } finally {
      this.token = prev;
    }
  }

  /** 讀取目錄（回傳陣列）或單一檔案（回傳物件）。404 時回傳 null。
   * 2.1.13：目錄清單有 30 秒快取（見檔頭的 contentsCache）。只有「目錄」
   * 才快取，單一檔案永遠直打，因為上傳覆蓋要靠檔案即時的 sha。
   * force=true 用於下拉刷新，跳過快取。 */
  async getContents(
    owner: string,
    repo: string,
    path: string,
    branch: string,
    force?: boolean,
  ): Promise<any | null> {
    const p = encodePath(path);
    // 2.1.12：分支未知時（收藏進來的倉庫沒帶 branch）不再空等 getRepo，直接不帶
    // ref 打目錄，GitHub 會用預設分支回覆；getRepo 在背景補上分支名。
    const url =
      `https://api.github.com/repos/${owner}/${repo}/contents` +
      (p ? `/${p}` : "") +
      (branch ? `?ref=${encodeURIComponent(branch)}` : "");
    const key = contentsKey(this.token, owner, repo, path, branch);
    if (!force) {
      const hit = readContentsCache(key);
      if (hit !== undefined) return hit;
    }
    try {
      const data = await this.request(url);
      // 只快取陣列（目錄）；null（404）也記起來，免得重複打不存在的路徑。
      if (data === null || Array.isArray(data)) writeContentsCache(key, data);
      return data;
    } catch (e: any) {
      if (String(e?.message || e).includes("404")) {
        writeContentsCache(key, null);
        return null;
      }
      throw e;
    }
  }

  // 2.0.5：首頁左滑 Push（上傳檔案）用。跟 getContents 同寫法，
  // 只差在帶指定帳號的 Token，不換共用的 repo.token。
  async getContentsForToken(
    token: string,
    owner: string,
    repo: string,
    path: string,
    branch: string,
    force?: boolean,
  ): Promise<any | null> {
    const p = encodePath(path);
    const url =
      `https://api.github.com/repos/${owner}/${repo}/contents` +
      (p ? `/${p}` : "") +
      (branch ? `?ref=${encodeURIComponent(branch)}` : "");
    const key = contentsKey(token, owner, repo, path, branch);
    if (!force) {
      const hit = readContentsCache(key);
      if (hit !== undefined) return hit;
    }
    try {
      const data = await this.request(url, { token });
      if (data === null || Array.isArray(data)) writeContentsCache(key, data);
      return data;
    } catch (e: any) {
      if (String(e?.message || e).includes("404")) {
        writeContentsCache(key, null);
        return null;
      }
      throw e;
    }
  }

  // v2.0.0：檔案最後更新時間。contents API 本身沒有時間欄位，所以用
  // commits API 查這個路徑最新的一筆（per_page=1、sha 指定分支），取
  // commit.committer.date（提交時間，比特 author.date 更貼近「最後更新」），
  // 沒有 author 時退回 author.date。任何失敗都回 null，讓呼叫端直接不顯示
  // 那一行，不要讓檔案頁因為這個附帶資訊壞掉。
  async getLastCommitDate(
    owner: string,
    repo: string,
    path: string,
    branch: string,
  ): Promise<string | null> {
    const url =
      `https://api.github.com/repos/${owner}/${repo}/commits` +
      `?path=${encodeURIComponent(path)}&per_page=1&sha=${encodeURIComponent(branch)}`;
    try {
      const list: any = await this.request(url);
      const c = Array.isArray(list) && list.length > 0 ? list[0] : null;
      const d = c?.commit?.committer?.date || c?.commit?.author?.date || null;
      return typeof d === "string" ? d : null;
    } catch {
      return null;
    }
  }

  // 2.0.5：自己非 Fork 倉庫的總 commit 數（首頁工作狀態第三行用）。
  // 空樹 SHA 當 compare base 這招實測行不通：2026-11-16 對公開倉庫打
  // compare/4b825dc642cb6eb9a060e54bf8d69288fbee4904...master，
  // GitHub 回 404——base 一定要是 commit 或分支，空樹不是 commit。
  // 改用 commits 列表讀分頁 Link 標頭：per_page=1 打一次，
  // Link 裡 rel="last" 的 page 數就是總 commit 數；只有一頁時沒有
  // Link 標頭，回傳實際筆數（0 或 1）。空倉庫 GitHub 回 409，
  // 直接拋錯，呼叫端顯示空白。request 不回傳標頭，所以這裡直接用
  // 全域 fetch，寫法跟 request 的 GET 分支同一套（標頭＋15 秒逾時）。
  async countCommits(owner: string, repo: string, branch: string, token?: string): Promise<number> {
    const url =
      `https://api.github.com/repos/${owner}/${repo}/commits` +
      `?per_page=1&sha=${encodeURIComponent(branch)}`;
    const r: any = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `token ${token ?? this.token}`,
      },
      timeout: 15,
      signal: (AbortSignal as any).timeout
        ? (AbortSignal as any).timeout(15000)
        : undefined,
    } as any);
    if (!r.ok) {
      throw new Error(t(`GitHub API 失敗（${r.status}）`, `GitHub API 失败（${r.status}）`, `GitHub API failed (${r.status})`));
    }
    let link = "";
    try {
      link = (r.headers && typeof r.headers.get === "function" ? r.headers.get("link") : "") || "";
    } catch {}
    const m = String(link).match(/page=(\d+)>;\s*rel="last"/);
    if (m) return parseInt(m[1], 10);
    const data: any = await r.json();
    return Array.isArray(data) ? data.length : 0;
  }

  /** 公開庫專用後備路徑：不帶 Token 讀取。公開庫本來就不需要授權，
      若帶 Token 反而被擋或卡住，這條路可以立刻分辨是不是 Token 的問題。
      注意：不帶 Token 的配額只有每小時 60 次，只當後備用。 */
  async getContentsAnonymous(
    owner: string,
    repo: string,
    path: string,
    branch: string,
  ): Promise<any | null> {
    const p = encodePath(path);
    const url =
      `https://api.github.com/repos/${owner}/${repo}/contents` +
      (p ? `/${p}` : "") +
      (branch ? `?ref=${encodeURIComponent(branch)}` : "");
    try {
      return await this.request(url, undefined, true);
    } catch (e: any) {
      if (String(e?.message || e).includes("404")) return null;
      throw e;
    }
  }

  async getFileText(
    owner: string,
    repo: string,
    path: string,
    branch: string,
  ): Promise<{ text: string; sha: string; size: number }> {
    const data = await this.getContents(owner, repo, path, branch);
    if (!data || data.type !== "file") throw new Error(t("找不到此檔案", "找不到此文件", "File not found"));
    const clean = String(data.content || "").replace(/\s/g, "");
    const decoded = Data.fromBase64String(clean)?.toDecodedString();
    if (decoded === null || decoded === undefined) throw new Error(t("無法解碼檔案內容", "无法解码文件内容", "Failed to decode file content"));
    return { text: decoded, sha: data.sha, size: data.size || 0 };
  }

  // 2026-11-20：唯讀檢視／快速預覽用。contents API 對超過 1MB 的檔案
  // 不回 content（回空字串），以前只能下載。這裡改走 git/blobs，用檔案
  // 的 sha 直接拿 base64，私庫也讀得到（同一顆 Token）。呼叫端自己守
  // MAX_VIEW_BYTES；這裡只負責把 base64 拿回來。
  async getBlobBase64(
    owner: string,
    repo: string,
    sha: string,
  ): Promise<string> {
    if (!sha) throw new Error(t("找不到目前檔案的 sha，請先重新整理", "找不到目前文件的 sha，请先刷新", "Cannot find the current file's sha. Please refresh first."));
    const data = await this.request(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(sha)}`,
    );
    const content = String(data?.content || "").replace(/\s/g, "");
    if (!content) throw new Error(t("檔案內容為空，無法預覽", "文件内容为空，无法预览", "The file is empty, so there is nothing to preview."));
    return content;
  }

  async putFile(args: {
    owner: string;
    repo: string;
    path: string;
    branch: string;
    message: string;
    base64: string;
    sha?: string;
  }): Promise<any> {
    const body: any = {
      message: args.message,
      content: args.base64,
      branch: args.branch,
    };
    if (args.sha) body.sha = args.sha;
    // v1.13：提交作者身分欄已取消，不再送 committer，一律用 GitHub 預設，
    // 也就是 Token 帳號當作者跟提交者，避免只填一欄造成 422。
    const r = await this.request(
      `https://api.github.com/repos/${args.owner}/${args.repo}/contents/${encodePath(args.path)}`,
      { method: "PUT", body: JSON.stringify(body) },
    );
    bustContents(args.owner, args.repo);
    return r;
  }

  // 2.0.5：首頁左滑 Push（上傳檔案）用。跟 putFile 同寫法，
  // 只差在帶指定帳號的 Token，不換共用的 repo.token。
  async putFileForToken(
    token: string,
    args: {
      owner: string;
      repo: string;
      path: string;
      branch: string;
      message: string;
      base64: string;
      sha?: string;
    },
  ): Promise<any> {
    const body: any = {
      message: args.message,
      content: args.base64,
      branch: args.branch,
    };
    if (args.sha) body.sha = args.sha;
    const r = await this.request(
      `https://api.github.com/repos/${args.owner}/${args.repo}/contents/${encodePath(args.path)}`,
      { method: "PUT", body: JSON.stringify(body), token },
    );
    bustContents(args.owner, args.repo);
    return r;
  }

  async deleteFile(args: {
    owner: string;
    repo: string;
    path: string;
    branch: string;
    message: string;
    sha: string;
  }): Promise<any> {
    const r = await this.request(
      `https://api.github.com/repos/${args.owner}/${args.repo}/contents/${encodePath(args.path)}`,
      {
        method: "DELETE",
        body: JSON.stringify({
          message: args.message,
          sha: args.sha,
          branch: args.branch,
        }),
      },
    );
    bustContents(args.owner, args.repo);
    return r;
  }

  // v3.0：更名／移動共用的 Git Data API 一次提交。
  // GitHub 沒有資料夾物件，資料夾只是路徑前綴，所以「改目錄名」就是
  // 把底下所有檔案換路徑；「檔案改名／換目錄」就是把一個檔案換路徑。
  // 一個檔案一個檔案用 Contents API 慢慢搬會變成很多次提交，中途失敗
  // 還會一半新、一半舊，所以這裡一律用一次提交完成：
  // 取分支 ref → 取 commit → 取 base tree → 建新 tree（新路徑加舊 blob、
  // 舊路徑 sha 設 null 刪除）→ 建 commit → 把分支 ref 指到新 commit。
  // 分支名字不變，只是往前移一個 commit；內容用舊 blob sha 重用，
  // 二進位檔案也不用重新下載、重新編碼。
  private cleanMovePath(p: string): string {
    const parts = String(p || "").split("/");
    for (const s of parts) {
      if (s === "..") throw new Error(t("路徑不能包含 ..", "路径不能包含 ..", "Path cannot contain .."));
    }
    return parts.filter((s) => s.length > 0 && s !== ".").join("/");
  }

  private async getBranchHead(owner: string, repo: string, branch: string): Promise<{ commitSha: string; treeSha: string }> {
    const ref = await this.request(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodePath(branch)}`,
    );
    const commitSha = ref?.object?.sha;
    if (!commitSha) throw new Error(t("找不到分支", "找不到分支", "Branch not found"));
    const commit = await this.request(
      `https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSha}`,
    );
    const treeSha = commit?.tree?.sha;
    if (!treeSha) throw new Error(t("找不到分支的檔案樹", "找不到分支的文件树", "Branch tree not found"));
    return { commitSha, treeSha };
  }

  private async commitTree(args: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    baseTreeSha: string;
    parentSha: string;
    entries: any[];
  }): Promise<any> {
    // 2026-11-19：三步各包一層，失敗時錯誤訊息寫明是哪一步（刪資料夾
    // 404 那次只看到籠統的 GitHub API 失敗，不知道是哪個請求出的錯）。
    // 更名／搬移也走這裡，一起受惠。
    let tree: any;
    try {
      tree = await this.request(
        `https://api.github.com/repos/${args.owner}/${args.repo}/git/trees`,
        { method: "POST", body: JSON.stringify({ base_tree: args.baseTreeSha, tree: args.entries }) },
      );
    } catch (e: any) {
      throw new Error(t(`建立檔案樹失敗：${String(e?.message || e)}`, `建立文件树失败：${String(e?.message || e)}`, `Failed to create tree: ${String(e?.message || e)}`));
    }
    if (!tree?.sha) throw new Error(t("建立檔案樹失敗", "建立文件树失败", "Failed to create tree"));
    let commit: any;
    try {
      commit = await this.request(
        `https://api.github.com/repos/${args.owner}/${args.repo}/git/commits`,
        { method: "POST", body: JSON.stringify({ message: args.message, tree: tree.sha, parents: [args.parentSha] }) },
      );
    } catch (e: any) {
      throw new Error(t(`建立提交失敗：${String(e?.message || e)}`, `建立提交失败：${String(e?.message || e)}`, `Failed to create commit: ${String(e?.message || e)}`));
    }
    if (!commit?.sha) throw new Error(t("建立提交失敗", "建立提交失败", "Failed to create commit"));
    try {
      await this.request(
        `https://api.github.com/repos/${args.owner}/${args.repo}/git/refs/heads/${encodePath(args.branch)}`,
        { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) },
      );
    } catch (e: any) {
      throw new Error(t(`更新分支失敗：${String(e?.message || e)}`, `更新分支失败：${String(e?.message || e)}`, `Failed to update branch: ${String(e?.message || e)}`));
    }
    // 2.1.13：更名／刪除資料夾、搬移檔案都走這條，一次提交完成後
    // 目錄內容已經變了，快取必須作廢，不然退回上層還看到舊的。
    bustContents(args.owner, args.repo);
    return commit;
  }

  async renameDirectory(args: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    oldDir: string;
    newDir: string;
  }): Promise<{ count: number; newDir: string }> {
    const oldDir = this.cleanMovePath(args.oldDir);
    const newDir = this.cleanMovePath(args.newDir);
    if (!oldDir || !newDir) throw new Error(t("資料夾名稱不能為空", "文件夹名称不能为空", "Folder name cannot be empty"));
    if (oldDir === newDir) throw new Error(t("新名稱跟舊名稱一樣", "新名称跟旧名称一样", "New name is the same as the old name"));
    if (newDir.startsWith(oldDir + "/")) throw new Error(t("不能把資料夾移到自己底下", "不能把文件夹移到自己底下", "Cannot move a folder into itself"));
    const head = await this.getBranchHead(args.owner, args.repo, args.branch);
    const treeData = await this.request(
      `https://api.github.com/repos/${args.owner}/${args.repo}/git/trees/${head.treeSha}?recursive=1`,
    );
    if (treeData?.truncated) throw new Error(t("檔案太多，樹狀清單被截斷，請分批更名", "文件太多，树状清单被截断，请分批更名", "Too many files — the tree listing was truncated. Rename in smaller batches."));
    const all = Array.isArray(treeData?.tree) ? treeData.tree : [];
    const files = all.filter((e: any) => e?.type !== "tree" && (e.path === oldDir || String(e.path || "").startsWith(oldDir + "/")));
    if (files.length === 0) throw new Error(t("此資料夾內沒有檔案，空資料夾無法更名", "此文件夹内没有文件，空文件夹无法更名", "This folder has no files — an empty folder cannot be renamed"));
    if (all.some((e: any) => e.path === newDir || String(e.path || "").startsWith(newDir + "/"))) {
      throw new Error(t("新名稱底下已有檔案，請換一個名稱", "新名称底下已有文件，请换一个名称", "Files already exist under the new name. Choose another name."));
    }
    const entries: any[] = [];
    for (const f of files) {
      entries.push({ path: newDir + String(f.path).slice(oldDir.length), mode: f.mode || "100644", type: f.type, sha: f.sha });
    }
    for (const f of files) {
      entries.push({ path: f.path, mode: f.mode || "100644", type: f.type, sha: null });
    }
    await this.commitTree({
      owner: args.owner,
      repo: args.repo,
      branch: args.branch,
      message: args.message,
      baseTreeSha: head.treeSha,
      parentSha: head.commitSha,
      entries,
    });
    return { count: files.length, newDir };
  }

  // v3.0 回饋 1：刪除資料夾，一樣一次提交完成。跟更名共用同一招：
  // 取分支 ref → commit → base tree → 遞迴樹篩出該資料夾底下所有檔案，
  // 新 tree 只放刪除項目（舊路徑 sha 設 null），建 commit、更新分支 ref。
  // 空資料夾在 Git 裡本來就不存在，瀏覽清單也不會出現它，所以沒檔案就報錯。
  // 2026-11-19：刪 KristenYT/wq 的 app 資料夾回 GitHub API 失敗 (404)，
  // 但倉庫、分支、資料夾、檔案都在（後台已查證：1 個提交、app/new-file.txt），
  // 唯讀那幾步都通，問題只能出在一次提交那三步裡，卻看不出是哪一步。
  // 所以兩件事：(1) 每步失敗都寫明步驟（取分支／取檔案樹／提交刪除），
  // 下次再失敗，對話框直接講是哪一步；(2) 一次提交失敗時改走 Contents API
  // 逐檔刪除（跟新增檔案同一套請求，裝置上已證實可用），不要整路死掉。
  async deleteDirectory(args: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    dir: string;
  }): Promise<{ count: number }> {
    const dir = this.cleanMovePath(args.dir);
    if (!dir) throw new Error(t("資料夾名稱不能為空", "文件夹名称不能为空", "Folder name cannot be empty"));
    try {
      return await this.deleteDirectoryViaTree(args, dir);
    } catch (treeErr: any) {
      const treeMsg = String(treeErr?.message || treeErr);
      // 空資料夾：逐檔刪也沒東西可刪，直接報原本的錯。
      if (treeMsg.includes("沒有檔案") || treeMsg.includes("没有文件")) throw treeErr;
      try {
        const count = await this.deleteDirectoryViaContents(args, dir);
        return { count };
      } catch (fallbackErr: any) {
        const fallbackMsg = String(fallbackErr?.message || fallbackErr);
        throw new Error(t(`刪除資料夾失敗（一次提交：${treeMsg}；逐檔刪除：${fallbackMsg}）`, `删除文件夹失败（一次提交：${treeMsg}；逐档删除：${fallbackMsg}）`, `Failed to delete folder (single commit: ${treeMsg}; per-file delete: ${fallbackMsg})`));
      }
    }
  }

  // 一次提交刪資料夾：取分支 → 取遞迴樹 → 篩檔案 → commitTree。
  private async deleteDirectoryViaTree(args: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    dir: string;
  }, dir: string): Promise<{ count: number }> {
    let head: { commitSha: string; treeSha: string };
    try {
      head = await this.getBranchHead(args.owner, args.repo, args.branch);
    } catch (e: any) {
      throw new Error(t(`取分支失敗：${String(e?.message || e)}`, `取分支失败：${String(e?.message || e)}`, `Failed to read branch: ${String(e?.message || e)}`));
    }
    let treeData: any;
    try {
      treeData = await this.request(
        `https://api.github.com/repos/${args.owner}/${args.repo}/git/trees/${head.treeSha}?recursive=1`,
      );
    } catch (e: any) {
      throw new Error(t(`取檔案樹失敗：${String(e?.message || e)}`, `取文件树失败：${String(e?.message || e)}`, `Failed to read file tree: ${String(e?.message || e)}`));
    }
    if (treeData?.truncated) throw new Error(t("檔案太多，樹狀清單被截斷，請分批刪除", "文件太多，树状清单被截断，请分批删除", "Too many files — the tree listing was truncated. Delete in smaller batches."));
    const all = Array.isArray(treeData?.tree) ? treeData.tree : [];
    const files = all.filter((e: any) => e?.type !== "tree" && (e.path === dir || String(e.path || "").startsWith(dir + "/")));
    if (files.length === 0) throw new Error(t("此資料夾內沒有檔案，無法刪除", "此文件夹内没有文件，无法删除", "This folder has no files to delete"));
    const entries = files.map((f: any) => ({ path: f.path, mode: f.mode || "100644", type: f.type, sha: null }));
    try {
      await this.commitTree({
        owner: args.owner,
        repo: args.repo,
        branch: args.branch,
        message: args.message,
        baseTreeSha: head.treeSha,
        parentSha: head.commitSha,
        entries,
      });
    } catch (e: any) {
      throw new Error(t(`提交刪除失敗：${String(e?.message || e)}`, `提交删除失败：${String(e?.message || e)}`, `Failed to commit deletion: ${String(e?.message || e)}`));
    }
    return { count: files.length };
  }

  // 逐檔刪資料夾（一次提交失敗時的後備）：Contents API 遞迴列出底下
  // 所有檔案，再一個一個用 DELETE /contents 刪（跟新增檔案同一套請求）。
  // 檔案多時會變成多次提交、比較慢，但至少刪得掉。
  private async deleteDirectoryViaContents(args: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    dir: string;
  }, dir: string): Promise<number> {
    const files = await this.collectDirFiles(args.owner, args.repo, dir, args.branch);
    if (files.length === 0) throw new Error(t("此資料夾內沒有檔案，無法刪除", "此文件夹内没有文件，无法删除", "This folder has no files to delete"));
    let done = 0;
    for (const f of files) {
      try {
        await this.deleteFile({ owner: args.owner, repo: args.repo, path: f.path, branch: args.branch, message: args.message, sha: f.sha });
        done++;
      } catch (e: any) {
        throw new Error(t(`刪除 ${f.path} 失敗（已刪 ${done}/${files.length} 個）：${String(e?.message || e)}`, `删除 ${f.path} 失败（已删 ${done}/${files.length} 个）：${String(e?.message || e)}`, `Failed to delete ${f.path} (deleted ${done}/${files.length}): ${String(e?.message || e)}`));
      }
    }
    return done;
  }

  // Contents API 遞迴列出資料夾底下所有檔案（帶 sha，給逐檔刪除用）。
  // 找不到資料夾時 getContents 回 null（404 當空），這裡直接報找不到。
  private async collectDirFiles(owner: string, repo: string, dir: string, branch: string): Promise<{ path: string; sha: string }[]> {
    const data = await this.getContents(owner, repo, dir, branch, true);
    if (data === null) throw new Error(t("找不到這個資料夾，可能是已經刪掉了", "找不到这个文件夹，可能是已经删除了", "Folder not found — it may already be deleted"));
    if (!Array.isArray(data)) throw new Error(t("此路徑不是資料夾", "此路径不是文件夹", "This path is not a folder"));
    const out: { path: string; sha: string }[] = [];
    for (const e of data) {
      if (e?.type === "dir") {
        out.push(...await this.collectDirFiles(owner, repo, String(e.path || ""), branch));
      } else if (e?.type === "file" && e?.sha) {
        out.push({ path: String(e.path || ""), sha: String(e.sha) });
      }
    }
    return out;
  }

  // v3.0 回饋 7：首頁長按重新命名倉庫。PATCH /repos/{owner}/{repo}，
  // body 只有 name，分支、內容、其他設定都不動，倉庫網址跟 Raw 連結的
  // 倉庫名那段會跟著換。跟 Fork 一樣用指定帳號 Token 打，完事換回來，
  // 別人的倉庫會回 403/404，錯誤直接交給呼叫端顯示。
  async renameRepoForToken(token: string, owner: string, oldName: string, newName: string): Promise<any> {
    const prev = this.token;
    this.token = token;
    try {
      const r = await this.request(
        `https://api.github.com/repos/${owner}/${oldName}`,
        { method: "PATCH", body: JSON.stringify({ name: newName }) },
      );
      // 2.1.13：改名後舊名稱的目錄快取已經沒用了，全部作廢（新名稱沒有舊資料）。
      bustContents(owner, oldName);
      bustContents(owner, newName);
      return r;
    } finally {
      this.token = prev;
    }
  }

  async moveFile(args: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    oldPath: string;
    newPath: string;
    newText?: string;
  }): Promise<{ newPath: string }> {
    const oldPath = this.cleanMovePath(args.oldPath);
    const newPath = this.cleanMovePath(args.newPath);
    if (!oldPath || !newPath) throw new Error(t("檔案路徑不能為空", "文件路径不能为空", "File path cannot be empty"));
    if (oldPath === newPath) throw new Error(t("新路徑跟舊路徑一樣", "新路径跟旧路径一样", "New path is the same as the old path"));
    const dest = await this.getContents(args.owner, args.repo, newPath, args.branch);
    if (dest) throw new Error(t("新路徑已有檔案，請換一個路徑", "新路径已有文件，请换一个路径", "A file already exists at the new path. Choose another path."));
    const head = await this.getBranchHead(args.owner, args.repo, args.branch);
    let blobSha = "";
    let mode = "100644";
    if (args.newText !== undefined) {
      const blob = await this.request(
        `https://api.github.com/repos/${args.owner}/${args.repo}/git/blobs`,
        { method: "POST", body: JSON.stringify({ content: args.newText, encoding: "utf-8" }) },
      );
      if (!blob?.sha) throw new Error(t("建立檔案內容失敗", "建立文件内容失败", "Failed to create blob"));
      blobSha = blob.sha;
    } else {
      const info = await this.getContents(args.owner, args.repo, oldPath, args.branch);
      if (!info || info.type !== "file" || !info.sha) throw new Error(t("找不到舊檔案", "找不到旧文件", "Old file not found"));
      blobSha = info.sha;
    }
    await this.commitTree({
      owner: args.owner,
      repo: args.repo,
      branch: args.branch,
      message: args.message,
      baseTreeSha: head.treeSha,
      parentSha: head.commitSha,
      entries: [
        { path: newPath, mode, type: "blob", sha: blobSha },
        { path: oldPath, mode, type: "blob", sha: null },
      ],
    });
    return { newPath };
  }

  // 2026-11-05 回饋：跨倉庫搬檔案。順序刻意先建目標、再刪原檔，
  // 所以中途失敗時原檔案還在，不會兩邊都沒有。
  // 1. 先查目標倉庫（getRepo）：不存在就直接報錯，不動任何檔案，
  //    不會因為倉庫名打錯就在原倉庫長出一個同名資料夾。
  // 2. 目標路徑已有檔案就報錯，不覆蓋。
  // 3. 目標分支用目標倉庫的預設分支（原分支在目標倉庫不一定存在），
  //    沒有預設分支（空倉庫）才退回原分支。
  // 4. 建立目標檔案（新內容用 utf-8 blob base64，否則重用原檔案的
  //    base64；內容 API 沒回內容的大檔案就直接報錯，不硬搬），
  //    成功後再刪原檔案。刪原檔案失敗時也要報錯，並明講目標那邊
  //    已經建立了，請手動刪原檔案，不要假裝搬成功。
  async moveFileToRepo(args: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    oldPath: string;
    targetRepo: string;
    targetPath: string;
    newText?: string;
  }): Promise<{ targetRepo: string; targetPath: string; targetBranch: string }> {
    const oldPath = this.cleanMovePath(args.oldPath);
    const targetPath = this.cleanMovePath(args.targetPath);
    const targetRepo = String(args.targetRepo || "").trim();
    if (!oldPath || !targetPath || !targetRepo) throw new Error(t("檔案路徑跟目標倉庫不能為空", "文件路径跟目标仓库不能为空", "File path and target repository cannot be empty"));
    if (targetRepo.includes("/") || targetRepo === "..") throw new Error(t("倉庫名稱不正確", "仓库名称不正确", "Invalid repository name"));
    if (targetRepo === args.repo) {
      await this.moveFile({ owner: args.owner, repo: args.repo, branch: args.branch, message: args.message, oldPath, newPath: targetPath, newText: args.newText });
      return { targetRepo: args.repo, targetPath, targetBranch: args.branch };
    }
    let targetBranch = args.branch;
    try {
      const info = await this.getRepo(args.owner, targetRepo);
      if (info?.default_branch) targetBranch = info.default_branch;
    } catch (e: any) {
      if (String(e?.message || e).includes("404")) {
        throw new Error(t(`找不到倉庫 "${args.owner}/${targetRepo}"\n請檢查倉庫名是否正確`, `找不到仓库 "${args.owner}/${targetRepo}"\n请检查仓库名是否正确`, `Repository "${args.owner}/${targetRepo}" was not found.\nPlease check the repository name.`));
      }
      throw e;
    }
    const dest = await this.getContents(args.owner, targetRepo, targetPath, targetBranch);
    if (dest) throw new Error(t("新路徑已有檔案，請換一個路徑", "新路径已有文件，请换一个路径", "A file already exists at the new path. Choose another path."));
    const source = await this.getContents(args.owner, args.repo, oldPath, args.branch);
    if (!source || source.type !== "file" || !source.sha) throw new Error(t("找不到舊檔案", "找不到旧文件", "Old file not found"));
    let base64 = "";
    if (args.newText !== undefined) {
      base64 = Repo.textToBase64(args.newText);
    } else {
      base64 = String(source.content || "").replace(/\s/g, "");
      if (!base64) throw new Error(t("此檔案太大，無法跨倉庫搬移，請先下載再上傳到目標倉庫", "此文件太大，无法跨仓库移动，请先下载再上传到目标仓库", "This file is too large to move across repositories. Download it and upload it to the target repository instead."));
    }
    await this.putFile({ owner: args.owner, repo: targetRepo, path: targetPath, branch: targetBranch, message: args.message, base64 });
    try {
      await this.deleteFile({ owner: args.owner, repo: args.repo, path: oldPath, branch: args.branch, message: args.message, sha: source.sha });
    } catch (e: any) {
      throw new Error(t(`目標倉庫已建立檔案，但原倉庫刪除失敗，請手動刪除原檔案：${String(e?.message || e)}`, `目标仓库已建立文件，但原仓库删除失败，请手动删除原文件：${String(e?.message || e)}`, `The file was created in the target repository, but deleting the original failed. Please delete the original manually: ${String(e?.message || e)}`));
    }
    return { targetRepo, targetPath, targetBranch };
  }

  static textToBase64(text: string): string {
    const data = Data.fromRawString(text);
    if (!data) throw new Error(t("文字轉換失敗", "文字转换失败", "Failed to convert text"));
    return data.toBase64String();
  }
}

export const repo = new Repo();

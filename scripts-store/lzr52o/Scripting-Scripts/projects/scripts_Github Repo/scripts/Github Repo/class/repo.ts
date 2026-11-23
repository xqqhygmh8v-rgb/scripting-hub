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
export const ACCOUNTS_KEY = "repo_editor_accounts";

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
}

function encodePath(path: string): string {
  return path
    .split("/")
    .filter((p) => p.length > 0)
    .map((p) => encodeURIComponent(p))
    .join("/");
}

export function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "" : path.slice(0, i);
}

export function isTextExtension(path: string): boolean {
  const ext = (path.split(".").pop() || "").toLowerCase();
  return [
    "txt", "md", "markdown", "json", "yml", "yaml", "toml", "ini", "cfg",
    "ts", "tsx", "js", "jsx", "mjs", "css", "scss", "html", "xml", "svg",
    "sh", "py", "rb", "go", "rs", "java", "c", "h", "cpp", "swift", "kt",
    "sql", "csv", "lock", "gitignore", "env",
  ].includes(ext);
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
  private async request(
    url: string,
    init?: { method?: string; body?: string },
    anonymous?: boolean,
  ): Promise<any> {
    const method = init?.method ?? "GET";
    const headers: any = {
      Accept: "application/vnd.github.v3+json",
    };
    if (!anonymous) headers.Authorization = `token ${this.token}`;
    try {
      // v1.8：GET 用跟診斷完全一樣的最小寫法（只有標頭 + timeout），
      // 不帶 method、body、signal，因為診斷用那個寫法在同一台裝置上秒回，
      // 而 Repo 編輯之前帶 method/body/signal 的寫法卻掛住超過兩分鐘。
      // PUT/DELETE 仍需要 method/body，保留原本寫法加 AbortSignal.timeout。
      const timeoutMs = method === "GET" ? 15000 : 60000;
      const r =
        method === "GET"
          ? await fetch(url, { headers, timeout: 15 } as any)
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
        throw new Error(t("請求逾時（15 秒）或網路問題：請按重新整理再試一次", "请求逾时（15 秒）或网路问题：请按重新整理再试一次", "Request timed out (15 seconds) or network issue. Tap Refresh and try again."));
      }
      throw err;
    }
  }

  async getUser(): Promise<any> {
    return await this.request("https://api.github.com/user");
  }

  async listMyRepos(): Promise<RepoInfo[]> {
    return await this.request(
      "https://api.github.com/user/repos?per_page=100&sort=updated",
    );
  }

  // v1.15：多帳號清單用。清單頁要逐一用每個帳號的 Token 抓該帳號的倉庫，
  // 不能只用使用中帳號的 Token，所以先換 Token、抓完再換回來；
  // 清單是循序抓的，不會兩個帳號同時換 Token 打架。
  async listReposForToken(token: string): Promise<RepoInfo[]> {
    const prev = this.token;
    this.token = token;
    try {
      return await this.listMyRepos();
    } finally {
      this.token = prev;
    }
  }

  // v1.17：手動只填用戶名用。抓該用戶的公開倉庫，不用先把他加成帳號。
  // 有 Token 時帶 Token 抓（避免共用 IP 額度被別人用完），沒 Token 才不帶 Token。
  // v1.18：說明寫的是「所有公開倉庫」，所以要分頁抓完，不能只抓第一頁 100 個；
  // 一頁不滿 100 個就代表到底了，否則繼續抓下一頁。
  async listUserRepos(username: string): Promise<RepoInfo[]> {
    const all: RepoInfo[] = [];
    for (let page = 1; ; page++) {
      const batch: any = await this.request(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&type=public&page=${page}`,
        undefined,
        !this.token,
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

  // v1.20：改倉庫公開／私人。PATCH /repos/{owner}/{repo}，private 欄位
  // true 是私人、false 是公開；開關開是公開、關是私人。
  async updateRepoVisibility(owner: string, repo: string, isPrivate: boolean): Promise<any> {
    return await this.request(
      `https://api.github.com/repos/${owner}/${repo}`,
      { method: "PATCH", body: JSON.stringify({ private: isPrivate }) },
    );
  }

  // v2.1.0：刪除倉庫。DELETE /repos/{owner}/{repo}，成功回 204、沒有內容；
  // 需要 delete_repo 權限，而且只能刪自己的倉庫（擁有者），別人的會回 403/404。
  async deleteRepo(owner: string, repo: string): Promise<any> {
    return await this.request(
      `https://api.github.com/repos/${owner}/${repo}`,
      { method: "DELETE" },
    );
  }

  async getRepo(owner: string, repo: string): Promise<RepoInfo> {
    return await this.request(`https://api.github.com/repos/${owner}/${repo}`);
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

  /** 讀取目錄（回傳陣列）或單一檔案（回傳物件）。404 時回傳 null。 */
  async getContents(
    owner: string,
    repo: string,
    path: string,
    branch: string,
  ): Promise<any | null> {
    const p = encodePath(path);
    const url =
      `https://api.github.com/repos/${owner}/${repo}/contents` +
      (p ? `/${p}` : "") +
      `?ref=${encodeURIComponent(branch)}`;
    try {
      return await this.request(url);
    } catch (e: any) {
      if (String(e?.message || e).includes("404")) return null;
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
      `?ref=${encodeURIComponent(branch)}`;
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
    return await this.request(
      `https://api.github.com/repos/${args.owner}/${args.repo}/contents/${encodePath(args.path)}`,
      { method: "PUT", body: JSON.stringify(body) },
    );
  }

  async deleteFile(args: {
    owner: string;
    repo: string;
    path: string;
    branch: string;
    message: string;
    sha: string;
  }): Promise<any> {
    return await this.request(
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
    const tree = await this.request(
      `https://api.github.com/repos/${args.owner}/${args.repo}/git/trees`,
      { method: "POST", body: JSON.stringify({ base_tree: args.baseTreeSha, tree: args.entries }) },
    );
    if (!tree?.sha) throw new Error(t("建立檔案樹失敗", "建立文件树失败", "Failed to create tree"));
    const commit = await this.request(
      `https://api.github.com/repos/${args.owner}/${args.repo}/git/commits`,
      { method: "POST", body: JSON.stringify({ message: args.message, tree: tree.sha, parents: [args.parentSha] }) },
    );
    if (!commit?.sha) throw new Error(t("建立提交失敗", "建立提交失败", "Failed to create commit"));
    await this.request(
      `https://api.github.com/repos/${args.owner}/${args.repo}/git/refs/heads/${encodePath(args.branch)}`,
      { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) },
    );
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
  async deleteDirectory(args: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    dir: string;
  }): Promise<{ count: number }> {
    const dir = this.cleanMovePath(args.dir);
    if (!dir) throw new Error(t("資料夾名稱不能為空", "文件夹名称不能为空", "Folder name cannot be empty"));
    const head = await this.getBranchHead(args.owner, args.repo, args.branch);
    const treeData = await this.request(
      `https://api.github.com/repos/${args.owner}/${args.repo}/git/trees/${head.treeSha}?recursive=1`,
    );
    if (treeData?.truncated) throw new Error(t("檔案太多，樹狀清單被截斷，請分批刪除", "文件太多，树状清单被截断，请分批删除", "Too many files — the tree listing was truncated. Delete in smaller batches."));
    const all = Array.isArray(treeData?.tree) ? treeData.tree : [];
    const files = all.filter((e: any) => e?.type !== "tree" && (e.path === dir || String(e.path || "").startsWith(dir + "/")));
    if (files.length === 0) throw new Error(t("此資料夾內沒有檔案，無法刪除", "此文件夹内没有文件，无法删除", "This folder has no files to delete"));
    const entries = files.map((f: any) => ({ path: f.path, mode: f.mode || "100644", type: f.type, sha: null }));
    await this.commitTree({
      owner: args.owner,
      repo: args.repo,
      branch: args.branch,
      message: args.message,
      baseTreeSha: head.treeSha,
      parentSha: head.commitSha,
      entries,
    });
    return { count: files.length };
  }

  // v3.0 回饋 7：首頁長按重新命名倉庫。PATCH /repos/{owner}/{repo}，
  // body 只有 name，分支、內容、其他設定都不動，倉庫網址跟 Raw 連結的
  // 倉庫名那段會跟著換。跟 Fork 一樣用指定帳號 Token 打，完事換回來，
  // 別人的倉庫會回 403/404，錯誤直接交給呼叫端顯示。
  async renameRepoForToken(token: string, owner: string, oldName: string, newName: string): Promise<any> {
    const prev = this.token;
    this.token = token;
    try {
      return await this.request(
        `https://api.github.com/repos/${owner}/${oldName}`,
        { method: "PATCH", body: JSON.stringify({ name: newName }) },
      );
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

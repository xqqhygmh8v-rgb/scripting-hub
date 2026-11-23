import { fetch, RequestInit } from "scripting";
import { t } from "../../components/i18n";

// v1.1.0：多帳號。帳號清單存在 gist_accounts，格式 [{username, token, avatar}]。
// username 跟 avatar 不是手填的，是用 Token 去 /user 抓回來的（跟舊版單一帳號
// 快取用戶名的做法一樣），所以不會有帳號跟 Token 對不上的問題；重複 Token 不給加。
export interface GistAccount {
  username: string;
  token: string;
  avatar?: string;
}

// Shared with GitHub Actions and Repository Manager in the combined script.
export const ACCOUNTS_KEY = "github_toolkit_accounts";

export function getAccounts(): GistAccount[] {
  try {
    const raw = Storage.get<string>(ACCOUNTS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr.filter((a: any) => a && a.username && a.token);
      }
    }
  } catch {}
  // 舊版遷移：還沒有帳號清單、但有舊的單一 Token，且快取裡有用戶名，
  // 就直接搬成第一個帳號，不用重填；快取沒有用戶名時由 ensureAccounts 去 /user 抓。
  const legacyToken = Storage.get<string>("gist") || "";
  const legacyName = Storage.get<string>("gist_user_name") || "";
  if (legacyToken && legacyName) {
    const accounts: GistAccount[] = [
      { username: legacyName, token: legacyToken, avatar: Storage.get<string>("gist_user_avatar") || "" },
    ];
    Storage.set(ACCOUNTS_KEY, JSON.stringify(accounts));
    return accounts;
  }
  return [];
}

export function saveAccounts(accounts: GistAccount[]): void {
  Storage.set(ACCOUNTS_KEY, JSON.stringify(accounts));
  // 第一帳號同時寫回舊的單一 Token 鍵，讓排序／記錄的 Gist 同步（走 gist.token）
  // 繼續用第一個帳號，不用改 fileOrder。
  if (accounts.length > 0) {
    Storage.set("gist", accounts[0].token);
  } else {
    Storage.remove("gist");
  }
}

// 帳號清單為空、但有舊 Token 時，試著用舊 Token 去 /user 抓回用戶名來遷移；
// 抓不到（Token 壞了）就回空陣列，讓呼叫端去開設定請用戶重新加。
export async function ensureAccounts(): Promise<GistAccount[]> {
  const cur = getAccounts();
  if (cur.length > 0) return cur;
  const legacyToken = Storage.get<string>("gist") || "";
  if (!legacyToken) return [];
  try {
    const user = await fetchUser(legacyToken);
    const accounts: GistAccount[] = [
      { username: user.login, token: legacyToken, avatar: user.avatar_url || "" },
    ];
    saveAccounts(accounts);
    return accounts;
  } catch {
    return [];
  }
}

// 2.1.11：逾時用原生 timeout 加上 AbortSignal.timeout 兩道。
// 型別環境裡沒有 AbortSignal，用 globalThis 取，兼顧執行環境可能沒有它的情況。
function timeoutSignal(ms: number): any {
  const A = (globalThis as any).AbortSignal;
  return A && typeof A.timeout === "function" ? A.timeout(ms) : undefined;
}

export async function fetchUser(token: string): Promise<{ login: string; avatar_url: string }> {
  const r = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
    },
    timeout: 15,
    signal: timeoutSignal(15000),
  } as any);
  if (!r.ok) throw t(`獲取用戶失敗: ${r.status} ${r.statusText}`, `获取用户失败: ${r.status} ${r.statusText}`, `Failed to fetch user: ${r.status} ${r.statusText}`);
  return await r.json();
}

// 2.1.11：GitHub Gist 的請求以前沒有逾時，網路一掛住就永遠轉圈圈（連錯誤都
// 不會出現）；而且 Token 是「暫時換掉共用欄位」的寫法，所以抓多帳號只能
// 一個一個排隊。現在每個請求都能自己帶 Token，呼叫端就能安全地 Promise.all。
async function gistFetch(url: string, init: RequestInit | undefined, token: string) {
  const isGet = !init?.method || init.method === "GET";
  const timeoutMs = isGet ? 15000 : 60000;
  const r = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      ...(init as any)?.headers,
      Authorization: `Bearer ${token}`,
    },
    timeout: timeoutMs / 1000,
    signal: timeoutSignal(timeoutMs),
  } as any);
  if (!r.ok) {
    // 2026-11-07：錯誤訊息優先用 GitHub 回的 message。
    let detail = r.statusText || "";
    try {
      const data = await r.json();
      if (data?.message) detail = data.message;
    } catch {}
    throw `GitHub API ${r.status}${detail ? `：${detail}` : ""}`;
  }
  // DELETE 成功回 204，本體是空的，不能直接 r.json()。
  const text = await r.text();
  if (!text) return undefined as any;
  return JSON.parse(text);
}

class Gist {
  private KEY = "gist";
  token: string = Storage.get(this.KEY) || "";

  save() {
    Storage.set(this.KEY, this.token);
  }

  // v1.1.0：用指定帳號的 Token 跑一次操作，跑完換回原本的 Token。
  // 多帳號時每個 Gist 的操作都要用它所屬帳號的 Token，不能共用目前這支。
  async withToken<T>(token: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.token;
    this.token = token;
    try {
      return await fn();
    } finally {
      this.token = prev;
    }
  }

  async get(token?: string) {
    return await this.fetch("https://api.github.com/gists", undefined, token);
  }

  // 2.1.11：詳情頁刷新只需要自己這一筆，不要每次把所有帳號的所有 Gist 重抓一次。
  async getById(id: string, token?: string) {
    return await this.fetch(`https://api.github.com/gists/${id}`, undefined, token);
  }

  // --- api --- //
  async create(filename: string, content: string, isPublic: boolean, description: string, token?: string) {
    return await this.fetch("https://api.github.com/gists", {
      method: "POST",
      body: JSON.stringify({
        description: description,
        public: isPublic,
        files: {
          [filename]: {
            content: content,
          },
        },
      }),
    }, token);
  }

  async updateContent(url: string, filename: string, content: string, token?: string) {
    // 2026-11-14：防刪檔。Kristen 編輯 Gist 存檔後檔案自己消失了（網頁版
    // Gist 也不見，活動記錄只有編輯、沒有刪除）。原因是 updateContent 完全
    // 沒驗證：GitHub 的 PATCH 會把檔案設為 null 或 content 為 null 解讀為
    // 刪檔；content 若是 undefined，JSON.stringify 會把 content 欄位整個
    // 省略（送出 files: {name: {}}），也可能被解讀為刪檔。只要編輯器那邊
    // controller.content 一度不是字串（載入異常、狀態不同步），存檔就會
    // 靜悄悄送出一個刪檔 PATCH，GitHub 回 200、活動記錄還照寫「編輯檔案」，
    // 檔案卻不見了。現在 filename 跟 content 都必須是有效字串，否則直接
    // 丟錯、不送請求，更新永遠不能變成刪檔。
    if (!filename || typeof filename !== "string") {
      throw t("檔名無效，無法儲存", "文件名无效，无法保存", "Invalid filename, cannot save");
    }
    if (typeof content !== "string") {
      throw t("內容無效，無法儲存（內容不是文字）", "内容无效，无法保存（内容不是文字）", "Invalid content, cannot save (content is not text)");
    }
    return await this.fetch(url, {
      method: "PATCH",
      body: JSON.stringify({
        files: {
          [filename]: {
            content: content,
          },
        },
      }),
    }, token);
  }

  async deleteContent(url: string, filename: string, token?: string) {
    return await this.fetch(url, {
      method: "PATCH",
      body: JSON.stringify({
        files: {
          [filename]: null,
        },
      }),
    }, token);
  }

  // 2026-11-07：更名一次 PATCH 完成。之前是先 PATCH 刪舊檔、再 PATCH 建
  // 新檔，兩次請求；Gist 只有一個檔案時，刪舊檔那步會把 Gist 刪空（或被
  // 擋），第二步就對著不存在的 Gist 打、只回一個含糊的 client error，舊檔
  // 也可能救不回來。GitHub 的 PATCH 本來就支援一次同時刪舊名、建新名，
  // 一次請求原子完成，不會中途把 Gist 弄空。
  async renameContent(url: string, oldFilename: string, newFilename: string, content: string, token?: string) {
    // 2026-11-14：同名更名時不要靠 JS 物件重複 key「後寫的蓋掉前面的」來
    // 消除那個 null。雖然現在這樣剛好只會送出更新，但語意太隱晦、換個
    // 寫法就可能變成先刪舊檔。同名就直接走一般更新，不帶 null。
    if (oldFilename === newFilename) {
      return await this.updateContent(url, newFilename, content, token);
    }
    return await this.fetch(url, {
      method: "PATCH",
      body: JSON.stringify({
        files: {
          [oldFilename]: null,
          [newFilename]: {
            content: content,
          },
        },
      }),
    }, token);
  }

  async updateDescription(url: string, description: string, token?: string) {
    return await this.fetch(url, {
      method: "PATCH",
      body: JSON.stringify({
        description: description,
      }),
    }, token);
  }

  // 2.1.11：日誌同步以前是「改內容」跟「改描述」兩次循序 PATCH，
  // 每寫一筆日誌都要多等一個來回。GitHub 同一支 PATCH 本來就能同時帶
  // files 和 description，合併成一次。
  async updateContentAndDescription(
    url: string,
    filename: string,
    content: string,
    description: string,
    token?: string,
  ) {
    if (!filename || typeof filename !== "string") {
      throw t("檔名無效，無法儲存", "文件名无效，无法保存", "Invalid filename, cannot save");
    }
    if (typeof content !== "string") {
      throw t("內容無效，無法儲存（內容不是文字）", "内容无效，无法保存（内容不是文字）", "Invalid content, cannot save (content is not text)");
    }
    return await this.fetch(url, {
      method: "PATCH",
      body: JSON.stringify({
        description,
        files: {
          [filename]: {
            content: content,
          },
        },
      }),
    }, token);
  }

  // 2.1.11：raw content 以前完全沒有逾時，一掛住就永遠轉圈圈。
  async getContent(url: string, token?: string) {
    const r = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github.raw+json",
        Authorization: `Bearer ${token ?? this.token}`,
      },
      timeout: 15,
      signal: timeoutSignal(15000),
    } as any);
    if (!r.ok) throw t(`獲取內容失敗: ${r.status} ${r.statusText}`, `获取内容失败: ${r.status} ${r.statusText}`, `Failed to fetch content: ${r.status} ${r.statusText}`);
    return r.text();
  }

  async delete(url: string, token?: string) {
    try {
      return await this.fetch(url, {
        method: "DELETE",
      }, token);
    } catch (e: any) {
      // 2026-11-07：要刪的東西已經不在了（404），等於已經刪掉，直接當成功，
      // 不要再跳錯誤讓使用者以為沒刪掉、又重刪一次。
      if (String(e).includes("404")) return undefined as any;
      throw e;
    }
  }

  // --- util --- //
  // 2.1.11：帶入 init.token 就只用這個 Token，不再動共用欄位，
  // 所以多帳號可以安全並行；沒帶才用 this.token。
  private async fetch(url: string, init?: RequestInit, token?: string) {
    return await gistFetch(url, init, token ?? this.token);
  }
}

export const gist = new Gist();

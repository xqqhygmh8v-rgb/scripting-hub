import { loadRss } from "./rss";

export class Cache {
  private static KEY = "cache";
  private static DATA: Record<string, any> = {};
  // Storage.get(Cache.KEY) || {};
  private static PROMISES: Record<string, Promise<any>> = {};

  static async fetch(url: string) {
    if (this.DATA[url]) return this.DATA[url];       // 已缓存直接返回
    if (!this.PROMISES[url]) {
      this.PROMISES[url] = loadRss(url).then(data => {
        this.DATA[url] = data;
        delete this.PROMISES[url];                 // 清理 promise
        return data;
      });
    }
    return this.PROMISES[url];                     // 返回已有 Promise
  }

  static save() {
    Storage.set(this.KEY, this.DATA);
  }
}
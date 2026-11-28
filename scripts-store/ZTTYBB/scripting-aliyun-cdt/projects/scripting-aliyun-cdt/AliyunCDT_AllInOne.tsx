var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// config.ts
function normalizeConfig(value) {
  const saved = value && typeof value === "object" ? value : {};
  const text = (v, fallback = "") => typeof v === "string" ? v.trim() : fallback;
  const quota = Number(saved.trafficThresholdGB);
  const limit = Number.isFinite(quota) && quota > 0 ? quota : DEFAULT_CONFIG.trafficThresholdGB;
  const cutoff = Number(saved.vpsCutoffReferenceGB);
  return {
    accessKeyId: text(saved.accessKeyId),
    accessKeySecret: text(saved.accessKeySecret),
    regionId: text(saved.regionId) || DEFAULT_CONFIG.regionId,
    ecsInstanceId: text(saved.ecsInstanceId),
    trafficThresholdGB: limit,
    vpsCutoffReferenceGB: Number.isFinite(cutoff) && cutoff > 0 ? Math.min(cutoff, limit) : Math.min(195, limit),
    resetDayOfMonth: 1
  };
}
function loadConfig() {
  try {
    const raw = Storage.get(STORAGE_KEY);
    return normalizeConfig(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
function saveConfig(config) {
  if (Storage.set(STORAGE_KEY, JSON.stringify(normalizeConfig(config))) === false) {
    throw new Error("\u672C\u5730\u914D\u7F6E\u4FDD\u5B58\u5931\u8D25");
  }
}
function isConfigured(config) {
  return Boolean(config.accessKeyId && config.accessKeySecret && config.ecsInstanceId && config.regionId);
}
function validateConfig(config) {
  if (!config.accessKeyId.trim() || !config.accessKeySecret.trim()) return "\u8BF7\u586B\u5199 AccessKey ID \u548C Secret\u3002";
  if (!config.ecsInstanceId.trim()) return "\u8BF7\u586B\u5199 ECS \u5B9E\u4F8B ID\u3002";
  if (!/^[a-z]{2}-[a-z0-9-]+$/.test(config.regionId.trim())) return "\u8BF7\u586B\u5199\u6709\u6548\u7684 Region ID\uFF0C\u4F8B\u5982 cn-hongkong\u3002";
  if (!Number.isFinite(config.trafficThresholdGB) || config.trafficThresholdGB <= 0) return "\u6708\u6D41\u91CF\u989D\u5EA6\u5FC5\u987B\u5927\u4E8E 0\u3002";
  if (!Number.isFinite(config.vpsCutoffReferenceGB) || config.vpsCutoffReferenceGB <= 0 || config.vpsCutoffReferenceGB > config.trafficThresholdGB) {
    return "VPS \u53C2\u8003\u7EBF\u5FC5\u987B\u5927\u4E8E 0\uFF0C\u4E14\u4E0D\u80FD\u9AD8\u4E8E\u6708\u6D41\u91CF\u989D\u5EA6\u3002";
  }
  return null;
}
var DEFAULT_CONFIG, STORAGE_KEY;
var init_config = __esm({
  "config.ts"() {
    DEFAULT_CONFIG = {
      accessKeyId: "",
      accessKeySecret: "",
      regionId: "cn-hongkong",
      ecsInstanceId: "",
      trafficThresholdGB: 200,
      vpsCutoffReferenceGB: 195,
      resetDayOfMonth: 1
    };
    STORAGE_KEY = "aliyun_cdt_monitor_config";
  }
});

// aliyun.ts
var aliyun_exports = {};
__export(aliyun_exports, {
  AliyunService: () => AliyunService,
  aliyunRequest: () => aliyunRequest
});
function safeAdd(x, y) {
  const lsw = (x & 65535) + (y & 65535);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return msw << 16 | lsw & 65535;
}
function rol(num, cnt) {
  return num << cnt | num >>> 32 - cnt;
}
function sha1Core(x, len) {
  x[len >> 5] |= 128 << 24 - len % 32;
  x[(len + 64 >> 9 << 4) + 15] = len;
  const w = new Array(80);
  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;
  let e = -1009589776;
  for (let i = 0; i < x.length; i += 16) {
    const olda = a;
    const oldb = b;
    const oldc = c;
    const oldd = d;
    const olde = e;
    for (let j = 0; j < 80; j++) {
      if (j < 16) {
        w[j] = x[i + j] || 0;
      } else {
        w[j] = rol(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
      }
      let t;
      if (j < 20) {
        t = safeAdd(safeAdd(rol(a, 5), b & c | ~b & d), safeAdd(safeAdd(e, w[j]), 1518500249));
      } else if (j < 40) {
        t = safeAdd(safeAdd(rol(a, 5), b ^ c ^ d), safeAdd(safeAdd(e, w[j]), 1859775393));
      } else if (j < 60) {
        t = safeAdd(safeAdd(rol(a, 5), b & c | b & d | c & d), safeAdd(safeAdd(e, w[j]), -1894007588));
      } else {
        t = safeAdd(safeAdd(rol(a, 5), b ^ c ^ d), safeAdd(safeAdd(e, w[j]), -899497514));
      }
      e = d;
      d = c;
      c = rol(b, 30);
      b = a;
      a = t;
    }
    a = safeAdd(a, olda);
    b = safeAdd(b, oldb);
    c = safeAdd(c, oldc);
    d = safeAdd(d, oldd);
    e = safeAdd(e, olde);
  }
  return [a, b, c, d, e];
}
function str2binb(str) {
  const bin = [];
  const mask = (1 << 8) - 1;
  for (let i = 0; i < str.length * 8; i += 8) {
    bin[i >> 5] |= (str.charCodeAt(i / 8) & mask) << 24 - i % 32;
  }
  return bin;
}
function binb2b64(binarray) {
  const tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let str = "";
  for (let i = 0; i < binarray.length * 4; i += 3) {
    const triplet = (binarray[i >> 2] >> 8 * (3 - i % 4) & 255) << 16 | (binarray[i + 1 >> 2] >> 8 * (3 - (i + 1) % 4) & 255) << 8 | binarray[i + 2 >> 2] >> 8 * (3 - (i + 2) % 4) & 255;
    for (let j = 0; j < 4; j++) {
      if (i * 8 + j * 6 > binarray.length * 32) {
        str += "=";
      } else {
        str += tab.charAt(triplet >> 6 * (3 - j) & 63);
      }
    }
  }
  return str;
}
function hmacSha1Base64(key, data) {
  let bkey = str2binb(key);
  if (bkey.length > 16) {
    bkey = sha1Core(bkey, key.length * 8);
  }
  const ipad = new Array(16);
  const opad = new Array(16);
  for (let i = 0; i < 16; i++) {
    ipad[i] = (bkey[i] || 0) ^ 909522486;
    opad[i] = (bkey[i] || 0) ^ 1549556828;
  }
  const hash = sha1Core(ipad.concat(str2binb(data)), 512 + data.length * 8);
  return binb2b64(sha1Core(opad.concat(hash), 512 + 160));
}
function percentEncode(str) {
  return encodeURIComponent(str).replace(/!/g, "%21").replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\*/g, "%2A");
}
async function aliyunRequest(options, config = DEFAULT_CONFIG) {
  const method = options.method || "POST";
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
  const nonce = Date.now().toString(36) + Math.random().toString(36).substring(2);
  const allParams = {
    Format: "JSON",
    Version: options.version,
    AccessKeyId: config.accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    Timestamp: timestamp,
    SignatureVersion: "1.0",
    SignatureNonce: nonce,
    Action: options.action,
    ...Object.fromEntries(
      Object.entries(options.params || {}).map(([k, v]) => [k, String(v)])
    )
  };
  const sortedKeys = Object.keys(allParams).sort();
  const canonicalizedQueryString = sortedKeys.map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`).join("&");
  const stringToSign = `${method}&${percentEncode("/")}&${percentEncode(canonicalizedQueryString)}`;
  const signature = hmacSha1Base64(config.accessKeySecret + "&", stringToSign);
  const requestUrl = `https://${options.domain}/`;
  const bodyString = `${canonicalizedQueryString}&Signature=${percentEncode(signature)}`;
  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15e3);
  try {
    if (method === "GET") {
      response = await fetch(`${requestUrl}?${bodyString}`, { signal: controller.signal });
    } else {
      response = await fetch(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: bodyString,
        signal: controller.signal
      });
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Aliyun API [${options.action}] timed out after 15000ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Aliyun API [${options.action}] Error (${response.status}): ${errorText}`);
  }
  const payload = await response.json();
  if (payload && typeof payload === "object" && payload.Success === false) {
    throw new Error(`Aliyun API [${options.action}] failed: ${payload.Code || "BusinessError"} ${payload.Message || ""}`.trim());
  }
  return payload;
}
function firstIp(value) {
  if (Array.isArray(value)) {
    return value.find((item) => typeof item === "string" && item.trim().length > 0)?.trim();
  }
  if (typeof value !== "string") return void 0;
  const text = value.trim();
  if (!text) return void 0;
  if (text.startsWith("[")) {
    try {
      return firstIp(JSON.parse(text));
    } catch {
      return void 0;
    }
  }
  return text;
}
function getInstancePublicIp(instance) {
  return firstIp(instance?.EipAddress?.IpAddress) || firstIp(instance?.PublicIpAddress?.IpAddress) || firstIp(instance?.EipAddresses) || firstIp(instance?.PublicIpAddresses);
}
async function queryAccountBillPages(config, params) {
  const pageSize = 300;
  const maxPages = 100;
  const items = [];
  let available = false;
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const result = await aliyunRequest({
      domain: "business.aliyuncs.com",
      action: "QueryAccountBill",
      version: "2017-12-14",
      method: "POST",
      params: { ...params, PageNum: pageNum, PageSize: pageSize }
    }, config);
    if (result?.Success === false) throw new Error(result.Message || "QueryAccountBill failed");
    if (!result?.Data) break;
    available = true;
    const pageItems = result.Data.Items?.Item ?? [];
    items.push(...pageItems);
    const totalCount = Number(result.Data.TotalCount ?? result.Data.Items?.TotalCount);
    if (Number.isFinite(totalCount) && totalCount > maxPages * pageSize) {
      throw new Error(`QueryAccountBill exceeds the ${maxPages * pageSize}-item safety limit`);
    }
    if (pageItems.length < pageSize || Number.isFinite(totalCount) && totalCount > 0 && items.length >= totalCount) break;
    if (pageNum === maxPages) throw new Error(`QueryAccountBill exceeds the ${maxPages}-page safety limit`);
  }
  return { available, items };
}
var AliyunService;
var init_aliyun = __esm({
  "aliyun.ts"() {
    init_config();
    AliyunService = class {
      config;
      constructor(config = DEFAULT_CONFIG) {
        this.config = config;
      }
      /**
       * 1. 获取 CDT 本月总互联网出网流量 (GB)
       */
      async getCDTTraffic() {
        const data = await aliyunRequest(
          {
            domain: "cdt.aliyuncs.com",
            action: "ListCdtInternetTraffic",
            version: "2021-08-13",
            method: "POST"
          },
          this.config
        );
        const details = data.TrafficDetails || [];
        const totalBytes = details.reduce((sum, item) => sum + (item.Traffic || 0), 0);
        const totalGB = Number((totalBytes / 1024 ** 3).toFixed(2));
        const thresholdGB = this.config.trafficThresholdGB;
        const remainingGB = Math.max(0, Number((thresholdGB - totalGB).toFixed(2)));
        const percentage = Math.min(100, Number((totalGB / thresholdGB * 100).toFixed(1)));
        let statusLevel = "normal";
        if (percentage >= 90 || totalGB >= thresholdGB) {
          statusLevel = "danger";
        } else if (percentage >= 70) {
          statusLevel = "warning";
        }
        return {
          totalBytes,
          totalGB,
          thresholdGB,
          remainingGB,
          percentage,
          statusLevel,
          updatedAt: /* @__PURE__ */ new Date()
        };
      }
      /**
       * 2. 获取 ECS 实例运行状态
       */
      async getECSStatus(instanceId = this.config.ecsInstanceId) {
        const domain = `ecs.${this.config.regionId}.aliyuncs.com`;
        const data = await aliyunRequest(
          {
            domain,
            action: "DescribeInstances",
            version: "2014-05-26",
            method: "POST",
            params: {
              InstanceIds: JSON.stringify([instanceId]),
              RegionId: this.config.regionId
            }
          },
          this.config
        );
        const instance = data.Instances?.Instance?.[0];
        if (!instance) {
          return {
            instanceId,
            status: "Unknown"
          };
        }
        return {
          instanceId: instance.InstanceId,
          status: instance.Status || "Unknown",
          stoppedMode: instance.StoppedMode,
          publicIp: getInstancePublicIp(instance),
          instanceName: instance.InstanceName
        };
      }
      /**
       * 7. 获取账户可用余额 (支持优雅降级，未授权返回 null)
       */
      async getAccountBalance() {
        try {
          const data = await aliyunRequest(
            {
              domain: "business.aliyuncs.com",
              action: "QueryAccountBalance",
              version: "2017-12-14",
              method: "POST"
            },
            this.config
          );
          if (!data?.Data) return null;
          const cash = Number(data.Data.AvailableCashAmount || 0);
          const available = Number(data.Data.AvailableAmount || 0);
          let status = "sufficient";
          if (available <= 0) {
            status = "arrears";
          } else if (cash < 10 && available < 10) {
            status = "low";
          }
          return {
            availableAmount: data.Data.AvailableAmount || "0.00",
            availableCashAmount: data.Data.AvailableCashAmount || "0.00",
            currency: data.Data.Currency || "CNY",
            status
          };
        } catch {
          return null;
        }
      }
      /**
       * 8. 获取当月实时累计消费账单 (支持优雅降级，未授权返回 null)
       */
      async getMonthlyBill() {
        try {
          const now = /* @__PURE__ */ new Date();
          const currentDay = now.getDate();
          const cycle = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
          let items = [];
          let billDataAvailable = false;
          try {
            const overviewData = await aliyunRequest(
              {
                domain: "business.aliyuncs.com",
                action: "QueryBillOverview",
                version: "2017-12-14",
                method: "POST",
                params: {
                  BillingCycle: cycle
                }
              },
              this.config
            );
            if (overviewData?.Data) billDataAvailable = true;
            if (overviewData?.Data?.Items?.Item && overviewData.Data.Items.Item.length > 0) {
              items = overviewData.Data.Items.Item;
            }
          } catch {
          }
          if (items.length === 0) {
            try {
              const accountBillData = await queryAccountBillPages(this.config, {
                BillingCycle: cycle,
                IsGroupByProduct: true
              });
              billDataAvailable ||= accountBillData.available;
              items = accountBillData.items;
            } catch {
            }
          }
          if (!billDataAvailable) {
            return null;
          }
          let allProductsEffective = 0;
          let ecsTotal = 0;
          let eipTotal = 0;
          let cdtTotal = 0;
          let outstanding = 0;
          let currency = "CNY";
          for (const it of items) {
            const code = String(it.PipCode || it.ProductCode || "").toLowerCase();
            const name = String(it.ProductName || "");
            const pay = Number(it.PaymentAmount || 0);
            const gross = Number(it.PretaxGrossAmount || 0);
            let effective = 0;
            if (it.PretaxAmount != null) {
              effective = Number(it.PretaxAmount) || 0;
            } else if (it.PaymentAmount != null) {
              effective = Number(it.PaymentAmount) || 0;
            } else {
              effective = gross;
            }
            allProductsEffective += effective;
            outstanding += Number(it.OutstandingAmount || 0);
            if (it.Currency) currency = it.Currency;
            const isEcs = code === "ecs" || code.includes("ecs") || name.includes("\u4E91\u670D\u52A1\u5668") || name.includes("ECS");
            const isEip = code === "eip" || code === "cbwp" || code.includes("eip") || code.includes("cbwp") || name.includes("\u5F39\u6027\u516C\u7F51") || name.includes("EIP") || name.includes("\u516C\u7F51IP") || name.includes("\u5171\u4EAB\u5E26\u5BBD");
            const isCdt = code === "cdt" || code.includes("cdt") || name.includes("\u4E91\u6570\u636E\u4F20\u8F93") || name.includes("CDT");
            if (isEcs) {
              ecsTotal += effective;
            } else if (isEip) {
              eipTotal += effective;
            } else if (isCdt) {
              cdtTotal += effective;
            }
          }
          const finalPayment = allProductsEffective;
          const formatDaily = (amt) => amt.toFixed(2);
          const ecsDailyList = [];
          const eipDailyList = [];
          const daysCount = Math.min(7, currentDay);
          const dateQueries = [];
          for (let i = 0; i < daysCount; i++) {
            const d = new Date(now.getFullYear(), now.getMonth(), currentDay - i);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            dateQueries.push({
              dateStr: `${yyyy}-${mm}-${dd}`,
              displayDate: `${mm}-${dd}`,
              isToday: i === 0
            });
          }
          try {
            const dailyResults = await Promise.all(
              dateQueries.map(async (q) => {
                try {
                  const dayResult = await queryAccountBillPages(this.config, {
                    BillingCycle: cycle,
                    Granularity: "DAILY",
                    BillingDate: q.dateStr,
                    IsGroupByProduct: true
                  });
                  const dayItems = dayResult.items;
                  let dEcs = 0;
                  let dEip = 0;
                  for (const it of dayItems) {
                    const c = String(it.PipCode || it.ProductCode || "").toLowerCase();
                    const n = String(it.ProductName || "");
                    const p = Number(it.PaymentAmount || 0);
                    const g = Number(it.PretaxGrossAmount || 0);
                    let eff = 0;
                    if (it.PretaxAmount != null) {
                      eff = Number(it.PretaxAmount) || 0;
                    } else if (it.PaymentAmount != null) {
                      eff = p;
                    } else {
                      eff = g;
                    }
                    if (c === "ecs" || c.includes("ecs") || n.includes("\u4E91\u670D\u52A1\u5668") || n.includes("ECS")) {
                      dEcs += eff;
                    } else if (c === "eip" || c === "cbwp" || c.includes("eip") || c.includes("cbwp") || n.includes("\u5F39\u6027\u516C\u7F51") || n.includes("EIP") || n.includes("\u516C\u7F51IP") || n.includes("\u5171\u4EAB\u5E26\u5BBD")) {
                      dEip += eff;
                    }
                  }
                  return {
                    date: q.displayDate,
                    isToday: q.isToday,
                    ecsAmount: formatDaily(dEcs),
                    eipAmount: formatDaily(dEip),
                    settled: dayItems.length > 0,
                    available: dayResult.available
                  };
                } catch {
                  return {
                    date: q.displayDate,
                    isToday: q.isToday,
                    ecsAmount: "0.00",
                    eipAmount: "0.00",
                    settled: false,
                    available: false
                  };
                }
              })
            );
            for (const r of dailyResults) {
              ecsDailyList.push({ date: r.date, amount: r.ecsAmount, isToday: r.isToday, settled: r.settled, available: r.available });
              eipDailyList.push({ date: r.date, amount: r.eipAmount, isToday: r.isToday, settled: r.settled, available: r.available });
            }
          } catch {
            for (const q of dateQueries) {
              ecsDailyList.push({ date: q.displayDate, amount: "0.00", isToday: q.isToday, settled: false, available: false });
              eipDailyList.push({ date: q.displayDate, amount: "0.00", isToday: q.isToday, settled: false, available: false });
            }
          }
          return {
            billingCycle: cycle,
            paymentAmount: finalPayment.toFixed(2),
            outstandingAmount: outstanding.toFixed(2),
            currency,
            ecsAmount: ecsTotal.toFixed(2),
            eipAmount: eipTotal.toFixed(2),
            cdtAmount: cdtTotal.toFixed(2),
            ecsDailyList,
            eipDailyList
          };
        } catch {
          return null;
        }
      }
    };
  }
});

// single_file_entry.tsx
import { Widget as Widget2 } from "scripting";

// index.tsx
init_config();
import {
  Navigation,
  Script,
  NavigationStack,
  TabView,
  Tab,
  Chart,
  LineChart,
  useObservable,
  ScrollView,
  VStack,
  HStack,
  ZStack,
  Text,
  Image,
  ProgressView,
  Circle,
  Button,
  Spacer,
  Divider,
  TextField,
  SecureField,
  useState,
  useEffect,
  useCallback
} from "scripting";

// traffic_history.ts
function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function configScope(config) {
  const source = `${config.accessKeyId.trim()}|${config.regionId.trim()}|${config.ecsInstanceId.trim()}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function trafficScope(config) {
  return configScope({ ...config, ecsInstanceId: "" });
}
function loadTrafficHistory() {
  try {
    const saved = Storage.get("aliyun_cdt_daily_history_v2");
    const parsed = typeof saved === "string" ? JSON.parse(saved) : saved;
    if (parsed?.version !== 1 || !Array.isArray(parsed.snapshots)) return null;
    return parsed;
  } catch {
    return null;
  }
}
function recordTrafficSnapshot(config, totalGB, now = /* @__PURE__ */ new Date()) {
  const today = localDateKey(now);
  const month = today.slice(0, 7);
  const scope = trafficScope(config);
  let history = loadTrafficHistory();
  if (history?.scope !== scope || history.month !== month) {
    history = { version: 1, scope, month, snapshots: [] };
  }
  const snapshots = history.snapshots.filter((item) => item?.date?.startsWith(month) && Number.isFinite(item.totalGB) && item.totalGB >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const latest = snapshots[snapshots.length - 1];
  if (latest && totalGB + 5e-3 < latest.totalGB) snapshots.length = 0;
  const todaySnapshot = snapshots.find((item) => item.date === today);
  if (todaySnapshot) {
    todaySnapshot.totalGB = totalGB;
    todaySnapshot.updatedAt = now.getTime();
  } else {
    snapshots.push({ date: today, totalGB, updatedAt: now.getTime() });
  }
  history.snapshots = snapshots.slice(-32);
  try {
    Storage.set("aliyun_cdt_daily_history_v2", JSON.stringify(history));
  } catch {
  }
  const byDate = new Map(history.snapshots.map((item) => [item.date, item]));
  const weekdays = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"];
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index - 6);
    const dateKey = localDateKey(date);
    const previousKey = localDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1));
    const current = byDate.get(dateKey);
    const previous = byDate.get(previousKey);
    const valueGB = current && previous && current.totalGB + 5e-3 >= previous.totalGB ? Math.max(0, Number((current.totalGB - previous.totalGB).toFixed(2))) : null;
    return {
      date: dateKey,
      label: index === 6 ? "\u4ECA" : `${date.getDate()}\u65E5`,
      valueGB,
      isToday: index === 6
    };
  });
}

// monitor.ts
var SNAPSHOT_STORAGE_KEY = "aliyun_cdt_dashboard_cache_v2";
function localBillCycle(now) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
async function fetchCoreSnapshot(config, now = /* @__PURE__ */ new Date(), persist = true) {
  const { AliyunService: AliyunService2 } = await Promise.resolve().then(() => (init_aliyun(), aliyun_exports));
  const service = new AliyunService2(config);
  const [traffic, ecs] = await Promise.all([
    service.getCDTTraffic(),
    service.getECSStatus(config.ecsInstanceId)
  ]);
  const dailyUsage = recordTrafficSnapshot(config, traffic.totalGB, now);
  const day = now.getDate();
  const daysRemaining = Math.max(1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - day + 1);
  const percentage = config.trafficThresholdGB > 0 ? Number((traffic.totalGB / config.trafficThresholdGB * 100).toFixed(1)) : 0;
  const cutoffGB = Math.min(config.vpsCutoffReferenceGB, config.trafficThresholdGB);
  const snapshot = {
    scope: configScope(config),
    updatedAt: now.toISOString(),
    trafficUpdatedAt: now.toISOString(),
    billingCycle: localBillCycle(now),
    totalGB: traffic.totalGB,
    thresholdGB: config.trafficThresholdGB,
    cutoffGB,
    remainingGB: Math.max(0, Number((config.trafficThresholdGB - traffic.totalGB).toFixed(2))),
    cutoffRemainingGB: Number((cutoffGB - traffic.totalGB).toFixed(2)),
    percentage,
    daysRemaining,
    dailyBudgetGB: Number((Math.max(0, cutoffGB - traffic.totalGB) / daysRemaining).toFixed(2)),
    monthTimeProgress: Number((day / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() * 100).toFixed(1)),
    dailyUsage,
    ecs: { status: ecs.status, publicIp: ecs.publicIp, instanceName: ecs.instanceName, stoppedMode: ecs.stoppedMode }
  };
  if (persist) {
    try {
      Storage.set(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
    }
  }
  return snapshot;
}
function loadCachedSnapshot(config, allowStale = false) {
  try {
    const expectedScope = configScope(config);
    const raw = Storage.get(SNAPSHOT_STORAGE_KEY);
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object") return null;
    const parsed = value;
    if (parsed.scope !== expectedScope) return null;
    if (!Number.isFinite(Number(parsed.totalGB)) || !parsed.ecs && typeof parsed.ecsStatus !== "string") return null;
    const updatedAt = new Date(String(parsed.updatedAt ?? ""));
    const now = /* @__PURE__ */ new Date();
    if (!Number.isFinite(updatedAt.getTime()) || updatedAt.getTime() > now.getTime() + 6e4) return null;
    if (updatedAt.getFullYear() !== now.getFullYear() || updatedAt.getMonth() !== now.getMonth()) return null;
    if (!allowStale && localDateKey(updatedAt) !== localDateKey(now)) return null;
    const dailyUsage = Array.isArray(parsed.dailyUsage) ? parsed.dailyUsage : [];
    const cacheDate = localDateKey(updatedAt);
    const today = localDateKey(now);
    const normalizedDailyUsage = dailyUsage.map((point) => {
      const dayNumber = Number(point.date.slice(8, 10));
      const isToday = point.date === today;
      return {
        ...point,
        label: isToday ? "\u4ECA" : `${dayNumber}\u65E5`,
        isToday,
        valueGB: allowStale && point.date > cacheDate ? null : point.valueGB
      };
    });
    return {
      scope: expectedScope,
      updatedAt: updatedAt.toISOString(),
      trafficUpdatedAt: String(parsed.trafficUpdatedAt ?? updatedAt.toISOString()),
      billingCycle: localBillCycle(now),
      totalGB: Number(parsed.totalGB),
      thresholdGB: config.trafficThresholdGB,
      cutoffGB: Math.min(config.vpsCutoffReferenceGB, config.trafficThresholdGB),
      remainingGB: Math.max(0, config.trafficThresholdGB - Number(parsed.totalGB)),
      cutoffRemainingGB: Math.min(config.vpsCutoffReferenceGB, config.trafficThresholdGB) - Number(parsed.totalGB),
      percentage: Number((Number(parsed.totalGB) / config.trafficThresholdGB * 100).toFixed(1)),
      daysRemaining: Math.max(1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1),
      dailyBudgetGB: Math.max(0, Math.min(config.vpsCutoffReferenceGB, config.trafficThresholdGB) - Number(parsed.totalGB)) / Math.max(1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1),
      monthTimeProgress: Number((now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() * 100).toFixed(1)),
      dailyUsage: normalizedDailyUsage,
      ecs: parsed.ecs ?? { status: parsed.ecsStatus, publicIp: parsed.publicIp }
    };
  } catch {
    return null;
  }
}
async function fetchFinancialSnapshot(config, core) {
  const { AliyunService: AliyunService2 } = await Promise.resolve().then(() => (init_aliyun(), aliyun_exports));
  const service = new AliyunService2(config);
  const [balanceResult, billResult] = await Promise.allSettled([
    service.getAccountBalance(),
    service.getMonthlyBill()
  ]);
  return {
    ...core,
    balance: balanceResult.status === "fulfilled" ? balanceResult.value : null,
    bill: billResult.status === "fulfilled" ? billResult.value : null,
    balanceStatus: balanceResult.status === "fulfilled" && balanceResult.value ? "available" : "unavailable",
    billStatus: billResult.status === "fulfilled" && billResult.value ? "available" : "unavailable",
    stale: false
  };
}

// index.tsx
var STORAGE_KEY2 = "aliyun_cdt_monitor_config";
var DEFAULT_CONFIG2 = {
  accessKeyId: "",
  accessKeySecret: "",
  regionId: "cn-hongkong",
  ecsInstanceId: "",
  trafficThresholdGB: 200,
  vpsCutoffReferenceGB: 195,
  resetDayOfMonth: 1
};
function loadSavedConfig() {
  try {
    if (typeof Storage !== "undefined" && Storage?.get) {
      const saved = Storage.get(STORAGE_KEY2);
      if (saved) {
        const parsed = typeof saved === "string" ? JSON.parse(saved) : saved;
        return { ...DEFAULT_CONFIG2, ...parsed };
      }
    }
  } catch (e) {
    console.error("\u52A0\u8F7D\u914D\u7F6E\u5931\u8D25:", e);
  }
  return { ...DEFAULT_CONFIG2 };
}
function isConfigReady(cfg) {
  return Boolean(cfg.accessKeyId?.trim()) && Boolean(cfg.accessKeySecret?.trim()) && Boolean(cfg.ecsInstanceId?.trim());
}
var PRIVACY_STORAGE_KEY = "aliyun_cdt_privacy_mode";
function humanizeAliyunError(rawMessage) {
  if (!rawMessage) return "\u672A\u77E5\u9519\u8BEF";
  if (rawMessage.includes("InvalidAccessKeyId.NotFound")) {
    return "AccessKey ID \u4E0D\u5B58\u5728\u6216\u5DF2\u5931\u6548\uFF0C\u8BF7\u6838\u5BF9\u51ED\u636E\u3002";
  }
  if (rawMessage.includes("SignatureDoesNotMatch")) {
    return "AccessKey Secret \u9519\u8BEF\u5BFC\u81F4\u7B7E\u540D\u6821\u9A8C\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5 Secret \u662F\u5426\u6B63\u786E\u3002";
  }
  if (rawMessage.includes("InvalidInstanceId.NotFound")) {
    return "\u627E\u4E0D\u5230\u6307\u5B9A\u7684 ECS \u5B9E\u4F8B\uFF0C\u8BF7\u6838\u5BF9\u5B9E\u4F8B ID \u4E0E\u6240\u5728\u5730\u57DF (Region)\u3002";
  }
  if (rawMessage.includes("Forbidden.RAM") || rawMessage.includes("NoPermission") || rawMessage.includes("Unauthorized")) {
    return "RAM \u6743\u9650\u4E0D\u8DB3\uFF1A\u8BF7\u5728\u963F\u91CC\u4E91\u8BBF\u95EE\u63A7\u5236\u4E3A\u8BE5 Key \u6388\u4E88 AliyunECSFullAccess \u548C CDT \u8BFB\u6743\u9650\u3002";
  }
  if (rawMessage.includes("IncorrectInstanceStatus")) {
    return "\u5B9E\u4F8B\u5F53\u524D\u72B6\u6001\u65E0\u6CD5\u6267\u884C\u6B64\u64CD\u4F5C\uFF0C\u8BF7\u7A0D\u5019\u91CD\u8BD5\u3002";
  }
  if (rawMessage.includes("OperationDenied.NoStock")) {
    return "\u5F53\u524D\u5730\u57DF\u5B9E\u4F8B\u8D44\u6E90\u5E93\u5B58\u7D27\u5F20\uFF0C\u65E0\u6CD5\u542F\u52A8\u3002";
  }
  return rawMessage;
}
function NativeSettingsView({
  currentConfig,
  onSave,
  onCancel
}) {
  const [ak, setAk] = useState(currentConfig.accessKeyId);
  const [sk, setSk] = useState(currentConfig.accessKeySecret);
  const [region, setRegion] = useState(currentConfig.regionId);
  const [instanceId, setInstanceId] = useState(currentConfig.ecsInstanceId);
  const [quota, setQuota] = useState(String(currentConfig.trafficThresholdGB));
  const [cutoff, setCutoff] = useState(String(currentConfig.vpsCutoffReferenceGB));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const buildConfig = () => ({
    accessKeyId: ak.trim(),
    accessKeySecret: sk.trim(),
    regionId: region.trim(),
    ecsInstanceId: instanceId.trim(),
    trafficThresholdGB: Number(quota),
    vpsCutoffReferenceGB: Number(cutoff),
    resetDayOfMonth: 1
  });
  const save = () => {
    const next = buildConfig();
    const validation = validateConfig(next);
    if (validation) {
      setMessage(validation);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      saveConfig(next);
      onSave(next);
    } catch (error) {
      setMessage(`\u4FDD\u5B58\u5931\u8D25\uFF1A${error?.message || String(error)}`);
    } finally {
      setSaving(false);
    }
  };
  const testConnection = async () => {
    const candidate = buildConfig();
    const validation = validateConfig(candidate);
    if (validation) {
      setMessage(validation);
      return;
    }
    setTesting(true);
    setMessage(null);
    setTestResult(null);
    try {
      const core = await fetchCoreSnapshot(candidate, /* @__PURE__ */ new Date(), false);
      const financial = await fetchFinancialSnapshot(candidate, core);
      setTestResult(`CDT ${core.totalGB.toFixed(1)} GB \xB7 ECS ${core.ecs.status} \xB7 \u4F59\u989D ${financial.balanceStatus === "available" ? "\u53EF\u8BFB" : "\u4E0D\u53EF\u7528"} \xB7 \u8D26\u5355 ${financial.billStatus === "available" ? "\u53EF\u8BFB" : "\u4E0D\u53EF\u7528"}`);
    } catch (error) {
      setMessage(humanizeAliyunError(error?.message || "\u8FDE\u63A5\u6D4B\u8BD5\u5931\u8D25"));
    } finally {
      setTesting(false);
    }
  };
  const smartPaste = async () => {
    try {
      const text = await Pasteboard.getString() || "";
      const akMatch = text.match(/LTAI[A-Za-z0-9]{16,24}/i);
      const ecsMatch = text.match(/i-[a-z0-9]{16,24}/i);
      const regionMatch = text.match(/(?:cn|ap|us|eu|me|af)-[a-z0-9-]+/i);
      const secretMatch = text.match(/(?:Secret|SecretKey|KeySecret)[\s:=]*([A-Za-z0-9]{28,34})/i);
      const tokens = text.match(/[A-Za-z0-9]{28,34}/g) || [];
      const secret = secretMatch?.[1] || tokens.find((token) => !token.startsWith("LTAI") && !token.startsWith("i-"));
      if (akMatch) setAk(akMatch[0]);
      if (ecsMatch) setInstanceId(ecsMatch[0]);
      if (regionMatch) setRegion(regionMatch[0]);
      if (secret) setSk(secret);
      const count = [akMatch, ecsMatch, regionMatch, secret].filter(Boolean).length;
      setMessage(count ? `\u5DF2\u8BC6\u522B\u5E76\u586B\u5165 ${count} \u9879\u914D\u7F6E\uFF0C\u8BF7\u786E\u8BA4\u540E\u4FDD\u5B58\u3002` : "\u526A\u8D34\u677F\u4E2D\u6CA1\u6709\u8BC6\u522B\u5230\u963F\u91CC\u4E91\u914D\u7F6E\u3002");
    } catch (error) {
      setMessage(`\u8BFB\u53D6\u526A\u8D34\u677F\u5931\u8D25\uFF1A${error?.message || String(error)}`);
    }
  };
  return <ScrollView background="systemGray6" showsIndicators={false} safeAreaPadding={{ bottom: true }}>
      <VStack alignment="leading" spacing={14} padding={{ horizontal: 16, top: 12, bottom: 30 }}>
        <HStack alignment="center">
          <Button title="返回" systemImage="chevron.left" action={onCancel} />
          <Spacer />
          <Text font="title2" bold>设置</Text>
          <Spacer />
          <Button title={saving ? "\u4FDD\u5B58\u4E2D" : "\u4FDD\u5B58"} systemImage="checkmark" disabled={saving} action={save} />
        </HStack>
        <Text font="caption1" foregroundStyle="secondaryLabel">凭据保存在 Scripting 本地存储中。手机端只读，不会执行 ECS 开关机。</Text>
        <Button title="从剪贴板识别" systemImage="doc.on.clipboard" action={() => void smartPaste()} />

        <VStack alignment="leading" spacing={12} padding={16} background="systemBackground" clipShape={{ type: "rect", cornerRadius: 18, style: "continuous" }}>
          <Text font="headline" bold>阿里云访问凭据</Text>
          <TextField title="AccessKey ID" value={ak} onChanged={setAk} prompt="输入 AccessKey ID" />
          <SecureField title="AccessKey Secret" value={sk} onChanged={setSk} prompt="输入 AccessKey Secret" />
        </VStack>

        <VStack alignment="leading" spacing={12} padding={16} background="systemBackground" clipShape={{ type: "rect", cornerRadius: 18, style: "continuous" }}>
          <Text font="headline" bold>目标实例</Text>
          <TextField title="Region ID" value={region} onChanged={setRegion} prompt="cn-hongkong" />
          <TextField title="ECS 实例 ID" value={instanceId} onChanged={setInstanceId} prompt="i-xxxxxxxx" />
        </VStack>

        <VStack alignment="leading" spacing={12} padding={16} background="systemBackground" clipShape={{ type: "rect", cornerRadius: 18, style: "continuous" }}>
          <Text font="headline" bold>用量参考</Text>
          <TextField title="月流量额度 / GB" value={quota} onChanged={setQuota} prompt="200" />
          <TextField title="VPS 参考线 / GB" value={cutoff} onChanged={setCutoff} prompt="195" />
          <Text font="caption2" foregroundStyle="secondaryLabel">参考线仅影响手机显示，不会发送到 VPS。</Text>
        </VStack>

        {message && <Text font="caption1" foregroundStyle="systemRed">{message}</Text>}
        {testResult && <Text font="caption1" foregroundStyle="systemGreen">{testResult}</Text>}
        <Button title={testing ? "\u6B63\u5728\u6D4B\u8BD5\u2026" : "\u6D4B\u8BD5\u8FDE\u63A5"} systemImage="antenna.radiowaves.left.and.right" disabled={testing} action={() => void testConnection()} />
        <Button title={saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u8BBE\u7F6E"} systemImage="checkmark.circle.fill" disabled={saving} action={save} />
      </VStack>
    </ScrollView>;
}
function DailyTrafficChart({ points }) {
  const segments = [];
  let segment = [];
  let previousDay = null;
  for (const point of points) {
    if (point.valueGB === null) {
      if (segment.length) segments.push(segment);
      segment = [];
      previousDay = null;
      continue;
    }
    const [year, month, day] = point.date.split("-").map(Number);
    const dayNumber = Date.UTC(year, month - 1, day);
    const consecutive = previousDay !== null && dayNumber - previousDay === 864e5;
    if (segment.length && !consecutive) {
      segments.push(segment);
      segment = [];
    }
    segment.push(point);
    previousDay = dayNumber;
  }
  if (segment.length) segments.push(segment);
  const marks = (items) => items.map((point) => ({
    label: point.label,
    value: point.valueGB ?? 0,
    foregroundStyle: point.isToday ? "systemBlue" : "systemBlue",
    symbol: "circle",
    symbolSize: point.isToday ? 24 : 16,
    lineStyle: { lineWidth: 2.5, lineCap: "round" },
    annotation: {
      position: "top",
      alignment: "center",
      spacing: 5,
      overflowResolution: { x: "fit", y: "padScale" },
      content: <Text font={10} bold={point.isToday} foregroundStyle={point.isToday ? "systemBlue" : "secondaryLabel"}>{point.valueGB?.toFixed(1)}</Text>
    }
  }));
  return <VStack spacing={8}>
      {segments.length === 0 ? <Text font="caption1" foregroundStyle="secondaryLabel">采样积累后显示每日流量</Text> : segments.map((items, index) => <Chart key={`${items[0].date}-${index}`} frame={{ height: 118 }}>
          <LineChart labelOnYAxis={false} marks={marks(items)} />
        </Chart>)}
      <Text font={10} foregroundStyle="secondaryLabel">单位 GB · 相邻日期快照差值；未采样日期不补零</Text>
    </VStack>;
}
function formatCurrency(value, currency, hidden = false) {
  if (hidden) return "\u2022\u2022\u2022\u2022";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} ${String(value)}`;
  const fractionDigits = currency === "JPY" ? 0 : 2;
  const formatted = amount.toFixed(fractionDigits);
  const symbol = currency === "CNY" || currency === "JPY" ? "\xA5" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${formatted}`;
}
function AppDashboard() {
  const selection = useObservable(0);
  const [config, setConfig] = useState(() => normalizeConfig(loadSavedConfig()));
  const [snapshot, setSnapshot] = useState(() => loadCachedSnapshot(config, true));
  const [snapshotStale, setSnapshotStale] = useState(() => Boolean(snapshot));
  const [finance, setFinance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeLoaded, setFinanceLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [financeError, setFinanceError] = useState(null);
  const [privacy, setPrivacy] = useState(() => {
    try {
      return Storage.get(PRIVACY_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [lastUpdated, setLastUpdated] = useState(() => snapshot?.updatedAt ?? null);
  const isActiveConfig = (candidate) => configScope(candidate) === configScope(normalizeConfig(loadSavedConfig()));
  const loadCore = useCallback(async (cfg = config) => {
    if (!cfg.accessKeyId || !cfg.accessKeySecret || !cfg.ecsInstanceId) return;
    setLoading(true);
    setSnapshotStale(true);
    setError(null);
    setFinance(null);
    setFinanceLoading(false);
    setFinanceLoaded(false);
    try {
      const core = await fetchCoreSnapshot(cfg);
      if (!isActiveConfig(cfg)) return;
      setSnapshot(core);
      setSnapshotStale(false);
      setLastUpdated(core.updatedAt);
      setFinanceError(null);
    } catch (err) {
      if (isActiveConfig(cfg)) setError(humanizeAliyunError(err?.message || "\u8BFB\u53D6\u6D41\u91CF\u6216\u5B9E\u4F8B\u72B6\u6001\u5931\u8D25"));
    } finally {
      if (isActiveConfig(cfg)) setLoading(false);
    }
  }, [config]);
  const loadFinance = useCallback(async (cfg = config, core = snapshot) => {
    if (!core) return;
    setFinanceLoading(true);
    setFinanceError(null);
    try {
      const result = await fetchFinancialSnapshot(cfg, core);
      if (!isActiveConfig(cfg)) return;
      setFinance(result);
      if (result.balanceStatus === "unavailable" && result.billStatus === "unavailable") {
        setFinanceError("\u4F59\u989D\u4E0E\u8D26\u5355\u6743\u9650\u4E0D\u53EF\u7528\u3002\u6D41\u91CF\u548C\u5B9E\u4F8B\u72B6\u6001\u4ECD\u53EF\u72EC\u7ACB\u67E5\u770B\u3002");
      }
    } catch (err) {
      if (isActiveConfig(cfg)) setFinanceError(humanizeAliyunError(err?.message || "\u8BFB\u53D6\u8D26\u5355\u4FE1\u606F\u5931\u8D25"));
    } finally {
      if (isActiveConfig(cfg)) {
        setFinanceLoaded(true);
        setFinanceLoading(false);
      }
    }
  }, [config, snapshot]);
  useEffect(() => {
    if (!isConfigReady(config)) {
      selection.setValue(2);
      return;
    }
    void loadCore(config);
  }, [config]);
  useEffect(() => {
    const onSelectionChanged = (value) => {
      if (value === 1 && snapshot && !finance && !financeLoading && !financeLoaded) {
        void loadFinance(config, snapshot);
      }
    };
    selection.subscribe(onSelectionChanged);
    if (selection.value === 1 && snapshot && !finance && !financeLoading) {
      void loadFinance(config, snapshot);
    }
    return () => selection.unsubscribe(onSelectionChanged);
  }, [selection, snapshot, finance, financeLoading, config, loadFinance]);
  const togglePrivacy = () => {
    const next = !privacy;
    setPrivacy(next);
    try {
      Storage.set(PRIVACY_STORAGE_KEY, String(next));
    } catch {
    }
  };
  const copyIp = async () => {
    if (!snapshot?.ecs.publicIp) return;
    try {
      await Pasteboard.setString(snapshot.ecs.publicIp);
    } catch {
      setError("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002");
    }
  };
  const statusText = snapshot?.ecs.status === "Running" ? "\u8FD0\u884C\u4E2D" : snapshot?.ecs.status === "Stopped" ? "\u5DF2\u505C\u6B62" : snapshot?.ecs.status === "Starting" ? "\u542F\u52A8\u4E2D" : snapshot?.ecs.status === "Stopping" ? "\u505C\u6B62\u4E2D" : "\u72B6\u6001\u672A\u77E5";
  const statusColor = snapshot?.ecs.status === "Running" ? "systemGreen" : snapshot?.ecs.status === "Starting" || snapshot?.ecs.status === "Stopping" ? "systemOrange" : "secondaryLabel";
  const trafficStatus = !snapshot ? "\u7B49\u5F85\u6570\u636E" : snapshot.cutoffRemainingGB <= 0 ? "\u5DF2\u8D85\u51FA\u53C2\u8003\u7EBF" : snapshot.cutoffRemainingGB <= 15 ? "\u4E34\u8FD1\u53C2\u8003\u7EBF" : "\u9884\u7B97\u5145\u8DB3";
  const trafficColor = !snapshot ? "secondaryLabel" : snapshot.cutoffRemainingGB <= 0 ? "systemRed" : snapshot.cutoffRemainingGB <= 15 ? "systemOrange" : "systemGreen";
  const formattedUpdate = lastUpdated ? new Date(lastUpdated).toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "\u5C1A\u672A\u540C\u6B65";
  return <TabView selection={selection}>
      <Tab title="概览" systemImage="square.grid.2x2.fill" value={0}>
        <ScrollView background="systemGray6" showsIndicators={false} safeAreaPadding={{ bottom: true }}>
          <VStack alignment="leading" spacing={12} padding={{ horizontal: 16, top: 12, bottom: 28 }}>
            <HStack alignment="center">
              <VStack alignment="leading" spacing={2}>
                <Text font="largeTitle" bold>概览</Text>
                <Text font="caption1" foregroundStyle="secondaryLabel">{snapshotStale ? "\u7F13\u5B58 \xB7 " : ""}{formattedUpdate}{loading ? " \xB7 \u6B63\u5728\u540C\u6B65" : snapshot ? " \xB7 \u53EA\u8BFB\u76D1\u63A7" : " \xB7 \u7B49\u5F85\u6570\u636E"}</Text>
              </VStack>
              <Spacer />
              <Button title={loading ? "\u540C\u6B65\u4E2D" : "\u5237\u65B0"} systemImage="arrow.clockwise" disabled={loading || !isConfigReady(config)} action={() => void loadCore(config)} />
            </HStack>

            {error && <Text font="caption1" foregroundStyle="systemRed">{error}</Text>}

            <VStack alignment="leading" spacing={12} padding={18} background="systemBackground" clipShape={{ type: "rect", cornerRadius: 22, style: "continuous" }}>
              <HStack alignment="center">
                <Text font="subheadline" foregroundStyle="secondaryLabel">{snapshot?.cutoffRemainingGB !== void 0 && snapshot.cutoffRemainingGB < 0 ? "\u5DF2\u8D85\u51FA VPS \u53C2\u8003\u7EBF" : "\u8DDD VPS \u53C2\u8003\u7EBF\u5269\u4F59"}</Text>
                <Spacer />
                <Text font="caption1" bold foregroundStyle={trafficColor}>{trafficStatus}</Text>
              </HStack>
              <HStack alignment="lastTextBaseline" spacing={6}>
                <Text font={46} bold monospacedDigit foregroundStyle={trafficColor}>{snapshot ? Math.abs(snapshot.cutoffRemainingGB).toFixed(1) : "--"}</Text>
                <Text font="title3" bold foregroundStyle="label">GB</Text>
              </HStack>
              <Text font="caption1" foregroundStyle="secondaryLabel">
                本月已用 <Text font="caption1" bold foregroundStyle="label">{snapshot?.totalGB.toFixed(1) ?? "--"} GB</Text> / {config.trafficThresholdGB} GB
              </Text>
              <ProgressView progressViewStyle="linear" value={Math.min(1, Math.max(0, (snapshot?.totalGB ?? 0) / config.trafficThresholdGB))} total={1} tint={trafficColor} frame={{ maxWidth: Infinity, height: 8 }} clipShape={{ type: "capsule" }} />
              <HStack alignment="center">
                <VStack alignment="leading" spacing={3}>
                  <Text font="caption2" foregroundStyle="secondaryLabel">VPS 参考线</Text>
                  <Text font="headline" bold>{config.vpsCutoffReferenceGB} GB</Text>
                </VStack>
                <Spacer />
                <VStack alignment="trailing" spacing={3}>
                  <Text font="caption2" foregroundStyle="secondaryLabel">安全日均 · 余 {snapshot?.daysRemaining ?? "--"} 天</Text>
                  <Text font="headline" bold foregroundStyle={trafficColor}>{snapshot?.dailyBudgetGB.toFixed(2) ?? "--"} GB/天</Text>
                </VStack>
              </HStack>
            </VStack>

            <HStack alignment="center" padding={{ leading: 4, trailing: 4, top: 2, bottom: 1 }}>
              <Text font="headline" bold>实例</Text>
              <Spacer />
              <Text font="caption1" foregroundStyle="secondaryLabel">{config.regionId}</Text>
            </HStack>
            <VStack spacing={0} background="systemBackground" clipShape={{ type: "rect", cornerRadius: 18, style: "continuous" }}>
              <HStack padding={14} spacing={12} alignment="center">
                <Image systemName="server.rack" font={20} foregroundStyle="systemBlue" />
                <VStack alignment="leading" spacing={3}>
                  <Text font="subheadline" bold>{config.ecsInstanceId || "\u672A\u914D\u7F6E\u5B9E\u4F8B"}</Text>
                  <Text font="caption1" foregroundStyle={statusColor}>{statusText}{snapshot?.ecs.stoppedMode ? ` \xB7 ${snapshot.ecs.stoppedMode}` : ""}</Text>
                </VStack>
                <Spacer />
                <Text font="caption1" foregroundStyle="secondaryLabel">{snapshot?.ecs.publicIp ?? "\u65E0\u516C\u7F51 IP"}</Text>
                {snapshot?.ecs.publicIp && <Button title="复制" systemImage="doc.on.doc" action={() => void copyIp()} />}
              </HStack>
            </VStack>

            <HStack alignment="center" padding={{ leading: 4, trailing: 4, top: 2, bottom: 1 }}>
              <Text font="headline" bold>每日流量</Text>
              <Spacer />
              <Text font="caption2" foregroundStyle="secondaryLabel">快照估算</Text>
            </HStack>
            <VStack alignment="leading" spacing={10} padding={16} background="systemBackground" clipShape={{ type: "rect", cornerRadius: 18, style: "continuous" }}>
              {snapshot ? <DailyTrafficChart points={snapshot.dailyUsage} /> : <Text font="caption1" foregroundStyle="secondaryLabel">同步后显示近 7 日流量。</Text>}
            </VStack>
            <Text font="caption2" foregroundStyle="secondaryLabel">手机端只读监控。VPS 熔断由远端脚本负责；未知日期不按零流量绘制。</Text>
          </VStack>
        </ScrollView>
      </Tab>

      <Tab title="费用" systemImage="creditcard.fill" value={1}>
        <ScrollView background="systemGray6" showsIndicators={false} safeAreaPadding={{ bottom: true }}>
          <VStack alignment="leading" spacing={12} padding={{ horizontal: 16, top: 12, bottom: 28 }}>
            <HStack alignment="center">
              <VStack alignment="leading" spacing={2}>
                <Text font="largeTitle" bold>费用</Text>
                <Text font="caption1" foregroundStyle="secondaryLabel">{snapshot?.billingCycle ?? "\u672C\u6708"} · 账户产品汇总</Text>
              </VStack>
              <Spacer />
              <Button title={financeLoading ? "\u8BFB\u53D6\u4E2D" : "\u5237\u65B0\u8D26\u5355"} systemImage="arrow.clockwise" disabled={financeLoading || !snapshot} action={() => void loadFinance(config, snapshot)} />
            </HStack>
            {financeError && <Text font="caption1" foregroundStyle="systemOrange">{financeError}</Text>}
            {finance?.balance && <VStack alignment="leading" spacing={8} padding={18} background="systemBackground" clipShape={{ type: "rect", cornerRadius: 20, style: "continuous" }}>
                <Text font="caption1" foregroundStyle="secondaryLabel">可用现金余额</Text>
                <Text font="largeTitle" bold>{formatCurrency(finance.balance.availableCashAmount, finance.balance.currency, privacy)}</Text>
                <Text font="caption1" foregroundStyle={finance.balance.status === "arrears" ? "systemRed" : finance.balance.status === "low" ? "systemOrange" : "systemGreen"}>
                  {finance.balance.status === "arrears" ? "\u73B0\u91D1\u4F59\u989D\u4E0D\u8DB3" : finance.balance.status === "low" ? "\u4F59\u989D\u504F\u4F4E" : "\u8D44\u91D1\u72B6\u6001\u6B63\u5E38"}
                </Text>
              </VStack>}
            {finance?.bill ? <VStack alignment="leading" spacing={12} padding={18} background="systemBackground" clipShape={{ type: "rect", cornerRadius: 20, style: "continuous" }}>
                <HStack alignment="center"><VStack alignment="leading" spacing={3}><Text font="caption1" foregroundStyle="secondaryLabel">当月应付 · 查询结果</Text><Text font="largeTitle" bold>{formatCurrency(finance.bill.paymentAmount, finance.bill.currency, privacy)}</Text></VStack><Spacer /><Button title={privacy ? "\u663E\u793A\u91D1\u989D" : "\u9690\u85CF\u91D1\u989D"} systemImage={privacy ? "eye" : "eye.slash"} action={togglePrivacy} /></HStack>
                <Divider />
                <HStack><Text font="subheadline">ECS</Text><Spacer /><Text font="subheadline" bold>{formatCurrency(finance.bill.ecsAmount, finance.bill.currency, privacy)}</Text></HStack>
                <HStack><Text font="subheadline">EIP</Text><Spacer /><Text font="subheadline" bold>{formatCurrency(finance.bill.eipAmount, finance.bill.currency, privacy)}</Text></HStack>
                <HStack><Text font="subheadline">CDT</Text><Spacer /><Text font="subheadline" bold>{formatCurrency(finance.bill.cdtAmount, finance.bill.currency, privacy)}</Text></HStack>
                <Text font="caption2" foregroundStyle="secondaryLabel">当前月账单可能延迟，作为参考，不代表最终结算金额。</Text>
              </VStack> : <VStack alignment="leading" spacing={8} padding={18} background="systemBackground" clipShape={{ type: "rect", cornerRadius: 20, style: "continuous" }}>
                <Text font="headline" bold>{financeLoading ? "\u6B63\u5728\u8BFB\u53D6\u8D26\u5355" : "\u8D26\u5355\u6682\u4E0D\u53EF\u7528"}</Text>
                <Text font="caption1" foregroundStyle="secondaryLabel">{financeLoading ? "\u6D41\u91CF\u548C\u5B9E\u4F8B\u72B6\u6001\u5DF2\u5148\u884C\u66F4\u65B0\u3002" : "\u8D26\u5355\u8BFB\u53D6\u5931\u8D25\u6216\u6743\u9650\u672A\u5F00\u653E\u3002\u6B64\u72B6\u6001\u4E0D\u4F1A\u663E\u793A\u4E3A\u96F6\u8D39\u7528\u3002"}</Text>
              </VStack>}
            {finance?.bill?.ecsDailyList && <VStack alignment="leading" spacing={10} padding={16} background="systemBackground" clipShape={{ type: "rect", cornerRadius: 18, style: "continuous" }}>
                <Text font="headline" bold>最近 7 日 ECS</Text>
                {finance.bill.ecsDailyList.map((item) => <HStack key={item.date} alignment="center"><Text font="subheadline">{item.date}{item.isToday ? " \xB7 \u4ECA\u5929" : ""}</Text><Spacer /><Text font="subheadline" foregroundStyle={item.available === false ? "systemOrange" : "secondaryLabel"}>{item.available === false ? "\u6682\u4E0D\u53EF\u7528" : item.settled ? `${finance.bill?.currency} ${privacy ? "\u2022\u2022\u2022\u2022" : item.amount}` : item.isToday ? "\u5F85\u51FA\u8D26" : "\u65E0\u8D39\u7528"}</Text></HStack>)}
              </VStack>}
            {finance?.bill?.eipDailyList && <VStack alignment="leading" spacing={10} padding={16} background="systemBackground" clipShape={{ type: "rect", cornerRadius: 18, style: "continuous" }}>
                <Text font="headline" bold>最近 7 日 EIP</Text>
                {finance.bill.eipDailyList.map((item) => <HStack key={item.date} alignment="center"><Text font="subheadline">{item.date}{item.isToday ? " \xB7 \u4ECA\u5929" : ""}</Text><Spacer /><Text font="subheadline" foregroundStyle={item.available === false ? "systemOrange" : "secondaryLabel"}>{item.available === false ? "\u6682\u4E0D\u53EF\u7528" : item.settled ? `${finance.bill?.currency} ${privacy ? "\u2022\u2022\u2022\u2022" : item.amount}` : item.isToday ? "\u5F85\u51FA\u8D26" : "\u65E0\u8D39\u7528"}</Text></HStack>)}
              </VStack>}
            <Text font="caption2" foregroundStyle="secondaryLabel">账户产品汇总，不代表单台 ECS 资源费用。当前月数据可能延迟更新，不是最终结算账单。</Text>
          </VStack>
        </ScrollView>
      </Tab>
 <Tab title="设置" systemImage="gearshape.fill" value={2}>
        <NativeSettingsView
    currentConfig={config}
    onSave={(next) => {
      setConfig(next);
      setSnapshot(null);
      setSnapshotStale(false);
      setFinance(null);
      setFinanceLoaded(false);
      setLastUpdated(null);
      setError(null);
      setFinanceError(null);
      selection.setValue(0);
    }}
    onCancel={() => selection.setValue(0)}
  />
      </Tab>
    </TabView>;
}
async function launchApp() {
  await Navigation.present({ element: <AppDashboard /> });
  Script.exit();
}
if (false) {
  void launchApp();
}

// widget.tsx
init_config();
import {
  Widget,
  VStack as VStack2,
  HStack as HStack2,
  Text as Text2,
  Image as Image2,
  Spacer as Spacer2,
  Circle as Circle2,
  Divider as Divider2,
  ProgressView as ProgressView2,
  Chart as Chart2,
  LineChart as LineChart2
} from "scripting";
var COLORS = {
  normal: "systemBlue",
  warning: "systemOrange",
  danger: "systemRed",
  stale: "secondaryLabel"
};
function riskColor(data, stale = false) {
  if (stale) return COLORS.stale;
  if (data.cutoffRemainingGB <= 0) return COLORS.danger;
  if (data.cutoffRemainingGB <= 15) return COLORS.warning;
  return COLORS.normal;
}
function riskLabel(data, stale = false) {
  if (stale) return "\u7F13\u5B58\u6570\u636E";
  if (data.cutoffRemainingGB <= 0) return "\u5DF2\u8D85\u51FA\u53C2\u8003\u7EBF";
  if (data.cutoffRemainingGB <= 15) return "\u4E34\u8FD1\u53C2\u8003\u7EBF";
  return "\u9884\u7B97\u5145\u8DB3";
}
function statusMeta(status) {
  switch (status) {
    case "Running":
      return { label: "\u8FD0\u884C\u4E2D", color: "systemGreen" };
    case "Starting":
      return { label: "\u542F\u52A8\u4E2D", color: "systemOrange" };
    case "Stopping":
      return { label: "\u505C\u6B62\u4E2D", color: "systemOrange" };
    case "Stopped":
      return { label: "\u5DF2\u505C\u6B62", color: "secondaryLabel" };
    default:
      return { label: "\u672A\u77E5", color: "secondaryLabel" };
  }
}
function remainingText(data) {
  return `${data.cutoffRemainingGB < 0 ? "\u8D85" : "\u4F59"} ${Math.abs(data.cutoffRemainingGB).toFixed(1)}`;
}
function UsageProgress({ data, stale = false }) {
  const tint = riskColor(data, stale);
  return <VStack2 alignment="leading" spacing={4}>
      <ProgressView2
    progressViewStyle="linear"
    value={Math.min(1, Math.max(0, data.totalGB / Math.max(1, data.thresholdGB)))}
    total={1}
    tint={tint}
    frame={{ maxWidth: Infinity, height: 6 }}
    clipShape={{ type: "capsule" }}
  />
      <HStack2 alignment="center">
        <Text2 font={9} monospacedDigit foregroundStyle="secondaryLabel">已用 {data.totalGB.toFixed(1)} / {data.thresholdGB} GB</Text2>
        <Spacer2 />
        <Text2 font={9} monospacedDigit foregroundStyle="secondaryLabel">线 {data.cutoffGB} GB</Text2>
      </HStack2>
    </VStack2>;
}
function DailyTrafficChart2({ data, stale = false, height = 58 }) {
  const segments = [];
  let segment = [];
  let previousDay = null;
  for (const point of data.dailyUsage) {
    if (point.valueGB === null) {
      if (segment.length) segments.push(segment);
      segment = [];
      previousDay = null;
      continue;
    }
    const [year, month, day] = point.date.split("-").map(Number);
    const dayNumber = Date.UTC(year, month - 1, day);
    if (segment.length && previousDay !== null && dayNumber - previousDay !== 864e5) {
      segments.push(segment);
      segment = [];
    }
    segment.push(point);
    previousDay = dayNumber;
  }
  if (segment.length) segments.push(segment);
  if (segments.reduce((sum, points) => sum + points.length, 0) < 2) {
    return <HStack2 frame={{ maxWidth: Infinity, height }} alignment="center">
        <Spacer2 />
        <Text2 font="caption2" foregroundStyle="secondaryLabel">采样积累后显示每日趋势</Text2>
        <Spacer2 />
      </HStack2>;
  }
  return <Chart2 frame={{ maxWidth: Infinity, height }}>
      {segments.map((points, index) => <LineChart2
    key={`${points[0].date}-${index}`}
    labelOnYAxis={false}
    marks={points.map((point) => ({
      label: point.label,
      value: point.valueGB,
      foregroundStyle: point.isToday && !stale ? "systemBlue" : "systemGreen",
      symbol: "circle",
      symbolSize: point.isToday && !stale ? 20 : 14,
      lineStyle: { lineWidth: 2.25, lineCap: "round" },
      annotation: {
        position: "top",
        alignment: "center",
        spacing: 3,
        overflowResolution: { x: "fit", y: "padScale" },
        content: <Text2 font={9} bold={point.isToday && !stale} foregroundStyle={point.isToday && !stale ? "systemBlue" : "secondaryLabel"}>{point.valueGB?.toFixed(1)}</Text2>
      }
    }))}
  />)}
    </Chart2>;
}
function SmallWidget({ data, stale }) {
  const status = statusMeta(data.ecs.status);
  return <VStack2 alignment="leading" spacing={7} padding={{ horizontal: 13, vertical: 12 }} widgetBackground="systemBackground" frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
      <HStack2 alignment="center" spacing={5}>
        <Image2 systemName="cloud.fill" font={12} foregroundStyle={riskColor(data, stale)} />
        <Text2 font="caption2" bold foregroundStyle="label">CDT</Text2>
        <Spacer2 />
        <Circle2 widgetAccentable fill={status.color} frame={{ width: 5, height: 5 }} />
        <Text2 font={9} bold foregroundStyle={status.color}>{status.label}</Text2>
      </HStack2>
      <Text2 font={10} foregroundStyle="secondaryLabel">{stale ? "\u8DDD\u53C2\u8003\u7EBF \xB7 \u7F13\u5B58" : data.cutoffRemainingGB < 0 ? "\u5DF2\u8D85\u51FA\u53C2\u8003\u7EBF" : "\u8DDD\u53C2\u8003\u7EBF\u5269\u4F59"}</Text2>
      <HStack2 alignment="lastTextBaseline" spacing={4}>
        <Text2 font={36} bold monospacedDigit foregroundStyle={riskColor(data, stale)}>{Math.abs(data.cutoffRemainingGB).toFixed(1)}</Text2>
        <Text2 font="caption1" foregroundStyle="label">GB</Text2>
      </HStack2>
      <UsageProgress data={data} stale={stale} />
      <HStack2 alignment="center">
        <Text2 font={9} foregroundStyle="secondaryLabel">今日估算</Text2>
        <Spacer2 />
        <Text2 font={10} bold monospacedDigit foregroundStyle="label">{stale ? "\u2014" : data.dailyUsage[data.dailyUsage.length - 1]?.valueGB?.toFixed(1) ?? "\u2014"} GB</Text2>
      </HStack2>
    </VStack2>;
}
function MediumWidget({ data, stale }) {
  const status = statusMeta(data.ecs.status);
  return <VStack2 alignment="leading" spacing={5} padding={{ horizontal: 15, vertical: 12 }} widgetBackground="systemBackground" frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
      <HStack2 alignment="center" spacing={5}>
        <Image2 systemName="cloud.fill" font={13} foregroundStyle={riskColor(data, stale)} />
        <Text2 font="caption1" bold foregroundStyle="label">阿里云 CDT</Text2>
        <Spacer2 />
        <Circle2 widgetAccentable fill={status.color} frame={{ width: 5, height: 5 }} />
        <Text2 font={9} foregroundStyle={status.color}>{status.label}</Text2>
        {stale && <Text2 font={9} foregroundStyle="secondaryLabel">· 缓存</Text2>}
      </HStack2>
      <HStack2 alignment="center">
        <VStack2 alignment="leading" spacing={2}>
          <Text2 font={9} foregroundStyle="secondaryLabel">{data.cutoffRemainingGB < 0 ? "\u8D85\u51FA\u53C2\u8003\u7EBF" : "\u8DDD\u53C2\u8003\u7EBF\u5269\u4F59"}</Text2>
          <HStack2 alignment="lastTextBaseline" spacing={3}>
            <Text2 font={29} bold monospacedDigit foregroundStyle={riskColor(data, stale)}>{Math.abs(data.cutoffRemainingGB).toFixed(1)}</Text2>
            <Text2 font={9} foregroundStyle="secondaryLabel">GB</Text2>
          </HStack2>
        </VStack2>
        <Spacer2 />
        <VStack2 alignment="trailing" spacing={2}>
          <Text2 font={9} foregroundStyle="secondaryLabel">日均预算 · 余 {data.daysRemaining} 天</Text2>
          <Text2 font={17} bold monospacedDigit foregroundStyle="label">{data.dailyBudgetGB.toFixed(2)} GB/天</Text2>
        </VStack2>
      </HStack2>
      <DailyTrafficChart2 data={data} stale={stale} height={64} />
      <Text2 font={9} foregroundStyle="secondaryLabel">每日估算 GB · {stale ? `\u7F13\u5B58\u4E8E ${new Date(data.updatedAt).toLocaleString()}` : "\u9010\u70B9\u6807\u6CE8"}</Text2>
    </VStack2>;
}
function LargeWidget({ data, stale }) {
  const status = statusMeta(data.ecs.status);
  return <VStack2 alignment="leading" spacing={9} padding={{ horizontal: 17, vertical: 14 }} widgetBackground="systemBackground" frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
      <HStack2 alignment="center" spacing={5}>
        <Image2 systemName="cloud.fill" font={14} foregroundStyle={riskColor(data, stale)} />
        <Text2 font="subheadline" bold foregroundStyle="label">阿里云 CDT</Text2>
        <Spacer2 />
        <Circle2 widgetAccentable fill={status.color} frame={{ width: 6, height: 6 }} />
        <Text2 font={10} bold foregroundStyle={status.color}>ECS {status.label}</Text2>
      </HStack2>
      <HStack2 alignment="center">
        <VStack2 alignment="leading" spacing={3}>
          <Text2 font="caption1" foregroundStyle="secondaryLabel">{data.cutoffRemainingGB < 0 ? "\u5DF2\u8D85\u51FA VPS \u53C2\u8003\u7EBF" : "\u8DDD VPS \u53C2\u8003\u7EBF\u5269\u4F59"}</Text2>
          <HStack2 alignment="lastTextBaseline" spacing={5}>
            <Text2 font={42} bold monospacedDigit foregroundStyle={riskColor(data, stale)}>{Math.abs(data.cutoffRemainingGB).toFixed(1)}</Text2>
            <Text2 font="title3" bold foregroundStyle="label">GB</Text2>
          </HStack2>
        </VStack2>
        <Spacer2 />
        <Text2 font="caption1" bold foregroundStyle={riskColor(data, stale)}>{riskLabel(data, stale)}</Text2>
      </HStack2>
      <UsageProgress data={data} stale={stale} />
      <HStack2 alignment="center" padding={{ top: 3, bottom: 2 }}>
        <VStack2 alignment="leading" spacing={3}>
          <Text2 font={9} foregroundStyle="secondaryLabel">今日估算</Text2>
          <Text2 font="headline" bold monospacedDigit>{stale ? "\u2014" : data.dailyUsage[data.dailyUsage.length - 1]?.valueGB?.toFixed(1) ?? "\u2014"} GB</Text2>
        </VStack2>
        <Spacer2 />
        <VStack2 alignment="trailing" spacing={3}>
          <Text2 font={9} foregroundStyle="secondaryLabel">安全日均</Text2>
          <Text2 font="headline" bold monospacedDigit foregroundStyle={riskColor(data, stale)}>{data.dailyBudgetGB.toFixed(2)} GB/天</Text2>
        </VStack2>
      </HStack2>
      <Divider2 />
      <HStack2 alignment="center">
        <Text2 font="caption2" bold foregroundStyle="secondaryLabel">每日用量 · 近 7 日</Text2>
        <Spacer2 />
        <Text2 font={9} foregroundStyle="secondaryLabel">单位 GB</Text2>
      </HStack2>
      <DailyTrafficChart2 data={data} stale={stale} height={94} />
      <HStack2 alignment="center">
        <Text2 font={9} foregroundStyle="secondaryLabel">{stale ? `${new Date(data.updatedAt).toLocaleString()} \u7F13\u5B58` : `${new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} \u66F4\u65B0`}</Text2>
        <Spacer2 />
        <Text2 font={9} foregroundStyle="secondaryLabel">{data.daysRemaining} 天后重置</Text2>
      </HStack2>
    </VStack2>;
}
function AccessoryRectangularWidget({ data, stale }) {
  const status = statusMeta(data.ecs.status);
  return <HStack2 alignment="center" spacing={9} widgetBackground="clear" frame={{ maxWidth: Infinity, maxHeight: Infinity, alignment: "leading" }}>
      <VStack2 alignment="leading" spacing={3} frame={{ maxWidth: Infinity }}>
        <HStack2 alignment="center" spacing={5}>
          <Text2 font={13} bold monospacedDigit>{remainingText(data)} GB</Text2>
          <Spacer2 />
          <Circle2 widgetAccentable fill={stale ? "secondaryLabel" : status.color} frame={{ width: 5, height: 5 }} />
          <Text2 font={9} foregroundStyle={stale ? "secondaryLabel" : status.color}>{stale ? "\u7F13\u5B58" : status.label}</Text2>
        </HStack2>
        <ProgressView2 progressViewStyle="linear" value={Math.min(1, Math.max(0, data.totalGB / Math.max(1, data.thresholdGB)))} total={1} tint={riskColor(data, stale)} frame={{ maxWidth: Infinity, height: 5 }} />
        <Text2 font={9} foregroundStyle="secondaryLabel">已用 {data.totalGB.toFixed(1)} GB · 余 {data.daysRemaining} 天</Text2>
      </VStack2>
    </HStack2>;
}
function AccessoryInlineWidget({ data, stale }) {
  const status = statusMeta(data.ecs.status);
  return <Text2 lineLimit={1} monospacedDigit>CDT {remainingText(data)} GB · {stale ? "\u7F13\u5B58" : status.label}</Text2>;
}
async function launchWidget() {
  const config = normalizeConfig(loadConfig());
  if (!isConfigured(config)) {
    Widget.present(
      <VStack2 alignment="leading" spacing={6} padding={14} widgetBackground="systemBackground" frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
        <HStack2 spacing={6} alignment="center"><Image2 systemName="gearshape.fill" font={14} foregroundStyle="systemOrange" /><Text2 font="subheadline" bold>尚未配置</Text2></HStack2>
        <Text2 font="caption2" foregroundStyle="secondaryLabel">请打开 CDT 监控并在底部“设置”中填写访问凭据。</Text2>
      </VStack2>
    );
    return;
  }
  let stale = false;
  let data;
  try {
    data = await fetchCoreSnapshot(config);
  } catch (error) {
    const cached = loadCachedSnapshot(config, true);
    if (!cached) {
      console.error("\u5C0F\u7EC4\u4EF6\u5237\u65B0\u5931\u8D25\uFF0C\u4E14\u6CA1\u6709\u53EF\u7528\u7F13\u5B58", error);
      Widget.present(
        <VStack2 alignment="leading" spacing={6} padding={14} widgetBackground="systemBackground" frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
          <HStack2 spacing={6} alignment="center"><Image2 systemName="exclamationmark.triangle.fill" font={14} foregroundStyle="systemOrange" /><Text2 font="subheadline" bold>暂时无法更新</Text2></HStack2>
          <Text2 font="caption2" foregroundStyle="secondaryLabel">打开 CDT 监控后可查看错误并重试。</Text2>
        </VStack2>
      );
      return;
    }
    data = cached;
    stale = true;
  }
  const family = Widget.family;
  if (family === "accessoryInline") Widget.present(<AccessoryInlineWidget data={data} stale={stale} />);
  else if (family === "accessoryRectangular") Widget.present(<AccessoryRectangularWidget data={data} stale={stale} />);
  else if (family === "systemLarge") Widget.present(<LargeWidget data={data} stale={stale} />);
  else if (family === "systemMedium") Widget.present(<MediumWidget data={data} stale={stale} />);
  else Widget.present(<SmallWidget data={data} stale={stale} />);
}
if (false) {
  void launchWidget();
}

// single_file_entry.tsx
if (Widget2?.family) {
  void launchWidget();
} else if (true) {
  void launchApp();
}

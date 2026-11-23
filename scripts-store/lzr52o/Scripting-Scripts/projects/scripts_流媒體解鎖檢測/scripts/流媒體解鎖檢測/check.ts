import { AbortController, fetch, type AbortSignal } from "scripting"
import { makeService, type ServiceResult, type UnlockReport } from "./model"

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36"

const BASE_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  "Accept-Language": "en",
  Accept: "*/*",
  Referer: "https://chat.openai.com/",
  "Cache-Control": "no-cache, no-store, max-age=0",
  Pragma: "no-cache",
}

function freshUrl(url: string): string {
  const join = url.includes("?") ? "&" : "?"
  return `${url}${join}_=${Date.now()}`
}

const CHATGPT_RESTRICTED = ["HK", "RU", "CN", "KP", "CU", "IR", "SY"]

class CheckError extends Error {
  code: "Not Available" | "Timeout" | "Error"

  constructor(code: "Not Available" | "Timeout" | "Error") {
    super(code)
    this.code = code
  }
}

type HttpResult = {
  status: number
  text: string
  url: string
  header: (name: string) => string
}

async function request(url: string, init: {
  method?: string
  headers?: Record<string, string>
  body?: string
  timeout?: number
  allowInsecureRequest?: boolean
  signal?: AbortSignal
} = {}): Promise<HttpResult> {
  const response = await fetch(freshUrl(url), {
    method: init.method,
    headers: { ...BASE_HEADERS, ...init.headers },
    body: init.body,
    timeout: init.timeout ?? 5,
    allowInsecureRequest: init.allowInsecureRequest,
    signal: init.signal,
  })
  const text = await response.text()
  return {
    status: response.status,
    text,
    url: response.url || url,
    header: (name: string) => response.headers.get(name) ?? "",
  }
}

function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController()
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort()
      reject(new CheckError("Timeout"))
    }, ms)
    work(controller.signal).then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        if (error instanceof CheckError) reject(error)
        else reject(new CheckError("Error"))
      },
    )
  })
}

async function fetchIp(): Promise<{ ip: string; location: string }> {
  try {
    const res = await request("https://ipinfo.io/json", { timeout: 4 })
    if (res.status !== 200) throw new Error("ip")
    const data = JSON.parse(res.text) as { ip?: string; region?: string; country?: string; city?: string }
    const place = [data.city, data.region, data.country].filter(item => item && item.trim()).join(", ")
    return {
      ip: data.ip && data.ip.trim() ? data.ip.trim() : "N/A",
      location: place || "N/A",
    }
  } catch {
    return { ip: "N/A", location: "N/A" }
  }
}

async function checkYoutube(): Promise<ServiceResult> {
  try {
    const res = await request("https://www.youtube.com/premium", { timeout: 5 })
    if (res.status !== 200) return makeService("youtube", "na", "", "檢測失敗")
    if (res.text.includes("Premium is not available in your country")) {
      return makeService("youtube", "no", "", "此區未開放 Premium")
    }
    const match = res.text.match(/"countryCode":"(.*?)"/)
    let region = "US"
    if (match && match[1] && /^[a-z]{2}$/i.test(match[1])) region = match[1].toUpperCase()
    else if (res.text.includes("www.google.cn")) region = "CN"
    return makeService("youtube", "ok", region, `${region} 可看 Premium`)
  } catch {
    return makeService("youtube", "na", "", "檢測失敗")
  }
}

function netflixRegion(raw: string): string {
  const parts = raw.split("/")
  let region = parts.length > 3 ? parts[3] : ""
  region = region.split("-")[0]
  if (!region || region.toLowerCase() === "title" || !/^[a-z]{2}$/i.test(region)) return "US"
  return region.toUpperCase()
}

async function probeNetflix(filmId: number): Promise<{ kind: "region"; region: string } | { kind: "missing" } | { kind: "blocked" } | { kind: "error" }> {
  try {
    const res = await request(`https://www.netflix.com/title/${filmId}`, { timeout: 5 })
    if (res.status === 403) return { kind: "blocked" }
    if (res.status === 404) return { kind: "missing" }
    if (res.status === 200) {
      const origin = res.header("x-originating-url")
      return { kind: "region", region: netflixRegion(origin || res.url) }
    }
    return { kind: "error" }
  } catch {
    return { kind: "error" }
  }
}

async function checkNetflix(): Promise<ServiceResult> {
  const firstTask = probeNetflix(81280792)
  const secondTask = probeNetflix(80018499)
  const first = await firstTask
  if (first.kind === "region") return makeService("netflix", "ok", first.region, `${first.region} 完整目錄`)
  if (first.kind === "blocked") return makeService("netflix", "no", "", "此區未開放")
  if (first.kind === "error") return makeService("netflix", "na", "", "檢測失敗")

  const second = await secondTask
  if (second.kind === "region") return makeService("netflix", "warn", second.region, `${second.region} 僅部分內容`)
  if (second.kind === "missing" || second.kind === "blocked") return makeService("netflix", "no", "", "此區未開放")
  return makeService("netflix", "na", "", "檢測失敗")
}

async function checkChatGptWeb(): Promise<{ status: "Available" | "Not Available"; region: string }> {
  const res = await request("http://chat.openai.com/cdn-cgi/trace", {
    timeout: 5,
    allowInsecureRequest: true,
  })
  if (res.status !== 200) throw new CheckError("Error")
  const fields: Record<string, string> = {}
  for (const line of res.text.split("\n")) {
    const index = line.indexOf("=")
    if (index <= 0) continue
    fields[line.slice(0, index)] = line.slice(index + 1).trim()
  }
  const country = (fields.loc || "").toUpperCase()
  if (!country || CHATGPT_RESTRICTED.includes(country)) return { status: "Not Available", region: "" }
  return { status: "Available", region: country }
}

async function checkChatGptIos(): Promise<"Client Available" | "Client Not Available" | "Client Error"> {
  try {
    const res = await request("https://ios.chat.openai.com/", {
      timeout: 5,
      headers: {
        authority: "ios.chat.openai.com",
        accept: "*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua": "",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"iOS\"",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "user-agent": "",
      },
    })
    if (res.text.toLowerCase().includes("vpn")) return "Client Not Available"
    return "Client Available"
  } catch {
    return "Client Error"
  }
}

async function checkChatGPT(): Promise<ServiceResult> {
  try {
    const [web, ios] = await Promise.all([checkChatGptWeb(), checkChatGptIos()])
    if (web.status === "Available" && ios === "Client Available") {
      return makeService("chatgpt", "ok", web.region, `${web.region} 網頁與 App 都可用`)
    }
    if (web.status === "Available" && ios === "Client Not Available") {
      return makeService("chatgpt", "warn", web.region, `${web.region} 網頁可用，App 被限制`)
    }
    return makeService("chatgpt", "no", "", "不支援")
  } catch {
    return makeService("chatgpt", "na", "", "檢測失敗")
  }
}

async function testDisneyHome(signal: AbortSignal): Promise<{ region: string }> {
  const res = await request("https://www.disneyplus.com/", {
    timeout: 5,
    signal,
    headers: {
      "Accept-Language": "en",
      "User-Agent": UA,
    },
  })
  if (res.status !== 200 || res.text.includes("Sorry, Disney+ is not available in your region.")) {
    throw new CheckError("Not Available")
  }
  const match = res.text.match(/Region: ([A-Za-z]{2})[\s\S]*?CNBL: ([12])/)
  return { region: match?.[1] ?? "" }
}

async function getDisneyLocation(signal: AbortSignal): Promise<{ countryCode: string; inSupportedLocation: boolean | string }> {
  const res = await request("https://disney.api.edge.bamgrid.com/graph/v1/device/graphql", {
    method: "POST",
    timeout: 5,
    signal,
    headers: {
      "Accept-Language": "en",
      Authorization: "ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84",
      "Content-Type": "application/json",
      "User-Agent": UA,
    },
    body: JSON.stringify({
      query: "mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }",
      variables: {
        input: {
          applicationRuntime: "chrome",
          attributes: {
            browserName: "chrome",
            browserVersion: "94.0.4606",
            manufacturer: "apple",
            model: null,
            operatingSystem: "macintosh",
            operatingSystemVersion: "10.15.7",
            osDeviceIds: [],
          },
          deviceFamily: "browser",
          deviceLanguage: "en",
          deviceProfile: "macosx",
        },
      },
    }),
  })
  if (res.status !== 200) throw new CheckError("Not Available")
  let data: {
    errors?: unknown
    extensions?: {
      sdk?: {
        session?: {
          inSupportedLocation?: boolean | string
          location?: { countryCode?: string }
        }
      }
    }
  }
  try {
    data = JSON.parse(res.text)
  } catch {
    throw new CheckError("Error")
  }
  if (data.errors) throw new CheckError("Not Available")
  const session = data.extensions?.sdk?.session
  const countryCode = session?.location?.countryCode
  const inSupportedLocation = session?.inSupportedLocation
  if (countryCode == null && inSupportedLocation == null) throw new CheckError("Error")
  return {
    countryCode: countryCode ?? "",
    inSupportedLocation: inSupportedLocation ?? true,
  }
}

async function checkDisney(): Promise<ServiceResult> {
  const homeTask = withTimeout(signal => testDisneyHome(signal), 4500)
  const locationTask = withTimeout(signal => getDisneyLocation(signal), 4500)
  try {
    const [homeResult, locationResult] = await Promise.allSettled([homeTask, locationTask])
    if (homeResult.status === "rejected") throw homeResult.reason
    if (locationResult.status === "rejected") throw locationResult.reason
    const home = homeResult.value
    const location = locationResult.value
    const region = (location.countryCode || home.region || "").toUpperCase()
    const coming = location.inSupportedLocation === false || location.inSupportedLocation === "false"
    if (coming) return makeService("disney", "soon", region, region ? `${region} 即將上線` : "即將上線")
    return makeService("disney", "ok", region, region ? `${region} 可解鎖` : "可解鎖")
  } catch (error) {
    const code = error instanceof CheckError ? error.code : "Error"
    if (code === "Not Available") return makeService("disney", "no", "", "此區未開放")
    if (code === "Timeout") return makeService("disney", "na", "", "檢測逾時")
    return makeService("disney", "na", "", "檢測異常")
  }
}

export async function checkUnlock(): Promise<UnlockReport> {
  const [ip, youtube, netflix, chatgpt, disney] = await Promise.all([
    fetchIp(),
    checkYoutube(),
    checkNetflix(),
    checkChatGPT(),
    checkDisney(),
  ])
  return {
    ip: ip.ip,
    location: ip.location,
    services: [youtube, netflix, chatgpt, disney],
    timestamp: new Date().toISOString(),
    stale: false,
  }
}

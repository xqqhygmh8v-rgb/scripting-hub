import {
  BASE_PATH_APP,
  BASE_PATH_WEB,
  HEADER_CUST_NUMBER,
  HEADER_X_AUTH_TOKEN,
  JSON_KEY_STA,
  RESP_STA_SUCCESS,
} from "../constants"
import { fetch, type Response } from "scripting"

type RequestOptions = {
  basePath?: string
  authToken?: string | null
  customerNumber?: string | null
  withAuth?: boolean
  method?: "POST" | "GET"
  timeout?: number
}

export class CSGAPIError extends Error {
  readonly code: string

  constructor(code: string, message?: string) {
    super(safeAPIErrorMessage(code, message))
    this.name = "CSGAPIError"
    this.code = code
  }
}

export async function requestJSON<T>(
  path: string,
  payload: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const startedAt = Date.now()
  const {
    basePath = BASE_PATH_APP,
    authToken,
    customerNumber,
    withAuth = true,
    method = "POST",
    timeout = 30,
  } = options

  const headers: Record<string, string> = {
    Host: "95598.csg.cn",
    "Content-Type": "application/json;charset=utf-8",
    Origin: "file://",
    Accept: "application/json, text/plain, */*",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Accept-Language": "zh-CN,cn;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)",
  }

  if (withAuth) {
    if (!authToken) {
      throw new Error("缺少登录凭证，请重新扫码登录。")
    }
    headers[HEADER_X_AUTH_TOKEN] = authToken
    headers[HEADER_CUST_NUMBER] = customerNumber ?? ""
  }

  console.log("[CSG] request:start", path, "payloadPresent", payload != null)

  let response: Response
  try {
    response = await fetch(`${basePath}${path}`, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(payload ?? {}) : undefined,
      timeout,
    })
  } catch (error: any) {
    console.log("[CSG] request:transportError", path, String(error?.message ?? error), "elapsedMs", Date.now() - startedAt)
    throw error
  }
  console.log("[CSG] request:endpoint", path, "status", response.status, "elapsedMs", Date.now() - startedAt)

  if (!response.ok) {
    throw new Error(`接口请求失败（HTTP ${response.status}）`)
  }

  const rawText = await response.text()
  const json = parseLooseJSON(rawText)
  if (json?.[JSON_KEY_STA] !== RESP_STA_SUCCESS) {
    console.log("[CSG] request:apiError", path, json?.[JSON_KEY_STA], "messagePresent", Boolean(json?.message))
    throw new CSGAPIError(String(json?.[JSON_KEY_STA] ?? "UNKNOWN"), json?.message)
  }

  console.log("[CSG] request:success", path, "elapsedMs", Date.now() - startedAt)

  return json.data as T
}

export function webRequestJSON<T>(path: string, payload: unknown) {
  return requestJSON<T>(path, payload, {
    basePath: BASE_PATH_WEB,
    withAuth: false,
  })
}

function parseLooseJSON(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end < start) {
    throw new Error("接口返回了无法解析的内容。")
  }
  return JSON.parse(text.slice(start, end + 1))
}

function safeAPIErrorMessage(code: string, message?: string) {
  if (code === "04") return "登录状态已失效，请重新扫码登录。"
  if (code === "09") return "授权尚未完成，请扫码后再检查。"
  return message ? `南网数据服务暂时不可用（${code}）` : `南网接口返回错误（${code}）`
}

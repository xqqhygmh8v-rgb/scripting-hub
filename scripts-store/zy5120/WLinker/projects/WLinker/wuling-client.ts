// WLinker - 五菱开放 API 客户端
// 签名算法来自开源项目 hasscc/wuling（Home Assistant 五菱集成）：
//   signature = SHA256(accessToken + timestamp + nonce + clientId + clientSecret + appcode + appversion + system + systemversion)
// 已通过真实车辆实测（openapi.baojun.net 明文接口）。

import { fetch } from "scripting"
import { loadAccount, loadCredential, saveCredential } from "./session-vault"
import type { VehicleCheck, VehicleInfo, VehicleSnapshot, VehicleStatus } from "./domain"

const API_BASE = "https://openapi.baojun.net/junApi/sgmw"
const APP_CODE = "sgmw_llb"
const APP_VERSION = "1691"
const SYSTEM = "android"
const SYSTEM_VERSION = "10"

export interface WulingCredential {
  accessToken: string
  clientId: string
  clientSecret: string
}

function generateNonce(length = 10): string {
  const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
  let out = ""
  for (let i = 0; i < length; i++) {
    out += letters[Math.floor(Math.random() * letters.length)]
  }
  return out
}

function signRequest(
  credential: WulingCredential,
  timestamp: number,
  nonce: string,
): string {
  const signStr =
    credential.accessToken +
    String(timestamp) +
    nonce +
    credential.clientId +
    credential.clientSecret +
    APP_CODE +
    APP_VERSION +
    SYSTEM +
    SYSTEM_VERSION
  const data = Data.fromString(signStr)
  if (!data) throw new Error("SIGN_DATA_FAILED")
  const digest = Crypto.sha256(data)
  return digest.toHexString().toLowerCase()
}

interface RequestOptions {
  method?: string
  body?: Record<string, unknown>
  timeout?: number
}

async function requestJSON<T>(
  credential: WulingCredential,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? "POST"
  const timestamp = Date.now()
  const nonce = generateNonce()
  const signature = signRequest(credential, timestamp, nonce)

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json; charset=UTF-8",
    "User-Agent": "okhttp/4.9.0",
    channel: "linglingbang",
    platformNo: "Android",
    appVersionCode: APP_VERSION,
    version: "V8.2.17",
    imei: "a-c62b2f538bf34758",
    imsi: "unknown",
    deviceModel: "MI 8",
    deviceBrand: "Xiaomi",
    deviceType: "Android",
    accessChannel: "1",
    sgmwaccesstoken: credential.accessToken,
    sgmwtimestamp: String(timestamp),
    sgmwnonce: nonce,
    sgmwclientid: credential.clientId,
    sgmwclientsecret: credential.clientSecret,
    sgmwappcode: APP_CODE,
    sgmwappversion: APP_VERSION,
    sgmwsystem: SYSTEM,
    sgmwsystemversion: SYSTEM_VERSION,
    sgmwsignature: signature,
  }

  const body = options.body != null ? JSON.stringify(options.body) : "{}"
  const response = await fetch(`${API_BASE}/${path}`, {
    method,
    headers,
    body,
    timeout: options.timeout ?? 20,
    debugLabel: `Wuling ${path}`,
  })
  const text = await response.text()
  if (text.length > 2_000_000) throw new Error("WULING_RESPONSE_TOO_LARGE")
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`WULING_NON_JSON_${response.status}`)
  }
  if (!response.ok) throw new Error(`WULING_HTTP_${response.status}`)
  return value as T
}

interface ApiEnvelope {
  result?: boolean
  errorCode?: string | number
  errorMessage?: string
  data?: unknown
}

function unwrap<T>(value: ApiEnvelope, operation: string): T {
  if (value?.result !== true) {
    const code = value?.errorCode ?? "?"
    const msg = value?.errorMessage ?? "unknown"
    throw new Error(`${operation}_FAILED_${code}_${msg}`)
  }
  if (value.data == null) throw new Error(`${operation}_NO_DATA`)
  return value.data as T
}

// 查询默认车辆完整状态（核心接口）
export async function fetchDefaultCarStatus(
  credential: WulingCredential,
): Promise<{ info: VehicleInfo; status: VehicleStatus }> {
  const envelope = await requestJSON<ApiEnvelope>(credential, "userCarRelation/queryDefaultCarStatus")
  const data = unwrap<{ carInfo?: Record<string, unknown>; carStatus?: Record<string, unknown> }>(envelope, "CAR_STATUS")
  return {
    info: mapCarInfo(data.carInfo ?? {}),
    status: mapCarStatus(data.carStatus ?? {}),
  }
}

// 车辆健康检查
export async function fetchCarCheck(
  credential: WulingCredential,
  vin: string,
): Promise<VehicleCheck> {
  const envelope = await requestJSON<ApiEnvelope>(credential, "car/check/all", { body: { vin } })
  return unwrap<VehicleCheck>(envelope, "CAR_CHECK")
}

// 爱车信息（queryAllFavoriteCar）：补充经销商/购车人/厂名等 queryDefaultCarStatus 没有的字段
async function fetchFavoriteCarInfo(
  credential: WulingCredential,
): Promise<Partial<VehicleInfo>> {
  const envelope = await requestJSON<ApiEnvelope>(credential, "userCarRelation/queryAllFavoriteCar")
  const data = unwrap<Array<Record<string, unknown>>>(envelope, "FAVORITE_CAR")
  const car = data[0] ?? {}
  const shopName = str(car.shopName)
  const purchaseUserName = str(car.purchaseUsername)
  const factoryCarName = str(car.factoryCarName)
  const dealerCode = str(car.dealerCode)
  const authenticatedUserMobile = str(car.authenticatedUserMobile)
  const nickname = str(car.carNickname)
  const purchaseDate = num(car.purchaseDate)
  return {
    shopName: shopName || undefined,
    purchaseUserName: purchaseUserName || undefined,
    factoryCarName: factoryCarName || undefined,
    dealerCode: dealerCode || undefined,
    authenticatedUserMobile: authenticatedUserMobile || undefined,
    carNickname: nickname || undefined,
    purchaseDate: purchaseDate,
  }
}

// 获取完整快照（App / 组件统一入口）
export async function fetchVehicleSnapshot(
  credential: WulingCredential,
): Promise<VehicleSnapshot> {
  const { info, status } = await fetchDefaultCarStatus(credential)
  let check: VehicleCheck | undefined
  try {
    check = await fetchCarCheck(credential, info.vin)
  } catch (error) {
    console.warn("car check unavailable:", error instanceof Error ? error.message : String(error))
  }
  // 补充爱车信息（经销商/购车人/厂名等），失败不阻塞
  let infoMerged = info
  try {
    const favorite = await fetchFavoriteCarInfo(credential)
    infoMerged = { ...info, ...favorite }
  } catch (error) {
    console.warn("favorite car info unavailable:", error instanceof Error ? error.message : String(error))
  }
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    localVehicleId: infoMerged.vin,
    vin: infoMerged.vin,
    info: infoMerged,
    status,
    check,
    fetchedAt: now,
    cachedAt: now,
    source: "network",
  }
}

// ---- 登录（hapi.00bang.cn 明文通道）----
// 纯浏览器 H5 模式走 hapi.00bang.cn，无需 sd 加密，与五菱官方 H5 登录页一致。
// 实测：密码登录 / 验证码登录均为明文 POST，返回 access_token（即 sgmwaccesstoken）。

const HAPI_BASE = "https://hapi.00bang.cn/llb"
// H5 渠道凭证（来自 cdn-m.00bang.cn/llb/js/common/config.js，生产环境）
const H5_CLIENT_ID = "20190428237594239281"
const H5_CLIENT_SECRET = "d9b66c5590b6446a918ae404d2f1f130"
// 车况接口固定凭证（抓包自官方 App 的 sgmwclientid / sgmwclientsecret）
export const CAR_CLIENT_ID = "2019041810222516127"
export const CAR_CLIENT_SECRET = "c5ad2a4290faa3df39683865c2e10310"

export interface WulingLoginResult {
  accessToken: string
  refreshToken?: string
}

const H5_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  "Content-Type": "application/json;charset=utf-8",
  Accept: "application/json, text/plain, */*",
  Origin: "https://cdn-m.00bang.cn",
  Referer: "https://cdn-m.00bang.cn/",
  deviceType: "html5",
  platformNo: "ios",
  accessChannel: "22",
  imei: "undefined",
  version: "undefined",
}

async function hapiRequest<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: H5_HEADERS,
    body: "{}",
    timeout: 20,
    debugLabel: "Wuling H5 login",
  })
  const text = await response.text()
  if (text.length > 2_000_000) throw new Error("WULING_RESPONSE_TOO_LARGE")
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`WULING_NON_JSON_${response.status}`)
  }
  if (!response.ok) throw new Error(`WULING_HTTP_${response.status}`)
  return value as T
}

function unwrapLogin(value: ApiEnvelope, operation: string): WulingLoginResult {
  if (value?.result !== true) {
    const code = value?.errorCode ?? "?"
    const msg = value?.errorMessage ?? "unknown"
    if (code === "40031") throw new Error("SMS_CODE_WRONG")
    if (code === "40032") throw new Error("SMS_CODE_EMPTY")
    if (code === "160001" || code === "160002") throw new Error("LOGIN_PARAMS_INVALID")
    throw new Error(`${operation}_FAILED_${code}_${msg}`)
  }
  const data = (value.data ?? {}) as { access_token?: string; refresh_token?: string }
  const accessToken = data.access_token
  if (!accessToken) throw new Error(`${operation}_NO_TOKEN`)
  return { accessToken, refreshToken: data.refresh_token }
}

// 密码登录（无验证码，App 内直接可用）
export async function loginWithPassword(phone: string, password: string): Promise<WulingLoginResult> {
  const url =
    `${HAPI_BASE}/oauth/llb/ucenter/login` +
    `?mobile=${encodeURIComponent(phone)}` +
    `&password=${encodeURIComponent(password)}` +
    `&client_id=${H5_CLIENT_ID}` +
    `&client_secret=${H5_CLIENT_SECRET}` +
    `&response_type=token&state=introduceLand`
  const envelope = await hapiRequest<ApiEnvelope>(url)
  return unwrapLogin(envelope, "LOGIN")
}

// 验证码登录（需要先通过 H5 登录页获取短信验证码）
export async function loginWithSms(phone: string, smsCode: string): Promise<WulingLoginResult> {
  const url =
    `${HAPI_BASE}/oauth/llb/ucenter/quickLogin` +
    `?mobile=${encodeURIComponent(phone)}` +
    `&smsCode=${encodeURIComponent(smsCode)}` +
    `&client_id=${H5_CLIENT_ID}` +
    `&client_secret=${H5_CLIENT_SECRET}` +
    `&state=introduceLand&response_type=token`
  const envelope = await hapiRequest<ApiEnvelope>(url)
  return unwrapLogin(envelope, "SMS_LOGIN")
}

// 由登录结果构造车况凭证（登录 token 即 sgmwaccesstoken，车况接口凭证为固定值）
export function credentialFromLogin(result: WulingLoginResult): WulingCredential {
  return {
    accessToken: result.accessToken,
    clientId: CAR_CLIENT_ID,
    clientSecret: CAR_CLIENT_SECRET,
  }
}

// 官方 H5 登录页（用户在其中完成极验滑块验证后接收短信验证码）
export const H5_LOGIN_PAGE = "https://cdn-m.00bang.cn/llb/html/my/login.html"

// 获取快照，失败时用已保存的手机号+密码自动重新登录再试一次
export async function fetchVehicleSnapshotWithRelogin(): Promise<VehicleSnapshot> {
  const credential = loadCredential()
  if (credential) {
    try {
      return await fetchVehicleSnapshot(credential)
    } catch (error) {
      console.warn("snapshot fetch failed, trying auto re-login:", error instanceof Error ? error.message : String(error))
    }
  }
  const account = loadAccount()
  if (!account) throw new Error("NO_CREDENTIAL")
  const result = await loginWithPassword(account.phone, account.password)
  const next = credentialFromLogin(result)
  saveCredential(next)
  return fetchVehicleSnapshot(next)
}

// ---- 字段映射 ----

function num(value: unknown): number | undefined {
  if (value == null || value === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function str(value: unknown): string {
  return value == null ? "" : String(value)
}

function mapCarInfo(raw: Record<string, unknown>): VehicleInfo {
  return {
    vin: str(raw.vin),
    carName: str(raw.carName),
    carNickname: str(raw.carNickname),
    model: str(raw.model),
    carTypeName: str(raw.carTypeName),
    colorName: str(raw.colorName),
    purchaseDate: num(raw.purchaseDate),
    purchaseUserName: str(raw.purchaseUserName),
    shopName: str(raw.shopName),
    image: str(raw.image),
    carPlate: str(raw.carPlate),
    seriesCode: str(raw.seriesCode),
    carOwnerDay: num(raw.carOwnerDay),
    bindCarUserMobile: str(raw.bindCarUserMobile),
    level: str(raw.level),
    vsn: str(raw.vsn),
  }
}

function mapCarStatus(raw: Record<string, unknown>): VehicleStatus {
  return {
    mileage: num(raw.mileage),
    yesterMileage: num(raw.yesterMileage),
    leftMileage: num(raw.leftMileage),
    batterySoc: num(raw.batterySoc),
    batHealth: num(raw.batHealth),
    batAvgTemp: num(raw.batAvgTemp),
    batMinTemp: num(raw.batMinTemp),
    batMaxTemp: num(raw.batMaxTemp),
    voltage: num(raw.voltage),
    lowBatVol: num(raw.lowBatVol),
    leftBatteryPower: num(raw.leftBatteryPower),
    leftFuel: num(raw.leftFuel),
    doorLockStatus: num(raw.doorLockStatus),
    door1LockStatus: num(raw.door1LockStatus),
    door2LockStatus: num(raw.door2LockStatus),
    door3LockStatus: num(raw.door3LockStatus),
    door4LockStatus: num(raw.door4LockStatus),
    tailDoorLockStatus: num(raw.tailDoorLockStatus),
    doorOpenStatus: num(raw.doorOpenStatus),
    door1OpenStatus: num(raw.door1OpenStatus),
    door2OpenStatus: num(raw.door2OpenStatus),
    door3OpenStatus: num(raw.door3OpenStatus),
    door4OpenStatus: num(raw.door4OpenStatus),
    tailDoorOpenStatus: num(raw.tailDoorOpenStatus),
    windowStatus: num(raw.windowStatus),
    window1OpenStatus: num(raw.window1OpenStatus),
    window2OpenStatus: num(raw.window2OpenStatus),
    window3OpenStatus: num(raw.window3OpenStatus),
    window4OpenStatus: num(raw.window4OpenStatus),
    window1Status: num(raw.window1Status),
    window2Status: num(raw.window2Status),
    window3Status: num(raw.window3Status),
    window4Status: num(raw.window4Status),
    windowHalfOpenStatus: num(raw.windowHalfOpenStatus),
    window1HalfOpenStatus: num(raw.window1HalfOpenStatus),
    window2HalfOpenStatus: num(raw.window2HalfOpenStatus),
    window3HalfOpenStatus: num(raw.window3HalfOpenStatus),
    window4HalfOpenStatus: num(raw.window4HalfOpenStatus),
    window1OpenDegree: num(raw.window1OpenDegree),
    window2OpenDegree: num(raw.window2OpenDegree),
    window3OpenDegree: num(raw.window3OpenDegree),
    window4OpenDegree: num(raw.window4OpenDegree),
    seat1HotStatus: num(raw.seat1HotStatus),
    seat1WindStatus: num(raw.seat1WindStatus),
    seat2HotStatus: num(raw.seat2HotStatus),
    seat2WindStatus: num(raw.seat2WindStatus),
    seat3HotStatus: num(raw.seat3HotStatus),
    seat3WindStatus: num(raw.seat3WindStatus),
    seat4HotStatus: num(raw.seat4HotStatus),
    seat4WindStatus: num(raw.seat4WindStatus),
    dipHeadLight: num(raw.dipHeadLight),
    lowBeamLight: num(raw.lowBeamLight),
    frontFogLight: num(raw.frontFogLight),
    rearFogLight: num(raw.rearFogLight),
    leftTurnLight: num(raw.leftTurnLight),
    rightTurnLight: num(raw.rightTurnLight),
    invActTemp: num(raw.invActTemp),
    tmActTemp: num(raw.tmActTemp),
    obcOtpCur: num(raw.obcOtpCur),
    current: num(raw.current),
    charging: num(raw.charging),
    rechargeStatus: num(raw.rechargeStatus),
    wireConnect: num(raw.wireConnect),
    vecChrgingSts: num(raw.vecChrgingSts),
    batteryStatus: num(raw.batteryStatus),
    batSOH: num(raw.batSOH),
    chargePower: num(raw.chargePower),
    obcTemp: num(raw.obcTemp),
    oilLeftMileage: num(raw.oilLeftMileage),
    hybridMileage: num(raw.hybridMileage),
    vehSpdAvgDrvn: num(raw.vehSpdAvgDrvn),
    strWhAng: num(raw.strWhAng),
    brakPedalPos: num(raw.brakPedalPos),
    accActPos: num(raw.accActPos),
    sentinelModeStatus: num(raw.sentinelModeStatus),
    intelligentCarSwitch: num(raw.intelligentCarSwitch),
    limitFeedback: num(raw.limitFeedback),
    interiorTemperature: num(raw.interiorTemperature),
    cdjTemp: num(raw.cdjTemp),
    mileType: num(raw.mileType),
    status: str(raw.status),
    statusName: str(raw.statusName),
    statusToast: str(raw.statusToast),
    latitude: num(raw.latitude),
    longitude: num(raw.longitude),
    collectTime: str(raw.collectTime),
    acStatus: num(raw.acStatus),
    keyStatus: num(raw.keyStatus),
    autoGearStatus: num(raw.autoGearStatus),
    leftSlidingDoorStatus: str(raw.leftSlidingDoorStatus),
    rightSlidingDoorStatus: str(raw.rightSlidingDoorStatus),
  }
}

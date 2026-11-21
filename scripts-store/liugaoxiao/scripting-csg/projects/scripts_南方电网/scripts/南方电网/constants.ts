export const SCRIPT_ACCENT = "#0092FF"

export const BASE_PATH_WEB = "https://95598.csg.cn/ucs/ma/wt/"
export const BASE_PATH_APP = "https://95598.csg.cn/ucs/ma/zt/"
export const BASE_PATH_QR_APP = "https://95598.csg.cn/mp/w2/wx/userauth/"

export const AREACODE_FALLBACK = "030000"
export const HEADER_X_AUTH_TOKEN = "x-auth-token"
export const HEADER_CUST_NUMBER = "custNumber"

export const JSON_KEY_STA = "sta"
export const JSON_KEY_DATA = "data"
export const JSON_KEY_AREA_CODE = "areaCode"
export const JSON_KEY_ELE_CUST_ID = "eleCustId"
export const JSON_KEY_METERING_POINT_ID = "meteringPointId"
export const JSON_KEY_METERING_POINT_NUMBER = "meteringPointNumber"
export const JSON_KEY_YEAR_MONTH = "yearMonth"

export const RESP_STA_SUCCESS = "00"
export const RESP_STA_QR_NOT_SCANNED = "09"
export const RESP_STA_NO_LOGIN = "04"

export const STORAGE_KEY = "csg.widget.settings"
export const WIDGET_CACHE_KEY = "csg.widget.cache"
export const KEYCHAIN_TOKEN_KEY = "csg.widget.authToken"
export const QR_POLL_INTERVAL_MS = 2500
export const DEFAULT_WIDGET_RELOAD_MINUTES = 180

export const LOGIN_CHANNELS = [
  { label: "南网在线", value: "app" },
  { label: "微信", value: "wechat" },
] as const

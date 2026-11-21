import {
  Button,
  HStack,
  Image,
  Rectangle,
  RoundedRectangle,
  Spacer,
  Text,
  VStack,
  Widget,
  ZStack,
} from "scripting"
import { RefreshWeatherIntent } from "./app_intents"

/* ------------------------------------------------------------------
 * 中国天气网 · Scripting 小组件
 *
 * 使用方法：
 * 1. 在 Scripting 中新建脚本项目「天气日历」；
 * 2. 把本目录的 script.json、index.tsx、widget.tsx 放进项目；
 * 3. 运行 index.tsx 预览，或到桌面添加 Scripting 小组件。
 *
 * 城市可以改下面的 DEFAULT_CITY，也可以在小工具“编辑小组件”的
 * 参数里填：杭州   或   {"city":"杭州","name":"你的昵称","source":"moji"}
 *
 * 默认使用墨迹天气，请求失败时自动回退中国天气网。
 * source 可选 moji（默认）或 weathercn（只用中国天气网）。
 * 轻点组件任意位置会在组件扩展内直接刷新，不打开 Scripting。
 * 不读取定位、不上传设备信息。
 * ------------------------------------------------------------------ */

const DEFAULT_CITY = "杭州"
const REFRESH_MINUTES = 30
type WeatherSource = "weathercn" | "moji"

type DynamicColor = { light: string; dark: string }

const C = {
  bg: { light: "#FFFFFF", dark: "#000000" } as DynamicColor,
  card: { light: "rgba(0,0,0,0.04)", dark: "rgba(255,255,255,0.08)" } as DynamicColor,
  chip: { light: "rgba(0,0,0,0.04)", dark: "rgba(255,255,255,0.08)" } as DynamicColor,
  text: { light: "#1C1C1E", dark: "#F2F2F7" } as DynamicColor,
  sub: { light: "#8E8E93", dark: "#AEAEB2" } as DynamicColor,
  line: { light: "rgba(0,0,0,0.08)", dark: "rgba(255,255,255,0.12)" } as DynamicColor,
  blue: "#0A84FF",
  cyan: "#32ADE6",
  amber: "#FF9500",
  violet: "#BF5AF2",
  red: "#FF3B30",
  green: "#34C759",
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]

/* 常用城市，命中后可直接跳过搜索请求；其余城市自动走天气网搜索接口。 */
const CITY_PRESETS: Record<string, string> = {
  "北京": "101010100", "上海": "101020100", "天津": "101030100", "重庆": "101040100",
  "哈尔滨": "101050101", "长春": "101060101", "沈阳": "101070101", "大连": "101070201",
  "呼和浩特": "101080101", "石家庄": "101090101", "太原": "101100101", "西安": "101110101",
  "济南": "101120101", "青岛": "101120201", "烟台": "101120501", "威海": "101121301",
  "乌鲁木齐": "101130101", "拉萨": "101140101", "西宁": "101150101", "兰州": "101160101",
  "银川": "101170101", "郑州": "101180101", "南京": "101190101", "苏州": "101190401",
  "无锡": "101190201", "常州": "101191101", "南通": "101190501", "武汉": "101200101",
  "杭州": "101210101", "宁波": "101210401", "温州": "101210701", "嘉兴": "101210301",
  "绍兴": "101210507", "金华": "101210901", "台州": "101210601", "合肥": "101220101",
  "福州": "101230101", "厦门": "101230201", "泉州": "101230501", "南昌": "101240101",
  "长沙": "101250101", "贵阳": "101260101", "成都": "101270101", "广州": "101280101",
  "深圳": "101280601", "珠海": "101280701", "佛山": "101280800", "东莞": "101281601",
  "中山": "101281701", "惠州": "101280301", "汕头": "101280501", "湛江": "101281001",
  "昆明": "101290101", "南宁": "101300101", "海口": "101310101", "三亚": "101310201",
  "儋州": "101310205", "琼海": "101310211", "文昌": "101310212", "万宁": "101310215",
  "陵水": "101310216", "澄迈": "101310204", "临高": "101310203", "东方": "101310202",
  "五指山": "101310222", "保亭": "101310214", "乐东": "101310221", "昌江": "101310206",
  "白沙": "101310207", "琼中": "101310208", "定安": "101310209", "屯昌": "101310210",
  "三沙": "101310301", "香港": "101320101", "澳门": "101330101", "台北": "101340101",
  "雄安新区": "101091201", "浦东新区": "101020600", "滨海新区": "101031100",
  "海淀": "101010200", "宝安": "101280605", "龙岗": "101280606",
}

type DayInfo = {
  date: string
  week: string
  tempMax: string
  tempMin: string
  codeDay: string
  codeNight: string
  textDay: string
  textNight: string
  windDay: string
  windNight: string
}

type LifeInfo = {
  label: string
  hint: string
  des: string
}

type WeatherModel = {
  city: string
  date: string
  time: string
  temp: string
  weather: string
  windDir: string
  windScale: string
  humidity: string
  pressure: string
  rain: string
  aqi: string
  vis: string
  todayMax: string
  todayMin: string
  daily: DayInfo[]
  life: LifeInfo[]
}

const HTTP_HEADERS = {
  "Referer": "https://www.weather.com.cn/",
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1",
}

const MOJI_HEADERS = {
  "Referer": "https://tianqi.moji.com/",
  "User-Agent": HTTP_HEADERS["User-Agent"],
}

/* ------------------------------------------------------------------
 * 配置
 * ------------------------------------------------------------------ */

function readConfig(): { city: string; name: string; source: WeatherSource } {
  const raw = String(Widget.parameter || "").trim()
  let city = DEFAULT_CITY
  let name = ""
  let source: WeatherSource = "moji"

  if (raw) {
    if (raw.startsWith("{")) {
      try {
        const obj = JSON.parse(raw)
        city = String(obj.city || obj.CITY || DEFAULT_CITY).trim() || DEFAULT_CITY
        name = String(obj.name || obj.userName || "").trim()
        const selected = String(obj.source || obj.provider || "").trim().toLowerCase()
        if (["weathercn", "weather.com.cn", "中国天气网"].includes(selected)) {
          source = "weathercn"
        } else if (["moji", "墨迹", "墨迹天气"].includes(selected)) {
          source = "moji"
        }
      } catch (_) {
        city = raw
      }
    } else {
      city = raw
    }
  }

  return { city, name, source }
}

/* ------------------------------------------------------------------
 * 网络
 * ------------------------------------------------------------------ */

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("请求超时")), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function getResponse(
  url: string,
  headers: Record<string, string> = HTTP_HEADERS,
): Promise<Response> {
  const response = await withTimeout(
    fetch(url, {
      headers,
      credentials: "omit",
    }),
    10000,
  )
  if (response.status !== 200) {
    throw new Error(`天气接口 HTTP ${response.status}`)
  }
  return response
}

async function getText(
  url: string,
  headers: Record<string, string> = HTTP_HEADERS,
): Promise<string> {
  const response = await getResponse(url, headers)
  return await response.text()
}

async function resolveCity(rawName: string): Promise<{ code: string; city: string }> {
  const name = rawName.trim()
  if (/^\d{9}$/.test(name)) {
    return { code: name, city: name }
  }

  const direct = CITY_PRESETS[name]
  if (direct) {
    return { code: direct, city: name }
  }

  const stripped = name.replace(/(市|县|区)$/, "")
  if (stripped !== name && CITY_PRESETS[stripped]) {
    return { code: CITY_PRESETS[stripped], city: stripped }
  }

  const url = `https://toy1.weather.com.cn/search?cityname=${encodeURIComponent(name)}`
  const text = await getText(url)
  const refs = [...text.matchAll(/"ref":"([^"]+)"/g)].map((item) => item[1])

  for (const ref of refs) {
    const parts = ref.split("~")
    const code = parts[0] || ""
    const foundName = parts[2] || ""
    if (/^\d{9}$/.test(code) && (foundName === name || foundName === stripped)) {
      return { code, city: foundName || name }
    }
  }

  for (const ref of refs) {
    const parts = ref.split("~")
    if (/^\d{9}$/.test(parts[0] || "")) {
      return { code: parts[0], city: parts[2] || name }
    }
  }

  throw new Error(`未找到城市「${name}」，请检查城市名`)
}

function pickObject(text: string, name: string): any | null {
  const index = text.indexOf(`var ${name}`)
  if (index < 0) return null

  const start = text.indexOf("{", index)
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === "\\") {
        escaped = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === "{") depth++
    if (ch === "}") {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch (_) {
          return null
        }
      }
    }
  }

  return null
}

async function fetchWeather(code: string): Promise<{
  cityDZ: any
  dataSK: any
  dataZS: any
  fc: any
}> {
  const text = await getText(`https://d1.weather.com.cn/weather_index/${code}.html`)
  const cityDZ = pickObject(text, "cityDZ")
  const dataSK = pickObject(text, "dataSK")
  const dataZS = pickObject(text, "dataZS")
  const fc = pickObject(text, "fc")

  if (!dataSK || !cityDZ) {
    throw new Error("实况接口没有返回有效数据")
  }
  return { cityDZ, dataSK, dataZS, fc }
}

async function fetch7Day(code: string): Promise<DayInfo[] | null> {
  try {
    const html = await getText(`https://www.weather.com.cn/weather/${code}.shtml`)
    const ulIndex = html.indexOf('id="7d"')
    if (ulIndex < 0) return null

    const ulStart = html.indexOf('<ul class="t', ulIndex)
    const ulEnd = html.indexOf("</ul>", ulStart)
    if (ulStart < 0 || ulEnd < 0) return null

    const ul = html.slice(ulStart, ulEnd)
    const items = [...ul.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
    const days: DayInfo[] = []

    for (const item of items) {
      const li = item[1]
      const h1 = (li.match(/<h1>([^<]+)<\/h1>/) || ["", ""])[1]
      const weather = (li.match(/<p[^>]*class="wea"[^>]*>([^<]+)<\/p>/) || ["", ""])[1]
      let temp = li.match(/<p[^>]*class="tem"[^>]*>\s*<span>([^<]+)<\/span>\/<i>([^<]+)<\/i>/)
      if (!temp) {
        const lowOnly = li.match(/<p[^>]*class="tem"[^>]*>\s*<i>([^<]+)<\/i>/)
        if (lowOnly) temp = ["", "", lowOnly[1]] as any
      }

      const dayCode = (li.match(/png40 d([0-9]+)/) || ["", ""])[1]
      const nightCode = (li.match(/png40 n([0-9]+)/) || ["", ""])[1]
      const wind = (li.match(/<p[^>]*class="win"[^>]*>[\s\S]*?<i>([^<]+)<\/i>/) || ["", ""])[1]
      if (!h1) continue

      const datePart = h1.split("（")[0] || ""
      const weekPart = (h1.match(/\uff08([^\uff09]+)\uff09/) || ["", ""])[1]

      days.push({
        date: datePart,
        week: weekPart || "",
        tempMax: temp ? (temp[1] || "").trim().replace("℃", "") : "",
        tempMin: temp ? (temp[2] || "").trim().replace("℃", "") : "",
        codeDay: dayCode || "",
        codeNight: nightCode || "",
        textDay: (weather || "").trim(),
        textNight: "",
        windDay: (wind || "").trim(),
        windNight: "",
      })
    }

    return days.length >= 5 ? days : null
  } catch (_) {
    return null
  }
}

/* ------------------------------------------------------------------
 * 墨迹天气网页版
 * ------------------------------------------------------------------ */

function cleanHtmlText(value: string): string {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function parseMojiCurrent(html: string): {
  temp: string
  weather: string
  time: string
  humidity: string
  windDir: string
  windScale: string
  aqi: string
} {
  const currentBlock =
    (html.match(/<div class="wea_weather[^"]*">([\s\S]*?)<\/div>/) || [])[1] || ""
  const aboutBlock =
    (html.match(/<div class="wea_about[^"]*">([\s\S]*?)<\/div>/) || [])[1] || ""
  const alertBlock =
    (html.match(/<div class="wea_alert[^"]*">([\s\S]*?)<div class="wea_weather/) || [])[1] || ""
  const windRaw = cleanHtmlText((aboutBlock.match(/<em>([^<]+)<\/em>/) || [])[1] || "")
  const wind = windRaw.match(/^(.+?)\s*(\d+级)$/)

  return {
    temp: cleanHtmlText((currentBlock.match(/<em>([^<]+)<\/em>/) || [])[1] || ""),
    weather: cleanHtmlText((currentBlock.match(/<b>([^<]+)<\/b>/) || [])[1] || ""),
    time: (currentBlock.match(/(\d{1,2}:\d{2})更新/) || [])[1] || "",
    humidity: cleanHtmlText((aboutBlock.match(/<span>湿度\s*([^<]+)<\/span>/) || [])[1] || ""),
    windDir: wind ? cleanHtmlText(wind[1]) : windRaw,
    windScale: wind ? wind[2] : "",
    aqi: (alertBlock.match(/<em>\s*(\d+)\s+[^<]*<\/em>/) || [])[1] || "",
  }
}

function parseMojiLife(html: string): LifeInfo[] {
  const values = new Map<string, string>()
  for (const item of html.matchAll(/<dt>([^<]+)<\/dt>\s*<dd>([^<]+)<\/dd>/g)) {
    values.set(cleanHtmlText(item[2]), cleanHtmlText(item[1]))
  }

  const specs = ["穿衣", "洗车", "紫外线", "感冒", "雨伞", "运动"]
  const life: LifeInfo[] = []
  for (const label of specs) {
    const hint = values.get(label)
    if (hint) life.push({ label, hint, des: "" })
  }
  return life
}

function parseMojiForecast(html: string): DayInfo[] {
  const list =
    (html.match(/<div class="wea_list clearfix wea_list_seven">([\s\S]*?)<\/ul>/) || [])[1] || ""
  const items = [...list.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/g)].map((item) => {
    const body = item[2]
    const weeks = [...body.matchAll(/<span class="week">([^<]+)<\/span>/g)].map((match) =>
      cleanHtmlText(match[1]),
    )
    const weather = [...body.matchAll(/<span class="wea">([^<]+)<\/span>/g)].map((match) =>
      cleanHtmlText(match[1]),
    )

    return {
      active: /class="active"/.test(item[1]),
      week: weeks[0] || "",
      date: weeks[weeks.length - 1] || "",
      textDay: weather[0] || "",
      textNight: weather[1] || "",
      tempMax: cleanHtmlText((body.match(/<b>([^<]+)<\/b>/) || [])[1] || "").replace("°", ""),
      tempMin: cleanHtmlText((body.match(/<strong>([^<]+)<\/strong>/) || [])[1] || "").replace(
        "°",
        "",
      ),
    }
  })

  const start = items.findIndex((item) => item.active)
  const ordered = start >= 0 ? items.slice(start) : items
  return ordered.slice(0, 7).map((item) => ({
    date: item.date,
    week: item.week,
    tempMax: item.tempMax,
    tempMin: item.tempMin,
    codeDay: "",
    codeNight: "",
    textDay: item.textDay,
    textNight: item.textNight,
    windDay: "",
    windNight: "",
  }))
}

function mojiCityTerms(name: string): string[] {
  const terms = new Set<string>()
  const compact = name.replace(/\s+/g, "")
  terms.add(compact)
  terms.add(compact.replace(/(特别行政区|自治区|自治州|自治县|省|市|区|县|旗)$/, ""))

  const parts = compact.split(/(?:特别行政区|自治区|自治州|自治县|省|市|区|县|旗)/).filter(Boolean)
  if (parts.length > 1) terms.add(parts[parts.length - 1])
  return [...terms].filter(Boolean)
}

function mojiCityScore(name: string, itemName: string): number {
  const found = itemName.trim()
  const foundBase = found.replace(/(特别行政区|自治区|自治州|自治县|省|市|区|县|旗)$/, "")
  let best = 0

  for (const term of mojiCityTerms(name)) {
    const base = term.replace(/(特别行政区|自治区|自治州|自治县|省|市|区|县|旗)$/, "")
    if (found === term) best = Math.max(best, 100)
    if (base && base === foundBase) best = Math.max(best, 95)
    if (base.length >= 2 && foundBase.startsWith(base)) best = Math.max(best, 80)
    if (base.length >= 2 && base.startsWith(foundBase)) best = Math.max(best, 75)
  }
  return best
}

async function fetchMojiWeather(rawCity: string): Promise<WeatherModel> {
  const name = rawCity.trim()
  if (!name) throw new Error("请填写城市名")

  let cityId = /^\d+$/.test(name) ? name : ""
  let cityName = name

  if (!cityId) {
    const text = await getText(
      `https://tianqi.moji.com/api/citysearch/${encodeURIComponent(name)}`,
      MOJI_HEADERS,
    )
    const data = JSON.parse(text)
    const list: any[] = Array.isArray(data.city_list) ? data.city_list : []
    if (list.length === 0) throw new Error(`墨迹天气未找到城市「${name}」`)

    const candidates = list.filter(
      (item) => !(Array.isArray(item.city_lable) && item.city_lable.some((tag: any) => tag.name === "景点")),
    )
    const ranked = (candidates.length ? candidates : list)
      .map((item, index) => ({
        item,
        index,
        score: mojiCityScore(name, String(item.name || "")),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
    const city = ranked[0].item

    cityId = String(city.cityId || "")
    cityName = String(city.name || name).replace(/市$/, "")
    if (!cityId) throw new Error(`墨迹天气未找到城市「${name}」`)
  }

  const page = await getResponse(`https://tianqi.moji.com/api/redirect/${cityId}`, MOJI_HEADERS)
  const html = await page.text()
  const finalUrl = String(page.url || "")
  const forecastLink = html.match(/https:\/\/tianqi\.moji\.com\/forecast7\/[^"]+/)
  const forecastUrl = forecastLink
    ? forecastLink[0]
    : finalUrl.includes("/weather/")
      ? finalUrl.replace("/weather/", "/forecast7/")
      : ""
  if (!forecastUrl) throw new Error("墨迹天气城市页跳转失败")

  const forecast = await getText(forecastUrl, MOJI_HEADERS)
  const daily = parseMojiForecast(forecast)
  if (daily.length < 3) throw new Error("墨迹天气 7 天预报解析失败")

  const current = parseMojiCurrent(html)
  if (!current.temp || !current.weather) throw new Error("墨迹天气实况解析失败")

  return {
    city: cityName,
    date: "",
    time: current.time,
    temp: current.temp,
    weather: current.weather,
    windDir: current.windDir,
    windScale: current.windScale,
    humidity: current.humidity,
    pressure: "",
    rain: "",
    aqi: current.aqi,
    vis: "",
    todayMax: daily[0].tempMax,
    todayMin: daily[0].tempMin,
    daily,
    life: parseMojiLife(html),
  }
}

/* ------------------------------------------------------------------
 * 数据整理
 * ------------------------------------------------------------------ */

function codeToText(code: string): string {
  const map: Record<string, string> = {
    "00": "晴", "01": "多云", "02": "阴", "03": "阵雨", "04": "雷阵雨",
    "05": "雷阵雨伴冰雹", "06": "雨夹雪", "07": "小雨", "08": "中雨",
    "09": "大雨", "10": "暴雨", "11": "大暴雨", "12": "特大暴雨",
    "13": "阵雪", "14": "小雪", "15": "中雪", "16": "大雪", "17": "暴雪",
    "18": "雾", "19": "冻雨", "20": "沙尘暴", "21": "小雨到中雨",
    "22": "中雨到大雨", "23": "大雨到暴雨", "24": "暴雨到大暴雨",
    "25": "大暴雨到特大暴雨", "26": "小雪到中雪", "27": "中雪到大雪",
    "28": "大雪到暴雪", "29": "浮尘", "30": "扬沙", "31": "强沙尘暴", "32": "霾",
  }
  return map[String(code)] || ""
}

function buildModel(data: any, fallbackCity: string, seven: DayInfo[] | null): WeatherModel {
  const sk = data.dataSK || {}
  const dz = (data.cityDZ && data.cityDZ.weatherinfo) || {}
  const fcList = (data.fc && data.fc.f) || []

  let daily: DayInfo[]

  if (seven && seven.length >= 5) {
    daily = seven.slice(0, 7).map((day) => ({ ...day }))
    if (daily[0] && !daily[0].tempMax && fcList[0]) {
      daily[0].tempMax = fcList[0].fc || ""
      daily[0].tempMin = daily[0].tempMin || fcList[0].fd || ""
      if (!daily[0].codeDay && fcList[0].fa) daily[0].codeDay = String(fcList[0].fa)
    }
  } else {
    daily = fcList.slice(0, 5).map((day: any) => ({
      date: day.fi || "",
      week: day.fj || "",
      tempMax: day.fc || "",
      tempMin: day.fd || "",
      codeDay: String(day.fa || ""),
      codeNight: String(day.fb || ""),
      textDay: codeToText(String(day.fa || "")),
      textNight: codeToText(String(day.fb || "")),
      windDay: `${day.fe || ""} ${day.fg || ""}`.trim(),
      windNight: `${day.ff || ""} ${day.fh || ""}`.trim(),
    }))
  }

  const zs = (data.dataZS && data.dataZS.zs) || {}
  const lifeSpecs: Array<[string, string]> = [
    ["ct", "穿衣"],
    ["xc", "洗车"],
    ["uv", "紫外线"],
    ["gm", "感冒"],
    ["ys", "雨伞"],
    ["yd", "运动"],
  ]
  const life: LifeInfo[] = []
  for (const [key, label] of lifeSpecs) {
    const hint = zs[`${key}_hint`]
    if (hint) {
      life.push({
        label,
        hint: String(hint),
        des: String(zs[`${key}_des_s`] || ""),
      })
    }
    if (life.length >= 6) break
  }

  return {
    city: sk.cityname || dz.city || fallbackCity,
    date: sk.date || "",
    time: sk.time || "",
    temp: sk.temp || "",
    weather: sk.weather || dz.weather || "",
    windDir: sk.WD || dz.wd || "",
    windScale: sk.WS || dz.ws || "",
    humidity: sk.SD || "",
    pressure: sk.qy || "",
    rain: sk.rain || "",
    aqi: sk.aqi || "",
    vis: sk.njd || "",
    todayMax: dz.temp || (daily[0] ? daily[0].tempMax : ""),
    todayMin: dz.tempn || (daily[0] ? daily[0].tempMin : ""),
    daily,
    life,
  }
}

/* ------------------------------------------------------------------
 * 图标与文字
 * ------------------------------------------------------------------ */

function iconForText(text: string): { symbol: string; color: string } {
  const value = String(text || "")
  if (value.includes("雷")) return { symbol: "cloud.bolt.rain.fill", color: C.violet }
  if (value.includes("雪")) return { symbol: "cloud.snow.fill", color: "#7DD3FC" }
  if (value.includes("雨")) return { symbol: "cloud.rain.fill", color: C.blue }
  if (value.includes("雾") || value.includes("霾") || value.includes("沙") || value.includes("尘")) {
    return { symbol: "cloud.fog.fill", color: "#94A3B8" }
  }
  if (value.includes("阴")) return { symbol: "cloud.fill", color: "#94A3B8" }
  if (value.includes("多云")) return { symbol: "cloud.sun.fill", color: C.amber }
  if (value.includes("晴")) return { symbol: "sun.max.fill", color: C.amber }
  return { symbol: "cloud.fill", color: "#94A3B8" }
}

function iconForCode(code: string): { symbol: string; color: string } {
  const value = String(code || "")
  if (value === "00") return { symbol: "sun.max.fill", color: C.amber }
  if (value === "01") return { symbol: "cloud.sun.fill", color: C.amber }
  if (value === "02") return { symbol: "cloud.fill", color: "#94A3B8" }
  if (value === "04" || value === "05") return { symbol: "cloud.bolt.rain.fill", color: C.violet }
  if (["06", "13", "14", "15", "16", "17", "26", "27", "28"].includes(value)) {
    return { symbol: "cloud.snow.fill", color: "#7DD3FC" }
  }
  if (["03", "07", "08", "21"].includes(value)) return { symbol: "cloud.rain.fill", color: C.blue }
  if (["09", "10", "11", "12", "22", "23", "24", "25"].includes(value)) {
    return { symbol: "cloud.heavyrain.fill", color: "#2563EB" }
  }
  if (["18", "19", "20", "29", "30", "31", "32"].includes(value)) {
    return { symbol: "cloud.fog.fill", color: "#94A3B8" }
  }
  return { symbol: "cloud.fill", color: "#94A3B8" }
}

function iconForDay(day: DayInfo): { symbol: string; color: string } {
  return day.codeDay ? iconForCode(day.codeDay) : iconForText(day.textDay)
}

function roundTemp(value: string | number): string {
  const number = parseFloat(String(value))
  return Number.isFinite(number) ? String(Math.round(number)) : "--"
}

function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 9) return "早晨好"
  if (hour >= 9 && hour < 12) return "上午好"
  if (hour >= 12 && hour < 14) return "中午好"
  if (hour >= 14 && hour < 18) return "下午好"
  if (hour >= 18 && hour < 23) return "晚上好"
  return "夜深了"
}

function windText(model: WeatherModel): string {
  const text = `${model.windDir || ""} ${model.windScale || ""}`.trim()
  return text || "微风"
}

function formatTemp(value: string | number): string {
  const number = parseFloat(String(value))
  if (!Number.isFinite(number)) return "--"
  return Number.isInteger(number) ? String(number) : number.toFixed(1)
}

function getNextTwoHolidays(): Array<{ name: string; md: string }> {
  const now = new Date()
  const year = now.getFullYear()
  const holidays = [
    { m: 1, d: 1, name: "元旦" },
    { m: 2, d: 17, name: "春节", y: 2026 },
    { m: 2, d: 6, name: "春节", y: 2027 },
    { m: 3, d: 3, name: "元宵节", y: 2026 },
    { m: 5, d: 1, name: "劳动节" },
    { m: 6, d: 19, name: "端午节", y: 2026 },
    { m: 6, d: 9, name: "端午节", y: 2027 },
    { m: 8, d: 19, name: "七夕节", y: 2026 },
    { m: 9, d: 25, name: "中秋节", y: 2026 },
    { m: 9, d: 15, name: "中秋节", y: 2027 },
    { m: 10, d: 18, name: "重阳节", y: 2026 },
    { m: 10, d: 1, name: "国庆节" },
    { m: 12, d: 25, name: "圣诞节" },
    { m: 2, d: 4, name: "立春" },
    { m: 2, d: 19, name: "雨水" },
    { m: 3, d: 5, name: "惊蛰" },
    { m: 3, d: 20, name: "春分" },
    { m: 4, d: 4, name: "清明" },
    { m: 4, d: 20, name: "谷雨" },
    { m: 5, d: 5, name: "立夏" },
    { m: 5, d: 21, name: "小满" },
    { m: 6, d: 5, name: "芒种" },
    { m: 6, d: 21, name: "夏至" },
    { m: 7, d: 7, name: "小暑" },
    { m: 7, d: 22, name: "大暑" },
    { m: 8, d: 7, name: "立秋" },
    { m: 8, d: 23, name: "处暑" },
    { m: 9, d: 7, name: "白露" },
    { m: 9, d: 23, name: "秋分" },
    { m: 10, d: 8, name: "寒露" },
    { m: 10, d: 23, name: "霜降" },
    { m: 11, d: 7, name: "立冬" },
    { m: 11, d: 22, name: "小雪" },
    { m: 12, d: 7, name: "大雪" },
    { m: 12, d: 21, name: "冬至" },
    { m: 1, d: 5, name: "小寒" },
    { m: 1, d: 20, name: "大寒" },
  ]

  const list: Array<{ name: string; dt: Date }> = []
  for (const holiday of holidays) {
    for (const candidateYear of [year, year + 1]) {
      if (holiday.y && holiday.y !== candidateYear) continue
      const dt = new Date(candidateYear, holiday.m - 1, holiday.d)
      const days = Math.ceil((dt.getTime() - now.getTime()) / 86400000)
      if (days >= 0) list.push({ name: holiday.name, dt })
    }
  }

  list.sort((a, b) => a.dt.getTime() - b.dt.getTime())
  const seen = new Set<string>()
  const result: Array<{ name: string; md: string }> = []
  for (const item of list) {
    if (seen.has(item.name)) continue
    seen.add(item.name)
    result.push({
      name: item.name,
      md: `${String(item.dt.getMonth() + 1).padStart(2, "0")}-${String(item.dt.getDate()).padStart(2, "0")}`,
    })
    if (result.length >= 2) break
  }
  return result
}

const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
  0x0d520,
]

const LUNAR_DAYS = [
  "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
]

const LUNAR_MONTHS = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"]

function lunarLeapMonth(year: number): number {
  return LUNAR_INFO[year - 1900] & 0xf
}

function lunarLeapDays(year: number): number {
  if (!lunarLeapMonth(year)) return 0
  return LUNAR_INFO[year - 1900] & 0x10000 ? 30 : 29
}

function lunarMonthDays(year: number, month: number): number {
  return LUNAR_INFO[year - 1900] & (0x10000 >> month) ? 30 : 29
}

function lunarYearDays(year: number): number {
  let sum = 348
  for (let mask = 0x8000; mask > 0x8; mask >>= 1) {
    sum += LUNAR_INFO[year - 1900] & mask ? 1 : 0
  }
  return sum + lunarLeapDays(year)
}

function lunarParts(date: Date): { month: number; day: number; isLeap: boolean } {
  const base = Date.UTC(1900, 0, 31)
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  let offset = Math.floor((utc - base) / 86400000)
  let year = 1900
  let temp = 0

  for (; year < 2101 && offset > 0; year++) {
    temp = lunarYearDays(year)
    offset -= temp
  }
  if (offset < 0) {
    offset += temp
    year--
  }

  const leap = lunarLeapMonth(year)
  let isLeap = false
  let month = 1

  for (; month < 13 && offset > 0; month++) {
    if (leap > 0 && month === leap + 1 && !isLeap) {
      month--
      isLeap = true
      temp = lunarLeapDays(year)
    } else {
      temp = lunarMonthDays(year, month)
    }
    if (isLeap && month === leap + 1) isLeap = false
    offset -= temp
  }

  if (offset === 0 && leap > 0 && month === leap + 1) {
    if (isLeap) {
      isLeap = false
    } else {
      isLeap = true
      month--
    }
  }
  if (offset < 0) {
    offset += temp
    month--
  }

  return { month, day: offset + 1, isLeap }
}

function lunarText(date: Date): string {
  const parts = lunarParts(date)
  return `农历${parts.isLeap ? "闰" : ""}${LUNAR_MONTHS[parts.month - 1]}月${LUNAR_DAYS[parts.day - 1]}`
}

function lunarShort(date: Date): string {
  const parts = lunarParts(date)
  if (parts.day === 1) return `${parts.isLeap ? "闰" : ""}${LUNAR_MONTHS[parts.month - 1]}月`
  return LUNAR_DAYS[parts.day - 1]
}

const SOLAR_TERMS = [
  "小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨", "立夏", "小满", "芒种", "夏至",
  "小暑", "大暑", "立秋", "处暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至",
]

const SOLAR_TERM_INFO = [
  0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551, 218072, 240693,
  263343, 285989, 308563, 331033, 353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758,
]

function solarTermName(date: Date): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  for (let index = (month - 1) * 2; index < month * 2; index++) {
    const time =
      Date.UTC(1900, 0, 6, 2, 5) +
      31556925974.7 * (year - 1900) +
      SOLAR_TERM_INFO[index] * 60000
    const termDate = new Date(time)
    if (termDate.getUTCMonth() + 1 === month && termDate.getUTCDate() === day) {
      return SOLAR_TERMS[index]
    }
  }
  return ""
}

/* ------------------------------------------------------------------
 * 小尺寸
 * ------------------------------------------------------------------ */

function MiniDayRow({ day }: { day: DayInfo }) {
  const icon = iconForDay(day)
  return (
    <HStack spacing={5}>
      <Text font={10} foregroundStyle={C.sub} lineLimit={1} frame={{ width: 30 }}>
        {day.week || day.date}
      </Text>
      <Image
        systemName={icon.symbol}
        resizable
        scaleToFit
        frame={{ width: 14, height: 14 }}
        foregroundStyle={icon.color}
      />
      <Text font={10} foregroundStyle={C.text} lineLimit={1}>
        {day.textDay || "—"}
      </Text>
      <Spacer />
      <Text font={10} foregroundStyle={C.sub}>
        {day.tempMin ? `${day.tempMin}°` : ""}
      </Text>
      <Text font={10} fontWeight="semibold" foregroundStyle={C.text}>
        {day.tempMax ? `${day.tempMax}°` : ""}
      </Text>
    </HStack>
  )
}

function SmallWidget({ model }: { model: WeatherModel }) {
  const icon = iconForText(model.weather)
  const today = model.daily[0]
  const nextDays = model.daily.slice(1, 3)

  return (
    <VStack alignment="leading" spacing={0} padding={13}>
      <HStack spacing={6}>
        <Text font={15} fontWeight="semibold" foregroundStyle={C.text} lineLimit={1}>
          {model.city}
        </Text>
        <Text font={9} foregroundStyle={C.sub} lineLimit={1}>
          {model.aqi ? `AQI ${model.aqi}` : ""}
        </Text>
        <Spacer />
        <Image
          systemName={icon.symbol}
          resizable
          scaleToFit
          frame={{ width: 22, height: 22 }}
          foregroundStyle={icon.color}
        />
      </HStack>

      <HStack alignment="bottom" spacing={4}>
        <Text font={40} fontWeight="bold" foregroundStyle={C.text} lineLimit={1}>
          {roundTemp(model.temp)}°
        </Text>
        <Spacer />
        <VStack alignment="trailing" spacing={0}>
          <Text font={10} foregroundStyle={C.sub} lineLimit={1}>
            {today && today.tempMax ? `最高 ${today.tempMax}°` : ""}
          </Text>
          <Text font={10} foregroundStyle={C.sub} lineLimit={1}>
            {today && today.tempMin ? `最低 ${today.tempMin}°` : ""}
          </Text>
        </VStack>
      </HStack>

      <Text font={11} foregroundStyle={C.sub} lineLimit={1}>
        {model.weather || "—"}
      </Text>

      <Spacer />
      <Rectangle fill={C.line} frame={{ height: 1 }} />
      <VStack spacing={2} padding={{ vertical: 3 }}>
        {nextDays.map((day) => (
          <MiniDayRow key={`${day.date}-${day.week}`} day={day} />
        ))}
      </VStack>
    </VStack>
  )
}

/* ------------------------------------------------------------------
 * 中尺寸
 * ------------------------------------------------------------------ */

function DayCell({ day, width }: { day: DayInfo; width: number }) {
  const icon = iconForDay(day)
  return (
    <VStack alignment="center" spacing={2} frame={{ width }}>
      <Text font={9} foregroundStyle={C.sub} lineLimit={1}>
        {day.week || day.date}
      </Text>
      <Image
        systemName={icon.symbol}
        resizable
        scaleToFit
        frame={{ width: 16, height: 16 }}
        foregroundStyle={icon.color}
      />
      <Text font={11} fontWeight="semibold" foregroundStyle={C.text} lineLimit={1}>
        {day.tempMax ? `${day.tempMax}°` : "—"}
      </Text>
    </VStack>
  )
}

function MediumWidget({ model }: { model: WeatherModel }) {
  const icon = iconForText(model.weather)
  const today = model.daily[0]
  const slots = [0, 1, 2, 3, 4, 5, 6]
  const widgetWidth = Widget.displaySize && Widget.displaySize.width ? Widget.displaySize.width : 338
  const cellWidth = Math.max(32, Math.min(42, Math.floor((widgetWidth - 24 - 18) / 7)))

  return (
    <VStack
      alignment="leading"
      spacing={6}
      padding={{ horizontal: 12, top: 12, bottom: 16 }}
    >
      <HStack alignment="center" spacing={8}>
        <VStack alignment="leading" spacing={1}>
          <HStack spacing={5}>
            <Text font={16} fontWeight="bold" foregroundStyle={C.text} lineLimit={1}>
              {model.city}
            </Text>
            <Text font={9} foregroundStyle={C.sub} lineLimit={1}>
              {model.aqi ? `AQI ${model.aqi}` : ""}
            </Text>
          </HStack>
          <Text font={10} foregroundStyle={C.sub} lineLimit={1}>
            {model.weather || "—"} · {windText(model)}
          </Text>
          <HStack alignment="bottom" spacing={5}>
            <Text font={30} fontWeight="bold" foregroundStyle={C.text} lineLimit={1}>
              {roundTemp(model.temp)}°
            </Text>
            <Text font={10} foregroundStyle={C.sub} lineLimit={1}>
              {today ? `H ${today.tempMax || "--"}°  L ${today.tempMin || "--"}°` : ""}
            </Text>
          </HStack>
        </VStack>
        <Spacer />
        <Image
          systemName={icon.symbol}
          resizable
          scaleToFit
          frame={{ width: 38, height: 38 }}
          foregroundStyle={icon.color}
        />
      </HStack>

      <Rectangle fill={C.line} frame={{ height: 1 }} />

      <HStack spacing={3}>
        {slots.map((index) =>
          model.daily[index] ? (
            <DayCell
              key={`${index}-${model.daily[index].date}`}
              day={model.daily[index]}
              width={cellWidth}
            />
          ) : (
            <VStack key={`empty-${index}`} frame={{ width: cellWidth }} />
          ),
        )}
      </HStack>

      <HStack spacing={8}>
        <Text font={9} foregroundStyle={C.sub} lineLimit={1}>
          湿度 {model.humidity || "—"}
        </Text>
        <Text font={9} foregroundStyle={C.sub} lineLimit={1}>
          降水 {model.rain ? `${model.rain}mm` : "—"}
        </Text>
        <Text font={9} foregroundStyle={C.sub} lineLimit={1}>
          能见度 {model.vis || "—"}
        </Text>
        <Spacer />
        <Text font={9} foregroundStyle={C.sub} lineLimit={1}>
          {model.time ? `${model.time} 更新` : ""}
        </Text>
      </HStack>
    </VStack>
  )
}

/* ------------------------------------------------------------------
 * 大尺寸
 * ------------------------------------------------------------------ */

function WeekStrip({ date }: { date: Date }) {
  const widgetWidth = Math.min(
    Widget.displaySize && Widget.displaySize.width ? Widget.displaySize.width : 364,
    364,
  )
  const cellWidth = (widgetWidth - 24) / 7
  const labels = ["一", "二", "三", "四", "五", "六", "日"]
  const monday = new Date(date)
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7))

  return (
    <HStack spacing={0} padding={{ vertical: 6 }}>
      {labels.map((label, index) => {
        const day = new Date(monday)
        day.setDate(monday.getDate() + index)
        const isToday =
          day.getFullYear() === date.getFullYear() &&
          day.getMonth() === date.getMonth() &&
          day.getDate() === date.getDate()
        const lunar = solarTermName(day) || lunarShort(day)

        return (
          <VStack key={label} alignment="center" spacing={0} frame={{ width: cellWidth }}>
            <Text font={10} foregroundStyle={C.sub} lineLimit={1}>
              {label}
            </Text>
            <ZStack alignment="center" frame={{ width: 34, height: 26 }}>
              {isToday ? (
                <RoundedRectangle
                  cornerRadius={10}
                  fill={{ light: "rgba(255,59,48,0.14)", dark: "rgba(255,69,58,0.20)" }}
                />
              ) : null}
              <Text
                font={15}
                fontWeight="semibold"
                foregroundStyle={isToday ? C.red : C.text}
                lineLimit={1}
              >
                {day.getDate()}
              </Text>
            </ZStack>
            <Text font={8} foregroundStyle={C.sub} lineLimit={1}>
              {lunar}
            </Text>
          </VStack>
        )
      })}
    </HStack>
  )
}

function NextDayCard({
  label,
  day,
  width,
}: {
  label: string
  day?: DayInfo
  width: number
}) {
  if (!day) {
    return <HStack frame={{ width }} />
  }
  const icon = iconForDay(day)

  return (
    <HStack alignment="center" spacing={6} frame={{ width }}>
      <Spacer />
      <Text font={13} foregroundStyle={C.sub} lineLimit={1}>
        {label}
      </Text>
      <Image
        systemName={icon.symbol}
        resizable
        scaleToFit
        frame={{ width: 22, height: 22 }}
        foregroundStyle={icon.color}
      />
      <Text font={13} fontWeight="semibold" foregroundStyle={C.text} lineLimit={1}>
        {day.tempMin ? `${day.tempMin}°-${day.tempMax}°` : "--"}
      </Text>
      <Spacer />
    </HStack>
  )
}

function LifeChip({ item, width }: { item: LifeInfo; width: number }) {
  return (
    <VStack alignment="center" spacing={2} frame={{ width }}>
      <Text font={11} foregroundStyle={C.sub} lineLimit={1}>
        {item.label}
      </Text>
      <Text font={13} fontWeight="semibold" foregroundStyle={C.text} lineLimit={1}>
        {item.hint}
      </Text>
    </VStack>
  )
}

function LargeWidget({ model, name }: { model: WeatherModel; name: string }) {
  const icon = iconForText(model.weather)
  const today = model.daily[0]
  const tomorrow = model.daily[1]
  const dayAfter = model.daily[2]
  const now = new Date()
  const greet = greetingFor(now.getHours())
  const greeting = name ? `${name}，${greet}！` : `${greet}！`
  const schedules = getNextTwoHolidays()
  const widgetWidth = Math.min(
    Widget.displaySize && Widget.displaySize.width ? Widget.displaySize.width : 364,
    364,
  )
  const contentWidth = widgetWidth - 24
  const lifeItems = model.life.slice(0, 4)
  const lifeWidth = lifeItems.length
    ? Math.floor((contentWidth - 6 * (lifeItems.length - 1)) / lifeItems.length)
    : 0

  return (
    <VStack
      alignment="leading"
      spacing={6}
      padding={{ horizontal: 12, top: 12, bottom: 20 }}
    >
      <HStack alignment="center" spacing={4}>
        <VStack alignment="leading" spacing={4} frame={{ width: 120 }}>
          <Text font={22} fontWeight="bold" foregroundStyle={C.text} lineLimit={1}>
            {now.getFullYear()} {now.getMonth() + 1}月
          </Text>

          <HStack
            spacing={0}
            padding={{ horizontal: 8, vertical: 2 }}
            background={
              <RoundedRectangle
                cornerRadius={6}
                fill={{ light: "rgba(175,82,222,0.15)", dark: "rgba(191,90,242,0.19)" }}
              />
            }
          >
            <Text
              font={12}
              fontWeight="bold"
              foregroundStyle={{ light: "#AF52DE", dark: "#BF5AF2" }}
              lineLimit={1}
            >
              日程
            </Text>
          </HStack>

          {schedules.map((schedule, index) => (
            <HStack key={`${schedule.name}-${schedule.md}`} spacing={6}>
              <RoundedRectangle
                cornerRadius={2}
                frame={{ width: 3, height: 28 }}
                fill={
                  index === 0
                    ? { light: "rgba(52,199,89,0.38)", dark: "rgba(48,209,88,0.38)" }
                    : { light: "rgba(255,149,0,0.38)", dark: "rgba(255,159,10,0.38)" }
                }
              />
              <Text font={13} foregroundStyle={C.text} lineLimit={1}>
                {schedule.name} {schedule.md}
              </Text>
            </HStack>
          ))}
        </VStack>

        <Spacer />

        <VStack alignment="center" spacing={0} frame={{ width: 96 }}>
          <Text font={68} fontWeight="bold" foregroundStyle={C.text} lineLimit={1}>
            {now.getDate()}
          </Text>
          <Text
            font={14}
            fontWeight="semibold"
            foregroundStyle={C.sub}
            lineLimit={1}
          >
            {greeting}
          </Text>
        </VStack>
      </HStack>

      <WeekStrip date={now} />

      <HStack alignment="center" spacing={10} padding={{ horizontal: 8 }}>
        <Image
          systemName={icon.symbol}
          resizable
          scaleToFit
          frame={{ width: 36, height: 36 }}
          foregroundStyle={icon.color}
        />
        <Text font={36} fontWeight="bold" foregroundStyle={C.text} lineLimit={1}>
          {formatTemp(model.temp)}°
        </Text>
        <VStack alignment="leading" spacing={1}>
          <Text font={14} foregroundStyle={C.sub} lineLimit={1}>
            {today ? `${today.tempMax || "--"}°-${today.tempMin || "--"}°` : ""}
          </Text>
          <Text font={13} foregroundStyle={C.sub} lineLimit={1}>
            {model.city} {model.weather}
          </Text>
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={1}>
          <Text font={12} foregroundStyle={C.sub} lineLimit={1}>
            AQI {model.aqi || "--"}
          </Text>
          <Text font={12} foregroundStyle={C.sub} lineLimit={1}>
            {windText(model)}
          </Text>
        </VStack>
      </HStack>

      <Spacer />

      <HStack alignment="center" spacing={16}>
        <NextDayCard label="明天" day={tomorrow} width={(contentWidth - 16) / 2} />
        <NextDayCard label="后天" day={dayAfter} width={(contentWidth - 16) / 2} />
      </HStack>

      <Spacer />
      <Spacer />

      {lifeItems.length > 0 ? (
        <HStack spacing={6}>
          {lifeItems.map((item) => (
            <LifeChip key={item.label} item={item} width={lifeWidth} />
          ))}
        </HStack>
      ) : null}
    </VStack>
  )
}

/* ------------------------------------------------------------------
 * 锁屏组件
 * ------------------------------------------------------------------ */

function AccessoryCircular({ model }: { model: WeatherModel }) {
  const icon = iconForText(model.weather)
  return (
    <VStack spacing={0}>
      <Image
        systemName={icon.symbol}
        resizable
        scaleToFit
        frame={{ width: 16, height: 16 }}
        foregroundStyle={icon.color}
      />
      <Text font={16} fontWeight="bold" lineLimit={1}>
        {roundTemp(model.temp)}°
      </Text>
      <Text font={9} lineLimit={1}>
        {model.city}
      </Text>
    </VStack>
  )
}

function AccessoryRectangular({ model }: { model: WeatherModel }) {
  const icon = iconForText(model.weather)
  const today = model.daily[0]
  return (
    <HStack spacing={8}>
      <Image
        systemName={icon.symbol}
        resizable
        scaleToFit
        frame={{ width: 26, height: 26 }}
        foregroundStyle={icon.color}
      />
      <VStack alignment="leading" spacing={0}>
        <Text font={13} fontWeight="bold" lineLimit={1}>
          {model.city}
        </Text>
        <Text font={12} lineLimit={1}>
          {roundTemp(model.temp)}° {model.weather}
        </Text>
        <Text font={10} lineLimit={1}>
          {today ? `${today.tempMin || "--"}° ~ ${today.tempMax || "--"}°` : ""}
        </Text>
      </VStack>
      <Spacer />
    </HStack>
  )
}

function AccessoryInline({ model }: { model: WeatherModel }) {
  return (
    <Text font={13} lineLimit={1}>
      {model.city} {roundTemp(model.temp)}° {model.weather}
    </Text>
  )
}

/* ------------------------------------------------------------------
 * 外壳与错误页
 * ------------------------------------------------------------------ */

function WidgetShell({ children }: { children?: any }) {
  const size =
    Widget.displaySize && Widget.displaySize.width && Widget.displaySize.height
      ? Widget.displaySize
      : { width: 364, height: 382 }

  return (
    <ZStack alignment="topLeading" widgetBackground={C.bg}>
      {children}
      <Button
        intent={RefreshWeatherIntent(undefined)}
        buttonStyle="plain"
      >
        <Rectangle
          fill="rgba(0,0,0,0.001)"
          frame={{ width: size.width, height: size.height }}
        />
      </Button>
    </ZStack>
  )
}

function ErrorWidget({ message }: { message: string }) {
  return (
    <VStack alignment="leading" spacing={6} padding={14}>
      <Text font={14} fontWeight="semibold" foregroundStyle={C.red} lineLimit={1}>
        天气加载失败
      </Text>
      <Text font={10} foregroundStyle={C.sub} lineLimit={3}>
        {message}
      </Text>
      <Spacer />
      <Text font={9} foregroundStyle={C.sub} lineLimit={2}>
        长按小组件 → 编辑小组件 → 检查城市和 source 参数
      </Text>
    </VStack>
  )
}

async function loadChinaWeather(cityName: string): Promise<WeatherModel> {
  const city = await resolveCity(cityName)
  const current = await fetchWeather(city.code)
  const seven = await fetch7Day(city.code)
  return buildModel(current, city.city, seven)
}

async function loadWeatherModel(config: {
  city: string
  source: WeatherSource
}): Promise<WeatherModel> {
  if (config.source === "weathercn") {
    return await loadChinaWeather(config.city)
  }

  try {
    return await fetchMojiWeather(config.city)
  } catch (mojiError) {
    try {
      return await loadChinaWeather(config.city)
    } catch (cnError) {
      const mojiText = mojiError instanceof Error ? mojiError.message : String(mojiError)
      const cnText = cnError instanceof Error ? cnError.message : String(cnError)
      throw new Error(`墨迹天气：${mojiText}；中国天气网回退：${cnText}`)
    }
  }
}

/* ------------------------------------------------------------------
 * 入口
 * ------------------------------------------------------------------ */

async function main() {
  const config = readConfig()

  try {
    const model = await loadWeatherModel(config)
    const family = String(Widget.family)

    let view: any
    if (family === "systemSmall") {
      view = <SmallWidget model={model} />
    } else if (
      family === "systemLarge" ||
      family === "systemExtraLarge" ||
      family === "systemExtraLargePortrait"
    ) {
      view = <LargeWidget model={model} name={config.name} />
    } else if (family === "accessoryCircular") {
      view = <AccessoryCircular model={model} />
    } else if (family === "accessoryRectangular") {
      view = <AccessoryRectangular model={model} />
    } else if (family === "accessoryInline") {
      view = <AccessoryInline model={model} />
    } else {
      view = <MediumWidget model={model} />
    }

    if (family.startsWith("accessory")) {
      Widget.present(view, {
        policy: "after",
        date: new Date(Date.now() + REFRESH_MINUTES * 60 * 1000),
      })
    } else {
      Widget.present(<WidgetShell>{view}</WidgetShell>, {
        policy: "after",
        date: new Date(Date.now() + REFRESH_MINUTES * 60 * 1000),
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    Widget.present(<WidgetShell><ErrorWidget message={message} /></WidgetShell>, {
      policy: "after",
      date: new Date(Date.now() + 10 * 60 * 1000),
    })
  }
}

void main()

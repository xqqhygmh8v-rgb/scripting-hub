// Static presets and demo data for Toki. Pure data — no scripting API.
import { TokiState, Identity, Account, Token, uid } from "./types"

export type Preset = [name: string, domain: string, category: string, color: string]

/** Common websites / apps for the 网站与 App page. */
export const SITE_PRESETS: Preset[] = [
  ["微信", "weixin.qq.com", "社交", "#07C160"], ["QQ", "qq.com", "社交", "#12B7F5"],
  ["微博", "weibo.com", "社交", "#E6162D"], ["小红书", "xiaohongshu.com", "社交", "#FF2442"],
  ["知乎", "zhihu.com", "社交", "#0066FF"], ["抖音", "douyin.com", "娱乐", "#FE2C55"],
  ["哔哩哔哩", "bilibili.com", "娱乐", "#FB7299"], ["网易云音乐", "music.163.com", "娱乐", "#E60026"],
  ["淘宝", "taobao.com", "购物", "#FF5000"], ["京东", "jd.com", "购物", "#E1251B"],
  ["拼多多", "pinduoduo.com", "购物", "#E02E24"], ["闲鱼", "goofish.com", "购物", "#FFDA44"],
  ["美团", "meituan.com", "出行", "#FFC300"], ["携程", "ctrip.com", "出行", "#2577E3"],
  ["12306", "12306.cn", "出行", "#3B6FD8"], ["高德地图", "amap.com", "出行", "#0091FF"],
  ["支付宝", "alipay.com", "支付金融", "#1677FF"], ["百度", "baidu.com", "工具", "#2932E1"],
  ["GitHub", "github.com", "开发", "#6E40C9"], ["Gitee", "gitee.com", "开发", "#C71D23"],
  ["Cloudflare", "cloudflare.com", "开发", "#F38020"], ["Vercel", "vercel.com", "开发", "#555555"],
  ["Google", "google.com", "工具", "#4285F4"], ["Apple ID", "apple.com", "工具", "#8E8E93"],
  ["Microsoft", "microsoft.com", "工具", "#00A4EF"], ["Notion", "notion.so", "工具", "#6B6B6B"],
  ["Figma", "figma.com", "工具", "#A259FF"], ["ChatGPT", "chatgpt.com", "AI", "#10A37F"],
  ["Claude", "claude.ai", "AI", "#D97757"], ["Gemini", "gemini.google.com", "AI", "#4796E3"],
  ["DeepSeek", "deepseek.com", "AI", "#4D6BFE"], ["Kimi", "kimi.com", "AI", "#1F1F1F"],
  ["豆包", "doubao.com", "AI", "#3C6CFF"], ["OpenRouter", "openrouter.ai", "AI", "#6467F2"],
  ["Steam", "steampowered.com", "游戏", "#1B2838"], ["Discord", "discord.com", "社交", "#5865F2"],
  ["Telegram", "telegram.org", "社交", "#26A5E4"], ["X", "x.com", "社交", "#3A3A3A"],
  ["Netflix", "netflix.com", "娱乐", "#E50914"], ["Spotify", "spotify.com", "娱乐", "#1DB954"],
  ["YouTube", "youtube.com", "娱乐", "#FF0000"], ["Binance", "binance.com", "加密", "#F0B90B"],
  ["Dropbox", "dropbox.com", "工具", "#0061FF"], ["Canva", "canva.com", "工具", "#00C4CC"],
  ["Outlook", "outlook.com", "工具", "#0078D4"], ["iCloud", "icloud.com", "工具", "#3693F3"],
  ["钉钉", "dingtalk.com", "工具", "#3296FA"], ["飞书", "feishu.cn", "工具", "#3370FF"],
]

/** API / token platforms for the Tokens page. */
export const TOKEN_PRESETS: Preset[] = [
  ["OpenAI", "openai.com", "AI API", "#10A37F"], ["Anthropic / Claude", "anthropic.com", "AI API", "#D97757"],
  ["DeepSeek", "deepseek.com", "AI API", "#4D6BFE"], ["Moonshot / Kimi", "moonshot.cn", "AI API", "#1F1F1F"],
  ["智谱 AI", "bigmodel.cn", "AI API", "#3859FF"], ["通义千问", "aliyun.com", "AI API", "#615CED"],
  ["豆包 / 火山", "volcengine.com", "AI API", "#3C6CFF"], ["OpenRouter", "openrouter.ai", "AI API", "#6467F2"],
  ["Gemini", "google.com", "AI API", "#4796E3"], ["Hugging Face", "huggingface.co", "AI API", "#FFB000"],
  ["Perplexity", "perplexity.ai", "AI API", "#20808D"], ["GitHub", "github.com", "GitHub", "#6E40C9"],
  ["Gitee", "gitee.com", "GitHub", "#C71D23"], ["GitLab", "gitlab.com", "GitHub", "#FC6D26"],
  ["Cloudflare", "cloudflare.com", "云服务", "#F38020"], ["Vercel", "vercel.com", "云服务", "#555555"],
  ["腾讯云", "cloud.tencent.com", "云服务", "#006EFF"], ["阿里云", "aliyun.com", "云服务", "#FF6A00"],
  ["AWS", "aws.amazon.com", "云服务", "#FF9900"], ["Supabase", "supabase.com", "数据库", "#3FCF8E"],
  ["MongoDB Atlas", "mongodb.com", "数据库", "#47A248"], ["Stripe", "stripe.com", "支付", "#635BFF"],
  ["PayPal", "paypal.com", "支付", "#003087"], ["OAuth / 自定义", "", "OAuth", "#0A84FF"],
]

export const IDENTITY_COLORS = [
  "#0A84FF", "#30D158", "#FF9F0A", "#FF375F", "#BF5AF2", "#64D2FF", "#FF453A", "#5E5CE6",
]

export function makeDemoState(): TokiState {
  const now = Date.now()
  const day = 86400000
  const email1: Identity = { id: uid(), type: "email", value: "me@gmail.com", label: "主力邮箱", color: "#0A84FF", notes: "", updatedAt: now }
  const phone1: Identity = { id: uid(), type: "phone", value: "+86 138 0000 1234", label: "主力手机", color: "#30D158", notes: "已实名", updatedAt: now }
  const email2: Identity = { id: uid(), type: "email", value: "dev@outlook.com", label: "开发专用", color: "#BF5AF2", notes: "", updatedAt: now }
  const phone2: Identity = { id: uid(), type: "phone", value: "+86 170 0000 5678", label: "副卡", color: "#FF9F0A", notes: "", esim: true, updatedAt: now }
  const wx: Identity = { id: uid(), type: "login", provider: "wechat", value: "toki_demo", label: "微信登录", color: "#07C160", via: phone1.id, notes: "", updatedAt: now }
  const identities = [email1, phone1, email2, phone2, wx]
  const mkAcc = (name: string, domain: string, category: string, identityIds: string[], notes = ""): Account => ({
    id: uid(), name, domain, category, identityIds, notes, createdAt: now, updatedAt: now,
  })
  const accounts: Account[] = [
    mkAcc("GitHub", "github.com", "开发", [email2.id, phone1.id], "已开两步验证"),
    mkAcc("ChatGPT", "chatgpt.com", "AI", [email1.id]),
    mkAcc("Claude", "claude.ai", "AI", [email1.id]),
    mkAcc("DeepSeek", "deepseek.com", "AI", [email1.id]),
    mkAcc("Cloudflare", "cloudflare.com", "开发", [email2.id]),
    mkAcc("Vercel", "vercel.com", "开发", [email2.id]),
    mkAcc("支付宝", "alipay.com", "支付金融", [phone1.id]),
    mkAcc("微信", "weixin.qq.com", "社交", [phone1.id, wx.id]),
    mkAcc("淘宝", "taobao.com", "购物", [phone2.id, wx.id]),
    mkAcc("哔哩哔哩", "bilibili.com", "娱乐", [phone2.id]),
    mkAcc("Notion", "notion.so", "工具", [email1.id]),
    mkAcc("Steam", "steampowered.com", "游戏", [email2.id]),
  ]
  const mkTok = (name: string, domain: string, category: string, color: string, expiresIn: number, notes: string): Token => ({
    id: uid(), name, domain, category, color, value: "", notes,
    expiresAt: expiresIn === 0 ? 0 : now + expiresIn * day,
    createdAt: now, updatedAt: now,
  })
  const tokens: Token[] = [
    mkTok("OpenAI", "openai.com", "AI API", "#10A37F", 3, "主力 key，记得轮换"),
    mkTok("GitHub PAT", "github.com", "GitHub", "#6E40C9", 30, "repo 权限"),
    mkTok("Cloudflare", "cloudflare.com", "云服务", "#F38020", 0, "不过期"),
    mkTok("旧测试 key", "openai.com", "AI API", "#FF453A", -2, "已过期，待删除"),
  ]
  return { identities, accounts, tokens, deleted: {} }
}

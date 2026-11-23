import { fetch } from 'scripting'
export type IconItem = { name: string; url: string }
export function filename(url: string): string {
 const last = url.split(/[?#]/)[0].split('/').filter(Boolean).pop() || '未命名图标集'
 try { return decodeURIComponent(last) } catch { return last }
}
export function normalize(url: string): string {
 return url.trim().replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:raw|blob)\/(?:refs\/heads\/)?/, 'https://raw.githubusercontent.com/$1/$2/')
}
export type Subscription = { icons: IconItem[]; sourceName: string; description: string; rawText: string }
export async function loadSubscription(input: string): Promise<Subscription> {
 const url = normalize(input)
 if (!/^https?:\/\/\S+$/.test(url)) throw Error('请输入 HTTP / HTTPS 链接')
 const response = await fetch(url, { timeout: 30, headers: { 'Cache-Control': 'no-cache' } })
 if (!response.ok) throw Error(`订阅请求失败（HTTP ${response.status}）`)
 const text = await response.text()
 if (text.length > 8 * 1024 * 1024) throw Error('订阅文件超过 8 MB 限制')
 let data: any
 try { data = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { throw Error('返回内容不是有效 JSON，请检查是否为文件直链') }
 if (!data || !Array.isArray(data.icons)) throw Error('不支持的格式：需要 icons 数组')
 if (data.icons.length > 10000) throw Error('单套图标集最多支持 10000 个图标')
 const icons: IconItem[] = data.icons.map((item: any, i: number) => {
  if (!item || typeof item.url !== 'string') throw Error(`第 ${i + 1} 个图标缺少 url`)
  let target = item.url.trim()
  if (target.startsWith('//')) target = 'https:' + target
  else if (!/^[a-z][a-z\d+.-]*:/i.test(target)) {
   const origin = url.match(/^https?:\/\/[^/]+/)?.[0] || ''
   target = target.startsWith('/') ? origin + target : url.split(/[?#]/)[0].replace(/[^/]*$/, '') + target
  }
  if (!/^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(target)) throw Error(`第 ${i + 1} 个图标链接无效`)
  return { name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : filename(target), url: normalize(target) }
 })
 if (!icons.length) throw Error('订阅中没有图标，保留原有数据')
 return { icons, sourceName: typeof data.name === 'string' ? data.name.trim() : '', description: typeof data.description === 'string' ? data.description.trim() : '', rawText: text }
}
export async function loadIcons(input: string): Promise<IconItem[]> {
 return (await loadSubscription(input)).icons
}

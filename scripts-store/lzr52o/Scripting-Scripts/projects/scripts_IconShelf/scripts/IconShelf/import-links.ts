// Formats supplied by the user. Opening a URL does not confirm installation.
export function loonIconLink(url: string): string {
 const value = url.trim()
 if (!/^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(value)) throw Error('图标集订阅地址无效')
 return 'https://www.nsloon.com/openloon/import?iconset=' + encodeURIComponent(value)
}
export function quantumultIconLink(url: string): string {
 const value = url.trim()
 if (!/^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(value)) throw Error('图标集订阅地址无效')
 return 'https://quantumult.app/x/open-app/ui?module=gallery&type=icon&action=add&content=' + encodeURIComponent(JSON.stringify([value]))
}

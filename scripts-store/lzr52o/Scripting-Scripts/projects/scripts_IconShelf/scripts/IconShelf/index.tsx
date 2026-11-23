/**
 * IconShelf — 图标集订阅管理
 * 作者：CookiePie
 */
import { Navigation, Script } from 'scripting'
import View from './View'
async function main() { await Navigation.present(<View />); Script.exit() }
main()

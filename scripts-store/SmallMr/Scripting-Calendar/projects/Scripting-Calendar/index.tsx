import { Navigation, Script } from 'scripting'
import { SettingsScreen } from './app/preferences'

async function main() {
  await Navigation.present({ element: <SettingsScreen /> })
  Script.exit()
}

main()

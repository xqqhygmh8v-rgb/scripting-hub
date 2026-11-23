import { ConfigItemProps } from "./type";

const Storage_Key = "rss_config";

export function getConfig(): ConfigItemProps[] {
  return Storage.get(Storage_Key) || [];
}

export function setConfig(config: ConfigItemProps[]) {
  Storage.set(Storage_Key, config);
}

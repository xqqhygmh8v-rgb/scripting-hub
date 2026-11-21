import { KEYCHAIN_TOKEN_KEY, STORAGE_KEY, WIDGET_CACHE_KEY } from "./constants"
import type { StoredSettings, WidgetData } from "./types"
import {
  DEFAULT_ICE_APPEARANCE,
  DEFAULT_WIDGET_GRADIENT_ID,
  DEFAULT_WIDGET_METRIC_IDS,
  DEFAULT_WIDGET_STYLE,
  normalizeWidgetConfiguration,
} from "./widget_config"

const defaultSettings: StoredSettings = {
  loginChannel: "app",
  paymentNumber: "",
  selectedAccount: null,
  linkedAccounts: [],
  customerNumber: null,
  lastSyncAt: null,
  localTariffText: "",
  localTariffSource: null,
  localTariffUpdatedAt: null,
  widgetStyle: DEFAULT_WIDGET_STYLE,
  widgetMetricIds: DEFAULT_WIDGET_METRIC_IDS,
  iceAppearance: DEFAULT_ICE_APPEARANCE,
  widgetGradientId: DEFAULT_WIDGET_GRADIENT_ID,
  customWidgetGradients: [],
}

export function readSettings(): StoredSettings {
  const saved = Storage.get<Omit<Partial<StoredSettings>, "loginChannel"> & { loginChannel?: string }>(STORAGE_KEY)
  const widgetConfiguration = normalizeWidgetConfiguration(saved)
  const normalizedLoginChannel = saved?.loginChannel === "wechat" ? "wechat" : "app"
  const settings: StoredSettings = {
    ...defaultSettings,
    ...saved,
    ...widgetConfiguration,
    loginChannel: normalizedLoginChannel,
  }
  return {
    ...settings,
    ...normalizeAccountSelection(settings),
  }
}

export function normalizeAccountSelection(
  settings: Pick<StoredSettings, "linkedAccounts" | "paymentNumber" | "selectedAccount">,
) {
  const paymentNumber = settings.paymentNumber.trim()
  const selectedFromPayment = paymentNumber
    ? settings.linkedAccounts.find((account) => account.accountNumber === paymentNumber) ?? null
    : null
  const selectedFromPrevious = settings.selectedAccount
    ? settings.linkedAccounts.find((account) => account.accountNumber === settings.selectedAccount?.accountNumber) ?? null
    : null
  const selectedAccount = selectedFromPayment
    ?? selectedFromPrevious
    ?? (settings.linkedAccounts.length === 1 ? settings.linkedAccounts[0] : null)

  return {
    selectedAccount,
    paymentNumber: paymentNumber || selectedAccount?.accountNumber || "",
  }
}

export function saveSettings(settings: StoredSettings) {
  Storage.set(STORAGE_KEY, settings)
}

export function patchSettings(patch: Partial<StoredSettings>) {
  saveSettings({
    ...readSettings(),
    ...patch,
  })
}

export function getAuthToken() {
  return Keychain.get(KEYCHAIN_TOKEN_KEY)
}

export function setAuthToken(token: string) {
  Keychain.set(KEYCHAIN_TOKEN_KEY, token)
}

export function clearAuthToken() {
  Keychain.remove(KEYCHAIN_TOKEN_KEY)
}

export function clearWidgetCache() {
  Storage.remove(WIDGET_CACHE_KEY)
}

export function clearAllSettings() {
  Storage.remove(STORAGE_KEY)
  clearWidgetCache()
  clearAuthToken()
}

export function readWidgetCache() {
  return Storage.get<WidgetData>(WIDGET_CACHE_KEY) ?? null
}

export function saveWidgetCache(data: WidgetData) {
  Storage.set(WIDGET_CACHE_KEY, data)
}

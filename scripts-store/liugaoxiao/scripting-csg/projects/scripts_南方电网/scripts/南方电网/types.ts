import type { IceAppearance, WidgetMetricId, WidgetStyle } from "./widget_config"
import type { WidgetGradientDefinition } from "./widget_gradients"

export type LoginChannel = "app" | "wechat"

export type CSGAccount = {
  accountNumber: string
  areaCode: string
  eleCustomerId: string
  meteringPointId: string
  meteringPointNumber: string
  address: string
  userName: string
}

export type StoredSettings = {
  loginChannel: LoginChannel
  paymentNumber: string
  selectedAccount: CSGAccount | null
  linkedAccounts: CSGAccount[]
  customerNumber: string | null
  lastSyncAt: string | null
  localTariffText: string
  localTariffSource: "image" | "manual" | null
  localTariffUpdatedAt: string | null
  widgetStyle: WidgetStyle
  widgetMetricIds: WidgetMetricId[]
  iceAppearance: IceAppearance
  widgetGradientId: string
  customWidgetGradients: WidgetGradientDefinition[]
}

export type MonthDayRecord = {
  date: string
  charge: number
  kwh: number
}

export type LadderInfo = {
  ladder: number | null
  remainingKwh: number | null
  tariff: number | null
}

export type WidgetData = {
  account: CSGAccount
  balance: number
  arrears: number
  monthTotalCharge: number | null
  previousMonthCharge?: number | null
  monthTotalKwh: number | null
  ladder: LadderInfo
  latestDay: MonthDayRecord | null
  yesterdayKwh: number | null
  refreshedAt: string
  lastBillAttemptAt?: string | null
}

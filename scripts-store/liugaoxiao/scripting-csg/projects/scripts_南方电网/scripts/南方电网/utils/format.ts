import type { CSGAccount } from "../types"

export function formatAmount(value: number | null | undefined, suffix = "元") {
  if (value == null || Number.isNaN(value)) {
    return "--"
  }
  return `${value.toFixed(2)}${suffix}`
}

export function formatKwh(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "--"
  }
  return `${value.toFixed(2)} kWh`
}

export function maskAccountNumber(accountNumber: string) {
  if (accountNumber.length <= 8) {
    return accountNumber
  }
  return `${accountNumber.slice(0, 4)} ${accountNumber.slice(4, 8)} ${accountNumber.slice(-4)}`
}

export function accountLabel(account: CSGAccount) {
  const title = account.userName?.trim() || "已绑定账户"
  const suffix = account.accountNumber.slice(-4) || account.accountNumber
  return `${title} · 尾号 ${suffix}`
}

export function findAccountByPaymentNumber(accounts: CSGAccount[], paymentNumber: string) {
  const normalized = paymentNumber.trim()
  if (!normalized) {
    return null
  }
  return accounts.find((item) => item.accountNumber === normalized) ?? null
}

export function formatTimestamp(isoString: string | null) {
  if (!isoString) {
    return "未同步"
  }
  return new Date(isoString).toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

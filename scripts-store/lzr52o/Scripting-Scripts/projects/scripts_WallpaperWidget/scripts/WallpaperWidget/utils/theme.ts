/**
 * 主题色板：粉色 / 绿色 / 蓝色 / 紫色 / 橙色 / 红色 / 青色 / 黄色 + 彩虹流光（动态）
 * 所有颜色均支持 light / dark 双模式，直接用于 foregroundStyle / background 等
 * 需要 DynamicShapeStyle 的字段（形如 { light, dark }）
 *
 * 液态玻璃：Scripting 框架（scripting.d.ts v1.1.1）已开放原生 glassEffect
 * （iOS 26.0+），设置页的卡片、横幅、按钮都用它；页面背景是跟主题色走的
 * 流光渐变，色相在主题色附近来回漂移，玻璃折射它才好看。
 */

import type { Color } from "scripting";

export type ThemeName =
  | "pink"
  | "green"
  | "blue"
  | "purple"
  | "orange"
  | "red"
  | "cyan"
  | "yellow"
  | "rainbow";

export interface ThemePalette {
  /** 主色 */
  primary: { light: Color; dark: Color };
  /** 浅色：用于渐变起始、边线点缀 */
  primaryLight: { light: Color; dark: Color };
  /** 渐变结束色（比 primary 再深一点） */
  primaryDeep: { light: Color; dark: Color };
  /** 主色相角（0–359）：流光背景以它为中心来回漂移 */
  baseHue: number;
  /** Icon 胶囊色 */
  iconRose: { light: Color; dark: Color };
  iconPeach: { light: Color; dark: Color };
  iconCoral: { light: Color; dark: Color };
  iconLilac: { light: Color; dark: Color };
  iconMauve: { light: Color; dark: Color };
  iconMint: { light: Color; dark: Color };
  /** 页面整体背景 */
  bgPage: { light: Color; dark: Color };
  /** 卡片背景（半透明，磨砂玻璃质感） */
  bgCard: { light: Color; dark: Color };
  /** 主文字色 */
  textPrimary: { light: Color; dark: Color };
  /** 次要文字色 */
  textSecondary: { light: Color; dark: Color };
  /** 分隔线 */
  divider: { light: Color; dark: Color };
  /** 卡片阴影色 */
  shadow: { light: Color; dark: Color };
  /** 错误 / 警示色 */
  danger: { light: Color; dark: Color };
}

/** 各主题共用的中性色 */
const neutrals = {
  textPrimary: { light: "#1F1B1D", dark: "#F5EEF1" },
  textSecondary: { light: "#8A7E84", dark: "#A89EA3" },
  danger: { light: "#FF3B6F", dark: "#FF6F97" },
};

/** 各主题共用的彩色小图标（只有 iconRose 跟主题主色走） */
const sharedIcons = {
  iconPeach: { light: "#FFA17A", dark: "#FFB599" },
  iconLilac: { light: "#C9A0FF", dark: "#D4B3FF" },
  iconMint: { light: "#7ED6C1", dark: "#95DFCE" },
};

/** 磨砂玻璃卡片：亮色半透明白，暗色半透明浅白 */
const glassCard = {
  light: "rgba(255,255,255,0.68)",
  dark: "rgba(255,255,255,0.09)",
};

function makeTheme(o: {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryLightDark: string;
  primaryDeep: string;
  primaryDeepDark: string;
  baseHue: number;
  bgPage: string;
  bgPageDark: string;
  divider: string;
  dividerDark: string;
  shadow: string;
  iconCoral: string;
  iconCoralDark: string;
  iconMauve: string;
  iconMauveDark: string;
}): ThemePalette {
  return {
    primary: { light: o.primary, dark: o.primaryDark },
    primaryLight: { light: o.primaryLight, dark: o.primaryLightDark },
    primaryDeep: { light: o.primaryDeep, dark: o.primaryDeepDark },
    baseHue: o.baseHue,
    iconRose: { light: o.primary, dark: o.primaryDark },
    iconPeach: sharedIcons.iconPeach,
    iconCoral: { light: o.iconCoral, dark: o.iconCoralDark },
    iconLilac: sharedIcons.iconLilac,
    iconMauve: { light: o.iconMauve, dark: o.iconMauveDark },
    iconMint: sharedIcons.iconMint,
    bgPage: { light: o.bgPage, dark: o.bgPageDark },
    bgCard: glassCard,
    textPrimary: neutrals.textPrimary,
    textSecondary: neutrals.textSecondary,
    divider: { light: o.divider, dark: o.dividerDark },
    shadow: { light: o.shadow, dark: "rgba(0,0,0,0.5)" },
    danger: neutrals.danger,
  };
}

/** 少女粉二次元主题（默认） */
export const pinkTheme: ThemePalette = makeTheme({
  primary: "#FF6B9D",
  primaryDark: "#FF8FB5",
  primaryLight: "#FFB6D9",
  primaryLightDark: "#FFA6CE",
  primaryDeep: "#FF4F89",
  primaryDeepDark: "#FF6F9F",
  baseHue: 340,
  bgPage: "#FFF5F8",
  bgPageDark: "#1A1416",
  divider: "#FFE4EE",
  dividerDark: "#3A2F33",
  shadow: "rgba(255,107,157,0.18)",
  iconCoral: "#FF6B8A",
  iconCoralDark: "#FF8CA5",
  iconMauve: "#E08BBF",
  iconMauveDark: "#EBA5CC",
});

/** 清新绿主题：过渡绿渐变 */
export const greenTheme: ThemePalette = makeTheme({
  primary: "#34C759",
  primaryDark: "#4CD964",
  primaryLight: "#A9E8BC",
  primaryLightDark: "#8FDCA6",
  primaryDeep: "#1E9E4A",
  primaryDeepDark: "#34B45C",
  baseHue: 140,
  bgPage: "#F2FBF4",
  bgPageDark: "#121A14",
  divider: "#DDF2E2",
  dividerDark: "#2A3A2E",
  shadow: "rgba(52,199,89,0.18)",
  iconCoral: "#2EAD5B",
  iconCoralDark: "#4CC878",
  iconMauve: "#5AC8A0",
  iconMauveDark: "#7AD3B2",
});

/** 天空蓝主题 */
export const blueTheme: ThemePalette = makeTheme({
  primary: "#0A84FF",
  primaryDark: "#409CFF",
  primaryLight: "#7CC4FF",
  primaryLightDark: "#6DB3F2",
  primaryDeep: "#0066CC",
  primaryDeepDark: "#1A80E0",
  baseHue: 210,
  bgPage: "#F2F7FF",
  bgPageDark: "#12161D",
  divider: "#DCEBFF",
  dividerDark: "#2A323E",
  shadow: "rgba(10,132,255,0.18)",
  iconCoral: "#0A84FF",
  iconCoralDark: "#409CFF",
  iconMauve: "#7AA5FF",
  iconMauveDark: "#93B8FF",
});

/** 梦幻紫主题 */
export const purpleTheme: ThemePalette = makeTheme({
  primary: "#AF52DE",
  primaryDark: "#C07AEB",
  primaryLight: "#D9A7F5",
  primaryLightDark: "#C99AEE",
  primaryDeep: "#8E3EC7",
  primaryDeepDark: "#A55CD6",
  baseHue: 280,
  bgPage: "#F9F2FF",
  bgPageDark: "#17121D",
  divider: "#EBDFFA",
  dividerDark: "#332A3E",
  shadow: "rgba(175,82,222,0.18)",
  iconCoral: "#AF52DE",
  iconCoralDark: "#C07AEB",
  iconMauve: "#C77DFF",
  iconMauveDark: "#D29CFF",
});

/** 活力橙主题 */
export const orangeTheme: ThemePalette = makeTheme({
  primary: "#FF9500",
  primaryDark: "#FFAA33",
  primaryLight: "#FFC46B",
  primaryLightDark: "#F5B95C",
  primaryDeep: "#E07B00",
  primaryDeepDark: "#F08C1A",
  baseHue: 32,
  bgPage: "#FFFBF2",
  bgPageDark: "#1D1712",
  divider: "#FFEFD6",
  dividerDark: "#3A2F24",
  shadow: "rgba(255,149,0,0.18)",
  iconCoral: "#FF9500",
  iconCoralDark: "#FFAA33",
  iconMauve: "#FFB85C",
  iconMauveDark: "#FFC978",
});

/** 热情红主题 */
export const redTheme: ThemePalette = makeTheme({
  primary: "#FF3B30",
  primaryDark: "#FF6B62",
  primaryLight: "#FF9A94",
  primaryLightDark: "#F08A84",
  primaryDeep: "#D70015",
  primaryDeepDark: "#E8322A",
  baseHue: 0,
  bgPage: "#FFF5F4",
  bgPageDark: "#1D1414",
  divider: "#FFE0DE",
  dividerDark: "#3A2A28",
  shadow: "rgba(255,59,48,0.18)",
  iconCoral: "#FF3B30",
  iconCoralDark: "#FF6B62",
  iconMauve: "#FF7A72",
  iconMauveDark: "#FF9A94",
});

/** 薄荷青主题 */
export const cyanTheme: ThemePalette = makeTheme({
  primary: "#00C7BE",
  primaryDark: "#32D4CB",
  primaryLight: "#7FE8E0",
  primaryLightDark: "#6EDCD4",
  primaryDeep: "#009E96",
  primaryDeepDark: "#00B3A8",
  baseHue: 174,
  bgPage: "#F2FBFA",
  bgPageDark: "#121A19",
  divider: "#D8F2EF",
  dividerDark: "#263A37",
  shadow: "rgba(0,199,190,0.18)",
  iconCoral: "#00C7BE",
  iconCoralDark: "#32D4CB",
  iconMauve: "#4DD8CF",
  iconMauveDark: "#6FE0D8",
});

/** 阳光黄主题 */
export const yellowTheme: ThemePalette = makeTheme({
  primary: "#FFCC00",
  primaryDark: "#FFD633",
  primaryLight: "#FFE27A",
  primaryLightDark: "#F5D96B",
  primaryDeep: "#E6A800",
  primaryDeepDark: "#F0B81A",
  baseHue: 48,
  bgPage: "#FFFCF2",
  bgPageDark: "#1D1A12",
  divider: "#FFF3CC",
  dividerDark: "#3A3424",
  shadow: "rgba(255,204,0,0.20)",
  iconCoral: "#FFCC00",
  iconCoralDark: "#FFD633",
  iconMauve: "#FFD94D",
  iconMauveDark: "#FFE06B",
});

export const THEMES: Record<Exclude<ThemeName, "rainbow">, ThemePalette> = {
  pink: pinkTheme,
  green: greenTheme,
  blue: blueTheme,
  purple: purpleTheme,
  orange: orangeTheme,
  red: redTheme,
  cyan: cyanTheme,
  yellow: yellowTheme,
};

export const THEME_OPTIONS: { value: ThemeName; label: string }[] = [
  { value: "pink", label: "少女粉" },
  { value: "green", label: "清新绿" },
  { value: "blue", label: "天空蓝" },
  { value: "purple", label: "梦幻紫" },
  { value: "orange", label: "活力橙" },
  { value: "red", label: "热情红" },
  { value: "cyan", label: "薄荷青" },
  { value: "yellow", label: "阳光黄" },
  { value: "rainbow", label: "彩虹流光" },
];

/** 按名字取静态色板，非法值回落到粉色 */
export const getTheme = (name: string | undefined | null): ThemePalette => {
  switch (name) {
    case "green":
      return greenTheme;
    case "blue":
      return blueTheme;
    case "purple":
      return purpleTheme;
    case "orange":
      return orangeTheme;
    case "red":
      return redTheme;
    case "cyan":
      return cyanTheme;
    case "yellow":
      return yellowTheme;
    default:
      return pinkTheme;
  }
};

/* ---------- 彩虹流光（动态）：按色相角算出一套色板 ---------- */

function hslToHex(h: number, s: number, l: number): string {
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = Math.max(0, Math.min(1, s));
  const ll = Math.max(0, Math.min(1, l));
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const f = (t: number) => {
    const tt = (((t % 1) + 1) % 1);
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const to255 = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to255(f(hh + 1 / 3))}${to255(f(hh))}${to255(f(hh - 1 / 3))}`;
}

/** 色相角 0–359，每变一次整套颜色跟着流动 */
export const rainbowPalette = (hue: number): ThemePalette => {
  const primary = hslToHex(hue, 0.75, 0.55);
  const primaryDark = hslToHex(hue, 0.8, 0.65);
  const primaryLight = hslToHex(hue, 0.85, 0.78);
  const primaryLightDark = hslToHex(hue, 0.8, 0.72);
  const primaryDeep = hslToHex(hue, 0.8, 0.45);
  const primaryDeepDark = hslToHex(hue, 0.8, 0.55);
  return {
    primary: { light: primary, dark: primaryDark },
    primaryLight: { light: primaryLight, dark: primaryLightDark },
    primaryDeep: { light: primaryDeep, dark: primaryDeepDark },
    baseHue: hue,
    iconRose: { light: primary, dark: primaryDark },
    iconPeach: sharedIcons.iconPeach,
    iconCoral: {
      light: hslToHex(hue, 0.75, 0.5),
      dark: hslToHex(hue, 0.8, 0.6),
    },
    iconLilac: sharedIcons.iconLilac,
    iconMauve: {
      light: hslToHex((hue + 40) % 360, 0.7, 0.65),
      dark: hslToHex((hue + 40) % 360, 0.75, 0.72),
    },
    iconMint: sharedIcons.iconMint,
    bgPage: {
      light: hslToHex(hue, 0.6, 0.97),
      dark: hslToHex(hue, 0.3, 0.08),
    },
    bgCard: glassCard,
    textPrimary: neutrals.textPrimary,
    textSecondary: neutrals.textSecondary,
    divider: {
      light: hslToHex(hue, 0.6, 0.9),
      dark: hslToHex(hue, 0.25, 0.18),
    },
    shadow: { light: `rgba(0,0,0,0.12)`, dark: "rgba(0,0,0,0.5)" },
    danger: neutrals.danger,
  };
};

/* ---------- 流光背景：按色相角算出三段渐变色（浅端 / 中间 / 浅端） ---------- */

/** 给定色相角，返回亮/暗模式下流光背景的三段渐变色 */
export function flowColors(hue: number): {
  light: [string, string, string];
  dark: [string, string, string];
} {
  return {
    light: [
      hslToHex(hue, 0.85, 0.78),
      hslToHex(hue, 0.6, 0.97),
      hslToHex(hue, 0.85, 0.78),
    ],
    dark: [
      hslToHex(hue, 0.75, 0.5),
      hslToHex(hue, 0.3, 0.08),
      hslToHex(hue, 0.75, 0.5),
    ],
  };
}

/* ---------- 兼容旧版：以下具名导出即粉色主题 ---------- */

export const primary = pinkTheme.primary;
export const primaryLight = pinkTheme.primaryLight;
export const primaryDeep = pinkTheme.primaryDeep;
export const iconRose = pinkTheme.iconRose;
export const iconPeach = pinkTheme.iconPeach;
export const iconCoral = pinkTheme.iconCoral;
export const iconLilac = pinkTheme.iconLilac;
export const iconMauve = pinkTheme.iconMauve;
export const iconMint = pinkTheme.iconMint;
export const bgPage = pinkTheme.bgPage;
export const bgCard = pinkTheme.bgCard;
export const textPrimary = pinkTheme.textPrimary;
export const textSecondary = pinkTheme.textSecondary;
export const divider = pinkTheme.divider;
export const shadow = pinkTheme.shadow;
export const danger = pinkTheme.danger;

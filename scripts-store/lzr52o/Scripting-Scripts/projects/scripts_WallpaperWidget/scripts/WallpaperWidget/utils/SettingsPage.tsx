import {
  NavigationStack,
  ScrollView,
  VStack,
  HStack,
  ZStack,
  Text,
  Image,
  Spacer,
  Toggle,
  Picker,
  TextField,
  TapGesture,
  Widget,
  gradient,
  useObservable,
  useEffect,
  useRef,
  type Color,
  type VirtualNode,
} from "scripting";
import { loadConfig, saveConfig } from "./storage";
import {
  DEFAULT_REFRESH_SECONDS,
  MAX_RANDOM_ID,
  validateId,
} from "./utils";
import {
  flowColors,
  getTheme,
  rainbowPalette,
  THEME_OPTIONS,
  type ThemeName,
  type ThemePalette,
} from "./theme";

interface SettingsPageProps {
  onBack: () => void;
}

const refreshOptions = [
  { value: 60, label: "1分钟" },
  { value: 120, label: "2分钟" },
  { value: 300, label: "5分钟" },
  { value: 600, label: "10分钟" },
  { value: 1800, label: "30分钟" },
  { value: 3600, label: "1小时" },
];

/** imageId 输入防抖延时（毫秒） */
const IMAGE_ID_DEBOUNCE_MS = 400;

/* ---------- 小部件 ---------- */

function RowIcon({
  name,
  color,
}: {
  name: string;
  color: { light: Color; dark: Color };
}) {
  return (
    <ZStack
      frame={{ width: 34, height: 34 }}
      background={{
        style: color,
        shape: { type: "rect", cornerRadius: 9 },
      }}
    >
      <Image
        systemName={name}
        foregroundStyle="white"
        font={15}
        fontWeight="semibold"
      />
    </ZStack>
  );
}

function SectionTitle({
  children,
  t,
}: {
  children: string;
  t: ThemePalette;
}) {
  return (
    <Text
      padding={{ leading: 20, bottom: 6, top: 4 }}
      font={13}
      fontWeight="semibold"
      foregroundStyle={t.primary}
      textCase="uppercase"
    >
      {children}
    </Text>
  );
}

function SectionFooter({
  children,
  t,
}: {
  children: string;
  t: ThemePalette;
}) {
  return (
    <Text
      padding={{ leading: 20, trailing: 20, top: 6 }}
      font={12}
      foregroundStyle={t.textSecondary}
    >
      {children}
    </Text>
  );
}

function Card({
  children,
  t,
}: {
  children:
    | VirtualNode
    | boolean
    | undefined
    | null
    | (VirtualNode | boolean | undefined | null)[];
  t: ThemePalette;
}) {
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={{ horizontal: 14 }}
      frame={{ maxWidth: Infinity, alignment: "leading" }}
      glassEffect={{ type: "rect", cornerRadius: 18 }}
      shadow={{ color: t.shadow.light, radius: 10, y: 4 }}
    >
      {children}
    </VStack>
  );
}

function RowDivider({ t }: { t: ThemePalette }) {
  return (
    <HStack
      frame={{ maxWidth: Infinity, height: 1 }}
      background={t.divider}
    />
  );
}

/* ---------- 主页面 ---------- */

export function SettingsPage({ onBack }: SettingsPageProps) {
  const imageId = useObservable<string>("");
  const imageIdError = useObservable<string>("");
  const refreshInterval = useObservable<number>(DEFAULT_REFRESH_SECONDS);
  const isAutoRefreshing = useObservable<boolean>(false);
  const themeName = useObservable<ThemeName>("pink");
  /** 彩虹流光的当前色相角（0–359），定时器每 1.5 秒推进一次 */
  const hue = useObservable<number>(0);
  /** 非彩虹主题：背景色相在主题色附近的漂移量（-30～+30），来回流动 */
  const drift = useObservable<number>(0);
  const driftDir = useRef<number>(1);

  const imageIdDebounceTimer = useRef<number | undefined>(undefined);

  // 当前色板：彩虹主题按色相角动态算，其他主题取静态色板
  const t =
    themeName.value === "rainbow"
      ? rainbowPalette(hue.value)
      : getTheme(themeName.value);

  // 彩虹主题：定时流动色相；切走别的主题就停掉
  useEffect(() => {
    if (themeName.value !== "rainbow") return;
    const id = setInterval(() => {
      hue.setValue((hue.value + 12) % 360);
    }, 1500);
    return () => clearInterval(id);
  }, [themeName.value]);

  // 非彩虹主题：背景色相在主题色附近 ±30° 来回漂移，形成缓慢流光
  useEffect(() => {
    if (themeName.value === "rainbow") return;
    const id = setInterval(() => {
      let next = drift.value + 8 * driftDir.current;
      if (next >= 30) {
        next = 30;
        driftDir.current = -1;
      } else if (next <= -30) {
        next = -30;
        driftDir.current = 1;
      }
      drift.setValue(next);
    }, 1500);
    return () => clearInterval(id);
  }, [themeName.value]);

  // 流光背景的当前色相：彩虹用流动色相，普通主题用主题色 + 漂移
  const flowHue =
    themeName.value === "rainbow" ? hue.value : t.baseHue + drift.value;
  const flow = flowColors(flowHue);

  useEffect(() => {
    const config = loadConfig();
    if (config) {
      imageId.setValue(config.imageId || "");
      const interval = parseInt(config.refreshInterval, 10);
      refreshInterval.setValue(
        Number.isFinite(interval) ? interval : DEFAULT_REFRESH_SECONDS
      );
      isAutoRefreshing.setValue(Boolean(config.isAutoRefreshing));
      const savedTheme = config.theme as ThemeName;
      themeName.setValue(
        THEME_OPTIONS.some((o) => o.value === savedTheme)
          ? savedTheme
          : "pink"
      );
    }
    return () => {
      if (imageIdDebounceTimer.current != null) {
        clearTimeout(imageIdDebounceTimer.current);
      }
    };
  }, []);

  function persistNow(overrides?: {
    imageId?: string;
    refreshInterval?: number;
    isAutoRefreshing?: boolean;
    theme?: ThemeName;
  }) {
    saveConfig({
      imageId: overrides?.imageId ?? imageId.value,
      refreshInterval: String(
        overrides?.refreshInterval ?? refreshInterval.value
      ),
      isAutoRefreshing:
        overrides?.isAutoRefreshing ?? isAutoRefreshing.value,
      theme: overrides?.theme ?? themeName.value,
    });
  }

  function onImageIdChanged(v: string) {
    imageId.setValue(v);
    const result = validateId(v);
    imageIdError.setValue(result.valid ? "" : result.error ?? "");

    if (imageIdDebounceTimer.current != null) {
      clearTimeout(imageIdDebounceTimer.current);
    }
    if (!result.valid) return;
    imageIdDebounceTimer.current = setTimeout(() => {
      persistNow({ imageId: v });
    }, IMAGE_ID_DEBOUNCE_MS);
  }

  function onRefreshIntervalChanged(v: number) {
    refreshInterval.setValue(v);
    persistNow({ refreshInterval: v });
  }

  function onAutoRefreshingChanged(v: boolean) {
    isAutoRefreshing.setValue(v);
    persistNow({ isAutoRefreshing: v });
  }

  function onThemeChanged(v: ThemeName) {
    themeName.setValue(v);
    drift.setValue(0);
    driftDir.current = 1;
    persistNow({ theme: v });
  }

  async function previewWidget() {
    await Widget.preview({ family: "systemMedium" });
  }

  /* ---------- Banner（液态玻璃） ---------- */
  const banner = (
    <ZStack
      alignment="leading"
      frame={{ maxWidth: Infinity, height: 140 }}
      glassEffect={{ type: "rect", cornerRadius: 24 }}
      shadow={{ color: t.shadow.light, radius: 16, y: 8 }}
      clipped
    >
      {/* 右侧装饰 sparkles */}
      <HStack frame={{ maxWidth: Infinity, alignment: "trailing" }}>
        <Image
          systemName="sparkles"
          font={88}
          fontWeight="bold"
          foregroundStyle={t.primaryLight}
          padding={{ trailing: 18 }}
        />
      </HStack>

      {/* 左侧文案 */}
      <VStack
        alignment="leading"
        spacing={6}
        padding={{ leading: 22, vertical: 22 }}
      >
        <HStack spacing={6}>
          <Image
            systemName="heart.fill"
            font={13}
            foregroundStyle={t.primary}
          />
          <Text
            font={12}
            fontWeight="semibold"
            foregroundStyle={t.primary}
          >
            ACG · 二次元壁纸
          </Text>
        </HStack>
        <Text
          font={28}
          fontWeight="bold"
          foregroundStyle={t.textPrimary}
        >
          壁纸组件
        </Text>
        <Text
          font={13}
          foregroundStyle={t.textSecondary}
        >
          每次刷新都是一期一会
        </Text>
      </VStack>
    </ZStack>
  );

  /* ---------- 预览按钮（液态玻璃大按钮） ---------- */
  const previewButton = (
    <HStack
      spacing={8}
      padding={{ vertical: 14, horizontal: 18 }}
      frame={{ maxWidth: Infinity }}
      glassEffect={{ type: "rect", cornerRadius: 16 }}
      shadow={{ color: t.shadow.light, radius: 10, y: 4 }}
      contentShape="rect"
      gesture={{
        gesture: TapGesture().onEnded(previewWidget),
        mask: "gesture",
      }}
    >
      <Image
        systemName="eye.fill"
        font={16}
        fontWeight="semibold"
        foregroundStyle={t.primary}
      />
      <Text
        font={16}
        fontWeight="semibold"
        foregroundStyle={t.primary}
      >
        预览组件效果
      </Text>
      <Spacer />
      <Image
        systemName="chevron.right"
        font={13}
        fontWeight="bold"
        foregroundStyle={t.textSecondary}
      />
    </HStack>
  );

  /* ---------- Row: 界面颜色 Picker ---------- */
  const currentThemeLabel =
    THEME_OPTIONS.find((o) => o.value === themeName.value)?.label ?? "少女粉";

  const themeRow = (
    <HStack padding={{ vertical: 14 }}>
      <RowIcon name="paintpalette.fill" color={t.iconMint} />
      <Text
        padding={{ leading: 12 }}
        font={16}
        fontWeight="medium"
        foregroundStyle={t.textPrimary}
      >
        界面颜色
      </Text>
      <Spacer />
      <Picker
        value={themeName.value}
        onChanged={onThemeChanged}
        pickerStyle="menu"
        label={
          <HStack spacing={4}>
            <Text
              font={14}
              fontWeight="medium"
              foregroundStyle={t.primary}
            >
              {currentThemeLabel}
            </Text>
            <Image
              systemName="chevron.up.chevron.down"
              font={11}
              fontWeight="semibold"
              foregroundStyle={t.textSecondary}
            />
          </HStack>
        }
      >
        {THEME_OPTIONS.map((o) => (
          <Text key={o.value} tag={o.value}>
            {o.label}
          </Text>
        ))}
      </Picker>
    </HStack>
  );

  /* ---------- Row: 图片 ID ---------- */
  const imageIdRow = (
    <HStack padding={{ vertical: 14 }}>
      <RowIcon name="number" color={t.iconPeach} />
      <VStack alignment="leading" spacing={2} padding={{ leading: 12 }}>
        <Text font={16} fontWeight="medium" foregroundStyle={t.textPrimary}>
          图片 ID
        </Text>
        <Text font={11} foregroundStyle={t.textSecondary}>
          留空为随机
        </Text>
      </VStack>
      <Spacer />
      <TextField
        title=""
        prompt="随机"
        value={imageId.value}
        onChanged={onImageIdChanged}
        keyboardType="numberPad"
        frame={{ width: 90 }}
        multilineTextAlignment="trailing"
        foregroundStyle={t.textPrimary}
      />
    </HStack>
  );

  /* ---------- Row: 自动刷新 Toggle ---------- */
  const autoRefreshRow = (
    <HStack padding={{ vertical: 14 }}>
      <RowIcon name="arrow.triangle.2.circlepath" color={t.iconRose} />
      <Text
        padding={{ leading: 12 }}
        font={16}
        fontWeight="medium"
        foregroundStyle={t.textPrimary}
      >
        自动刷新
      </Text>
      <Spacer />
      <Toggle
        title=""
        frame={{ width: 50 }}
        value={isAutoRefreshing.value}
        onChanged={onAutoRefreshingChanged}
        tint={t.primary}
      />
    </HStack>
  );

  /* ---------- Row: 刷新间隔 Picker ---------- */
  const currentIntervalLabel =
    refreshOptions.find((o) => o.value === refreshInterval.value)?.label ??
    `${refreshInterval.value} 秒`;

  const intervalRow = (
    <HStack padding={{ vertical: 14 }}>
      <RowIcon name="clock.fill" color={t.iconLilac} />
      <Text
        padding={{ leading: 12 }}
        font={16}
        fontWeight="medium"
        foregroundStyle={t.textPrimary}
      >
        刷新间隔
      </Text>
      <Spacer />
      <Picker
        value={refreshInterval.value}
        onChanged={onRefreshIntervalChanged}
        pickerStyle="menu"
        label={
          <HStack spacing={4}>
            <Text
              font={14}
              fontWeight="medium"
              foregroundStyle={t.primary}
            >
              {currentIntervalLabel}
            </Text>
            <Image
              systemName="chevron.up.chevron.down"
              font={11}
              fontWeight="semibold"
              foregroundStyle={t.textSecondary}
            />
          </HStack>
        }
      >
        {refreshOptions.map((o) => (
          <Text key={o.value} tag={o.value}>
            {o.label}
          </Text>
        ))}
      </Picker>
    </HStack>
  );

  /* ---------- Row: 关于 ---------- */
  const aboutRow = (
    <HStack padding={{ vertical: 14 }}>
      <RowIcon name="sparkles" color={t.iconMauve} />
      <Text
        padding={{ leading: 12 }}
        font={16}
        fontWeight="medium"
        foregroundStyle={t.textPrimary}
      >
        数据来源
      </Text>
      <Spacer />
      <Text font={14} foregroundStyle={t.textSecondary}>
        ACG 图库
      </Text>
    </HStack>
  );

  const versionRow = (
    <HStack padding={{ vertical: 14 }}>
      <RowIcon name="checkmark.seal.fill" color={t.iconMint} />
      <Text
        padding={{ leading: 12 }}
        font={16}
        fontWeight="medium"
        foregroundStyle={t.textPrimary}
      >
        版本
      </Text>
      <Spacer />
      <Text font={14} foregroundStyle={t.textSecondary}>
        v1.2.6
      </Text>
    </HStack>
  );

  /* ---------- Footer 文本 ---------- */
  const imageFooterText = imageIdError.value
    ? imageIdError.value
    : `输入 1-${MAX_RANDOM_ID} 的数字，留空则每次随机`;

  const refreshFooterText = isAutoRefreshing.value
    ? `每 ${
        refreshInterval.value >= 60
          ? Math.floor(refreshInterval.value / 60) + " 分钟"
          : refreshInterval.value + " 秒"
      }为你换一张 ✨`
    : "自动刷新已关闭，组件会乖乖保持当前图片 (｡･ω･｡)";

  const imageFooterColor = imageIdError.value ? t.danger : t.textSecondary;

  return (
    <NavigationStack>
      <ScrollView
        navigationTitle="壁纸组件"
        navigationBarTitleDisplayMode="inline"
        toolbarTitleDisplayMode="inline"
        toolbarBackgroundVisibility={{ visibility: "hidden", bars: ["navigationBar"] }}
        background={
          <ZStack
            ignoresSafeArea
            frame={{ maxWidth: Infinity, maxHeight: Infinity }}
            background={{
              light: gradient("linear", {
                colors: flow.light,
                startPoint: "topLeading",
                endPoint: "bottomTrailing",
              }),
              dark: gradient("linear", {
                colors: flow.dark,
                startPoint: "topLeading",
                endPoint: "bottomTrailing",
              }),
            }}
          />
        }
        toolbar={{
          topBarLeading: (
            <HStack
              spacing={4}
              padding={{ horizontal: 12, vertical: 7 }}
              glassEffect="capsule"
              contentShape="rect"
              gesture={{
                gesture: TapGesture().onEnded(onBack),
                mask: "gesture",
              }}
            >
              <Image
                systemName="chevron.left"
                font={15}
                fontWeight="semibold"
                foregroundStyle={t.primary}
              />
              <Text
                font={16}
                foregroundStyle={t.primary}
              >
                返回
              </Text>
            </HStack>
          ),
        }}
      >
        <VStack
          alignment="leading"
          spacing={18}
          padding={{ horizontal: 16, top: 8, bottom: 40 }}
        >
          {/* Banner */}
          {banner}

          {/* 预览大按钮 */}
          {previewButton}

          {/* 外观 */}
          <VStack alignment="leading" spacing={0}>
            <SectionTitle t={t}>外观</SectionTitle>
            <Card t={t}>{themeRow}</Card>
            <SectionFooter t={t}>
              {themeName.value === "rainbow"
                ? "彩虹流光：颜色每 1.5 秒流动一次"
                : "换个颜色，整页跟着变"}
            </SectionFooter>
          </VStack>

          {/* 图片设置 */}
          <VStack alignment="leading" spacing={0}>
            <SectionTitle t={t}>图片设置</SectionTitle>
            <Card t={t}>{imageIdRow}</Card>
            <Text
              padding={{ leading: 20, trailing: 20, top: 6 }}
              font={12}
              foregroundStyle={imageFooterColor}
            >
              {imageFooterText}
            </Text>
          </VStack>

          {/* 刷新设置（C：Toggle 打开才展开间隔行） */}
          <VStack alignment="leading" spacing={0}>
            <SectionTitle t={t}>刷新设置</SectionTitle>
            <Card t={t}>
              {autoRefreshRow}
              {isAutoRefreshing.value && <RowDivider t={t} />}
              {isAutoRefreshing.value && intervalRow}
            </Card>
            <SectionFooter t={t}>{refreshFooterText}</SectionFooter>
          </VStack>

          {/* 关于 */}
          <VStack alignment="leading" spacing={0}>
            <SectionTitle t={t}>关于</SectionTitle>
            <Card t={t}>
              {aboutRow}
              <RowDivider t={t} />
              {versionRow}
            </Card>
          </VStack>

          {/* 底部装饰 */}
          <HStack
            frame={{ maxWidth: Infinity }}
            padding={{ top: 8 }}
            spacing={6}
          >
            <Spacer />
            <Image
              systemName="heart.fill"
              font={10}
              foregroundStyle={t.primaryLight}
            />
            <Text font={11} foregroundStyle={t.textSecondary}>
              Made with love
            </Text>
            <Image
              systemName="heart.fill"
              font={10}
              foregroundStyle={t.primaryLight}
            />
            <Spacer />
          </HStack>
        </VStack>
      </ScrollView>
    </NavigationStack>
  );
}

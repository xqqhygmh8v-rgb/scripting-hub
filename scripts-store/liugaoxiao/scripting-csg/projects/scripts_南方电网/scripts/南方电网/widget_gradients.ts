export type WidgetGradientDefinition = {
  id: string
  label: string
  colors: string[]
  tone: "light" | "dark"
  custom?: boolean
}

export const DEFAULT_WIDGET_GRADIENT_ID = "mist-blue"

export const WIDGET_GRADIENTS: WidgetGradientDefinition[] = [
  createGradientDefinition(["#1F2D3A", "#496B7B", "#8FB9C2"], "mist-blue", "雾霭蓝", false),
  createGradientDefinition(["#15383C", "#34756E", "#82B9A8"], "turquoise", "松石青", false),
  createGradientDefinition(["#252C33", "#56636C", "#A2B1B8"], "graphite", "石墨银", false),
  createGradientDefinition(["#29423D", "#678779", "#B0CAB9"], "morning-green", "晨雾绿", false),
  createGradientDefinition(["#AFD7EC", "#537579"], "wake-blue", "唤醒蓝", false),
  createGradientDefinition(["#FADDA7", "#70C7DA"], "warm-cyan", "暖阳青", false),
]

export function extractHexColors(text: string) {
  const matches = text.match(/#[0-9a-f]{6}\b/gi) ?? []
  return [...new Set(matches.map((value) => normalizeHex(value)).filter((value): value is string => Boolean(value)))]
}

export function createCustomWidgetGradient(colors: readonly string[]): WidgetGradientDefinition {
  const normalized = uniqueColors(colors)
  if (normalized.length < 2) {
    throw new Error("至少需要两个有效颜色")
  }
  const resolved = normalized.length === 2
    ? [normalized[0], mixHex(normalized[0], normalized[1]), normalized[1]]
    : normalized.slice(0, 3)
  return createGradientDefinition(resolved, "custom", "导入配色", true)
}

export function normalizeCustomWidgetGradient(value: unknown): WidgetGradientDefinition | null {
  if (!isRecord(value) || value.id !== "custom" || !Array.isArray(value.colors)) {
    return null
  }
  try {
    return createCustomWidgetGradient(value.colors.filter((item): item is string => typeof item === "string"))
  } catch {
    return null
  }
}

export function appendCustomWidgetGradient(
  customGradients: readonly WidgetGradientDefinition[],
  gradient: WidgetGradientDefinition,
) {
  let index = 1
  while (customGradients.some((item) => item.id === `custom-${index}`)) index += 1
  return [
    ...customGradients,
    {
      ...gradient,
      id: `custom-${index}`,
      label: `导入配色 ${index}`,
      custom: true,
    },
  ]
}

export function resolveWidgetGradient(
  id: unknown,
  customGradients: readonly WidgetGradientDefinition[] | WidgetGradientDefinition | null | undefined,
) {
  const singleGradient = customGradients as WidgetGradientDefinition | null | undefined
  const customList: readonly WidgetGradientDefinition[] = Array.isArray(customGradients)
    ? customGradients as WidgetGradientDefinition[]
    : singleGradient?.custom
      ? [singleGradient]
      : []
  const custom = customList.find((gradient) => gradient.id === id)
  if (custom) return custom
  return WIDGET_GRADIENTS.find((gradient) => gradient.id === id) ?? WIDGET_GRADIENTS[0]
}

export async function importWidgetGradientsFromPhotos() {
  const results = await Photos.pick({ filter: PHPickerFilter.images(), limit: 6 })
  if (results.length === 0) throw new Error("未选择可用图片")

  const gradients: WidgetGradientDefinition[] = []
  const messages: string[] = []
  let failureCount = 0
  for (const result of results) {
    const image = await result.uiImage()
    if (!image) {
      failureCount += 1
      continue
    }
    try {
      const imported = await createWidgetGradientFromImage(image)
      gradients.push(imported.gradient)
      messages.push(imported.message)
    } catch (error) {
      failureCount += 1
      console.log("[CSG] gradientImport:imageFailed", String((error as Error)?.message ?? error))
    }
  }
  if (gradients.length === 0) throw new Error("所选图片未识别到可用配色")
  return {
    gradients,
    message: gradients.length === 1 && failureCount === 0
      ? messages[0]
      : `已导入 ${gradients.length} 个配色${failureCount > 0 ? `，${failureCount} 张图片未识别` : ""}`,
  }
}

export async function importWidgetGradientFromPhoto() {
  const result = await importWidgetGradientsFromPhotos()
  return { gradient: result.gradients[0], message: result.message }
}

async function createWidgetGradientFromImage(image: UIImage) {
  try {
    const recognized = await Vision.recognizeText(image, {
      recognitionLevel: "accurate",
      recognitionLanguages: ["zh-Hans", "en"],
      usesLanguageCorrection: false,
    })
    const textColors = extractHexColors(recognized.text)
    if (textColors.length >= 2) {
      return {
        gradient: createCustomWidgetGradient(textColors),
        message: `已识别 ${textColors.slice(0, 3).join(" · ")}`,
      }
    }
  } catch (error) {
    console.log("[CSG] gradientImport:visionFallback", String((error as Error)?.message ?? error))
  }

  const sampledColors = await sampleDominantColors(image)
  return {
    gradient: createCustomWidgetGradient(sampledColors),
    message: `已提取 ${sampledColors.join(" · ")}`,
  }
}

async function sampleDominantColors(image: UIImage): Promise<string[]> {
  const thumbnail = image.preparingThumbnail({ width: 96, height: 96 }) ?? image
  const base64 = thumbnail.toJPEGBase64String(0.78)
  if (!base64) {
    throw new Error("无法读取图片颜色")
  }

  const controller = new WebViewController({ ephemeral: true })
  try {
    await controller.loadHTML("<html><body><canvas id='sample' width='96' height='96'></canvas></body></html>")
    await controller.waitForLoad()
    const colors = await controller.evaluateJavaScript<string[]>(`
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          try {
            const canvas = document.getElementById('sample');
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.drawImage(image, 0, 0, 96, 96);
            const pixels = context.getImageData(0, 0, 96, 96).data;
            const buckets = new Map();
            for (let index = 0; index < pixels.length; index += 16) {
              const r = pixels[index];
              const g = pixels[index + 1];
              const b = pixels[index + 2];
              const alpha = pixels[index + 3];
              if (alpha < 220) continue;
              const max = Math.max(r, g, b);
              const min = Math.min(r, g, b);
              if ((max > 238 && max - min < 18) || max < 22) continue;
              const key = (r >> 4) + '-' + (g >> 4) + '-' + (b >> 4);
              const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
              bucket.r += r;
              bucket.g += g;
              bucket.b += b;
              bucket.count += 1;
              buckets.set(key, bucket);
            }
            const candidates = Array.from(buckets.values()).map((bucket) => ({
              r: bucket.r / bucket.count,
              g: bucket.g / bucket.count,
              b: bucket.b / bucket.count,
              count: bucket.count,
            })).sort((a, b) => b.count - a.count).slice(0, 18);
            if (candidates.length < 2) throw new Error('没有提取到足够的有效颜色');
            let pair = [candidates[0], candidates[1]];
            let bestScore = 0;
            for (let first = 0; first < candidates.length; first += 1) {
              for (let second = first + 1; second < candidates.length; second += 1) {
                const a = candidates[first];
                const b = candidates[second];
                const distance = Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
                const score = distance * Math.sqrt(Math.min(a.count, b.count));
                if (distance >= 48 && score > bestScore) {
                  bestScore = score;
                  pair = [a, b];
                }
              }
            }
            const luminance = (color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
            const hex = (color) => '#' + [color.r, color.g, color.b]
              .map((value) => Math.round(value).toString(16).padStart(2, '0'))
              .join('').toUpperCase();
            resolve(pair.sort((a, b) => luminance(b) - luminance(a)).map(hex));
          } catch (error) {
            reject(String(error));
          }
        };
        image.onerror = () => reject('图片解码失败');
        image.src = 'data:image/jpeg;base64,${base64}';
      });
    `)
    if (!Array.isArray(colors) || colors.length < 2) {
      throw new Error("没有提取到足够的有效颜色")
    }
    return colors
  } finally {
    controller.dispose()
  }
}

function createGradientDefinition(
  colors: readonly string[],
  id: string,
  label: string,
  custom: boolean,
): WidgetGradientDefinition {
  const normalized = uniqueColors(colors)
  return {
    id,
    label,
    colors: normalized,
    tone: gradientTone(normalized),
    custom,
  }
}

function uniqueColors(colors: readonly string[]) {
  return [...new Set(colors.map(normalizeHex).filter((value): value is string => Boolean(value)))]
}

function normalizeHex(value: unknown) {
  const match = String(value).trim().match(/^#?([0-9a-f]{6})$/i)
  return match ? `#${match[1].toUpperCase()}` : null
}

function mixHex(start: string, end: string) {
  const first = hexToRgb(start)
  const second = hexToRgb(end)
  return rgbToHex({
    r: (first.r + second.r) / 2,
    g: (first.g + second.g) / 2,
    b: (first.b + second.b) / 2,
  })
}

function hexToRgb(hex: string) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

function rgbToHex(color: { r: number; g: number; b: number }) {
  return `#${[color.r, color.g, color.b]
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase()
}

function gradientTone(colors: readonly string[]): "light" | "dark" {
  const average = colors.reduce((sum, color) => sum + relativeLuminance(color), 0) / Math.max(colors.length, 1)
  return average >= 0.36 ? "dark" : "light"
}

function relativeLuminance(hex: string) {
  const color = hexToRgb(hex)
  const linear = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null
}

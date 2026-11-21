import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  Picker,
  ProgressView,
  Script,
  Section,
  Text,
  TextField,
  VStack,
  useState,
} from "scripting"
import { PrimaryButton } from "./full_screen_page"
import { patchSettings, readSettings } from "../storage"
import { extractTariffInformation } from "../utils/tariff_ocr"

type TariffSource = "image" | "manual"
const Btn = Button as any
const TARIFF_OCR_WORDS = [
  "到户电价",
  "阶梯电价",
  "峰谷电价",
  "第一档",
  "第二档",
  "第三档",
  "尖峰",
  "高峰",
  "平段",
  "低谷",
  "合表电价",
]

export function LocalTariffEntryPage() {
  const dismiss = Navigation.useDismiss()
  const saved = readSettings()
  const [text, setText] = useState(saved.localTariffText)
  const [mode, setMode] = useState<TariffSource>(saved.localTariffSource ?? "image")
  const [draftSource, setDraftSource] = useState<TariffSource>(saved.localTariffSource ?? "manual")
  const [status, setStatus] = useState(saved.localTariffText ? savedStatus(saved.localTariffSource, saved.localTariffUpdatedAt) : "尚未录入电价资料")
  const [isRecognizing, setIsRecognizing] = useState(false)

  async function handleImportImage() {
    if (isRecognizing) {
      return
    }
    try {
      setIsRecognizing(true)
      setStatus("请选择包含电价信息的清晰图片")
      const granted = await Script.requestAccess(["photos"])
      if (!granted.includes("photos")) {
        throw new Error("未获得相册访问权限，请在 Scripting 设置中允许后重试")
      }
      const results = await Photos.pick({ filter: PHPickerFilter.images(), limit: 1 })
      if (results.length === 0) {
        setStatus("已取消选择图片")
        return
      }
      const image = await results[0].uiImage()
      if (!image) {
        throw new Error("无法读取所选图片")
      }
      setStatus("正在使用本机识别图片文字…")
      const recognized = await Vision.recognizeText(image, {
        recognitionLevel: "accurate",
        recognitionLanguages: ["zh-Hans", "en"],
        usesLanguageCorrection: true,
        minimumTextHeight: 0.004,
        customWords: TARIFF_OCR_WORDS,
      })
      console.log("[CSG] tariffOCR:vision", {
        candidateCount: recognized.candidates?.length ?? 0,
        hasText: Boolean(recognized.text.trim()),
      })
      const recognizedText = recognized.text.trim()
      if (!recognizedText) {
        throw new Error("图片中没有识别到文字，请换一张更清晰的图片")
      }
      const extracted = extractTariffInformation(recognizedText, {
        candidates: recognized.candidates,
        accountAddress: saved.selectedAccount?.address,
      })
      console.log("[CSG] tariffOCR:extracted", {
        priceCount: extracted.priceCount,
        ignoredLineCount: extracted.ignoredLineCount,
        facts: extracted.facts,
      })
      if (extracted.priceCount === 0) {
        throw new Error("图片中没有提取到有效电价，请选择包含地区、档位、到户电价和单位的清晰图片")
      }
      setText(extracted.text)
      setDraftSource("image")
      setMode("manual")
      setStatus(`已提取 ${extracted.priceCount} 条有效单价，剔除 ${extracted.ignoredLineCount} 行无关内容，请检查后保存`)
    } catch (error: any) {
      const message = String(error?.message ?? error)
      setStatus(message.toLowerCase().includes("cancel") ? "已取消选择图片" : message)
    } finally {
      setIsRecognizing(false)
    }
  }

  function handleTextChanged(value: string) {
    setText(value)
    setDraftSource("manual")
  }

  function handleSave() {
    const extracted = extractTariffInformation(text)
    if (extracted.priceCount === 0) {
      setStatus("请先从图片识别，或手动输入电价资料")
      return
    }
    const updatedAt = new Date().toISOString()
    patchSettings({
      localTariffText: extracted.text,
      localTariffSource: draftSource,
      localTariffUpdatedAt: updatedAt,
    })
    dismiss(true)
  }

  return <NavigationStack>
    <List
      navigationTitle="当地电价"
      navigationBarTitleDisplayMode="inline"
      listStyle="insetGroup"
      toolbar={{
        cancellationAction: <Button title="返回" action={() => dismiss()} />,
      }}
    >
      <Section header={<Text>录入方式</Text>}>
        <Picker
          title="电价录入方式"
          value={mode}
          onChanged={(value: string) => setMode(value as TariffSource)}
          pickerStyle="segmented"
        >
          <Text tag="image">图片识别</Text>
          <Text tag="manual">手动输入</Text>
        </Picker>

        {mode === "image" ? (
          <Btn action={handleImportImage} buttonStyle="glass" disabled={isRecognizing} frame={{ maxWidth: "infinity" }}>
            <HStack spacing={8} frame={{ minHeight: 46, maxWidth: "infinity" }}>
              {isRecognizing ? (
                <ProgressView progressViewStyle="circular" />
              ) : <Image systemName="photo.on.rectangle" font={18} />}
              <Text font={15} fontWeight="semibold">
                {isRecognizing ? "正在识别图片文字…" : "选择电价图片"}
              </Text>
            </HStack>
          </Btn>
        ) : (
          <HStack spacing={8} frame={{ minHeight: 46, maxWidth: "infinity" }}>
            <Image systemName="keyboard" font={20} foregroundStyle="#606067" />
            <Text font={14} foregroundStyle="#606067">直接编辑电价内容</Text>
          </HStack>
        )}
      </Section>

      <Section header={<Text>识别与录入结果</Text>} footer={<Text>{status}</Text>}>
        <TextField
          title="识别与录入结果"
          prompt="例如：第一档 0.6089 元/度"
          axis="vertical"
          value={text}
          onChanged={handleTextChanged}
          lineLimit={12}
          font={14}
          frame={{ minHeight: 190, maxWidth: "infinity", alignment: "topLeading" }}
        />
      </Section>

      <Section>
        <PrimaryButton title="保存并返回" systemImage="square.and.arrow.down" action={handleSave} />
      </Section>
    </List>
  </NavigationStack>
}

function savedStatus(source: "image" | "manual" | null, updatedAt: string | null) {
  const sourceLabel = source === "image" ? "图片识别" : "手动输入"
  if (!updatedAt) {
    return `已保存 · ${sourceLabel}`
  }
  const date = new Date(updatedAt)
  if (Number.isNaN(date.getTime())) {
    return `已保存 · ${sourceLabel}`
  }
  return `已保存 · ${sourceLabel} · ${date.getMonth() + 1}/${date.getDate()} ${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`
}

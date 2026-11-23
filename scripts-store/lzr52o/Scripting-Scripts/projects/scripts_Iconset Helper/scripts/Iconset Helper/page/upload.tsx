import {
  Button,
  Group,
  Image,
  List,
  Navigation,
  NavigationStack,
  Picker,
  ProgressView,
  Section,
  Text,
  VStack,
  useEffect,
  useObservable,
} from "scripting"
import { github } from "../util/github"

let globalClip: number
let globalSize: number

export function View({ img, url, filename }: { img: UIImage; url?: string; filename?: string }) {
  const dismiss = Navigation.useDismiss()

  // 初始化
  globalClip = 0
  globalSize = 0

  return (
    <NavigationStack>
      <StackView
        img={img}
        url={url}
        navigationTitle={filename}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          topBarLeading: [<Button title="关闭" systemImage={"xmark"} action={dismiss} />],
          topBarTrailing: [<UploadButton img={img} filename={filename} />],
        }}
      />
    </NavigationStack>
  )
}

function UploadButton({ img, filename }: { img: UIImage; filename?: string }) {
  const dismiss = Navigation.useDismiss()
  const load = useObservable(false)
  return (
    <Button
      action={async () => {
        try {
          const name = await Dialog.prompt({
            title: "请输入文件名",
            defaultValue: filename
          })
          if (!name) return

          // 开始上传
          load.setValue(true)

          // --- 处理图像 --- //
          // 裁切
          switch (globalClip) {
            case 1:
              img = img.renderedInCircle()
              break
          }
          // 缩放
          if (globalSize !== 0) {
            const res = img.preparingThumbnail({
              height: globalSize,
              width: globalSize,
            })!
            if (!res) throw new Error("缩放失败")
            img = res
          }

          const png = img.toPNGData()
          if (!png) throw new Error("转为 PNG 失败")
          const download_url = await github.upload(png, name + ".png")

          // Dialog.alert({
          //   message: "上传成功",
          // });

          const i = await Dialog.actionSheet({
            title: "上传成功",
            message: download_url,
            actions: [{ label: "拷贝链接" }],
          })

          switch (i) {
            case 0:
              Pasteboard.setString(download_url)
              break
          }
          dismiss()
        } catch (e) {
          Dialog.alert({
            title: "错误",
            message: String(e),
          })
        } finally {
          load.setValue(false)
        }
      }}>
      {load.value ? <ProgressView /> : <Image systemName={"square.and.arrow.up"} />}
    </Button>
  )
}

function StackView({ img, url }: { img: UIImage; url?: string }) {
  return (
    <VStack>
      <Image
        image={img}
        clipShape={{ type: "rect", cornerRadius: 41 }}
        resizable={true}
        frame={{ height: 180, width: 180 }}
        contextMenu={{
          menuItems: (
            <Group>
              <Section>
                <Button title={"拷贝"} action={() => Pasteboard.setImage(img)} />
                <Button title={"共享"} action={() => ShareSheet.present([img])} />
              </Section>
              <Section>
                <Button title={"保存图像"} action={() => {
                  const i = img.toPNGData()
                  if (!i) return Dialog.alert({ message: "转换失败" })
                  Photos.savePhoto(i)
                }} />
                {url ? (
                  <Button title={"拷贝图像链接"} action={() => Pasteboard.setString(url)} />
                ) : null}
              </Section>
            </Group>
          ),
        }}
      />
      <List>
        <OperationView />
      </List>
    </VStack>
  )
}

function OperationView() {
  return (
    <>
      <ClipSec />
      <ResizeSec />
    </>
  )
}

function ClipSec() {
  const value = useObservable(globalClip)
  useEffect(() => {
    globalClip = value.value
  }, [value.value])
  return (
    <Picker title="裁切图标" value={value}>
      <Text tag={0}>{"默认"}</Text>
      <Text tag={1}>{"圆形"}</Text>
    </Picker>
  )
}

const sizeOptions = [108, 120, 144, 256].sort()
function ResizeSec() {
  const value = useObservable(globalSize)
  useEffect(() => {
    globalSize = value.value
  }, [value.value])
  return (
    <Picker title="缩放图标" value={value}>
      <Text tag={0}>{"默认"}</Text>
      {sizeOptions.map((s) => (
        <Text tag={s}>{s}</Text>
      ))}
    </Picker>
  )
}

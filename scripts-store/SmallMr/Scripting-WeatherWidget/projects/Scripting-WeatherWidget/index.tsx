import {
  Button,
  List,
  Navigation,
  NavigationStack,
  Script,
  Text,
  Widget,
} from "scripting"

function Page() {
  const dismiss = Navigation.useDismiss()

  return (
    <NavigationStack>
      <List
        navigationTitle="天气日历"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: (
            <Button title="关闭" action={() => dismiss()} />
          ),
        }}
      >
        <Text font="headline">已经可以使用了</Text>
        <Text font="footnote" foregroundStyle="secondaryLabel">
          默认使用墨迹天气，请求失败会自动回退中国天气网；都不需要 API Key。下面可以先预览三种桌面尺寸。
        </Text>

        <Text font="headline">点击组件刷新</Text>
        <Text font="footnote">
          组件上已经加了一层透明刷新热区：轻点桌面组件任意位置，就会重新获取天气并刷新时间线，不会打开 Scripting。
        </Text>
        <Text font="footnote" foregroundStyle="secondaryLabel">
          请把“交互时 / When Interacting”设为“不做任何操作”。刷新由组件内的透明按钮完成，不需要运行脚本。
        </Text>

        <Button
          title="预览小号组件"
          action={() => void Widget.preview({ family: "systemSmall" })}
        />
        <Button
          title="预览中号组件"
          action={() => void Widget.preview({ family: "systemMedium" })}
        />
        <Button
          title="预览大号组件"
          action={() => void Widget.preview({ family: "systemLarge" })}
        />
        <Button
          title="刷新桌面组件"
          action={() => Widget.reloadAll()}
        />

        <Text font="headline">添加到桌面</Text>
        <Text font="footnote">
          长按桌面空白处 → 左上角“+” → 搜索 Scripting → 选择合适尺寸 → 添加后长按组件 → 编辑小组件 → 选择“天气日历”。
        </Text>
        <Text font="footnote" foregroundStyle="secondaryLabel">
          改完 widget.tsx 后先保存，再运行本页并点“刷新桌面组件”，桌面上的组件会立即重建。
        </Text>

        <Text font="headline">设置城市</Text>
        <Text font="footnote">
          在“编辑小组件”的参数里填：杭州
        </Text>
        <Text font="footnote">
          也可以填 JSON：{"{"}"city":"杭州","name":"你的昵称","source":"weathercn"{"}"}
        </Text>
        <Text font="footnote" foregroundStyle="secondaryLabel">
          不填 source 默认用墨迹并自动回退；填 weathercn 只使用中国天气网。
        </Text>
        <Text font="footnote" foregroundStyle="secondaryLabel">
          不填参数时使用 widget.tsx 顶部 DEFAULT_CITY 的值，默认是杭州。
        </Text>

        <Text font="headline">隐私</Text>
        <Text font="footnote" foregroundStyle="secondaryLabel">
          不读取定位、不读取通讯录/照片/文件、不上报设备信息；只向当前选择的中国天气网或墨迹天气请求数据。
        </Text>
      </List>
    </NavigationStack>
  )
}

async function run() {
  await Navigation.present(<Page />)
  Script.exit()
}

run()

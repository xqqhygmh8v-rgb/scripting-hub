# Scripting Calendar

Scripting 桌面日历小组件：公历、农历、节气与节日、休息日和补班日。

当前版本：`1.0.0`（打开脚本直接进入设置页，「外观」分组标题显示 `外观 · v1.0.0`）。

## 只有一个脚本

本项目始终以**同一个**「日历 / Calendar」脚本维护。更新时只替换这个脚本里的文件，
不要再导入第二个脚本。

### 更新已安装的脚本

1. 在 Scripting 里打开已安装的「日历」脚本。
2. 进入该脚本的设置，把「远程来源」设为 `https://github.com/SmallMr/Scripting-Calendar`。
3. 点「检查更新」并等待文件替换完成，然后重新打开脚本。
4. 看到「外观 · v1.0.0」即表示已更新到这个版本。

### 首次安装

只有从未安装过时才需要导入：
[一键导入 Scripting Calendar](https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fraw.githubusercontent.com%2FSmallMr%2FScripting-Calendar%2Fmain%2FScripting-Calendar.scripting%22%5D)

### 启用

1. 打开脚本，在「节假日数据」里点一次「在线获取」，会同时抓取上一年、本年与下一年。
2. 到桌面添加大号小组件。

获取失败的年份不会猜测法定节假日；未获取时不显示「休」「班」标记。获取成功后数据保存在本机。

## 功能

- 顶部左右箭头切换月份，点击月份标题回到本月。
- 整块组件背景色可调整，提供云白、纯白、米白、雾蓝预设和十六进制颜色输入。
- 字号可用滑块在 85%–125% 之间调整，笔画粗细也有独立滑块（极细→粗，默认「较细」），公历、农历、表头与底部信息同步变化。
- 每周可从周日或周一开始。
- 可选显示国际节日：情人节、愚人节、母亲节、父亲节、万圣夜、万圣节、感恩节、平安夜、圣诞节、复活节，作为日期下方的次要标签（与节气同样的样式）。
- 本月日期用柔和的近黑色，周末再淡一档，非本月日期最浅且不显示休息、补班和节日角标。
- 法定节假日休息日右上角显示「休」，补班日右上角显示「班」；普通周末不加标记。
- 今天用红色胶囊同时圈住公历日期和农历日期。
- 节气、传统节日使用淡雾蓝，不抢主日期层级。
- 大号组件的比例按约 `338 × 354` 的桌面尺寸设计，并随实际组件宽度等比缩放。

## 节假日数据

数据按年保存在本机，存储键为 `calendar-holidays-v2-YYYY`。每年的配置包含：

- 所有法定节假日休息日（普通周末不写入配置）
- 所有补班日
- 获取时间与来源

在线获取顺序：

1. `https://timor.tech/api/holiday/year/YYYY`
2. `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/YYYY.json`

两个在线源都失败时只报错，不写入内置节假日兜底表。重新在线获取会覆盖该年已保存的数据。

打开设置页时会自动检查上一年、本年与下一年：数据缺失或超过 30 天未更新时静默重新获取，失败则保留原数据，并在分组说明里用红字标出失败年份与原因；也可以随时手动点「在线获取」。获取失败不会写入任何数据，组件照常使用。

## 配置

设置页只保留外观、字体（字号与粗细）、每周起始和节假日获取：年份选择只用于查看某一年已保存的数据，点「在线获取」会更新连续三年，结果与更新时间显示在该分组的说明文字里。

## 目录

```text
.
├── index.tsx                设置页入口
├── widget.tsx               桌面组件入口
├── app_intents.tsx          上一月、下一月、回到本月
├── app/preferences.tsx      设置页（按国网脚本的 List/Section 结构）
├── core/
│   ├── calendar.ts          月历、农历、节气、节日
│   ├── dateUtils.ts         日期与每周起始工具
│   ├── holidays.ts          在线获取与本地缓存
│   ├── monthState.ts        当前查看月份
│   └── settings.ts          背景色与每周起始
├── ui/
│   ├── calendarWidget.tsx   桌面组件界面
│   └── theme.ts             明暗底色适配
├── vendor/
│   ├── solarlunar.ts        农历与节气计算
│   └── LICENSE.solarlunar
└── scripts/package.ps1      生成 .scripting 包
```

## 开发

```powershell
npm install
npm run typecheck
npm run package
```

`.scripting` 是 ZIP 文件。打包脚本只收录运行时需要的文件。

## 发布

仓库里只保留一个 `Scripting-Calendar.scripting`，每次打包直接覆盖它；不再往仓库提交带版本号的文件。

需要留档某个版本时，打 tag 并建 Release，把当次的包作为 Release 附件上传（附件可以命名为 `Scripting-Calendar-X.Y.Z.scripting`，不入库）：

```powershell
git tag v1.0.0
git push origin v1.0.0
gh release create v1.0.0 Scripting-Calendar.scripting#Scripting-Calendar-1.0.0.scripting
```

`script.json` 里的 `version` 与 tag 保持一致，方便对照。

## 第三方

农历、干支、生肖和二十四节气使用
[`solarlunar`](https://www.npmjs.com/package/solarlunar)，其许可证见
`vendor/LICENSE.solarlunar`。

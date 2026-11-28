# 阿里云 CDT 流量监控与 ECS 账单看板 (Scripting iOS)

[![Version](https://img.shields.io/badge/version-1.7.0-blue.svg)](https://github.com/ZTTYBB/scripting-aliyun-cdt)
[![Platform](https://img.shields.io/badge/platform-iOS%2018%2B-lightgrey.svg)](https://apps.apple.com/app/scripting/id1575361494)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

专为 iOS **Scripting** 打造的阿里云 CDT 流量、ECS 状态与 BSS 账单看板，采用原生 TypeScript + TSX 构建，支持 iOS 18+ 原生标签页，以及桌面和锁屏小组件。

> 💡 **v1.7.0 原生看板架构**：手机端采用三标签原生 `TabView`，首页先读取 CDT 流量与 ECS 状态，费用页按需读取余额和账单；小号、中号、大号与锁屏组件共用带配置隔离的本地快照。手机端始终只读，保活与熔断由 VPS 独立负责。

---

## 🚀 一键安装 (快速导入)

在已安装 **Scripting** 的 iPhone / iPad 上，点击下方链接即可自动唤起 Scripting 完成安装：

👉 **[📥 点击一键导入到 Scripting](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fraw.githubusercontent.com%2FZTTYBB%2Fscripting-aliyun-cdt%2Fmain%2FAliyunCDT.scripting%22%5D)**

> 💡 **原理说明**：本仓库预先生成并持续构建标准的 `AliyunCDT.scripting` 安装包，包含完整的 `script.json` 与模块化代码。

---

## 🌟 核心特性

- **🔒 零硬编码 & 本地存储**：代码中无任何 AK/SK，首次打开进入底部「设置」标签，支持直接编辑凭据与连接诊断。凭据通过 Scripting `Storage` 保存在设备本地；是否由宿主加密由 Scripting 负责。
- **📊 CDT 200GB 免费流量池实时追踪**：首页优先展示当月已用、距 VPS 参考线余量、剩余额度、重置倒计时与安全日均预算。
- **📈 每日用量趋势**：按相邻日期快照计算近 7 日增量，原生折线图逐点标注 GB；未采样日期保持空缺，不补成 0。
- **💰 折后账单按需加载**：费用标签页才读取余额与 BSS 账单，优先使用 `PretaxAmount`；查询失败、待出账、确认零费用分别显示，不把错误伪装成 ¥0。
- **📅 账单明细状态清晰**：月度产品汇总支持 `QueryAccountBill` 分页，ECS/EIP 最近 7 日明细保留“暂不可用”和“无费用”的区别。
- **💳 账户实时可用余额看板**：同步展示阿里云账户可用现金余额与财务健康状态，防止因欠费导致资源停机。
- **🖥️ ECS 只读状态**：查询实例状态与公网 IP。停止模式仅在 ECS API 返回字段时显示，不从“已停止”状态推断是否停止计费。
- **📱 全尺寸小组件**：支持小号、中号、大号与锁屏行内/矩形组件；中、大号逐点标注近 7 日快照用量，网络失败时显示配置隔离的同月缓存并标明过期状态。
- **🤖 VPS 托管纯只读模式**：手机端只发起 CDT、ECS 查询和用户主动打开费用页后的 BSS 查询；所有开关机、夜间休眠与流量熔断均由 VPS 独立负责。

---

## 📲 使用与配置步骤

### 1. 导入脚本
- **方式 A（最推荐）**：点击上方的 **[一键导入链接](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fraw.githubusercontent.com%2FZTTYBB%2Fscripting-aliyun-cdt%2Fmain%2FAliyunCDT.scripting%22%5D)** 自动安装；
- **方式 B（单文件）**：直接复制 [`AliyunCDT_AllInOne.tsx`](./AliyunCDT_AllInOne.tsx) 全文粘贴到 Scripting 新建脚本中。

### 2. 填写配置
首次运行会进入底部「设置」标签，表单支持直接编辑并提供「测试连接」：
* **AccessKey ID / Secret**：阿里云 RAM 访问凭据，Secret 使用安全输入框。
* **地域 ID**：实例所在地域（如香港为 `cn-hongkong`）。
* **ECS 实例 ID**：需要监控的实例编号（如 `i-xxxxxxxx`）。
* **月流量额度**：默认为 `200` GB。
* **VPS 参考线**：默认为 `195` GB，只用于手机告警和每日预算显示，不会控制 ECS。

---

## 🔒 阿里云 RAM 权限配置建议（最小权限原则）

为了脚本能够正常拉取 CDT 流量、ECS 状态、账户余额与折后账单，请在阿里云 RAM 访问控制台为子账号授予如下**最小必要权限策略**：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cdt:ListCdtInternetTraffic"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeInstances"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "bss:QueryAccountBalance",
        "bss:QueryBillOverview",
        "bss:QueryAccountBill"
      ],
      "Resource": "*"
    }
  ]
}
```

> ⚠️ **注意**：`bss:*` 权限用于查询账单总览、每日实际费用与账户现金余额。如果不授予，账单卡片将无法读取数据。

---

## 🤝 搭配 VPS 脚本实现“极致省钱 (月费 2~3 元)”

推荐搭配远端 VPS 定时脚本（参考 NodeSeek 经典方案）：
1. **VPS 后台脚本负责**：
   - 每天夜间 02:30 ~ 08:00 自动调用 `StopCharging`（节省停机）暂停 CPU/内存计费；
   - 每天早上 08:00 自动唤醒开机；
   - CDT 流量超过 195GB 时触发紧急熔断关机；
   - 每天 23:59 推送 Telegram 统计日报。
2. **手机端 Scripting 看板负责**：
   - 查看剩余流量、VPS 参考线、每日用量趋势和账户账单；
   - 查看 ECS 运行状态、停止模式（仅在 API 返回时展示）与公网 IP；
   - 费用页按需读取余额和最近 7 日 ECS/EIP 明细。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。

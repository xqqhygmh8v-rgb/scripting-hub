# WLinker · 五菱宏光 MINIEV 车况助手

基于五菱官方开放接口 `openapi.baojun.net`（`junApi/sgmw`）的车辆状态展示工具，
参照脚本库中 **BMW MINI Linker** 模板实现。

> ⚠️ 仅限个人学习使用，请勿用于商业用途。

## 功能

- **车况首页**：车辆图片、电量、续航、总里程、门锁、充电状态、电池健康/温度等
- **车辆信息**：VIN、车型、颜色、车牌、购车日期、经销商等
- **门锁与状态**：整车/四门/尾门锁、门窗开关、充电、位置、档位、钥匙等
- **车辆检测**：电池/电机健康检查（该车型无胎压传感器，故无胎压数据）
- **桌面小组件**：小号 / 中号 / 大号（含锁屏矩形），30 分钟自动刷新，失败自动回退缓存
- **快捷指令意图**：`RefreshWLinker` 一键刷新组件数据

## 如何连接

打开「设置 → 连接与会话管理」，输入手机号 + 五菱 App（灵灵邦）的登录密码即可登录。

登录后自动获取访问凭证，手机号和密码也保存在本机钥匙串（Keychain）——**之后刷新失败（如 token 失效）时会自动用保存的手机号+密码重新登录**，无需手动操作。

> 说明：登录走五菱官方 H5 通道 `hapi.00bang.cn`（明文），与官方登录页行为一致。

## 手动粘贴凭证（高级）

如果手机号登录不可用，仍可手动粘贴抓包获得的凭证：

| 字段 | 抓包 Header |
|---|---|
| Access Token | `sgmwaccesstoken` |
| Client ID | `sgmwclientid` |
| Client Secret | `sgmwclientsecret` |

获取步骤：

1. 开启抓包（HTTPS 解密需先安装并信任 CA 证书）
2. 重新登录五菱 App，找到 `openapi.baojun.net/junApi/sgmw/*` 的请求
3. 从请求头复制上述三个字段填入连接页

> ⚠️ 注意：每次重新登录五菱 App 后 `sgmwaccesstoken` 都会变化，旧 token 会失效。建议优先使用手机号登录方式。

## 接口说明

签名算法（来自开源项目 [hasscc/wuling](https://github.com/hasscc/wuling)）：

```
signature = SHA256(accessToken + timestamp + nonce + clientId + clientSecret + appcode + appversion + system + systemversion)
appcode=sgmw_llb  appversion=1691  system=android  systemversion=10
```

登录通道（H5 明文，来自官方 H5 登录页 `cdn-m.00bang.cn`）：

- `hapi.00bang.cn/llb/oauth/llb/ucenter/login` — 密码登录，返回 access_token
- `hapi.00bang.cn/llb/oauth/llb/ucenter/quickLogin` — 验证码登录
- `hapi.00bang.cn/llb/oauth/llb/verification/getLoginSmsCodeNew` — 发送短信验证码（需极验滑块）

核心车况接口：

- `userCarRelation/queryDefaultCarStatus` — 车辆信息 + 实时状态（里程/电量/续航/门锁/位置等）
- `car/check/all` — 车辆健康检查

## 关于远程控制

经抓包实测，本车（宏光 MINIEV，VIN `LK6ADAE18NB210298`）返回
`telematicsPlatform: 0`、`supportMqtt: 0`、`bluetoothKeyConnectMark: 1`，
且 App 内无远程锁车按钮——判断该车型**无 4G T-Box，仅支持蓝牙近场控制**，
因此 WLinker 仅做状态展示，不提供远程锁车/解锁控制。

## 项目结构

```
WLinker/
├── index.tsx          # 主界面（车况/设置/连接/详情）
├── widget.tsx         # 桌面小组件（小/中/大/锁屏矩形）
├── app_intents.tsx    # RefreshWLinker 刷新意图
├── domain.ts          # 领域模型
├── wuling-client.ts   # 五菱 API 客户端（签名 + 请求 + 字段映射）
├── session-vault.ts   # Keychain 凭证存取
├── storage.ts         # 共享域设置/快照/运行模式
├── formatters.ts      # 格式化工具
└── fixtures.ts        # 演示数据（未连接时展示）
```

## 免责声明

本工具与上汽通用五菱官方无任何关联，数据仅供个人学习研究使用。

# Clawd Mobile — Android 伴侣应用

通过局域网连接 Clawd 桌面端，远程监控 Claude Code 会话状态，随时审批权限请求。

## 下载

> 需要配合 [Clawd on Desk](https://github.com/Bynlk/clawd-on-desk) 桌面端使用。

前往 [Releases](https://github.com/Bynlk/clawd-on-desk/releases) 下载 `app-release.apk`。

- Android 8.0+（API 26）
- arm64-v8a 架构

<details>
<summary>📱 功能</summary>

- **QR 扫码配对** — 扫描桌面端生成的二维码，自动获取 IP / 端口 / Token
- **实时会话监控** — SSE 推送会话状态（工作中 / 思考中 / 空闲 / 休眠等）
- **远程审批** — Claude Code 请求权限时，手机弹出通知，一键允许 / 拒绝
- **前台服务** — 后台持续运行，断线自动重连（指数退避 1s → 30s）
- **状态通知** — 会话状态变化推送通知，支持点击跳转审批

</details>

<details>
<summary>🛠 技术栈</summary>

| 层面 | 技术 |
|------|------|
| 语言 | Kotlin |
| UI | Jetpack Compose + Material 3 |
| 导航 | Navigation Compose |
| 网络 | OkHttp SSE（长连接）+ OkHttp HTTP（审批回传） |
| 序列化 | kotlinx.serialization |
| 相机 | CameraX + ZXing（QR 扫码） |
| 通知 | Android 原生 Notification（前台服务 + 审批弹窗） |
| 存储 | SharedPreferences |
| 构建 | Gradle 8.11.1 + AGP 8.7.3 |
| CI | GitHub Actions（自动签名构建 debug + release） |
| 最低版本 | Android 8.0（API 26），arm64-v8a |

</details>

<details>
<summary>🏗 架构</summary>

```
┌─────────────────────────────────────────┐
│  MainActivity (Compose NavHost)         │
│  ├── ScanScreen       — QR 扫码配对     │
│  ├── SessionsScreen   — 会话列表 + 状态 │
│  ├── SettingsScreen   — 连接配置        │
│  └── ApprovalScreen   — 权限审批弹窗    │
├─────────────────────────────────────────┤
│  WebSocketService（前台服务）            │
│  ├── ClawdWebSocket   — SSE 长连接管理  │
│  ├── StatusNotifier   — 状态变化通知    │
│  └── NotificationHelper — 通知渠道管理  │
├─────────────────────────────────────────┤
│  数据层                                  │
│  ├── SessionData      — 会话状态模型    │
│  ├── ConnectionConfig — 连接配置        │
│  └── PrefsStore       — SharedPreferences│
└─────────────────────────────────────────┘
        ↕ SSE (port 23334)
┌─────────────────────────────────────────┐
│  Clawd Desktop（Electron 桌面端）        │
└─────────────────────────────────────────┘
```

</details>

<details>
<summary>📂 项目结构</summary>

```
android/app/src/main/java/com/clawd/mobile/
├── MainActivity.kt              — 入口 Activity
├── ClawdApp.kt                  — Application 类
├── data/
│   ├── Session.kt               — 会话数据模型
│   ├── ConnectionConfig.kt      — 连接配置（host/port/token）
│   ├── PrefsStore.kt            — SharedPreferences 封装
│   └── WsMessage.kt             — SSE 消息解析
├── ws/
│   ├── ClawdWebSocket.kt        — SSE 长连接管理
│   └── ConnectionState.kt       — 连接状态枚举
├── service/
│   └── WebSocketService.kt      — 前台服务
├── notification/
│   ├── NotificationHelper.kt    — 通知渠道创建
│   ├── StatusNotifier.kt        — 状态变化通知
│   ├── NotificationIcons.kt     — 通知图标
│   └── ApprovalReceiver.kt      — 审批按钮广播接收器
└── ui/
    ├── scan/ScanScreen.kt       — QR 扫码页面
    ├── sessions/SessionsScreen.kt — 会话列表页面
    ├── settings/SettingsScreen.kt — 设置页面
    ├── approval/ApprovalViewModel.kt — 审批逻辑
    ├── manual/ManualScreen.kt   — 手动输入页面
    ├── navigation/NavGraph.kt   — 导航图
    ├── components/ClawdIcons.kt — 自定义图标
    └── theme/                   — 主题（Color/Theme/Type）
```

</details>

<details>
<summary>🔧 开发</summary>

```bash
# 构建 debug APK
cd android
./gradlew assembleDebug

# 构建 release APK（需要环境变量）
KEYSTORE_FILE=release-keystore.jks \
STORE_PASSWORD=xxx \
KEY_ALIAS=clawd \
KEY_PASSWORD=xxx \
./gradlew assembleRelease
```

### CI/CD

推送到 `main` 分支且修改 `android/` 目录下的文件时，GitHub Actions 自动：

1. 构建 debug + release APK
2. 使用 keystore 签名 release
3. 上传两个 APK 为 artifacts

### GitHub Secrets

| Secret | 说明 |
|--------|------|
| `KEYSTORE_BASE64` | Keystore 文件的 Base64 编码 |
| `STORE_PASSWORD` | Keystore 密码 |
| `KEY_ALIAS` | Key 别名 |
| `KEY_PASSWORD` | Key 密码 |

</details>

<details>
<summary>📡 通信协议</summary>

Android app 通过局域网与桌面端通信，使用 SSE（Server-Sent Events）协议：

- **连接地址**: `http://<桌面IP>:23334/mobile/stream`
- **审批回传**: `POST http://<桌面IP>:23334/mobile/approve`
- **认证**: URL 中携带 Token

### SSE 消息类型（服务端 → 客户端）

| type | 说明 |
|------|------|
| `connected` | 连接成功 |
| `clear_sessions` | 清空本地会话缓存 |
| `snapshot` | 全量会话快照 |
| `state` | 单个会话状态变更 |
| `session_deleted` | 会话删除 |
| `permission_request` | 权限审批请求 |
| `elicitation_request` | 用户输入请求 |
| `tool_output` | 工具输出 |
| `ping` | 心跳保活 |

### 审批回传（客户端 → 服务端）

```json
POST /mobile/approve
{
  "id": "request-id",
  "decision": "allow" | "deny",
  "suggestionIndex": 0
}
```

</details>

## 许可证

[AGPL-3.0](../LICENSE)

# DeepSeek Harness 自研插件

这台设备的 7 个插件，来源为 DeepSeek Harness Desktop 0.2.2-rc.3。

| 插件 | 功能 |
| --- | --- |
| `general-session-picker` | 选择和添加工作区 |
| `dsh-title-project-tip` | 顶部标题悬停显示项目名和路径 |
| `dsh-quota-bar` | 底部显示已登录账号的剩余额度 |
| `dsh-project-icons` | 侧栏项目图标、圆形彩色首字母头像、会话状态靠右 |
| `dsh-concise-replies` | 精炼的结果回复及输入框中的下一步建议 |
| `dsh-running-prompt-status` | 固定当前阅读任务的标题、状态和用时 |
| `dsh-queue-expanded` | 展开排队中的消息 |

## 安装到另一台设备

登录有仓库权限的 GitHub 账号，克隆仓库。打开 DSH 的「插件 → 添加插件」，填入 `plugins` 下某个插件目录的绝对路径。安装完成后启用。

如果使用 macOS 终端，先在 DSH 应用菜单的「管理 dsh 命令」安装命令行工具。打开过 DSH 桌面版并完全退出后，可以批量安装。

```sh
gh repo clone Bavoch/dsh-plugins
cd dsh-plugins
dsh plugin --profile desktop add "$PWD"/plugins/*
```

安装后重新打开 DSH。Web 版把命令里的 `desktop` 改为实际使用的 profile。DSH 链接到克隆目录，后续可在该目录运行 `git pull` 更新，并重启 DSH。

额度插件读取目标设备的登录状态。Antigravity 额度查询需要在 DSH Host 环境设置 `DSH_ANTIGRAVITY_CLIENT_ID` 和 `DSH_ANTIGRAVITY_CLIENT_SECRET`。精炼回复的配套折叠选项见该插件的 README。

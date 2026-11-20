# DeepSeek Harness 社区插件

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供的独立插件，涵盖侧栏、会话、任务状态和额度显示。

| 插件 | 功能 |
| --- | --- |
| `general-session-picker` | 选择和添加工作区 |
| `dsh-quota-bar` | 底部显示已登录账号的剩余额度 |
| `dsh-project-icons` | 侧栏项目图标、会话状态靠右、标题悬停显示项目名和路径，侧栏可缩至 176 px |
| `dsh-concise-replies` | 精炼的结果回复及输入框中的下一步建议 |
| `dsh-running-prompt-status` | 对话按轮滚动翻页，当前轮标题显示状态和用时 |
| `dsh-queue-expanded` | 展开排队中的消息 |
| [`dsh-shared-rightbar`](plugins/dsh-shared-rightbar/README.md) | 同一工作区的会话共用右侧面板，适用于 `0.2.2-rc.5` |

## 安装到另一台设备

克隆仓库，或从 GitHub 下载 ZIP 并解压。打开 DSH 的「插件 → 添加插件」，填入 `plugins` 下所需插件目录的绝对路径。安装完成后启用。

如果使用 macOS 终端，先在 DSH 应用菜单的「管理 dsh 命令」安装命令行工具。打开过 DSH 桌面版并完全退出后，可以批量安装。如果当前版本与表中的个别插件不兼容，请指定要安装的插件目录。

```sh
git clone https://github.com/Bavoch/dsh-plugins.git
cd dsh-plugins
dsh plugin --profile desktop add "$PWD"/plugins/*
```

安装后重新打开 DSH。Web 版把命令里的 `desktop` 改为实际使用的 profile。DSH 链接到克隆目录，如果用 Git 克隆，后续可以在该目录运行 `git pull` 更新，再重启 DSH。

已安装旧版「标题气泡显示项目」（`@local/dsh-title-project-tip`）时，请先在 DSH 插件管理中卸载它，再更新仓库并重启 DSH。该功能现在由「项目图标与状态靠右」提供。

额度插件读取目标设备的登录状态。Antigravity 额度查询需要在 DSH Host 环境设置 `DSH_ANTIGRAVITY_CLIENT_ID` 和 `DSH_ANTIGRAVITY_CLIENT_SECRET`。精炼回复的配套折叠选项见[插件说明](plugins/dsh-concise-replies/README.md)。

## 反馈与许可

欢迎通过 [Issues](https://github.com/Bavoch/dsh-plugins/issues) 反馈问题，并注明 DSH 版本和插件名称。项目采用 [MIT 许可](LICENSE)。

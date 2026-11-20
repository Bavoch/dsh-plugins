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
| [`dsh-plugin-publisher`](plugins/dsh-plugin-publisher/README.md) | 管理自研插件、发布 GitHub 版本，查看安装状态和发布包下载量 |
| [`dsh-preview-element-context`](plugins/dsh-preview-element-context/README.md) | 点选右侧浏览器预览中的元素并添加到当前对话，适用于桌面版 `0.2.2-rc.5` |

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

## 发布前检查

本地开发继续通过 DSH 的「添加插件」链接源码目录。各插件在自己的清单中声明已验证的 DSH 版本，在中英文 locale 的 `meta.title` 和 `meta.description` 中声明显示名称和描述。

先安装检查脚本的依赖，再用已安装的 DeepSeek Harness 桌面版检查。需要 Node.js 22.12 或以上，以及支持 `git archive --mtime` 的 Git。Windows 和 macOS 默认使用标准位置的桌面版，其他安装路径可传 `--desktop` 和可执行文件的绝对路径。

```sh
npm ci
npm run check:release -- dsh-preview-element-context
```

默认检查已提交的插件目录。省略目录名会检查全部插件。开发期间可加 `--worktree` 检查当前源码，包括尚未跟踪的插件文件，且无需暂存或提交。发布时，源码树必须和通过检查的快照一致。

在 Windows PowerShell 中，带参数时用 `npm.cmd run check:release -- --worktree`，以便把参数原样交给检查脚本。当前 9 个插件均在桌面版 `0.2.2-rc.5` 通过了安装和启用检查。

检查会核对清单、双语元数据和包内文件，生成与发布器相同的 `.tgz`，然后用独立的 DSH 配置和桌面用户数据安装，确认插件已启用并且组件无加载错误。检查结果和安装包写入仓库忽略的 `.dsh-release-check/`。发布器会核对源码树和摘要，并上传通过检查的那份包。检查流程只在本地运行。

## 反馈与许可

欢迎通过 [Issues](https://github.com/Bavoch/dsh-plugins/issues) 反馈问题，并注明 DSH 版本和插件名称。项目采用 [MIT 许可](LICENSE)。

# AI Agent 任务调度中心 — 架构设计文档

> 项目代号：`mymy/subtitles`（Project A — 控制中心）
> 创建日期：2026-05-28
> 状态：MVP 实施中

---

## 1. 项目目标

通过 GitHub Pages 静态面板管理 AI Agent 任务：

1. **查看/创建/编辑 Issues** — 作为任务载体
2. **设定执行时间** — 定时触发 GitHub Actions
3. **设定 AI 提示词** — 指导 Agent 处理任务
4. **关联目标项目** — 指定 Agent 操作哪个仓库
5. **AI 客户端解耦** — 当前 opencode，后续可换 Claude Code 等

### 迭代规划

| 阶段 | 内容 | 状态 |
|------|------|------|
| **MVP** | 静态面板管理 Issues + 设定执行时间/项目/提示词 + Actions 用 opencode 执行 | 🔄 进行中 |
| **V2** | 状态追踪（执行进度、PR 结果） | 待开始 |
| **V3** | Cloudflare Worker 代理（鉴权、Cron 触发） | 待开始 |
| **V4** | 多项目完整管理 | 待开始 |

---

## 2. MVP 核心流程

```
┌─────────────────────────────────────────────────┐
│  静态面板 (GitHub Pages)                          │
│                                                  │
│  1. 查看 Issues 列表                              │
│  2. 创建 Issue，填写：                             │
│     - 标题                                        │
│     - 目标项目（B/C/D 仓库地址）                    │
│     - 执行时间（Cron 或指定时间）                   │
│     - AI 提示词（Agent 要做什么）                   │
│  3. 编辑/更新 Issue                               │
│  4. 手动触发执行                                   │
└──────────────┬──────────────────────────────────┘
               │
               ▼ (前端直接调 GitHub API，Token 存 localStorage)
┌─────────────────────────────────────────────────┐
│  GitHub (A 仓库)                                  │
│                                                  │
│  Issues (任务载体)                                │
│    ↓ workflow_dispatch / schedule                 │
│  GitHub Actions                                  │
│    ↓ 读取 Issue 中的提示词和目标项目               │
│  opencode (AI Agent)                             │
│    ↓ 在目标项目执行任务，创建 PR                   │
│  结果                                            │
└─────────────────────────────────────────────────┘
```

---

## 3. Issue 数据模型

每个 Issue 就是一个任务，Body 使用结构化格式：

```markdown
## 任务配置

- **目标项目**: owner/project-b
- **执行时间**: 2026-05-28 15:00
- **AI 客户端**: opencode
- **状态**: pending

## 提示词

请分析 project-b 中的 API 模块，找出所有未处理错误的接口，
修复它们并添加适当的错误处理，完成后创建 PR。
```

### Issue 结构解析

| 字段 | 来源 | 说明 |
|------|------|------|
| 标题 | Issue title | 任务名称 |
| 目标项目 | Body 中 `目标项目` | Agent 操作的目标仓库 |
| 执行时间 | Body 中 `执行时间` | 定时执行时间（精确到分钟） |
| AI 客户端 | Body 中 `AI 客户端` | opencode / claude-code 等 |
| 提示词 | Body 中 `提示词` 下方内容 | Agent 的指令 |
| 状态 | Label: `status:pending` / `status:running` / `status:done` / `status:failed` | 任务状态 |
| 项目 | Label: `project:project-b` | 按项目筛选 |

---

## 4. MVP 文件清单

```
subtitles/
├── docs/
│   └── index.html              # 静态面板 SPA
├── .github/
│   └── workflows/
│       ├── pages.yml           # Pages 部署
│       └── run-agent.yml       # Agent 执行 workflow
└── ARCHITECTURE_DESIGN.md      # 本文档
```

### 4.1 静态面板（index.html）

纯 HTML + Tailwind CDN + Vanilla JS，单文件 SPA。

#### 功能模块

**Issues 列表视图**
- 展示 A 仓库所有 Issues
- 按 Label 筛选（状态 / 项目）
- 显示：标题、目标项目、执行时间、状态

**创建/编辑 Issue**
- 表单字段：
  - 标题
  - 目标项目（下拉选择或手动输入仓库地址）
  - 执行时间（datetime picker）
  - AI 客户端选择（当前默认 opencode）
  - 提示词（textarea）
- 提交后通过 GitHub API 创建 Issue
- 自动打上 Labels（`status:pending`, `project:xxx`）

**手动触发**
- Issue 列表每条有「立即执行」按钮
- 调用 GitHub API 触发 `workflow_dispatch`
- 将 Issue 编号和提示词作为参数传入

**设置**
- GitHub Token 输入（存 localStorage）
- 仓库地址配置（默认 A 仓库自身）

#### API 调用

前端直接调 GitHub API（Token 存 localStorage）：

| 操作 | GitHub API |
|------|-----------|
| 查看 Issues | `GET /repos/{owner}/{repo}/issues` |
| 创建 Issue | `POST /repos/{owner}/{repo}/issues` |
| 编辑 Issue | `PATCH /repos/{owner}/{repo}/issues/{number}` |
| 触发执行 | `POST /repos/{owner}/{repo}/actions/workflows/run-agent.yml/dispatches` |
| 查看 Actions 状态 | `GET /repos/{owner}/{repo}/actions/runs` |

### 4.2 Agent 执行 Workflow（run-agent.yml）

```yaml
name: run-agent

on:
  workflow_dispatch:
    inputs:
      issue_number:
        description: 'Issue number'
        required: true
      target_repo:
        description: 'Target repository (owner/repo)'
        required: true
      prompt:
        description: 'AI prompt for the agent'
        required: true
      agent:
        description: 'Agent client to use'
        default: 'opencode'
        required: false

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout target repo
        uses: actions/checkout@v4
        with:
          repository: ${{ github.event.inputs.target_repo }}
          token: ${{ secrets.PAT_TOKEN }}

      - name: Setup opencode
        run: |
          # 安装 opencode
          # TODO: 填入实际安装方式

      - name: Run agent
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
        run: |
          opencode "${{ github.event.inputs.prompt }}"

      - name: Update issue status
        if: always()
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.PAT_TOKEN }}
          script: |
            const status = '${{ job.status }}' === 'success' ? 'done' : 'failed';
            // 更新 Issue labels
            await github.rest.issues.removeLabel({
              owner: '${{ github.repository_owner }}',
              repo: '${{ github.event.repository.name }}',
              issue_number: ${{ github.event.inputs.issue_number }},
              name: 'status:pending'
            });
            await github.rest.issues.addLabels({
              owner: '${{ github.repository_owner }}',
              repo: '${{ github.event.repository.name }}',
              issue_number: ${{ github.event.inputs.issue_number }},
              labels: [`status:${status}`]
            });
            // 评论执行结果
            await github.rest.issues.createComment({
              owner: '${{ github.repository_owner }}',
              repo: '${{ github.event.repository.name }}',
              issue_number: ${{ github.event.inputs.issue_number }},
              body: `Agent execution **${status}** at ${new Date().toISOString()}`
            });
```

---

## 5. AI 客户端解耦设计

Agent 执行层抽象为可替换的接口：

```yaml
# workflow_dispatch 中的 agent 参数决定使用哪个客户端
agent: opencode    # 或 claude-code / cursor / 其他
```

Workflow 内根据 `agent` 参数选择执行脚本：

```yaml
- name: Run agent
  run: |
    case "${{ github.event.inputs.agent }}" in
      opencode)
        opencode "${{ github.event.inputs.prompt }}"
        ;;
      claude-code)
        claude "${{ github.event.inputs.prompt }}"
        ;;
      *)
        echo "Unknown agent: ${{ github.event.inputs.agent }}"
        exit 1
        ;;
    esac
```

后续添加新客户端只需：
1. 在 Workflow 中加一个 case 分支
2. 在面板的下拉选项中加一项

---

## 6. 定时执行方案（MVP 用 workflow_dispatch 手动触发）

MVP 不做 Cron，手动触发验证链路。定时执行留给 V3（Cloudflare Worker Cron）。

后续定时实现方式：
1. 面板设定执行时间 → 写入 Issue Body
2. Cloudflare Worker Cron 定期扫描到期 Issue
3. 调 GitHub API `workflow_dispatch` 触发执行

---

## 7. 需要的 Secrets

| Secret | 说明 |
|--------|------|
| `PAT_TOKEN` | GitHub PAT（repo scope），用于 checkout 目标仓库 + 更新 A 仓库 Issues |
| `OPENCODE_API_KEY` | opencode 的 API Key |

---

## 8. 验证步骤

```
1. Push 代码到 A 仓库
2. GitHub Pages 自动部署面板
3. 打开面板，输入 GitHub Token
4. 创建一个 Issue：填写目标项目、提示词
5. 点击「立即执行」
6. 查看 A 仓库 Actions → run-agent workflow 被触发
7. Agent 在目标项目执行任务
8. Issue 自动更新状态为 done/failed
```

---

## 9. 待决策事项

| # | 问题 | 当前决定 |
|---|------|----------|
| 1 | Token 管理 | 前端 localStorage（MVP），后续 Worker 代理 |
| 2 | AI 客户端 | 先 opencode，后续可换 |
| 3 | 定时触发 | MVP 手动，后续 Worker Cron |
| 4 | 目标项目 | MVP 先操作 A 自己，后续扩展 B/C/D |
| 5 | 面板框架 | 单文件 HTML + Tailwind CDN |

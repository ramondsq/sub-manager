# 订阅管理 · Sub Manager

管理家庭订阅（Spotify、Apple Music 等）拼车成员和到期时间的小工具。部署在 Cloudflare 上，全部使用免费套餐。

## 功能

- 多个订阅，每个订阅设置可售名额和默认月价
- 每个订阅下添加成员，记录联系方式、账号、单独定价、备注
- 按月续费（1～12 个月），可选“接着原到期日续”或“从今天重新算”，自动记录收款
- 到期概览：按“已过期 / 今天 / 7 天内 / 30 天内”分组，支持搜索和筛选
- 收款记录和本月/今年收入统计，续费记错了可以撤销
- 一键复制催费消息（模板可自定义）
- 成员退出后可以“标记退出”，保留历史记录
- 每天定时通过 [Bark](https://github.com/Finb/Bark) 推送到期提醒
- 导出/导入 JSON 备份
- 手机和电脑都能用，可以“添加到主屏幕”当 App 用；支持深色模式

## 技术栈

| 部分 | 使用 |
| --- | --- |
| 前端 | React + Vite |
| 后端 | Cloudflare Workers + [Hono](https://hono.dev) |
| 数据库 | Cloudflare D1（SQLite） |
| 定时任务 | Cloudflare Cron Triggers（每小时一次） |
| 推送 | Bark |

前端静态文件和 API 在同一个 Worker 里，数据库表结构由 Worker 在第一次请求时自动创建，不需要手动执行迁移。

## 部署

### 方式一：在 Cloudflare 控制台连接 GitHub（推荐）

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com)，进入 **Workers & Pages** → **Create** → **Import a repository**，选择这个仓库。
2. 构建设置：
   - Project name：`sub-manager`（必须和 `wrangler.jsonc` 里的 `name` 一致）
   - Build command：`npm run build`
   - Deploy command：`npx wrangler deploy`（默认值）
3. 点击部署。第一次部署时 Wrangler 会自动在你的账户下创建名为 `sub-manager` 的 D1 数据库。
4. 部署完成后，进入这个 Worker 的 **Settings** → **Variables and Secrets** → **Add**，类型选 **Secret**，名称填 `ADMIN_PASSWORD`，值填你的登录密码（建议 12 位以上的随机密码）。
5. 打开 Worker 的地址（`https://sub-manager.<你的子域>.workers.dev`），用刚才的密码登录。

以后每次往 GitHub 推送代码，Cloudflare 都会自动重新部署。

### 方式二：本地命令行

```bash
npm install
npx wrangler login
npm run deploy                          # 构建并部署，第一次会自动创建 D1 数据库
npx wrangler secret put ADMIN_PASSWORD  # 设置登录密码
```

### 如果自动创建数据库失败

自动创建 D1 数据库（automatic provisioning）目前还是 Cloudflare 的 beta 功能。如果部署时报数据库相关的错误，可以手动创建：

```bash
npx wrangler d1 create sub-manager
```

然后把输出的 `database_id` 填到 `wrangler.jsonc` 的 `d1_databases` 里再部署。也可以在控制台 **Storage & Databases** → **D1** 里创建。

### 在国内访问

`workers.dev` 域名在中国大陆经常无法访问。如果你在国内使用，建议在 Worker 的 **Settings** → **Domains & Routes** 里绑定一个自己的域名（域名需要托管在 Cloudflare）。

## 设置 Bark 推送

1. 在 iPhone 上安装 [Bark](https://apps.apple.com/app/bark-customed-notifications/id1403753865)，打开后会看到一个形如 `https://api.day.app/xxxxxxxx/` 的地址。
2. 在网页的 **设置** 页面把这个地址粘贴到“Bark 地址”，点 **发送测试通知** 确认能收到。
3. 设置每天推送时间和提醒天数，然后保存。

提醒规则：

- **提醒天数** 是用逗号分隔的天数，例如 `3,1,0,-1,-3` 表示到期前 3 天、前 1 天、当天、过期后第 1 天、过期后第 3 天各提醒一次。
- 每天只推送一条汇总消息，列出当天所有需要提醒的成员；没有需要提醒的人就不推送。
- Cron 每小时的第 7 分钟运行一次，到了设置的时间就推送（例如设置 9:00，实际大约 9:07 收到）。推送失败会在之后每小时重试，直到当天结束。
- 设置页可以预览“今天的提醒”，也可以手动 **立即推送**。

> 为什么用 Bark 而不是浏览器推送？iOS 上网页推送必须先“添加到主屏幕”，而且经常收不到；Bark 是原生 App，推送稳定，也支持自建服务器（地址填你自己的服务器即可）。

## 免费额度

对这个用途来说，Cloudflare 免费套餐完全够用：

- Workers：每天 10 万次请求
- D1：5 GB 存储，每天 500 万行读取、10 万行写入
- Cron Triggers：这个项目只用 1 个

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars   # 修改里面的 ADMIN_PASSWORD
npm run dev                      # http://localhost:5173
```

本地开发会使用一个本地的 D1 数据库（保存在 `.wrangler/` 目录），不会影响线上数据。

其他命令：

```bash
npm test            # 运行单元测试
npm run typecheck   # 类型检查
```

测试定时任务：`npm run dev` 运行时访问 `http://localhost:5173/cdn-cgi/handler/scheduled` 会触发一次 Cron。

## 数据备份

在 **设置** → **数据备份** 里可以导出全部数据（订阅、成员、收款记录、设置）为 JSON 文件，也可以用备份文件恢复（会覆盖当前所有数据）。建议定期导出一份。

## 安全说明

- 登录密码保存在 Cloudflare 的 Secret 里，不会出现在代码和数据库中。
- 登录后使用 HttpOnly Cookie 保持会话 30 天；同一 IP 15 分钟内输错 10 次密码会被暂时锁定。
- 所有 API 都需要登录，并且会拦截跨站请求。

## 目录结构

```
shared/     前后端共用的类型和日期计算
worker/     Cloudflare Worker（API、定时推送、数据库结构）
src/        React 前端
public/     图标、manifest 等静态文件
tests/      单元测试
```

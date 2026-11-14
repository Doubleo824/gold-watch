# gold-watch 金价与汇率到价提醒

零成本的价格监控提醒工具：腾讯云函数每 5 分钟唤醒 GitHub Actions 拉取行情，命中阈值后通过 QQ 邮箱推送提醒。

目前监控两类标的：

| 模块 | 标的 | 单位 | 配置文件 |
|------|------|------|---------|
| 金价 | 上海黄金交易所 Au99.99（沪金99） | 元/克 | `gold-watch/alerts.json` |
| 汇率 | 澳元兑人民币（AUD/CNY） | 元/澳元 | `fx-watch/alerts.json` |

不需要服务器、域名、备案。

## 监控对象

- **金价**：新浪财经公开接口（`gds_AU9999`）
- **汇率**：新浪财经公开接口（`AUDCNY`）

## 工作原理

```
腾讯云函数 SCF（定时触发器，每 5 分钟）
   ↓ 调用 GitHub API（workflow_dispatch）
GitHub Actions（金价、汇率各一个任务）
   ↓ 拉取行情
   ↓ 读取 alerts.json 里的阈值
   ↓ 命中 → 发邮件
   ↓ 写回 triggeredAt 并自动提交到仓库
```

**实际执行者是腾讯云函数**，它每 5 分钟主动唤醒 GitHub Actions。所以：

- 本机 Mac 关机、不打开 GitHub 都不影响
- 不依赖 GitHub 自己的 cron 调度，也就**不受「仓库 60 天无提交停用定时任务」的规则影响**

## 目录结构

```
.github/workflows/gold-check.yml   金价定时任务
.github/workflows/fx-check.yml     汇率定时任务
gold-watch/
  ├── alerts.json                  金价提醒配置
  ├── src/check.js                 拉行情、判阈值、发邮件
  └── package.json                 依赖（nodemailer）
fx-watch/
  ├── alerts.json                  汇率提醒配置
  ├── src/check.js                 同上，行情源为 AUDCNY
  └── package.json                 依赖（nodemailer）
scf/dispatch/index.js              腾讯云函数源码（定时调用 GitHub API）
```

## 怎么改阈值

### 方式一：网页改（推荐）

1. 打开仓库里的配置文件
   - 金价：`gold-watch/alerts.json`
   - 汇率：`fx-watch/alerts.json`
2. 点右上角铅笔图标进入编辑
3. 修改 `targetPrice`，或复制一段新增提醒
4. 拉到页面底部点 **Commit changes**

改完不需要任何其它操作，下一次定时任务就会用新配置。

### 方式二：本地改后推送

```bash
# 编辑对应模块的 alerts.json 后
git add fx-watch/alerts.json
git commit -m "chore: 调整汇率阈值"
git push
```

## alerts.json 字段说明

下面以汇率模块为例（金价模块结构完全相同）：

```json
{
  "alerts": [
    {
      "id": "aud-low",
      "direction": "down",
      "targetPrice": 4.5,
      "enabled": true,
      "note": "澳元兑人民币跌破 4.5 时提醒",
      "triggeredAt": null
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `id` | 唯一标识，不要重复 |
| `direction` | `up` = 涨到/高于目标价提醒；`down` = 跌到/低于目标价提醒 |
| `targetPrice` | 目标值，金价单位元/克，汇率单位元/澳元 |
| `enabled` | `true` 启用，`false` 暂停 |
| `note` | 备注，只用于邮件正文展示，可省略 |
| `triggeredAt` | 触发时间，**不用手改**，由程序自动写入 |

### 触发后会自动恢复

某条提醒触发并发出邮件后，程序会写入 `triggeredAt`。
**满 24 小时后自动恢复监控**——如果价格仍在目标区间内，会再发一封，**每天最多一次**。

想立即恢复监控，把 `triggeredAt` 改回 `null` 即可。
想彻底停用，把 `enabled` 改成 `false`。

## 邮箱配置（已配好，一般不用改）

推送依赖仓库的 3 个 Secrets：仓库 Settings → Secrets and variables → Actions

| Secret | 说明 |
|--------|------|
| `SMTP_USER` | 发件 QQ 邮箱地址 |
| `SMTP_PASS` | QQ 邮箱的 16 位 SMTP 授权码（不是登录密码） |
| `MAIL_TO` | 接收提醒的邮箱 |

授权码获取：QQ 邮箱网页 → 设置 → 账户 → 开启「IMAP/SMTP 服务」→ 生成授权码。

## 手动测试

仓库 Actions 页 → 左侧选 `gold-check`（金价）或 `fx-check`（汇率）→ 右侧 **Run workflow**。

想在不通真实行情的情况下验证邮件能否送达，可在对应 `alerts.json` 里临时加一条必然触发的配置（金价用 500，汇率用 4.0）：

```json
{
  "id": "test",
  "direction": "up",
  "targetPrice": 4.0,
  "enabled": true,
  "triggeredAt": null
}
```

确认收到邮件后，删掉这段即可。

## 已知限制

- **最小间隔 5 分钟**，触发链路是腾讯云 → GitHub，命中后通常 10~30 秒内发信，不是实时行情。
- **触发后每天最多提醒一次**（24 小时自动恢复的机制）。
- 行情来自新浪财经公开接口，免费但不保证长期可用；若失效需修改 `check.js` 中的 `QUOTE.code`。
- 数据仅供参考，不构成投资建议。

## 凭证与到期维护

系统依赖两个凭证，性质不同：

| 凭证 | 存放位置 | 到期时间 | 失效表现 |
|------|---------|---------|---------|
| GitHub 令牌 | 腾讯云函数环境变量 `GH_TOKEN` | **2027-02-12** | 云函数返回 401，Actions 完全不再运行 |
| QQ 邮箱授权码 | GitHub Secrets 的 `SMTP_PASS` | 无固定期限 | Actions 报 `Invalid login`，不发送邮件 |

### 令牌过期后怎么换（2027-02-12 之前做一次）

**1. 生成新令牌**

打开 https://github.com/settings/personal-access-tokens/new

| 项目 | 填写 |
|------|------|
| Token name | `cron-trigger-新日期`（随便起，别和旧的重复） |
| Expiration | 选最长（约 1 年） |
| Repository access | Only select repositories → 勾选 `gold-watch` |
| Permissions | 点 `+ Add permissions` → 找 **Actions** → 选 **Read and write** → Add permissions |

拉到底部点 **Generate token**，复制 `github_pat_` 开头那串（**只显示一次**，先存到备忘录）。

**2. 更新腾讯云**

腾讯云控制台 → 云函数 → `gold-watch-trigger` → **函数配置** → 环境变量 → 修改 `GH_TOKEN` 的值为新令牌 → 保存。

**3. 验证**

函数代码页 → 点 **测试**，返回下面这样即成功：

```json
{"ok":true,"results":["gold-check:204(...)","fx-check:204(...)"]}
```

看到 `204` 就说明换好了。最后回 GitHub 令牌列表把旧令牌 **Delete** 掉。

### QQ 授权码失效后怎么换

**1. 重新生成授权码**

QQ 邮箱网页 → 设置 → 账户 → 「IMAP/SMTP 服务」→ 生成授权码（16 位，字母数字）。

**2. 更新 Secrets**

仓库 Settings → Secrets and variables → Actions → 点 `SMTP_PASS` 的 **Update** → 粘贴新授权码 → 保存。

**3. 验证**

Actions 页手动跑一次任一模，看日志是否出现 `已发送提醒邮件`。

## 故障排查

| 现象 | 原因 | 处理 |
|------|------|------|
| Actions 完全没有新运行 | 腾讯云定时器未运行 / 令牌失效 | 云函数「测试」看返回码 |
| 云函数返回 `401` | 令牌无效、过期、复制不全 | 按上面「令牌过期后怎么换」重做 |
| 云函数返回 `403` | 令牌缺少 Actions 写权限 | 重新生成，勾选 Actions: Read and write |
| 云函数返回 `404` | 令牌没授权 `gold-watch` 仓库 | 重新生成，Repository access 勾上仓库 |
| Actions 成功但没收到邮件 | 授权码失效或进了垃圾箱 | 检查 `SMTP_PASS`，翻垃圾邮件 |
| 邮件延迟很久 | 腾讯云定时器被暂停 | 控制台确认触发器为「启用」状态 |
| 配置文件出现冲突标记 `<<<<<<<` | 两个工作流同时提交 | 手工保留正确内容后提交 |

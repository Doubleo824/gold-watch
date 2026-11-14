# gold-watch 金价到价提醒

零成本的金价监控提醒工具：GitHub Actions 每 5 分钟拉取一次国内金价，命中阈值后通过 QQ 邮箱推送提醒。

不需要服务器、域名、备案。

## 监控对象

上海黄金交易所 **Au99.99（沪金99）**，单位 **元/克**。
数据源：新浪财经公开行情接口（`gds_AU9999`）。

## 工作原理

```
GitHub Actions（每 5 分钟）
   ↓ 拉取行情
   ↓ 读取 gold-watch/alerts.json 里的阈值
   ↓ 命中 → 发邮件
   ↓ 写回 triggeredAt 并自动提交到仓库
```

## 目录结构

```
.github/workflows/gold-check.yml   定时任务定义
gold-watch/
  ├── alerts.json                  提醒配置（最常改的就是它）
  ├── src/check.js                 拉行情、判阈值、发邮件
  └── package.json                 依赖（nodemailer）
```

## 怎么改阈值

### 方式一：网页改（推荐）

1. 打开仓库里的 `gold-watch/alerts.json`
2. 点右上角铅笔图标进入编辑
3. 修改 `targetPrice`，或复制一段新增提醒
4. 拉到页面底部点 **Commit changes**

改完不需要任何其它操作，下一次定时任务就会用新配置。

### 方式二：本地改后推送

```bash
# 编辑 gold-watch/alerts.json 后
git add gold-watch/alerts.json
git commit -m "chore: 调整金价阈值"
git push
```

## alerts.json 字段说明

```json
{
  "alerts": [
    {
      "id": "a1",
      "direction": "down",
      "targetPrice": 800,
      "enabled": true,
      "note": "国内金价跌破 800 元/克时提醒",
      "triggeredAt": null
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `id` | 唯一标识，不要重复 |
| `direction` | `up` = 涨到/高于目标价提醒；`down` = 跌到/低于目标价提醒 |
| `targetPrice` | 目标价格，单位元/克 |
| `enabled` | `true` 启用，`false` 暂停 |
| `note` | 备注，只用于邮件正文展示，可省略 |
| `triggeredAt` | 触发时间，**不用手改**，由程序自动写入 |

### 触发后会自动恢复

某条提醒触发并发出邮件后，程序会写入 `triggeredAt`。
**满 24 小时后自动恢复监控**——如果价格仍在目标区间内，会再发一封，每天最多一次。

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

仓库 Actions 页 → 左侧 `gold-check` → 右侧 **Run workflow**。

想在不通真实行情的情况下验证邮件能否送达，可临时加一条必然触发的配置：

```json
{
  "id": "test",
  "direction": "up",
  "targetPrice": 500,
  "enabled": true,
  "triggeredAt": null
}
```

确认收到邮件后，删掉这段即可。

## 已知限制

- **最小间隔 5 分钟**，且 GitHub 定时调度高峰期可能延迟几分钟，不是实时行情。
- **触发后每天最多提醒一次**（24 小时自动恢复的机制）。
- **仓库 60 天无提交，定时任务会被自动停用**。到 Actions 页面点一次 Enable 即可恢复。
- 行情来自新浪财经公开接口，免费但不保证长期可用；若失效需修改 `check.js` 中的 `QUOTE.code`。
- 数据仅供参考，不构成投资建议。

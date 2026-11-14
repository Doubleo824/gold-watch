const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const STATE_PATH = path.join(__dirname, '..', 'alerts.json');

// 行情品种：上海黄金交易所 Au99.99（沪金99），单位 元/克
const QUOTE = {
  code: 'gds_AU9999',
  name: '上海黄金交易所 Au99.99',
  unit: '元/克',
  symbol: '¥'
};
const SINA_URL = `https://hq.sinajs.cn/list=${QUOTE.code}`;

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 拉取国内金价最新行情（Au99.99，元/克）
 * 新浪 gds_ 字段：0 最新价 / 4 最高 / 5 最低 / 6 时间 / 7 昨收 / 12 日期
 */
async function fetchPrice() {
  const res = await fetch(SINA_URL, {
    headers: {
      Referer: 'https://finance.sina.com.cn',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    }
  });
  if (!res.ok) throw new Error(`行情接口 HTTP ${res.status}`);

  const text = await res.text();
  const match = text.match(/"([^"]+)"/);
  if (!match) throw new Error('行情返回格式无法解析');

  const f = match[1].split(',');
  const price = num(f[0]);
  if (!price) throw new Error('行情价格为空');

  const prevClose = num(f[7]);
  // 昨收异常（偏离超过 10%）时视为数据异常，不计算涨跌
  const valid = prevClose && Math.abs(prevClose - price) / price < 0.1;
  const change = valid ? Number((price - prevClose).toFixed(2)) : null;

  return {
    price,
    high: num(f[4]),
    low: num(f[5]),
    prevClose,
    change,
    changePercent: valid ? Number(((change / prevClose) * 100).toFixed(2)) : null,
    time: f[6] || '',
    date: f[12] || ''
  };
}

function buildMailText(alert, quote) {
  const dirText = alert.direction === 'up' ? '向上突破' : '向下跌破';
  const { symbol, unit, name } = QUOTE;
  const lines = [
    `你设置的金价提醒已触发（${dirText}）。`,
    '',
    `当前金价：${symbol}${quote.price} ${unit}`,
    `品种：${name}`,
    `目标价格：${symbol}${alert.targetPrice}`,
    `当日最高：${quote.high ?? '-'}　最低：${quote.low ?? '-'}`
  ];
  if (quote.change !== null) {
    lines.push(`较昨收：${quote.change >= 0 ? '+' : ''}${quote.change} (${quote.changePercent}%)`);
  }
  lines.push(`行情时间：${quote.date} ${quote.time}`);
  if (alert.note) lines.push('', `备注：${alert.note}`);
  lines.push('', '数据仅供参考，不构成投资建议。');
  return lines.join('\n');
}

/**
 * 判断提醒当前是否处于监控状态
 * 未触发过的直接监控；触发过的间隔满 24 小时后自动恢复监控
 */
const REARM_MS = 24 * 60 * 60 * 1000;

function isWatching(alert) {
  if (!alert.enabled) return false;
  if (!alert.triggeredAt) return true;
  const last = Date.parse(alert.triggeredAt);
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= REARM_MS;
}

async function main() {
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  const alerts = state.alerts || [];

  const pending = alerts.filter(isWatching);
  if (pending.length === 0) {
    console.log('没有待监控的提醒（未启用或 24 小时内已提醒过），本次跳过');
    return;
  }

  let quote;
  try {
    quote = await fetchPrice();
  } catch (err) {
    console.error('获取金价失败：', err.message);
    return; // 不标记触发，下次重试
  }
  console.log(
    `当前金价 ${QUOTE.symbol}${quote.price} ${QUOTE.unit}，涨跌 ${quote.change ?? '-'}，待监控 ${pending.length} 条`
  );

  const hitList = pending.filter((a) => {
    const target = Number(a.targetPrice);
    if (!Number.isFinite(target)) return false;
    return a.direction === 'up' ? quote.price >= target : quote.price <= target;
  });

  if (hitList.length === 0) {
    console.log('未达到任何阈值');
    return;
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    console.error('缺少 SMTP_USER / SMTP_PASS（QQ 邮箱账号与授权码），无法发送邮件；状态未变更');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: { user, pass }
  });

  const to = process.env.MAIL_TO || user;
  let changed = false;

  for (const alert of hitList) {
    const subject = `[金价提醒] ${alert.direction === 'up' ? '涨到' : '跌到'} ${QUOTE.symbol}${alert.targetPrice} 已触发`;
    try {
      await transporter.sendMail({
        from: `金价提醒 <${user}>`,
        to,
        subject,
        text: buildMailText(alert, quote)
      });
      alert.triggeredAt = new Date().toISOString();
      alert.triggeredPrice = quote.price;
      changed = true;
      console.log(`已发送提醒邮件：${subject}`);
    } catch (err) {
      console.error(`发送邮件失败（${subject}）：`, err.message);
    }
  }

  if (changed) {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
    console.log('已写回 alerts.json');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('执行异常：', err);
    process.exitCode = 1;
  });
}

module.exports = { fetchPrice, main };

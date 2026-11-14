/**
 * 腾讯云 SCF 定时触发器函数
 * 作用：定时调用 GitHub Actions 的 workflow_dispatch 接口，
 *      触发 gold-check（金价）和 fx-check（汇率）两个工作流。
 * 运行环境：Node.js 18.x（依赖全局 fetch）
 * 环境变量：GH_TOKEN = GitHub 细粒度令牌（Actions: Read and write）
 */

const REPO = 'Doubleo824/gold-watch';
const WORKFLOWS = ['gold-check', 'fx-check'];

exports.main_handler = async (event, context) => {
  const token = process.env.GH_TOKEN;
  if (!token) {
    console.error('缺少环境变量 GH_TOKEN');
    return { ok: false, msg: 'missing GH_TOKEN' };
  }

  const results = [];

  for (const wf of WORKFLOWS) {
    const url = `https://api.github.com/repos/${REPO}/actions/workflows/${wf}.yml/dispatches`;
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'scf-gold-watch-trigger'
        },
        body: JSON.stringify({ ref: 'main' })
      });
      const cost = Date.now() - started;
      results.push(`${wf}:${res.status}(${cost}ms)`);
      if (res.status !== 204) {
        const body = await res.text();
        console.error(`${wf} 触发失败 HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
    } catch (err) {
      results.push(`${wf}:error`);
      console.error(`${wf} 请求异常: ${err.message}`);
    }
  }

  console.log('触发结果:', results.join(' '));
  return { ok: true, results };
};

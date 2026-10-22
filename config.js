/**
 * 全局运行配置
 *
 * 【为什么要有这个文件】
 * 改造前，学校名、页面大小这类"会变的东西"直接写在各个页面里，
 * 换一个学校就要改好几个文件，还容易漏。抽到一处以后，只改这里。
 *
 * 【两个模式】
 * - local：数据存在手机本地 Storage，不需要云开发，打开就能演示
 * - cloud：数据存在微信云开发数据库，所有人看到同一份数据
 *
 * 把下面 CLOUD_ENV 填成你的云环境 ID，就自动切换到 cloud 模式。
 */
const CLOUD_ENV = '' // TODO 在开发者工具「云开发」控制台复制环境 ID，填到这里

const config = {
  cloudEnv: CLOUD_ENV,

  // 自动推导模式：填了环境 ID 就是云端，没填就是本地
  mode: CLOUD_ENV ? 'cloud' : 'local',

  // 内容安全检测。需要先部署 cloudfunctions/msgSecCheck
  // 未部署时会打警告并放行（fail-open）。正式上线应改为拦截（fail-close）。
  requireContentCheck: false,

  // AI 问答。需要先部署 cloudfunctions/askCampus 并配好 LLM_API_KEY 环境变量。
  // 只有 cloud 模式下才生效；没部署时问答会自动降级到本地知识库。
  askFunction: 'askCampus',
  useAI: true,

  schoolName: '嘉兴南洋职业技术学院',
  semesterStart: '2026-09-07',
  version: '3.0.0',

  // 校园墙每页几条
  pageSize: 8
}

module.exports = config

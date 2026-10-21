/**
 * 数据层入口
 *
 * 页面统一 require 这个文件，永远不用关心底层是本地还是云端。
 * 这叫「按接口编程」：调用方只依赖方法名，不依赖实现。
 *
 * 把 config.js 里的 CLOUD_ENV 填上，这里就自动切到云开发。
 */

const config = require('../config')

const store = config.mode === 'cloud'
  ? require('./cloud-store')
  : require('./local-store')

module.exports = store

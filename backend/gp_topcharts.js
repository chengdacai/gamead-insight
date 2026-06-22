#!/usr/bin/env node
/**
 * Google Play 榜单抓取脚本（Node.js 版）
 * 调用 google-play-scraper NPM 包的 list() 函数
 * 用法：node gp_topcharts.js <category> <country> <chart_type> <limit>
 * 输出：JSON 到 stdout
 */
const gps = require('google-play-scraper').default;

const args = process.argv.slice(2);
const category   = args[0] || 'TOOLS';
const country    = args[1] || 'US';
const chartType  = args[2] || 'free';  // free | paid
const limit      = parseInt(args[3]) || 20;

// 榜单类型映射
const COLLECTION_MAP = {
  'free':         gps.collection.TOP_FREE,
  'paid':         gps.collection.TOP_PAID,
  'top_grossing': gps.collection.TOP_GROSSING,
};

// 类别映射（google-play-scraper Node 包的内部值）
const CATEGORY_MAP = {
  'TOOLS':         gps.category.TOOLS,
  'ART_AND_DESIGN': gps.category.ART_AND_DESIGN,
  'PHOTOGRAPHY':  gps.category.PHOTOGRAPHY,
  'PRODUCTIVITY':  gps.category.PRODUCTIVITY,
  'BUSINESS':      gps.category.BUSINESS,
  'EDUCATION':     gps.category.EDUCATION,
  'ENTERTAINMENT': gps.category.ENTERTAINMENT,
  'GAME_ACTION':   gps.category.GAME_ACTION,
  'GAME_PUZZLE':  gps.category.GAME_PUZZLE,
};

const coll   = COLLECTION_MAP[chartType]  || gps.collection.TOP_FREE;
const cat    = CATEGORY_MAP[category]   || gps.category.TOOLS;

gps.list({
  category:   cat,
  collection: coll,
  country:    country,
  num:        limit,
})
  .then(apps => {
    const results = apps.map((app, i) => ({
      rank:         i + 1,
      id:           app.appId     || '',
      app_id:       app.appId     || '',
      store:        'google_play',
      name:         app.title      || '',
      developer:    app.developer || '',
      category:     category,
      category_en:  category.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      price:        app.price      || 0,
      rating:       app.score      || 0.0,
      rating_count:  app.reviews    || 0,
      installs:     app.installs   || '',
      icon:         app.icon       || '',
      url:          `https://play.google.com/store/apps/details?id=${app.appId}`,
      country:      country,
      chart_type:   chartType,
      version:      app.version    || '',
      updated:      app.updated    || '',
      screenshots:  app.screenshots || [],
      change_type:  'none',
      change_label_zh: '',
      change_label_en: '',
    }));
    process.stdout.write(JSON.stringify(results));
  })
  .catch(err => {
    // 输出空数组，不抛异常
    process.stdout.write(JSON.stringify([]));
  });

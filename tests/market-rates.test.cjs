const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const window={};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../js/market-rates.js'),'utf8'),{window,document:{readyState:'loading',addEventListener(){}},Date,Intl,Number});
const rates=window.TriptiRates;
test('ticker starts populated and playing before network completes, even with reduced motion',()=>{
 const classes=new Set(),track={innerHTML:''},button={setAttribute(){}};
 const strip={set className(v){v.split(' ').forEach(x=>classes.add(x));},setAttribute(){},querySelector:s=>s==='.market-track'?track:button,classList:{contains:x=>classes.has(x),add:x=>classes.add(x),toggle(x){if(classes.has(x)){classes.delete(x);return false;}classes.add(x);return true;}}};
 const header={querySelector:()=>({before(){}})};
 const document={readyState:'loading',hidden:false,addEventListener(){},querySelector:s=>s==='.site-header'?header:{},createElement:()=>strip};
 const window={matchMedia:()=>({matches:true}),TriptiSupabase:{select:()=>new Promise(()=>{})}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../js/market-rates.js'),'utf8'),{window,document,Date,Intl,Number});
 window.TriptiRates.initialize();
 assert.match(track.innerHTML,/Loading rates/);assert.match(track.innerHTML,/Gold 24K/);
 assert.equal(classes.has('motion-enabled'),true);assert.equal(classes.has('is-paused'),false);assert.equal(button.textContent,'Pause');
 button.onclick();assert.equal(classes.has('is-paused'),true);assert.equal(button.textContent,'Play');
 button.onclick();assert.equal(classes.has('is-paused'),false);assert.equal(button.textContent,'Pause');
});
test('defaults do not invent rates and diamond cannot use a universal live quote',()=>{
 const result=rates.normalize({speed:1,items:[{id:'diamond',mode:'auto',value:-5}]});
 assert.equal(result.speed,20);assert.equal(result.items[2].mode,'manual');assert.equal(result.items[2].value,null);assert.equal(result.items[0].mode,'auto');
});
test('manual rate overrides provider without live label',()=>{
 const item={id:'gold',mode:'manual',value:123,updated_at:null};
 assert.equal(rates.quote(item,{}).value,123);assert.equal(rates.quote(item,{}).status,'Store rate');
});
test('auto quotes enforce units, source and age and preserve market closure',()=>{
 const item={id:'gold',mode:'auto',unit:'₹ / 10 g'},now=Date.now();
 const q={value:123,unit:item.unit,source:'Test provider',asOf:new Date(now).toISOString(),status:'live'};
 const feed={quotes:{gold:q}};
 assert.equal(rates.quote(item,feed,now).status,'Live');
 q.status='closed';assert.match(rates.quote(item,feed,now).status,/Market closed/);
 q.status='live';q.asOf=new Date(now-3600000).toISOString();assert.equal(rates.quote(item,feed,now).status,'Last available');
 q.asOf=new Date(now-90000000).toISOString();assert.equal(rates.quote(item,feed,now).value,null);
 q.asOf=new Date(now).toISOString();q.unit='USD / oz';assert.equal(rates.quote(item,feed,now).value,null);
 assert.equal(rates.quote(item,null,now).value,null);
});
test('API fails honestly when unconfigured and filters malformed provider assets',async()=>{
 const handler=require('../api/market-rates.js');
 const oldURL=process.env.MARKET_RATES_FEED_URL,oldFetch=global.fetch;
 const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
 try{
  delete process.env.MARKET_RATES_FEED_URL;let res=response();await handler({method:'GET'},res);assert.equal(res.code,503);
  process.env.MARKET_RATES_FEED_URL='https://provider.example/quotes';
  global.fetch=async()=>({ok:true,text:async()=>JSON.stringify({quotes:{gold:{value:123,unit:'₹ / 10 g',source:'Test',asOf:new Date().toISOString(),status:'live'},silver:{value:-1}}})});
  res=response();await handler({method:'GET'},res);assert.equal(res.code,200);assert.equal(res.body.quotes.gold.value,123);assert.equal(res.body.quotes.silver,undefined);
  global.fetch=async()=>{throw new Error('private credential must not leak');};res=response();await handler({method:'GET'},res);assert.equal(res.code,503);assert.doesNotMatch(JSON.stringify(res.body),/credential/);
 }finally{global.fetch=oldFetch;if(oldURL===undefined)delete process.env.MARKET_RATES_FEED_URL;else process.env.MARKET_RATES_FEED_URL=oldURL;}
});

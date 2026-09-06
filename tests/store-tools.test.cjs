const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const window={TriptiSupabase:{config:{url:'https://example.supabase.co'}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/store-tools.js'),'utf8'),{window,Intl,Date});
test('photos reject non-raster and oversized files; public URL rejects foreign paths',()=>{
 const t=window.TriptiStoreTools;assert.equal(t.photoExtension({type:'image/png',size:20}),'png');
 assert.throws(()=>t.photoExtension({type:'image/svg+xml',size:20}));assert.throws(()=>t.photoExtension({type:'image/png',size:5242881}));
 assert.equal(t.publicPhoto('https://evil.example/photo'), '');assert.equal(t.publicPhoto('../secret'), '');
});
test('request decisions follow allowed states',()=>{
 const f=window.TriptiStoreTools.decisionForm;assert.match(f({id:'test',status:'requested'},'aftercare'),/approved/);assert.doesNotMatch(f({id:'test',status:'approved'},'aftercare'),/>rejected</);assert.equal(f({id:'test',status:'completed'},'aftercare'),'');
});
test('direct provider messages and phone validation use real acceptance ids',async()=>{
 const d=require('../lib/store-delivery.cjs'),oldFetch=global.fetch;
 assert.equal(d.phone('9876543210'),'+919876543210');assert.equal(d.phone('not a phone'),null);
 const env={RESEND_API_KEY:'test',EMAIL_FROM:'Tripti <test@example.com>',TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'test',TWILIO_WHATSAPP_FROM:'+919876543210',TWILIO_WHATSAPP_CONTENT_SID:'HX'+'b'.repeat(32)};
 assert.deepEqual(d.configured(env),{email:true,whatsapp:true});
 let sent;
 try{
  global.fetch=async(url,opts)=>{sent={url,...opts};return {ok:true,json:async()=>url.includes('resend')?{id:'email-1'}:{sid:'wa-1'}};};
  assert.equal(await d.send({channel:'email',event:'order_cancelled',event_key:'stable-key',destination:'test@example.com',order_number:'TJ-1'},env),'email-1');
  assert.equal(sent.headers['Idempotency-Key'],'stable-key');assert.match(JSON.parse(sent.body).text,/does not confirm a completed refund/);
  assert.equal(await d.send({channel:'whatsapp',event:'order_shipped',destination:'9876543210',order_number:'TJ-1'},env),'wa-1');
  assert.equal(new URLSearchParams(sent.body).get('ContentSid'),env.TWILIO_WHATSAPP_CONTENT_SID);
  await assert.rejects(d.send({channel:'email',first_attempt_at:new Date(Date.now()-24*3600000).toISOString()},env),/retry window expired/);
 }finally{global.fetch=oldFetch;}
});
test('notification endpoint fails closed without server config',async()=>{
 const handler=require('../api/store-notifications.js'),old=process.env.SUPABASE_SERVICE_ROLE_KEY;
 try{delete process.env.SUPABASE_SERVICE_ROLE_KEY;const res={setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};await handler({method:'POST',headers:{}},res);assert.equal(res.code,503);assert.match(res.body.error,/No messages were sent/);}finally{if(old!==undefined)process.env.SUPABASE_SERVICE_ROLE_KEY=old;}
});
test('dispatcher requires admin, preserves idempotency and never marks failed delivery sent',async()=>{
 const handler=require('../api/store-notifications.js');const saved={...process.env},oldFetch=global.fetch;
 const response=()=>({setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
 try{
  Object.assign(process.env,{SUPABASE_URL:'https://db.example',SUPABASE_SERVICE_ROLE_KEY:'server-test-key',EMAIL_DELIVERY_URL:'https://delivery.example',DELIVERY_ADAPTER_SECRET:'adapter-test',CRON_SECRET:'cron-test'});
  delete process.env.WHATSAPP_DELIVERY_URL;
  let role='customer',accept=true,patches=[],keys=[],claims=[];
  global.fetch=async(url,opts={})=>{
   if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'user-id'})};
   if(url.includes('/profiles?'))return {ok:true,json:async()=>[{role}]};
   if(url.endsWith('/enqueue_cart_reminders'))return {ok:true,status:204};
   if(url.endsWith('/claim_store_notifications')){claims.push(JSON.parse(opts.body));return {ok:true,json:async()=>[{id:1,event_key:'order:confirmed:email',event:'order_confirmed',channel:'email',destination:'customer@example.com',order_number:'TJ-TEST'}]};}
   if(url.startsWith('https://delivery.example')){keys.push(opts.headers['Idempotency-Key']);return {ok:accept,json:async()=>accept?{accepted:true,provider_id:'provider-1'}:{}};}
   if(url.includes('/store_outbox?')){patches.push(JSON.parse(opts.body));return {ok:true,status:204};}
   throw Error('Unexpected request');
  };
  let res=response();await handler({method:'POST',headers:{authorization:'Bearer user-session'}},res);assert.equal(res.code,403);assert.equal(keys.length,0);
  role='admin';res=response();await handler({method:'POST',headers:{authorization:'Bearer user-session'}},res);assert.equal(res.code,200);assert.equal(patches[0].status,'sent');assert.deepEqual(claims[0].p_channels,['email']);
  accept=false;res=response();await handler({method:'POST',headers:{authorization:'Bearer user-session'}},res);assert.equal(patches[1].status,'failed');assert.equal(keys[0],keys[1]);
  res=response();await handler({method:'GET',headers:{}},res);assert.equal(res.code,401);
 }finally{global.fetch=oldFetch;for(const k of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','EMAIL_DELIVERY_URL','WHATSAPP_DELIVERY_URL','DELIVERY_ADAPTER_SECRET','CRON_SECRET']){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
});

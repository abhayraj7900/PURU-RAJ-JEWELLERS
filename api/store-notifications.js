'use strict';
// A delivery adapter must honor Idempotency-Key and acknowledge with a provider id.
// This endpoint never accepts a destination or message from the browser.
const {timingSafeEqual}=require('node:crypto');
const delivery=require('../lib/store-delivery.cjs');
function equal(a,b){return !!a&&!!b&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function endpoint(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 const base=endpoint(process.env.SUPABASE_URL),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)return res.status(503).json({error:'Notification service needs Supabase server credentials. No messages were sent.'});
 const root=base.replace(/\/$/,'');
 const request=async(path,options={})=>{const r=await fetch(root+path,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Database request failed. Check store-tools migration and server configuration.');return r.status===204?null:r.json();};
 try{
  const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
  const cron=equal(token,process.env.CRON_SECRET);
  if(!cron){
   if(req.method!=='POST'||!token)return res.status(401).json({error:'Admin sign-in required.'});
   const r=await fetch(root+'/auth/v1/user',{headers:{apikey:key,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
   if(!r.ok)return res.status(401).json({error:'Please sign in again.'});
   const u=await r.json();
   const profiles=await request(`/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(u.id)}`);
   if(profiles[0]?.role!=='admin')return res.status(403).json({error:'Admin access required.'});
  }
  const adapters={email:endpoint(process.env.EMAIL_DELIVERY_URL),whatsapp:endpoint(process.env.WHATSAPP_DELIVERY_URL)};
  if(!process.env.DELIVERY_ADAPTER_SECRET){adapters.email=null;adapters.whatsapp=null;}
  const direct=delivery.configured(process.env);
  const channels=['email','whatsapp'].filter(c=>adapters[c]||direct[c]);
  if(!channels.length)return res.status(503).json({error:'Configure Resend email or Twilio WhatsApp credentials first. Messages remain queued; none were sent.'});
  await request('/rest/v1/rpc/enqueue_cart_reminders',{method:'POST',body:'{}'});
  const jobs=await request('/rest/v1/rpc/claim_store_notifications',{method:'POST',body:JSON.stringify({p_channels:channels})});
  await Promise.all(jobs.map(async job=>{
   let values;
   if(!adapters[job.channel]&&direct[job.channel]){
    // Twilio has no equivalent provider idempotency key here. Persist a no-auto-retry
    // guard BEFORE sending, so a crash or lost response cannot cause a second message.
    if(job.channel==='whatsapp')await request(`/rest/v1/store_outbox?id=eq.${job.id}&status=eq.processing`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({attempts:5})});
    try{const id=await delivery.send(job);values={status:'sent',provider_id:id,sent_at:new Date().toISOString(),last_error:''};}
    catch(error){values={status:'failed',last_error:job.channel==='whatsapp'?'WhatsApp acceptance uncertain or failed. Reconcile provider logs before manual retry.':'Email delivery failed. Check credentials and provider status.',...(error.terminal||job.channel==='whatsapp'?{attempts:5}:{})};}
   }
   else if(!adapters[job.channel])values={status:'pending',last_error:'Delivery provider not configured',attempts:0};
   else try{
    const r=await fetch(adapters[job.channel],{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.DELIVERY_ADAPTER_SECRET||''}`,'Idempotency-Key':job.event_key},body:JSON.stringify({channel:job.channel,to:job.destination,event:job.event,order_number:job.order_number||null,account_url:'https://triptijewllers.vercel.app/account.html',preferences_url:'https://triptijewllers.vercel.app/account.html#notification-preferences'}),signal:AbortSignal.timeout(10000)});
    const data=await r.json().catch(()=>null);
    if(!r.ok||data?.accepted!==true||typeof data?.provider_id!=='string'||!data.provider_id)throw new Error('Delivery adapter did not acknowledge acceptance');
    values={status:'sent',provider_id:data.provider_id.slice(0,200),sent_at:new Date().toISOString(),last_error:''};
   }catch{values={status:'failed',last_error:'Delivery failed or acknowledgement missing. Retry uses the same idempotency key.'};}
   await request(`/rest/v1/store_outbox?id=eq.${job.id}&status=eq.processing`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(values)});
  }));
  return res.status(200).json({processed:jobs.length});
 }catch{return res.status(503).json({error:'Notification processing could not finish. Check database activation and delivery configuration; queued jobs are retained.'});}
};
module.exports.endpoint=endpoint;

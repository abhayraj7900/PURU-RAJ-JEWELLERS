'use strict';
const site='https://triptijewllers.vercel.app';
const labels={order_received:'received',order_confirmed:'confirmed',order_shipped:'shipped',order_cancelled:'cancelled',order_delivered:'delivered'};
function phone(value){let n=String(value||'').replace(/[\s()-]/g,'');if(/^[6-9]\d{9}$/.test(n))n='+91'+n;if(/^91\d{10}$/.test(n))n='+'+n;return /^\+[1-9]\d{9,14}$/.test(n)?n:null;}
function configured(env){return {email:!!(env.RESEND_API_KEY&&env.EMAIL_FROM),whatsapp:!!(/^AC[a-fA-F0-9]{32}$/.test(env.TWILIO_ACCOUNT_SID||'')&&env.TWILIO_AUTH_TOKEN&&phone(env.TWILIO_WHATSAPP_FROM)&&/^HX[a-fA-F0-9]{32}$/.test(env.TWILIO_WHATSAPP_CONTENT_SID||''))};}
async function send(job,env=process.env){
 if(job.channel==='email'){
  // Resend retains idempotency keys for 24 h. Stop automatic retry before expiry.
  if(job.first_attempt_at&&Date.now()-Date.parse(job.first_attempt_at)>23*3600000)throw Object.assign(new Error('Email retry window expired; reconcile provider logs manually.'),{terminal:true});
  const reminder=job.event==='cart_reminder',label=labels[job.event]||'updated';
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':job.event_key},body:JSON.stringify({from:env.EMAIL_FROM,to:[job.destination],subject:reminder?'Your saved bag | Tripti Jewellers':`Order ${job.order_number} ${label} | Tripti Jewellers`,text:reminder?`You asked us to remind you about your saved jewellery. View your bag: ${site}/cart.html\nStock and prices may change.\nStop reminders: ${site}/account.html#notification-preferences`:`Your order ${job.order_number} is ${label}.\nView details: ${site}/account.html\n${job.event==='order_cancelled'?'Cancellation does not confirm a completed refund. Contact the store for refund status.\n':''}Notification preferences: ${site}/account.html#notification-preferences`}),signal:AbortSignal.timeout(10000)});
  const data=await response.json().catch(()=>null);if(!response.ok||!data?.id)throw new Error('Email provider did not acknowledge acceptance.');return data.id;
 }
 if(job.channel==='whatsapp'){
  const to=phone(job.destination);if(!to)throw Object.assign(new Error('WhatsApp contact must include a valid country code.'),{terminal:true});
  const body=new URLSearchParams({To:'whatsapp:'+to,From:'whatsapp:'+phone(env.TWILIO_WHATSAPP_FROM),ContentSid:env.TWILIO_WHATSAPP_CONTENT_SID,ContentVariables:JSON.stringify({'1':job.order_number,'2':labels[job.event]||'updated','3':site+'/account.html'})});
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),signal:AbortSignal.timeout(10000)});
  const data=await response.json().catch(()=>null);if(!response.ok||!data?.sid)throw Object.assign(new Error('WhatsApp acceptance could not be confirmed. Check provider logs before any manual retry.'),{terminal:true});return data.sid;
 }
 throw new Error('Unsupported notification channel.');
}
module.exports={configured,send,phone};

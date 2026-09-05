const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
for(const hash of ['#access_token=test-token&type=recovery','#error=access_denied&error_code=otp_expired']){
 test('storefront forwards recovery/error callback before consuming it: '+(hash.includes('recovery')?'recovery':'expired'),async()=>{
  let ready,destination,consumed=false;
  const document={querySelector(){return null;},addEventListener(event,fn){if(event==='DOMContentLoaded')ready=fn;}};
  const window={location:{hash,replace(value){destination=value;}},TriptiSupabase:{consumeAuthHash(){consumed=true;}}};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../js/main.js'),'utf8'),{document,window,URLSearchParams});
  await ready();assert.equal(destination,'login.html'+hash);assert.equal(consumed,false);
 });
}

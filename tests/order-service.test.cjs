const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const window={};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../js/order-service.js'),'utf8'),{window,URL});
test('tracking URLs reject executable URLs and embedded credentials',()=>{const safe=window.TriptiOrderService.safe;assert.equal(safe('javascript:alert(1)'), '');assert.equal(safe('https://user:secret@example.com'),'');assert.equal(safe('http://example.com'),'');assert.equal(safe('https://example.com/track'),'https://example.com/track');});
test('cancellation eligibility excludes dispatched and terminal orders',()=>{for(const status of ['pending','confirmed','processing'])assert.equal(window.TriptiOrderService.eligible({status}),true);for(const status of ['shipped','delivered','cancelled','unknown'])assert.equal(window.TriptiOrderService.eligible({status}),false);});
test('admin renders a selectable approval option for cancellation requests',async()=>{
 const records={innerHTML:''},status={textContent:''};let panel;
 const document={createElement:()=>({dataset:{},querySelector:s=>s==='.service-records'?records:status}),querySelector:s=>({append:el=>{if(s==='#admin-main')panel=el;}})};
 const window={TriptiSupabase:{select:async table=>table==='orders'?[{id:'order-1',order_number:'TJ-1',status:'pending'}]:[{order_id:'order-1',cancel_status:'requested',cancel_reason:'Changed mind'}]}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../js/order-service.js'),'utf8'),{window,document,URL});
 await window.TriptiOrderService.initializeAdmin();
 assert.match(records.innerHTML,/<option value="approved">Approve cancellation<\/option>/);
 assert.doesNotMatch(records.innerHTML,/<\/option\s+value=/);
 assert.equal(typeof panel.onsubmit,'function');
});

const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
test('lower admin sections switch immediately and reveal selected content',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../js/admin.js'),'utf8');
 const fn=source.slice(source.indexOf('  function showPanel('),source.indexOf('  async function requireAdmin('));
 let scrolled=0;const panels=['inventory','sales-reports'].map(name=>({id:'admin-panel-'+name,hidden:false,scrollIntoView(){scrolled++;}}));
 const buttons=['inventory','sales-reports'].map(name=>({dataset:{adminPanel:name},classList:{toggle(){}},setAttribute(){}}));
 const context={document:{querySelector:s=>panels.find(p=>'#'+p.id===s),querySelectorAll:s=>s==='.admin-panel'?panels:buttons}};
 vm.createContext(context);vm.runInContext(fn,context);
 context.showPanel('sales-reports',true);assert.equal(panels[0].hidden,true);assert.equal(panels[1].hidden,false);assert.equal(scrolled,1);
 context.showPanel('inventory');assert.equal(scrolled,1);
 context.showPanel('missing',true);assert.equal(panels[0].hidden,false);
});

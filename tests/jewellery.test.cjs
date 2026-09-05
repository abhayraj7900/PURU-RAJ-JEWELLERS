const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/main.js'),'utf8');
const storage=new Map();
const context={window:{},document:{querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Intl,console,PRODUCTS:[]};
vm.createContext(context);vm.runInContext(source,context);
test('stock urgency only appears for a real single remaining item',()=>{
 for(const stock of [undefined,0,1,5]){const html=context.productCard({id:1,name:'Test',price:100,category:'Gold',stock});assert.equal(html.includes('Only 1 left!'),stock===1);}
});
test('price breakup requires complete reconciled amounts',()=>{
 const p={id:1,price:100,category:'Gold',details:['Metal value: 70','Stone value: 0','Making charges: 20','Tax: 10']};
 assert.doesNotMatch(context.jewelleryPanels(p),/available on request/);
 p.details.pop();assert.match(context.jewelleryPanels(p),/available on request/);
 p.details.push('Tax: 11');assert.match(context.jewelleryPanels(p),/available on request/);
});
test('wishlist local caches are isolated per account and anonymous users see none',()=>{
 vm.runInContext("wishlistUserId='A';saveWishlist([1]);wishlistUserId='B';saveWishlist([2]);",context);
 assert.equal(JSON.stringify(context.getWishlist()),'[2]');vm.runInContext("wishlistUserId='A'",context);assert.equal(JSON.stringify(context.getWishlist()),'[1]');vm.runInContext('wishlistUserId=null',context);assert.equal(JSON.stringify(context.getWishlist()),'[]');
});

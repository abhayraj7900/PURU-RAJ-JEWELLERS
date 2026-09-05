const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const window={};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/checkout-extras.js'),'utf8'),{window});
const parse=window.TriptiCheckout.addressParts;
test('geocoded Indian address populates real fields without inventing a house number',()=>{
 const result=parse({address:{country_code:'in',road:'MG Road',suburb:'Sector 14',city:'Gurugram',state:'Haryana',postcode:'122001'}});
 assert.equal(result.address,'MG Road, Sector 14');assert.equal(result.city,'Gurugram');assert.equal(result.state,'Haryana');assert.equal(result.pincode,'122001');
});
test('missing or invalid geocoder fields stay blank for manual entry',()=>{
 const result=parse({address:{country_code:'in',village:'Village',postcode:'unknown'}});
 assert.equal(result.address,'');assert.equal(result.city,'Village');assert.equal(result.pincode,'');
});
test('addresses outside India are not silently accepted',()=>{
 assert.throws(()=>parse({address:{country_code:'us'}}),/Indian delivery/);
});

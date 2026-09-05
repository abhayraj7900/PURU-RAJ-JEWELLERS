(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(v);
 let applied=null,version=0;
 const fingerprint=cart=>JSON.stringify(cart.map(i=>[i.id,i.quantity,i.size||'']));
 function addressParts(payload){
  const a=payload.address||{};
  if(a.country_code&&a.country_code!=='in')throw new Error('Please enter an Indian delivery address.');
  return {address:[a.house_number,a.road||a.pedestrian,a.neighbourhood,a.suburb].filter(Boolean).join(', '),city:a.city||a.town||a.village||a.municipality||a.county||'',state:a.state||'',pincode:/^[1-9][0-9]{5}$/.test(a.postcode||'')?a.postcode:''};
 }
 function locationForm(form){
  if(form.querySelector('#checkout-detect-location'))return;
  const block=document.createElement('div');block.className='checkout-location';
  block.innerHTML='<button id="checkout-detect-location" type="button" class="button button-outline button-full">⌖ Use my current location</button><p class="form-note">Allow location access to look up your address with OpenStreetMap. Check the result and add your house / flat number.</p><p id="checkout-location-status" role="status" hidden></p><small>Address data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a></small>';
  form.querySelector('label[for="checkout-address"]').before(block);
  const button=block.querySelector('button'),status=block.querySelector('[role="status"]');let lastRequest=0,cached=null;
  button.addEventListener('click',async()=>{
   button.disabled=true;status.hidden=false;status.textContent='Detecting your location…';
   const original=Object.fromEntries(['address','city','state','pincode'].map(key=>[key,form.elements[key].value]));
   try{
    if(!navigator.geolocation)throw new Error('Location detection is unavailable. Please enter your address manually.');
    const coords=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>resolve(p.coords),e=>reject(new Error(e.code===1?'Location permission was denied. Enter your address manually or enable location in browser settings.':'Your location could not be detected. Please try again or type your address.')),{timeout:15000,maximumAge:60000,enableHighAccuracy:true}));
    status.textContent='Looking up your address…';
    let payload=cached;
    if(!payload||Math.abs(coords.latitude-payload.lat)>0.001||Math.abs(coords.longitude-payload.lng)>0.001){
     if(Date.now()-lastRequest<1500)throw new Error('Please wait a moment before trying again.');lastRequest=Date.now();
     const response=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}&addressdetails=1&accept-language=en`,{signal:AbortSignal.timeout(12000),referrerPolicy:'strict-origin-when-cross-origin'});
     if(!response.ok)throw new Error('Address lookup is temporarily unavailable. Please enter your address manually.');
     payload={...(await response.json()),lat:coords.latitude,lng:coords.longitude};cached=payload;
    }
    const parts=addressParts(payload);let changed=0;
    for(const [key,value] of Object.entries(parts))if(value&&form.elements[key].value===original[key]){form.elements[key].value=value;changed++;}
    status.textContent=changed?`Location detected (accuracy approximately ${Math.round(coords.accuracy)} m). Please verify every field and add your house / flat number.${parts.pincode?'':' Enter your PIN code manually.'}`:'Your location was found, but the address is incomplete. Please fill in the address manually.';
   }catch(e){status.textContent=e.name==='TimeoutError'?'Address lookup timed out. You can enter your address manually.':e.message;}finally{button.disabled=false;}
  });
 }
 function renderCoupon(cart,summary){
  const form=document.querySelector('#checkout-form');if(form)locationForm(form);
  const token=++version;const current=fingerprint(cart);
  if(applied?.fingerprint!==current)applied=null;
  const box=document.createElement('section');box.className='coupon-panel';
  box.innerHTML='<h3>Apply Coupon / Promo Code</h3><form class="coupon-form"><label class="sr-only" for="coupon-input">Coupon code</label><input id="coupon-input" name="code" placeholder="Enter coupon code" maxlength="32" autocomplete="off" required><button type="submit" class="button button-dark">Apply</button></form><p class="coupon-status" role="status" hidden></p><div class="coupon-applied" hidden></div><details class="coupon-available"><summary>Available coupons</summary><div class="coupon-options">Loading offers…</div></details>';
  summary.querySelector('h2').after(box);
  const couponForm=box.querySelector('form'),status=box.querySelector('.coupon-status'),badge=box.querySelector('.coupon-applied');
  function updateTotals(){
   summary.querySelector('.coupon-discount')?.remove();
   const subtotal=cart.reduce((sum,item)=>sum+getProduct(item.id).price*item.quantity,0);
   const shipping=subtotal>=STORE_CONFIG.freeShippingMinimum?0:STORE_CONFIG.standardShipping;
   if(applied){const row=document.createElement('div');row.className='summary-row coupon-discount';row.innerHTML=`<span>Coupon discount</span><strong>− ${money(applied.discount)}</strong>`;summary.querySelector('.summary-total').before(row);badge.innerHTML=`<div><strong>✓ ${esc(applied.code)}</strong><small>You save ${money(applied.discount)}</small></div><button type="button">Remove</button>`;badge.hidden=false;badge.querySelector('button').onclick=()=>{applied=null;couponForm.reset();status.hidden=true;updateTotals();};}else badge.hidden=true;
   summary.querySelector('.summary-total strong').textContent=money(subtotal+shipping-(applied?.discount||0));
   const sticky=document.querySelector('[data-sticky-total]');if(sticky)sticky.textContent=money(subtotal+shipping-(applied?.discount||0));
   summary.querySelector('.total-savings')?.remove();
   const saving=cart.reduce((sum,item)=>{const p=getProduct(item.id);return sum+Math.max(0,(p.oldPrice||p.price)-p.price)*item.quantity;},0)+(applied?.discount||0);
   if(saving>0){const row=document.createElement('div');row.className='summary-row total-savings';row.innerHTML=`<span>You save</span><strong>${money(saving)}</strong>`;summary.append(row);}
  }
  async function apply(code){
   const button=couponForm.querySelector('button');button.disabled=true;status.hidden=false;status.textContent='Checking coupon…';
   try{const quote=await window.TriptiSupabase.rpc('quote_coupon',{p_code:code,p_items:cart});if(token!==version)return;applied={...quote,fingerprint:current};status.textContent=quote.excluded_categories?.length?`Not applicable on: ${quote.excluded_categories.join(', ')}.`:'Coupon applied successfully.';status.dataset.type='success';couponForm.elements.code.value=quote.code;updateTotals();}
   catch(e){if(token!==version)return;applied=null;updateTotals();status.dataset.type='error';status.textContent=e.status===404?'Coupon service is being activated. Please try again shortly.':e.message;}finally{button.disabled=false;}
  }
  couponForm.addEventListener('submit',e=>{e.preventDefault();apply(couponForm.elements.code.value.trim().toUpperCase());});
  const options=box.querySelector('.coupon-options');
  window.TriptiSupabase.select('coupons','select=code,title,min_subtotal,excluded_categories&active=eq.true&order=created_at.desc').then(rows=>{if(token!==version)return;options.innerHTML=rows.length?rows.map(c=>`<button type="button" data-coupon="${esc(c.code)}"><strong>${esc(c.code)}</strong><span>${esc(c.title)}</span><small>Minimum bag value ${money(c.min_subtotal)}</small></button>`).join(''):'No coupons available right now.';}).catch(()=>{options.textContent='Enter a coupon code when an offer is available.';});
  options.addEventListener('click',e=>{const b=e.target.closest('[data-coupon]');if(b)apply(b.dataset.coupon);});
  updateTotals();
 }
 window.TriptiCheckout={renderCoupon,addressParts,couponCode:()=>applied?.code||'',clear:()=>{applied=null;}};
})();

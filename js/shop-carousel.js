(function(){
 'use strict';
 const marker='shop-carousel:';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const briefs=[
  ['gold-necklace','Gold, beautifully told','Statement necklaces for celebrations worth remembering.','Gold'],
  ['diamond-ring','A little brilliance','Explore diamond rings for moments that mean more.','Diamond'],
  ['jhumka-earrings','Tradition in every detail','Discover earrings that bring a festive finish to your look.','Earrings'],
  ['gold-bangles','Golden rhythm','Explore gold designs to layer, stack and make your own.','Gold'],
  ['emerald-pendant','Colour with character','Discover gemstone jewellery with a vibrant point of view.','Gemstone'],
  ['daily-chain','Your everyday signature','Simple jewellery ideas for workdays, weekends and everything between.','Daily Wear'],
  ['bridal-set','For your forever moments','Explore wedding jewellery for a celebration that is uniquely yours.','Wedding'],
  ['silver-anklets','A softer kind of shine','Discover silver-inspired styling and ask us about available designs.',''],
  ['gift-pendant','A gift with meaning','Find jewellery inspiration for the people closest to your heart.','Gifting'],
  ['diamond-studs','Small details. Lasting sparkle.','Explore diamond accents to bring a little shine to the everyday.','Diamond']
 ];
 const defaults=()=>briefs.map(([slug,title,body,category],i)=>({slot:i+1,title,body,image_url:`images/shop-carousel/${slug}.jpg`,link_url:category?`shop.html?category=${encodeURIComponent(category)}`:'contact.html',is_active:true,display_order:i}));
 function safe(value,kind='link'){
  const text=String(value||'').trim();if(!text||/[\u0000-\u001f\\]/.test(text))return '';
  try{const url=new URL(text,'https://triptijewllers.vercel.app/');if(url.protocol!=='https:'||url.username||url.password)return '';if(kind==='image'&&!/^https:\/\//i.test(text)&&!/^images\/[a-zA-Z0-9/_ .-]+$/.test(text))return '';return text;}catch{return '';}
 }
 function merge(rows){return defaults().map(d=>{const saved=rows.find(r=>r.button_label===marker+String(d.slot).padStart(2,'0'));if(!saved)return d;let content={description:saved.body,enabled:saved.is_active!==false};try{const parsed=JSON.parse(saved.body);if(parsed.version===1)content=parsed;}catch{}return {...d,id:saved.id,title:String(saved.title||d.title).slice(0,90),body:String(content.description||'').slice(0,250),image_url:safe(saved.image_url,'image')||d.image_url,link_url:safe(saved.link_url)||d.link_url,is_active:content.enabled!==false,display_order:Number.isFinite(Number(saved.display_order))?Number(saved.display_order):d.display_order};}).sort((a,b)=>a.display_order-b.display_order||a.slot-b.slot);}
 async function load(){const rows=await window.TriptiSupabase.select('banners','select=*&button_label=like.shop-carousel:*&order=updated_at.desc,id.desc');return merge(rows);}
 function windowSlots(start,count,length){return Array.from({length:count},(_,i)=>(start+i)%length);}
 async function initialize(){
  const section=document.querySelector('#shop-carousel');if(!section)return;
  let slides=defaults();let timer,resetTimer,index=0,paused=false,focused=false,hovered=false,moving=false;
  const viewport=section.querySelector('.shop-carousel-viewport'),track=section.querySelector('.shop-carousel-track'),pause=section.querySelector('[data-carousel-pause]'),position=section.querySelector('[data-carousel-position]');
  const perView=()=>Math.min(slides.length,innerWidth>=900?3:innerWidth>=600?2:1);
  function schedule(){clearInterval(timer);timer=setInterval(()=>{if(!paused&&!focused&&!hovered&&!document.hidden&&!moving&&slides.length>perView())go(index+1);},4500);}
  function active(){const count=perView();[...track.children].forEach((el,i)=>{const visible=i>=index&&i<index+count;el.inert=!visible;el.setAttribute('aria-hidden',String(!visible));el.querySelector('a').tabIndex=visible?0:-1;});position.textContent=windowSlots(index%slides.length,count,slides.length).map(n=>n+1).join(', ')+' / '+slides.length;}
  function setPosition(animated){track.style.transition=animated?'':'none';const first=track.children[0];if(first)track.style.transform=`translate3d(${-index*(first.getBoundingClientRect().width+20)}px,0,0)`;active();}
  function go(next){
   if(moving||slides.length<=perView())return;
   if(next<0){index=slides.length;setPosition(false);void track.offsetWidth;next=slides.length-1;}
   moving=true;index=next;setPosition(true);
   clearTimeout(resetTimer);resetTimer=setTimeout(()=>{if(index>=slides.length){index=0;setPosition(false);}moving=false;},550);
  }
  function render(){
   clearTimeout(resetTimer);moving=false;index=0;slides=slides.filter(s=>s.is_active);
   viewport.hidden=!slides.length;section.querySelector('.shop-carousel-controls').hidden=slides.length<2;
   if(!slides.length){track.innerHTML='';position.textContent='';clearInterval(timer);return;}
   const shown=[...slides,...slides.slice(0,3)];
   track.innerHTML=shown.map((s,i)=>`<article class="shop-carousel-card" role="group" aria-roledescription="slide" aria-label="${i%slides.length+1} of ${slides.length}"><a href="${esc(s.link_url)}"><div class="shop-carousel-image"><img src="${esc(s.image_url)}" alt="${esc(s.title)} — jewellery collection inspiration" width="1024" height="1024" ${i<3?'fetchpriority="high"':'loading="lazy"'} decoding="async"></div><div class="shop-carousel-copy"><span class="eyebrow">${String(s.slot).padStart(2,'0')} / THE TRIPTI EDIT</span><h2>${esc(s.title)}</h2><p>${esc(s.body)}</p><span class="shop-carousel-link">Explore collection <span aria-hidden="true">↗</span></span></div></a></article>`).join('');
   track.querySelectorAll('img').forEach((img,i)=>img.addEventListener('error',()=>{const fallback=defaults().find(s=>s.slot===shown[i].slot).image_url;if(img.getAttribute('src')!==fallback)img.src=fallback;},{once:true}));
   setPosition(false);schedule();
  }
  section.querySelector('[data-carousel-prev]').onclick=()=>{go(index-1);schedule();};
  section.querySelector('[data-carousel-next]').onclick=()=>{go(index+1);schedule();};
  pause.onclick=()=>{paused=!paused;pause.textContent=paused?'Play':'Pause';pause.setAttribute('aria-pressed',String(paused));schedule();};
  track.addEventListener('focusin',()=>focused=true);track.addEventListener('focusout',()=>{focused=false;schedule();});
  viewport.addEventListener('mouseenter',()=>{if(matchMedia('(hover:hover)').matches)hovered=true;});viewport.addEventListener('mouseleave',()=>hovered=false);
  let startX=null,startY=null;
  viewport.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;startY=e.touches[0].clientY;},{passive:true});
  viewport.addEventListener('touchend',e=>{if(startX===null)return;const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){go(index+(dx<0?1:-1));schedule();}startX=null;},{passive:true});
  window.addEventListener('resize',()=>{clearTimeout(resetTimer);index=0;moving=false;if(slides.length)setPosition(false);schedule();});
  document.addEventListener('visibilitychange',schedule);
  render(); // Photos and motion never wait for the network.
  try{slides=await load();render();}catch{/* Keep the complete local campaign if remote settings are unavailable. */}
 }
 async function admin(){
  const api=window.TriptiSupabase,b=document.createElement('button');b.type='button';b.dataset.adminPanel='shop-carousel';b.textContent='Shop carousel';document.querySelector('.admin-sidebar nav').append(b);
  const panel=document.createElement('section');panel.id='admin-panel-shop-carousel';panel.className='admin-panel';panel.hidden=true;panel.innerHTML='<h2>Shop jewellery carousel</h2><p>10 collection cards. Desktop: 3 together; tablet: 2; phone: 1 with swipe. Each card advances automatically every 4.5 seconds. Changes are saved to the live website. Campaign images are illustrative, not exact inventory photographs.</p><p role="status"></p><div class="carousel-editor-grid"></div>';document.querySelector('#admin-main').append(panel);
  let cards;
  try{cards=await load();}catch(e){panel.querySelector('[role=status]').textContent='Could not load banner settings. Refresh and check your admin access. '+e.message;return;}
  panel.querySelector('.carousel-editor-grid').innerHTML=cards.map(s=>`<form class="admin-form carousel-editor" data-slot="${s.slot}"><h3>Card ${s.slot}</h3><img src="${esc(s.image_url)}" alt="Card ${s.slot} preview" loading="lazy"><label>Title<input name="title" value="${esc(s.title)}" maxlength="90" required></label><label>Short description<textarea name="body" maxlength="250">${esc(s.body)}</textarea></label><label>Replace photo (JPG, PNG, WebP; up to 5 MB)<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><label>Or image URL<input name="image_url" value="${esc(s.image_url)}" required></label><label>Collection / destination link<input name="link_url" value="${esc(s.link_url)}" required></label><label>Display order<input name="display_order" type="number" min="0" max="100" value="${s.display_order}" required></label><label class="checkbox-single"><input name="is_active" type="checkbox" ${s.is_active?'checked':''}> Show this card</label><button class="button button-gold" type="submit">Save card ${s.slot}</button><p role="status" aria-live="polite"></p></form>`).join('');
  panel.querySelectorAll('form').forEach(form=>form.addEventListener('submit',async e=>{
   e.preventDefault();if(!form.reportValidity())return;const button=form.querySelector('[type=submit]'),status=form.querySelector('[role=status]');button.disabled=true;status.textContent='Saving…';
   try{
    const values=Object.fromEntries(new FormData(form)),slot=Number(form.dataset.slot),existing=cards.find(s=>s.slot===slot);
    let image=safe(values.image_url,'image'),link=safe(values.link_url);if(!image||!link)throw Error('Use a valid HTTPS URL or a website-relative path.');
    if(values.photo?.size){const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[values.photo.type];if(!ext||values.photo.size>5242880)throw Error('Choose a JPG, PNG or WebP photo under 5 MB.');image=await api.uploadPublic('product-images',`shop-carousel/${crypto.randomUUID()}.${ext}`,values.photo);}
    // Keep the namespaced configuration readable under the existing active-banner RLS.
    // Visibility lives in its payload so hiding a card cannot resurrect the local default.
    const payload={title:values.title.trim(),body:JSON.stringify({version:1,description:values.body.trim(),enabled:form.elements.is_active.checked}),image_url:image,link_url:link,button_label:marker+String(slot).padStart(2,'0'),display_order:Number(values.display_order),is_active:true};
    if(!payload.title)throw Error('Enter a title.');
    const saved=existing.id?await api.update('banners',payload,`id=eq.${existing.id}`):await api.insert('banners',payload);
    if(!saved?.[0]?.id)throw Error('Save was not confirmed. Refresh before retrying.');
    Object.assign(existing,payload,{id:saved[0].id});form.elements.image_url.value=image;form.elements.photo.value='';form.querySelector('img').src=image;status.textContent='Saved to the live shop. Refresh the shop page to see it.';
   }catch(err){status.textContent=err.message;}finally{button.disabled=false;}
  }));
 }
 window.TriptiShopCarousel={defaults,merge,safe,windowSlots,initialize,admin};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();

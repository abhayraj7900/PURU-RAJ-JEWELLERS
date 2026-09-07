/* Shared footer, information pages, store locator and delivery settings. */
(function () {
  "use strict";
  const LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const DRAFT_KEY = "triptiContentPreviewV1";
  const pages = [
    ["delivery", "Delivery Information", "useful", "Choose your jewellery and enter your delivery PIN code to check the areas we serve. Delivery estimates are shown when coverage has been confirmed. For help with a particular order, contact our team."],
    ["international", "International Shipping", "useful", "For delivery outside India, please contact Puru Raj Jewelllers before placing an order. Our team will confirm whether delivery is available, along with charges and any additional requirements."],
    ["payments", "Payment Options", "useful", "Available payment methods are shown at checkout. Never share a payment PIN, password or OTP with anyone. For help with a payment or refund, contact our team with your order number."],
    ["returns", "Returns", "useful", "If an item arrives damaged or differs from your order, contact our team with your order number and photographs. Please keep the item and its original packaging. Our team will explain the applicable return or replacement process before you send anything back."],
    ["blog", "Blog", "information", "Stories from Puru Raj Jewelllers\n\nOur latest jewellery stories and care notes will be shared here. Speak to our team for guidance on selecting and caring for your jewellery."],
    ["offers", "Offers & Contest Details", "information", "Current offers and their terms will be published here. Contact our team to confirm eligibility, availability and the final price before purchasing."],
    ["faq", "Help & FAQs", "information", "How do I order?\nBrowse the collection, choose your design and size, add it to your bag and continue to checkout.\n\nWhere can I see my order?\nSign in to My Account to view your order history and available tracking details.\n\nNeed help with sizing or a gift?\nContact our team before ordering."],
    ["cookies", "Cookie Policy", "information", "This website uses browser storage to remember your shopping bag, saved items and sign-in session. You can remove this information through your browser settings. Removing it may sign you out and clear locally saved preferences. Contact us if you have questions about information stored on your device."],
    ["security", "Cyber Security Policy", "legal", "Report a suspicious message or a possible website security issue to our contact email. Do not include passwords, OTPs, card numbers or other secret information in your report. Our team will review it and contact you when more information is needed."],
    ["terms", "Terms & Conditions", "legal", "Please review the product details, price, payment method and delivery information before placing an order. Contact our team to clarify availability, customisation, cancellations or returns. The terms applicable to a specific service or offer will be communicated with that service or offer."],
    ["privacy", "Privacy Notice", "legal", "We use the contact and delivery information you provide to assist with enquiries and fulfil orders. Your account gives you access to your saved details and orders. Order information may be shared with the payment and delivery services needed to process your purchase. Contact our team for requests concerning your personal information."],
    ["disclaimer", "Disclaimer", "legal", "Product photographs may appear different across screens. Review the product description and confirm any questions about size, weight, purity, availability or pricing with Puru Raj Jewelllers before purchasing."]
  ].map(([slug, title, group, body]) => ({ slug, title, group, body }));
  const DEFAULTS = {
    brand: "Puru Raj Jewelllers", tagline: "Timeless beauty, lasting trust.",
    phone: "", whatsapp: "", email: "triptijewellers4826@gmail.com", hours: "",
    copyright: "Puru Raj Jewelllers. All rights reserved.",
    instagram: "", facebook: "", youtube: "", x: "", playStore: "", appStore: "",
    paymentNote: "Available payment methods are shown at checkout.",
    locatorTitle: "Welcome to Puru Raj Jewelllers!", locatorIntro: "Find a store near you. Search by city, area or PIN code.",
    deliveryNote: "Delivery estimates are subject to order confirmation and courier availability.",
    stores: [], zones: [], pages
  };
  let data = structuredClone(DEFAULTS);
  let loading;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function safeUrl(value) {
    try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
  }
  function readDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; } }
  function normalize(value) {
    const source = value && typeof value === "object" ? value : {};
    const result = structuredClone(DEFAULTS);
    Object.keys(DEFAULTS).filter(key=>typeof DEFAULTS[key]==="string").forEach(key=>{if(typeof source[key]==="string")result[key]=source[key].slice(0,2000);});
    result.stores = (Array.isArray(source.stores)?source.stores:[]).filter(s=>s&&typeof s==="object").map((s,i)=>{
      const store={id:String(s.id||`store-${i}`),active:s.active!==false};
      ["name","address","city","state","pincode","phone","hours","mapUrl"].forEach(key=>store[key]=String(s[key]??""));
      store.lat=s.lat!==""&&s.lat!=null&&Number.isFinite(Number(s.lat))&&Math.abs(Number(s.lat))<=90?Number(s.lat):"";
      store.lng=s.lng!==""&&s.lng!=null&&Number.isFinite(Number(s.lng))&&Math.abs(Number(s.lng))<=180?Number(s.lng):"";
      return store;
    });
    result.zones = (Array.isArray(source.zones)?source.zones:[]).filter(z=>z&&/^[1-9][0-9]{1,5}$/.test(String(z.prefix))).map((z,i)=>({id:String(z.id||`zone-${i}`),prefix:String(z.prefix),name:String(z.name||""),note:String(z.note||""),available:z.available===true,cod:z.cod===true,active:z.active!==false,minDays:Math.max(1,Math.min(90,Number(z.minDays)||4)),maxDays:Math.max(Number(z.minDays)||4,Math.min(90,Number(z.maxDays)||8))}));
    result.pages = DEFAULTS.pages.map(p=>{
      const saved=Array.isArray(source.pages)?source.pages.find(row=>row&&row.slug===p.slug):null;
      return {...p,title:typeof saved?.title==="string"?saved.title.slice(0,100):p.title,body:typeof saved?.body==="string"?saved.body.slice(0,50000):p.body};
    });
    // Display the renamed store even when older dashboard copy is still saved.
    // Limit this migration to copy fields; never alter email, URLs or account identifiers.
    const renameBrand = text => String(text).replace(/\bTripti\s*Jewellers\b/gi, "Puru Raj Jewelllers");
    ["brand", "tagline", "copyright", "locatorTitle", "locatorIntro"].forEach(key => result[key] = renameBrand(result[key]));
    result.pages.forEach(page => { page.title = renameBrand(page.title); page.body = renameBrand(page.body); });
    result.stores.forEach(store => { store.name = renameBrand(store.name); });
    return result;
  }
  async function load() {
    if (loading) return loading;
    loading = (async () => {
      if (LOCAL) data = normalize(readDraft() || DEFAULTS);
      else {
        try {
          const rows = await window.TriptiSupabase.select("site_content", "select=content&id=eq.main&limit=1");
          data = normalize(rows[0]?.content || DEFAULTS);
        } catch { data = normalize(DEFAULTS); }
      }
      return data;
    })();
    return loading;
  }
  async function save(value) {
    const next = normalize(value);
    if (LOCAL) localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    else await window.TriptiSupabase.insert("site_content", { id: "main", content: next }, { upsert: true, onConflict: "id" });
    data = next;
    loading = Promise.resolve(data);
    return data;
  }
  const pageLink = p => `<a href="information.html?page=${encodeURIComponent(p.slug)}">${esc(p.title)}</a>`;
  function footer() {
    const target = document.querySelector(".site-footer");
    if (!target) return;
    const socials = [["instagram","Instagram"],["x","X"],["facebook","Facebook"],["youtube","YouTube"]].filter(([key]) => safeUrl(data[key]));
    const apps = [["playStore","Play Store"],["appStore","App Store"]].filter(([key]) => safeUrl(data[key]));
    target.innerHTML = `<div class="container footer-expanded">
      <div class="footer-service-columns">
        <section><h2>Useful Links</h2>${data.pages.filter(p=>p.group==="useful").map(pageLink).join("")}<a href="account.html#account-orders">Track your Order</a><a href="stores.html">Find a Store</a></section>
        <section><h2>Information</h2>${data.pages.filter(p=>p.group==="information").map(pageLink).join("")}<a href="about.html">About ${esc(data.brand)}</a></section>
        <section class="footer-contact-column"><h2>Contact Us</h2>${data.phone ? `<a href="tel:${esc(data.phone.replace(/[^+0-9]/g,""))}">${esc(data.phone)}</a>` : `<a href="contact.html">Speak with our team</a>`}<a href="mailto:${esc(data.email)}">${esc(data.email)}</a>${data.hours ? `<p>${esc(data.hours)}</p>` : ""}<h2>Chat With Us</h2>${data.whatsapp ? `<a href="https://wa.me/${data.whatsapp.replace(/\D/g,"")}" target="_blank" rel="noopener">${esc(data.whatsapp)}</a>` : ""}<div class="footer-contact-actions"><a href="contact.html" aria-label="Send a message">Message us ↗</a><a href="stores.html">Visit a store ↗</a></div></section>
      </div>
      <div class="footer-connect-row"><a class="footer-signature" href="index.html"><img src="images/puru-raj-prj-logo.png" alt=""><span>${esc(data.brand)}<small>${esc(data.tagline)}</small></span></a>${apps.length ? `<div class="footer-apps">${apps.map(([key,label])=>`<a href="${esc(safeUrl(data[key]))}" target="_blank" rel="noopener"><small>Download on the</small>${label} ↗</a>`).join("")}</div>` : ""}${socials.length ? `<nav class="footer-socials" aria-label="Social media"><span>Social</span>${socials.map(([key,label])=>`<a href="${esc(safeUrl(data[key]))}" target="_blank" rel="noopener">${label} ↗</a>`).join("")}</nav>` : ""}</div>
      <div class="footer-payments"><span>Payment options</span><p>${esc(data.paymentNote)}</p><a href="information.html?page=payments">Learn more →</a></div>
      <div class="footer-legal"><p>© ${new Date().getFullYear()} ${esc(data.copyright)}</p><nav aria-label="Policies">${data.pages.filter(p=>p.group==="legal").map(pageLink).join("")}</nav></div>
    </div>`;
  }
  function information() {
    const target = document.querySelector("#information-content");
    if (!target) return;
    const slug = new URLSearchParams(location.search).get("page") || "delivery";
    const page = data.pages.find(p=>p.slug === slug);
    document.querySelector("#information-navigation").innerHTML = data.pages.map(p=>`<a href="information.html?page=${encodeURIComponent(p.slug)}" ${p.slug===slug?'aria-current="page"':""}>${esc(p.title)}</a>`).join("");
    if (!page) { target.innerHTML = '<h1>Page not found</h1><a href="contact.html">Contact our team</a>'; return; }
    document.title = `${page.title} | ${data.brand}`;
    target.innerHTML = `<p class="eyebrow">${esc(data.brand)} · Customer care</p><h1>${esc(page.title)}</h1><div class="information-copy">${page.body.split(/\n\s*\n/).map(p=>`<p>${esc(p).replace(/\n/g,"<br>")}</p>`).join("")}</div>${page.slug==="delivery"?'<a class="button button-dark" href="delivery.html">Check your delivery PIN code →</a>':""}<div class="information-help"><p>Need a little more help?</p><a class="text-link" href="contact.html">Contact Puru Raj Jewelllers →</a></div>`;
  }
  function distance(lat, lng, store) {
    if (store.lat === "" || store.lng === "" || store.lat == null || store.lng == null) return Infinity;
    const rad = Math.PI/180;
    const a = Math.sin((store.lat-lat)*rad/2)**2 + Math.cos(lat*rad)*Math.cos(store.lat*rad)*Math.sin((store.lng-lng)*rad/2)**2;
    return 6371*2*Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0,1-a)));
  }
  function locate() {
    return new Promise((resolve,reject)=> {
      if (!navigator.geolocation) return reject(new Error("Location detection is unavailable. Please enter your city or PIN code."));
      navigator.geolocation.getCurrentPosition(p=>resolve(p.coords), e=>reject(new Error(e.code===1 ? "Location access was declined. You can still search by city or PIN code." : "We could not detect your location. Please try again or enter your PIN code.")), { timeout: 12000, maximumAge: 60000, enableHighAccuracy: false });
    });
  }
  function stores() {
    const target = document.querySelector("#store-results");
    if (!target) return;
    document.querySelector("#locator-title").textContent = data.locatorTitle;
    document.querySelector("#locator-intro").textContent = data.locatorIntro;
    const form = document.querySelector("#store-search"), input = form.elements.query;
    const status = document.querySelector("#locator-status"), button = document.querySelector("#detect-location");
    const active = data.stores.filter(s=>s.active !== false);
    const cities = [...new Set(active.map(s=>s.city).filter(Boolean))];
    const cityBox = document.querySelector("#store-cities");
    cityBox.innerHTML = cities.map(city=>`<button type="button" data-city="${esc(city)}"><small>${active.filter(s=>s.city===city).length} store${active.filter(s=>s.city===city).length===1?"":"s"}</small><span aria-hidden="true">⌖</span><strong>${esc(city)}</strong></button>`).join("");
    document.querySelector("#popular-cities").hidden = !cities.length;
    function render(query="", coords=null) {
      let results = active.filter(s=>`${s.name} ${s.address} ${s.city} ${s.state} ${s.pincode}`.toLowerCase().includes(query.trim().toLowerCase()));
      if (coords) results.sort((a,b)=>distance(coords.latitude,coords.longitude,a)-distance(coords.latitude,coords.longitude,b));
      document.querySelector("#store-result-count").textContent = `${results.length} store${results.length===1?"":"s"}${coords?" · nearest first":""}`;
      target.innerHTML = results.length ? results.map(s=>{
        const km = coords ? distance(coords.latitude,coords.longitude,s) : Infinity;
        const destination = s.lat !== "" && s.lat != null && s.lng !== "" && s.lng != null ? `${s.lat},${s.lng}` : `${s.name}, ${s.address}, ${s.city}, ${s.state}, ${s.pincode}`;
        const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}${coords?`&origin=${coords.latitude},${coords.longitude}`:""}`;
        return `<article class="locator-store-card"><div class="store-card-top"><span class="eyebrow">${esc(s.city)}</span>${Number.isFinite(km)?`<small>${km.toFixed(1)} km away · straight-line distance</small>`:""}</div><h3>${esc(s.name)}</h3><p>${esc([s.address,s.city,s.state,s.pincode].filter(Boolean).join(", "))}</p>${s.hours?`<p class="store-hours">${esc(s.hours)}</p>`:""}<div class="store-card-actions"><a href="${esc(directions)}" target="_blank" rel="noopener" class="button button-dark">Get directions ↗</a>${s.phone?`<a href="tel:${esc(s.phone.replace(/[^+0-9]/g,""))}" class="text-link">Call store</a>`:""}${safeUrl(s.mapUrl)?`<a href="${esc(safeUrl(s.mapUrl))}" target="_blank" rel="noopener" class="text-link">View map</a>`:""}</div></article>`;
      }).join("") : `<div class="locator-empty"><span aria-hidden="true">⌖</span><h3>${active.length?"No matching store":"Let us help you plan your visit"}</h3><p>${active.length?"Try a nearby city, area or a different PIN code.":"Contact our team for the current store address and opening hours."}</p><a class="text-link" href="contact.html">Contact our team →</a></div>`;
    }
    form.addEventListener("submit",e=>{e.preventDefault();status.textContent="";render(input.value);});
    cityBox.addEventListener("click",e=>{const city=e.target.closest("[data-city]");if(city){input.value=city.dataset.city;render(input.value);}});
    document.querySelector("#clear-store-search").addEventListener("click",()=>{input.value="";status.textContent="";render();});
    button.addEventListener("click",async()=>{
      button.disabled=true;status.textContent="Detecting your location…";
      try { const coords=await locate(); input.value="";render("",coords);status.textContent=active.some(s=>Number.isFinite(distance(coords.latitude,coords.longitude,s)))?"Location detected. Stores with a map pin are sorted by distance.":"Location detected. Contact our team for a store near you."; }
      catch(e){status.textContent=e.message;} finally {button.disabled=false;}
    });
    render();
  }
  function deliveryResult(pin) {
    if (!/^[1-9][0-9]{5}$/.test(pin)) return { type:"error", message:"Enter a valid 6-digit Indian PIN code." };
    const zone = [...data.zones].filter(z=>z.active!==false && pin.startsWith(z.prefix)).sort((a,b)=>b.prefix.length-a.prefix.length)[0];
    if (!zone) return { type:"info", message:`Please contact our team to confirm delivery to ${pin}. We do not have a confirmed estimate for this PIN code yet.` };
    if (!zone.available) return { type:"error", message:`Delivery to ${pin} is currently unavailable. Contact our team for assistance.` };
    return { type:"success", message:`Delivery to ${pin}: estimated ${zone.minDays}–${zone.maxDays} working days. ${zone.cod?"Cash on delivery may be available.":"Prepaid orders only."} ${zone.note || ""} ${data.deliveryNote}` };
  }
  function deliveryWidget() {
    return `<section class="delivery-checker"><p class="eyebrow">Delivery details</p><h2>Where shall we deliver?</h2><form data-delivery-check><label>Country<select name="country"><option value="IN">India</option></select></label><label>Delivery PIN code<div class="pin-entry"><input name="pincode" inputmode="numeric" autocomplete="postal-code" pattern="[1-9][0-9]{5}" maxlength="6" placeholder="Enter PIN code" required><button class="button button-dark" type="submit">Check →</button></div></label><p class="delivery-result" role="status" hidden></p></form><a class="text-link" href="stores.html">Prefer to visit? Find a store →</a></section>`;
  }
  function deliveries() {
    const target = document.querySelector("#delivery-page-content");
    const product = document.querySelector(".product-info .delivery-note");
    if(target) target.innerHTML=deliveryWidget();
    if(product) product.outerHTML=deliveryWidget();
    const bag = document.querySelector('#cart-items');
    if (bag && !document.querySelector('#bag-delivery')) { const block = document.createElement('div'); block.id = 'bag-delivery'; block.innerHTML = deliveryWidget(); bag.before(block); }
    document.querySelectorAll("[data-delivery-check]").forEach(form=>form.addEventListener("submit",e=>{
      e.preventDefault();const pin=form.elements.pincode.value.trim();const result=deliveryResult(pin);const box=form.querySelector(".delivery-result");box.textContent=result.message;box.dataset.type=result.type;box.hidden=false;
    }));
  }
  async function initializePublic() { await load(); footer(); information(); stores(); deliveries(); }
  window.TriptiContent={load,save,initializePublic,defaults:DEFAULTS,isLocal:LOCAL,esc,safeUrl,distance,deliveryResult};
})();

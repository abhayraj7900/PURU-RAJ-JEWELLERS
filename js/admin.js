/* Tripti Jewellers admin dashboard. Supabase RLS remains the source of authorization. */
(function () {
  "use strict";

  const api = window.TriptiSupabase;
  const loading = document.querySelector("#admin-loading");
  const dashboard = document.querySelector("#admin-dashboard");
  const denied = document.querySelector("#admin-denied");
  const message = document.querySelector("#admin-message");
  let user = null;
  let products = [];
  let categories = [];
  let banners = [];
  let editingProductId = null;
  let editingBannerId = null;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  }

  function slugify(value) {
    return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function setMessage(text, type = "success") {
    message.textContent = text;
    message.dataset.type = type;
    message.hidden = !text;
    if (text) window.setTimeout(() => { message.hidden = true; }, 3500);
  }

  function showPanel(name, reveal = false) {
    const selected = document.querySelector(`#admin-panel-${name}`);
    if (!selected) return;
    document.querySelectorAll("[data-admin-panel]").forEach((button) => {
      const active = button.dataset.adminPanel === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".admin-panel").forEach((panel) => { panel.hidden = panel.id !== `admin-panel-${name}`; });
    // Do not retain the previous section's page scroll after a menu click.
    if (reveal) selected.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  async function requireAdmin() {
    if (!api) throw new Error("Admin service could not load.");
    api.consumeAuthHash();
    const session = await api.getSession();
    if (!session) {
      window.location.replace("login.html?returnTo=admin.html");
      return false;
    }
    user = await api.getUser();
    if (!user) {
      window.location.replace("login.html?returnTo=admin.html");
      return false;
    }
    const rows = await api.select("profiles", `select=*&id=eq.${encodeURIComponent(user.id)}&limit=1`);
    const profile = rows?.[0];
    if (!profile) throw new Error("Admin profile was not found. Complete the Supabase database setup first.");
    if (profile.role !== "admin") {
      loading.hidden = true;
      denied.hidden = false;
      return false;
    }
    document.querySelector("#admin-name").textContent = profile.full_name || "Tripti Admin";
    document.querySelector("#admin-email").textContent = profile.email;
    return true;
  }

  function productPayload(form) {
    const values = new FormData(form);
    const name = values.get("name").trim();
    const details = values.get("details").split("\n").map((item) => item.trim()).filter(Boolean);
    const sizes = values.get("sizes").split(",").map((item) => item.trim()).filter(Boolean);
    const oldPrice = values.get("old_price").trim();
    return {
      name,
      slug: slugify(name),
      category: values.get("category").trim(),
      price: Number(values.get("price")),
      old_price: oldPrice ? Number(oldPrice) : null,
      stock: Number(values.get("stock")),
      image_url: values.get("image_url").trim() || "images/hero-jewellery.png",
      image_position: values.get("image_position").trim() || "center",
      image_alt: values.get("image_alt").trim() || name,
      badge: values.get("badge").trim(),
      featured: values.get("featured") === "on",
      is_active: values.get("is_active") === "on",
      description: values.get("description").trim(),
      details,
      sizes,
      display_order: Number(values.get("display_order") || 0)
    };
  }

  async function loadProducts() {
    products = await api.select("products", "select=*&order=display_order.asc,created_at.desc");
    const body = document.querySelector("#admin-products-body");
    body.innerHTML = products.length ? products.map((product) => `
      <tr>
        <td><div class="admin-product-cell"><img src="${escapeHtml(product.image_url)}" alt=""><div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category)}</small></div></div></td>
        <td>${formatPrice(product.price)}${product.old_price ? `<small class="table-old-price">${formatPrice(product.old_price)}</small>` : ""}</td>
        <td>${product.stock}</td>
        <td><span class="status-badge ${product.is_active ? "status-delivered" : "status-cancelled"}">${product.is_active ? "Active" : "Hidden"}</span></td>
        <td><div class="table-actions"><button type="button" data-edit-product="${product.id}">Edit</button><button class="danger-action" type="button" data-delete-product="${product.id}">Delete</button></div></td>
      </tr>`).join("") : '<tr><td colspan="5">No products yet.</td></tr>';
    document.querySelector("#stat-products").textContent = products.filter((product) => product.is_active).length;
    document.querySelector("#stat-stock").textContent = products.reduce((total, product) => total + Number(product.stock), 0);
  }

  async function loadOrders() {
    let orders;
    try {
      orders = await api.select("orders", "select=id,order_number,invoice_number,status,payment_status,shipping_status,shipment_id,tracking_url,customer_name,email,phone,total,created_at,order_items(product_name,quantity,size)&order=created_at.desc");
    } catch (error) {
      orders = await api.select("orders", "select=id,order_number,status,customer_name,email,phone,total,created_at,order_items(product_name,quantity,size)&order=created_at.desc");
    }
    const body = document.querySelector("#admin-orders-body");
    body.innerHTML = orders.length ? orders.map((order) => `
      <tr>
        <td><strong>${escapeHtml(order.order_number)}</strong><small>${escapeHtml(order.invoice_number || "Invoice pending")}</small><small>${formatDate(order.created_at)}</small></td>
        <td><strong>${escapeHtml(order.customer_name)}</strong><small>${escapeHtml(order.phone)}</small></td>
        <td>${(order.order_items || []).map((item) => `${escapeHtml(item.product_name)} × ${item.quantity}${item.size ? ` (${escapeHtml(item.size)})` : ""}`).join("<br>")}</td>
        <td>${formatPrice(order.total)}</td>
        <td><strong>${escapeHtml((order.payment_status || "pending").replace(/_/g, " "))}</strong><small>${escapeHtml((order.shipping_status || "not created").replace(/_/g, " "))}</small>${order.tracking_url ? `<a class="table-link" href="${escapeHtml(order.tracking_url)}" target="_blank" rel="noopener">Track</a>` : ""}</td>
        <td><select data-order-status="${escapeHtml(order.id)}" aria-label="Status for ${escapeHtml(order.order_number)}">${["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"].map((status) => `<option value="${status}" ${status === order.status ? "selected" : ""}>${status}</option>`).join("")}</select></td>
      </tr>`).join("") : '<tr><td colspan="6">No orders yet.</td></tr>';
    document.querySelector("#stat-orders").textContent = orders.length;
    document.querySelector("#stat-revenue").textContent = formatPrice(orders.filter((order) => order.status !== "cancelled").reduce((total, order) => total + Number(order.total), 0));
  }

  async function loadCustomers() {
    const customers = await api.select("profiles", "select=id,email,full_name,phone,role,created_at&order=created_at.desc");
    const body = document.querySelector("#admin-customers-body");
    body.innerHTML = customers.length ? customers.map((customer) => `
      <tr><td><strong>${escapeHtml(customer.full_name || "Customer")}</strong><small>${escapeHtml(customer.email)}</small></td><td>${escapeHtml(customer.phone || "—")}</td><td>${escapeHtml(customer.role)}</td><td>${formatDate(customer.created_at)}</td></tr>`).join("") : '<tr><td colspan="4">No customers yet.</td></tr>';
    document.querySelector("#stat-customers").textContent = customers.filter((customer) => customer.role === "customer").length;
  }

  async function loadContacts() {
    const body = document.querySelector("#admin-contacts-body");
    try {
      const contacts = await api.select("contact_messages", "select=id,name,email,phone,message,status,created_at&order=created_at.desc");
      body.innerHTML = contacts.length ? contacts.map((contact) => `
        <tr>
          <td><strong>${escapeHtml(contact.name)}</strong><small>${escapeHtml(contact.email)}</small><small>${escapeHtml(contact.phone)}</small></td>
          <td class="admin-message-cell">${escapeHtml(contact.message)}</td>
          <td>${formatDate(contact.created_at)}</td>
          <td><select data-contact-status="${escapeHtml(contact.id)}" aria-label="Message status for ${escapeHtml(contact.name)}">${["new", "in_progress", "resolved", "spam"].map((status) => `<option value="${status}" ${status === contact.status ? "selected" : ""}>${status.replace(/_/g, " ")}</option>`).join("")}</select></td>
        </tr>`).join("") : '<tr><td colspan="4">No messages yet.</td></tr>';
      document.querySelector("#stat-messages").textContent = contacts.filter((contact) => contact.status === "new").length;
    } catch (error) {
      body.innerHTML = '<tr><td colspan="4">Messages will appear after the commerce database upgrade is activated.</td></tr>';
      document.querySelector("#stat-messages").textContent = "—";
    }
  }

  async function loadCategories() {
    categories = await api.select("categories", "select=*&order=display_order.asc");
    document.querySelector("#product-category-options").innerHTML = categories.map((category) => `<option value="${escapeHtml(category.name)}"></option>`).join("");
    document.querySelector("#category-list").innerHTML = categories.map((category) => `<li><span>${escapeHtml(category.name)}</span><button type="button" data-delete-category="${category.id}" aria-label="Delete ${escapeHtml(category.name)}">×</button></li>`).join("");
  }

  async function loadSettings() {
    const rows = await api.select("site_settings", "select=*&id=eq.1&limit=1");
    const settings = rows?.[0];
    if (!settings) return;
    const form = document.querySelector("#settings-form");
    Object.entries(settings).forEach(([key, value]) => {
      const field = form.elements.namedItem(key);
      if (field) field.value = value ?? "";
    });
  }

  async function loadBanners() {
    banners = await api.select("banners", "select=*&button_label=not.like.shop-carousel:*&order=display_order.asc,created_at.desc");
    document.querySelector("#banner-list").innerHTML = banners.length ? banners.map((banner) => `
      <article class="banner-admin-card"><div><p class="eyebrow">${banner.is_active ? "Active" : "Hidden"}</p><h3>${escapeHtml(banner.title)}</h3><p>${escapeHtml(banner.body)}</p></div><div class="table-actions"><button type="button" data-edit-banner="${banner.id}">Edit</button><button class="danger-action" type="button" data-delete-banner="${banner.id}">Delete</button></div></article>`).join("") : '<p class="dashboard-muted">No banners yet.</p>';
  }

  function resetProductForm() {
    editingProductId = null;
    const form = document.querySelector("#product-form");
    form.reset();
    form.elements.is_active.checked = true;
    form.elements.image_position.value = "center";
    document.querySelector("#product-form-title").textContent = "Add product";
    document.querySelector("#product-submit").textContent = "Save product";
    document.querySelector("#product-cancel").hidden = true;
  }

  function editProduct(id) {
    const product = products.find((item) => item.id === Number(id));
    if (!product) return;
    editingProductId = product.id;
    const form = document.querySelector("#product-form");
    ["name", "category", "price", "old_price", "stock", "image_url", "image_position", "image_alt", "badge", "description", "display_order"].forEach((key) => {
      form.elements[key].value = product[key] ?? "";
    });
    form.elements.details.value = (product.details || []).join("\n");
    form.elements.sizes.value = (product.sizes || []).join(", ");
    form.elements.featured.checked = product.featured;
    form.elements.is_active.checked = product.is_active;
    document.querySelector("#product-form-title").textContent = "Edit product";
    document.querySelector("#product-submit").textContent = "Update product";
    document.querySelector("#product-cancel").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-panel]");
    if (button) showPanel(button.dataset.adminPanel, true);
  });

  document.querySelector("#product-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const button = document.querySelector("#product-submit");
    button.disabled = true;
    try {
      const payload = productPayload(form);
      const imageFile = form.elements.image_file.files[0];
      if (imageFile) {
        const path = `${Date.now()}-${payload.slug}.${imageFile.name.split(".").pop().toLowerCase()}`;
        payload.image_url = await api.uploadPublic("product-images", path, imageFile);
      }
      if (editingProductId) await api.update("products", payload, `id=eq.${editingProductId}&select=*`);
      else await api.insert("products", payload);
      setMessage(editingProductId ? "Product updated." : "Product added.");
      resetProductForm();
      await loadProducts();
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#product-cancel").addEventListener("click", resetProductForm);
  document.querySelector("#admin-products-body").addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit-product]");
    const remove = event.target.closest("[data-delete-product]");
    if (edit) editProduct(edit.dataset.editProduct);
    if (remove && window.confirm("Delete this product permanently?")) {
      try {
        await api.remove("products", `id=eq.${Number(remove.dataset.deleteProduct)}`);
        setMessage("Product deleted.");
        await loadProducts();
      } catch (error) { setMessage(error.message, "error"); }
    }
  });

  document.querySelector("#admin-orders-body").addEventListener("change", async (event) => {
    const select = event.target.closest("[data-order-status]");
    if (!select) return;
    select.disabled = true;
    try {
      await api.update("orders", { status: select.value }, `id=eq.${encodeURIComponent(select.dataset.orderStatus)}`, { select: false });
      setMessage("Order status updated.");
    } catch (error) { setMessage(error.message, "error"); }
    finally { select.disabled = false; }
  });

  document.querySelector("#admin-contacts-body").addEventListener("change", async (event) => {
    const select = event.target.closest("[data-contact-status]");
    if (!select) return;
    select.disabled = true;
    try {
      await api.update("contact_messages", { status: select.value }, `id=eq.${encodeURIComponent(select.dataset.contactStatus)}`, { select: false });
      setMessage("Message status updated.");
      await loadContacts();
    } catch (error) { setMessage(error.message, "error"); }
    finally { select.disabled = false; }
  });

  document.querySelector("#category-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = event.currentTarget.elements.name;
    const name = input.value.trim();
    if (!name) return;
    try {
      await api.insert("categories", { name, slug: slugify(name), display_order: categories.length + 1 });
      input.value = "";
      setMessage("Category added.");
      await loadCategories();
    } catch (error) { setMessage(error.message, "error"); }
  });

  document.querySelector("#category-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-category]");
    if (!button || !window.confirm("Delete this category? Existing products will keep their category name.")) return;
    try {
      await api.remove("categories", `id=eq.${Number(button.dataset.deleteCategory)}`);
      setMessage("Category deleted.");
      await loadCategories();
    } catch (error) { setMessage(error.message, "error"); }
  });

  document.querySelector("#settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await api.update("site_settings", {
        announcement: values.get("announcement").trim(),
        whatsapp_number: values.get("whatsapp_number").replace(/\D/g, ""),
        support_email: values.get("support_email").trim().toLowerCase(),
        free_shipping_minimum: Number(values.get("free_shipping_minimum")),
        standard_shipping: Number(values.get("standard_shipping"))
      }, "id=eq.1", { select: false });
      setMessage("Store settings updated.");
    } catch (error) { setMessage(error.message, "error"); }
  });

  function resetBannerForm() {
    editingBannerId = null;
    const form = document.querySelector("#banner-form");
    form.reset();
    form.elements.is_active.checked = true;
    form.elements.link_url.value = "shop.html";
    form.elements.button_label.value = "Shop now";
    document.querySelector("#banner-form-title").textContent = "Add homepage banner";
    document.querySelector("#banner-submit").textContent = "Save banner";
    document.querySelector("#banner-cancel").hidden = true;
  }

  document.querySelector("#banner-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const payload = {
      title: values.get("title").trim(),
      body: values.get("body").trim(),
      image_url: values.get("image_url").trim(),
      link_url: values.get("link_url").trim() || "shop.html",
      button_label: values.get("button_label").trim() || "Shop now",
      display_order: Number(values.get("display_order") || 0),
      is_active: values.get("is_active") === "on"
    };
    try {
      if (editingBannerId) await api.update("banners", payload, `id=eq.${editingBannerId}`, { select: false });
      else await api.insert("banners", payload, { select: false });
      setMessage(editingBannerId ? "Banner updated." : "Banner added.");
      resetBannerForm();
      await loadBanners();
    } catch (error) { setMessage(error.message, "error"); }
  });

  document.querySelector("#banner-cancel").addEventListener("click", resetBannerForm);
  document.querySelector("#banner-list").addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit-banner]");
    const remove = event.target.closest("[data-delete-banner]");
    if (edit) {
      const banner = banners.find((item) => item.id === Number(edit.dataset.editBanner));
      if (!banner) return;
      editingBannerId = banner.id;
      const form = document.querySelector("#banner-form");
      ["title", "body", "image_url", "link_url", "button_label", "display_order"].forEach((key) => { form.elements[key].value = banner[key] ?? ""; });
      form.elements.is_active.checked = banner.is_active;
      document.querySelector("#banner-form-title").textContent = "Edit homepage banner";
      document.querySelector("#banner-submit").textContent = "Update banner";
      document.querySelector("#banner-cancel").hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (remove && window.confirm("Delete this banner?")) {
      try {
        await api.remove("banners", `id=eq.${Number(remove.dataset.deleteBanner)}`);
        setMessage("Banner deleted.");
        await loadBanners();
      } catch (error) { setMessage(error.message, "error"); }
    }
  });

  document.querySelector("#admin-sign-out").addEventListener("click", async () => {
    await api.signOut();
    window.location.replace("index.html");
  });

  async function initialize() {
    try {
      if (!await requireAdmin()) return;
      loading.hidden = true;
      dashboard.hidden = false;
      const detailField = document.querySelector('[name="details"]');
      if (detailField) {
        const hint = document.createElement('p'); hint.className = 'form-note';
        hint.textContent = 'Jewellery detail fields: enter one per line, e.g. Purity: 22K, Metal: Gold, Colour: Yellow, Weight: 5.573 g, SKU: TJ-001, Size guide: your sizing instructions. For price breakup enter Metal value:, Stone value:, Making charges:, Tax: with numeric rupee amounts. All four amounts must add up to the product price. Use actual product data. Sizes remain in the Sizes field, including units (e.g. 16.40 mm).';
        detailField.after(hint);
      }
      if (window.TriptiContentAdmin) await window.TriptiContentAdmin.initialize();
      if (window.TriptiCouponAdmin) await window.TriptiCouponAdmin.initialize();
      if (window.TriptiRatesAdmin) await window.TriptiRatesAdmin.initialize();
      if (window.TriptiOrderService) await window.TriptiOrderService.initializeAdmin();
      if (window.TriptiStoreTools) await window.TriptiStoreTools.admin();
      if (window.TriptiShopCarousel) await window.TriptiShopCarousel.admin();
      showPanel("overview");
      await Promise.all([loadProducts(), loadOrders(), loadCustomers(), loadContacts(), loadCategories(), loadSettings(), loadBanners()]);
    } catch (error) {
      loading.hidden = true;
      denied.hidden = false;
      denied.querySelector("p").textContent = error.message;
    }
  }

  initialize();
})();

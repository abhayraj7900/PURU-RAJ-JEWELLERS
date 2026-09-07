/* Signed-in customer dashboard. Data access is enforced by Supabase RLS. */
(function () {
  "use strict";

  const api = window.TriptiSupabase;
  const loading = document.querySelector("#account-loading");
  const dashboard = document.querySelector("#account-dashboard");
  const errorBox = document.querySelector("#account-error");
  let user = null;
  let profile = null;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
  }

  function showError(text) {
    errorBox.textContent = text;
    errorBox.hidden = !text;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  async function requireAccount() {
    if (!api) throw new Error("Account service could not load.");
    api.consumeAuthHash();
    const session = await api.getSession();
    if (!session) {
      window.location.replace("login.html?returnTo=account.html");
      return false;
    }
    user = await api.getUser();
    if (!user) {
      window.location.replace("login.html?returnTo=account.html");
      return false;
    }
    const rows = await api.select("profiles", `select=*&id=eq.${encodeURIComponent(user.id)}&limit=1`);
    profile = rows?.[0];
    if (!profile) throw new Error("Your profile is not ready. Complete the database setup and refresh this page.");
    return true;
  }

  function fillProfile() {
    document.querySelector("#account-name").textContent = profile.full_name || "Puru Raj customer";
    document.querySelector("#account-email").textContent = profile.email;
    document.querySelector("#profile-name").value = profile.full_name || "";
    document.querySelector("#profile-email").value = profile.email;
    document.querySelector("#profile-phone").value = profile.phone || "";
    const adminLink = document.querySelector("#admin-dashboard-link");
    adminLink.hidden = profile.role !== "admin";
  }

  async function loadOrders() {
    const container = document.querySelector("#account-orders");
    try {
      let orders;
      try {
        orders = await api.select("orders", `select=id,order_number,invoice_number,status,payment_status,total,shipping_status,tracking_url,created_at,order_items(product_name,quantity,size)&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc`);
      } catch (error) {
        orders = await api.select("orders", `select=id,order_number,status,total,created_at,order_items(product_name,quantity,size)&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc`);
      }
      if (!orders.length) {
        container.innerHTML = '<div class="dashboard-empty"><p>No orders yet.</p><a class="text-link" href="shop.html">Explore jewellery →</a></div>';
        return;
      }
      container.innerHTML = orders.map((order) => `
        <article class="order-card">
          <div><p class="eyebrow">${escapeHtml(order.order_number)}</p><h3>${formatDate(order.created_at)}</h3><small>${escapeHtml(order.invoice_number || "Invoice preparing")}</small></div>
          <span class="status-badge status-${escapeHtml(order.status)}">${escapeHtml(order.status)}</span>
          <ul>${(order.order_items || []).map((item) => `<li>${escapeHtml(item.product_name)} × ${item.quantity}${item.size ? ` · Size ${escapeHtml(item.size)}` : ""}</li>`).join("")}</ul>
          <strong>${formatPrice(order.total)}</strong>
          <div class="order-card-actions"><a class="text-link" href="invoice.html?order=${encodeURIComponent(order.id)}">View invoice →</a>${order.tracking_url ? `<a class="text-link" href="${escapeHtml(order.tracking_url)}" target="_blank" rel="noopener">Track shipment →</a>` : `<span>${order.shipping_status === "created" ? "Shipment booking created" : "Tracking will appear here"}</span>`}</div>
        </article>`).join("");
      if (window.TriptiOrderService) await window.TriptiOrderService.customers(orders, container);
    } catch (error) {
      container.innerHTML = `<p class="dashboard-inline-error">${escapeHtml(error.message)}</p>`;
    }
  }

  async function loadAddresses() {
    const container = document.querySelector("#address-list");
    try {
      const addresses = await api.select("addresses", `select=*&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc`);
      if (!addresses.length) {
        container.innerHTML = '<p class="dashboard-muted">No saved address yet.</p>';
        return;
      }
      container.innerHTML = addresses.map((address) => `
        <article class="address-card">
          <div><p class="eyebrow">${escapeHtml(address.label)}</p><h3>${escapeHtml(address.full_name)}</h3><p>${escapeHtml(address.address_line)}, ${escapeHtml(address.city)}, ${escapeHtml(address.state)} – ${escapeHtml(address.pincode)}</p><p>${escapeHtml(address.phone)}</p></div>
          <button class="remove-button" type="button" data-remove-address="${escapeHtml(address.id)}">Remove</button>
        </article>`).join("");
    } catch (error) {
      container.innerHTML = `<p class="dashboard-inline-error">${escapeHtml(error.message)}</p>`;
    }
  }

  document.querySelector("#profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      const values = new FormData(form);
      const rows = await api.update("profiles", {
        full_name: values.get("full_name").trim(),
        phone: values.get("phone").trim()
      }, `id=eq.${encodeURIComponent(user.id)}&select=*`);
      profile = rows?.[0] || profile;
      fillProfile();
      showError("");
      document.querySelector("#profile-success").hidden = false;
    } catch (error) {
      showError(error.message);
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#address-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      const values = new FormData(form);
      await api.insert("addresses", {
        user_id: user.id,
        label: values.get("label").trim(),
        full_name: values.get("full_name").trim(),
        phone: values.get("phone").trim(),
        address_line: values.get("address_line").trim(),
        city: values.get("city").trim(),
        state: values.get("state").trim(),
        pincode: values.get("pincode").trim()
      }, { select: false });
      form.reset();
      await loadAddresses();
      showError("");
    } catch (error) {
      showError(error.message);
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#address-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-remove-address]");
    if (!button) return;
    button.disabled = true;
    try {
      await api.remove("addresses", `id=eq.${encodeURIComponent(button.dataset.removeAddress)}&user_id=eq.${encodeURIComponent(user.id)}`);
      await loadAddresses();
    } catch (error) {
      showError(error.message);
      button.disabled = false;
    }
  });

  document.querySelectorAll("[data-sign-out]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    await api.signOut();
    window.location.replace("index.html");
  }));

  async function initialize() {
    try {
      if (!await requireAccount()) return;
      fillProfile();
      loading.hidden = true;
      dashboard.hidden = false;
      await Promise.all([loadOrders(), loadAddresses()]);
      if (window.TriptiStoreTools) await window.TriptiStoreTools.customer();
    } catch (error) {
      loading.hidden = true;
      showError(error.message);
    }
  }

  initialize();
})();

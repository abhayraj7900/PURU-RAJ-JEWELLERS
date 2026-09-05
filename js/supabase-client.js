/* Tripti Jewellers Supabase client: Auth, PostgREST and Storage without exposing secret keys. */
(function () {
  "use strict";

  const CONFIG = Object.freeze({
    url: "https://iecxxyoatjzfnbjzepsk.supabase.co",
    publishableKey: "sb_publishable_ezJOxFf8WJji_zGXTIl16w_XJkjKmn3"
  });
  const SESSION_KEY = "triptiJewellersSession";
  const listeners = new Set();
  let session = readSession();
  let refreshPromise = null;

  function readSession() {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_KEY));
      return value && value.access_token ? value : null;
    } catch (error) {
      return null;
    }
  }

  function notify() {
    listeners.forEach((listener) => listener(session));
  }

  function saveSession(value) {
    if (!value || !value.access_token) {
      session = null;
      localStorage.removeItem(SESSION_KEY);
      notify();
      return null;
    }
    const expiresIn = Number(value.expires_in || 3600);
    session = {
      ...value,
      expires_at: Number(value.expires_at || Math.floor(Date.now() / 1000) + expiresIn)
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    notify();
    return session;
  }

  function errorMessage(payload, fallback) {
    return payload?.msg || payload?.message || payload?.error_description || payload?.error || fallback;
  }

  async function fetchJson(path, options = {}, retry = true) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), options.timeout || 10000);
    const token = options.token === false ? null : (options.token || session?.access_token);
    const headers = {
      apikey: CONFIG.publishableKey,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    try {
      const response = await fetch(`${CONFIG.url}${path}`, {
        method: options.method || "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal
      });
      const text = await response.text();
      let payload = null;
      if (text) {
        try { payload = JSON.parse(text); } catch (error) { payload = text; }
      }

      if (response.status === 401 && retry && session?.refresh_token && !path.includes("grant_type=refresh_token")) {
        await refreshSession();
        return fetchJson(path, options, false);
      }
      if (!response.ok) {
        const error = new Error(errorMessage(payload, `Request failed (${response.status})`));
        error.status = response.status;
        error.details = payload;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Connection timed out. Please try again.");
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function refreshSession() {
    if (!session?.refresh_token) return null;
    if (refreshPromise) return refreshPromise;
    refreshPromise = fetchJson("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      token: false,
      body: { refresh_token: session.refresh_token }
    }, false).then(saveSession).catch((error) => {
      saveSession(null);
      throw error;
    }).finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  async function getSession(options = {}) {
    if (!session) return null;
    if (options.refresh !== false && session.expires_at && session.expires_at < Math.floor(Date.now() / 1000) + 60) {
      try { await refreshSession(); } catch (error) { return null; }
    }
    return session;
  }

  function consumeAuthHash() {
    if (!window.location.hash.includes("access_token=")) return null;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const value = {
      access_token: params.get("access_token"),
      refresh_token: params.get("refresh_token"),
      expires_in: Number(params.get("expires_in") || 3600),
      token_type: params.get("token_type") || "bearer"
    };
    saveSession(value);
    const type = params.get("type") || "signin";
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    return type;
  }

  async function signUp(email, password, fullName) {
    const redirectTo = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "login.html")}`;
    const payload = await fetchJson(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      token: false,
      body: { email: email.trim().toLowerCase(), password, data: { full_name: fullName.trim() } }
    });
    if (payload?.access_token) saveSession(payload);
    return payload;
  }

  async function signIn(email, password) {
    const payload = await fetchJson("/auth/v1/token?grant_type=password", {
      method: "POST",
      token: false,
      body: { email: email.trim().toLowerCase(), password }
    });
    saveSession(payload);
    return payload;
  }

  async function signOut() {
    try {
      if (session?.access_token) await fetchJson("/auth/v1/logout", { method: "POST" }, false);
    } finally {
      saveSession(null);
    }
  }

  async function requestPhoneOtp(phone) {
    if (!/^\+91[6-9][0-9]{9}$/.test(phone)) throw new Error('Enter a valid Indian mobile number.');
    return fetchJson('/auth/v1/otp', { method: 'POST', token: false, body: { phone, create_user: true, channel: 'sms' } }, false);
  }
  async function verifyPhoneOtp(phone, token) {
    if (!/^\d{6}$/.test(token)) throw new Error('Enter the 6-digit OTP.');
    const result = await fetchJson('/auth/v1/verify', { method: 'POST', token: false, body: { phone, token, type: 'sms' } }, false);
    if (!result?.access_token) throw new Error('Verification did not complete. Please retry.');
    return saveSession(result);
  }

  async function sendPasswordReset(email, redirectTo) {
    return fetchJson(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      token: false,
      body: { email: email.trim().toLowerCase() }
    });
  }

  async function updatePassword(password) {
    return fetchJson("/auth/v1/user", { method: "PUT", body: { password } });
  }

  async function getUser() {
    const active = await getSession();
    if (!active) return null;
    try {
      return await fetchJson("/auth/v1/user");
    } catch (error) {
      if (error.status === 401) saveSession(null);
      return null;
    }
  }

  function restPath(table, query = "") {
    return `/rest/v1/${encodeURIComponent(table)}${query ? `?${query}` : ""}`;
  }

  async function select(table, query = "select=*") {
    return fetchJson(restPath(table, query), { headers: { Accept: "application/json" } });
  }

  async function insert(table, rows, options = {}) {
    const query = options.query || (options.select === false ? "" : "select=*");
    const headers = { Prefer: `${options.upsert ? "resolution=merge-duplicates," : ""}${options.select === false ? "return=minimal" : "return=representation"}` };
    if (options.onConflict) headers.Prefer += `,missing=default`;
    const path = `${restPath(table, query)}${options.onConflict ? `${query ? "&" : "?"}on_conflict=${encodeURIComponent(options.onConflict)}` : ""}`;
    return fetchJson(path, { method: "POST", body: rows, headers });
  }

  async function update(table, values, query, options = {}) {
    return fetchJson(restPath(table, query), {
      method: "PATCH",
      body: values,
      headers: { Prefer: options.select === false ? "return=minimal" : "return=representation" }
    });
  }

  async function remove(table, query) {
    return fetchJson(restPath(table, query), { method: "DELETE", headers: { Prefer: "return=minimal" } });
  }

  async function rpc(name, body) {
    return fetchJson(`/rest/v1/rpc/${encodeURIComponent(name)}`, { method: "POST", body });
  }

  async function invokeFunction(name, body, options = {}) {
    const active = await getSession();
    if (options.authenticated !== false && !active) throw new Error("Please sign in again.");
    return fetchJson(`/functions/v1/${encodeURIComponent(name)}`, {
      method: "POST",
      token: active?.access_token || false,
      body,
      timeout: options.timeout || 30000
    });
  }

  async function uploadPublic(bucket, path, file) {
    const active = await getSession();
    if (!active) throw new Error("Please sign in again.");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${CONFIG.url}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, {
        method: "POST",
        headers: {
          apikey: CONFIG.publishableKey,
          Authorization: `Bearer ${active.access_token}`,
          "Content-Type": file.type,
          "x-upsert": "true"
        },
        body: file,
        signal: controller.signal
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, "Image upload failed."));
      return `${CONFIG.url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  window.TriptiSupabase = Object.freeze({
    config: CONFIG,
    getSession,
    getUser,
    refreshSession,
    consumeAuthHash,
    signUp,
    signIn,
    requestPhoneOtp,
    verifyPhoneOtp,
    signOut,
    sendPasswordReset,
    updatePassword,
    select,
    insert,
    update,
    remove,
    rpc,
    invokeFunction,
    uploadPublic,
    onAuthChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  });
})();

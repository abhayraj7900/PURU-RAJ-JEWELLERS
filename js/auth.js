/* Login, registration and password recovery for Puru Raj Jewelllers customers. */
(function () {
  "use strict";

  const api = window.TriptiSupabase;
  const form = document.querySelector("#auth-form");
  const nameField = document.querySelector("#auth-name-field");
  const nameInput = document.querySelector("#auth-name");
  const title = document.querySelector("#auth-title");
  const intro = document.querySelector("#auth-intro");
  const submit = document.querySelector("#auth-submit");
  const passwordField = document.querySelector("#auth-password-field");
  const passwordInput = document.querySelector("#auth-password");
  const forgotButton = document.querySelector("#forgot-password");
  const message = document.querySelector("#auth-message");
  const modeButtons = [...document.querySelectorAll("[data-auth-mode]")];
  let mode = "signin";

  function safeReturnTo() {
    const value = new URLSearchParams(window.location.search).get("returnTo") || "account.html";
    return /^[a-z0-9_-]+\.html(?:\?[a-z0-9_=&%-]*)?$/i.test(value) ? value : "account.html";
  }

  function setMessage(text, type = "info") {
    message.textContent = text;
    message.dataset.type = type;
    message.hidden = !text;
  }

  function setBusy(busy) {
    [...form.elements].forEach((element) => { element.disabled = busy; });
    submit.textContent = busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "reset" ? "Set new password" : "Sign in";
  }

  function setMode(nextMode) {
    mode = nextMode;
    const signup = mode === "signup";
    const reset = mode === "reset";
    form.dataset.authMode = mode;
    nameField.hidden = !signup;
    nameInput.required = signup;
    document.querySelector("#auth-email-field").hidden = reset;
    document.querySelector("#auth-email").required = !reset;
    passwordField.hidden = false;
    passwordInput.autocomplete = signup ? "new-password" : reset ? "new-password" : "current-password";
    forgotButton.hidden = signup || reset;
    document.querySelector(".auth-mode-switcher").hidden = reset;
    title.textContent = signup ? "Create your account" : reset ? "Choose a new password" : "Welcome back";
    intro.textContent = signup
      ? "Save favourites and keep every order together."
      : reset
        ? "Use at least 8 characters for your new password."
        : "Sign in to view your profile, addresses and orders.";
    submit.textContent = signup ? "Create account" : reset ? "Set new password" : "Sign in";
    modeButtons.forEach((button) => {
      const active = button.dataset.authMode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    setMessage("");
  }

  async function initialize() {
    if (!api) {
      setMessage("Login service could not load. Please refresh the page.", "error");
      return;
    }
    const callback = new URLSearchParams(window.location.hash.slice(1));
    if (callback.has('error') || callback.has('error_code')) {
      history.replaceState(null, '', window.location.pathname);
      setMessage('This reset link has expired, has already been used, or is invalid. Request a new link with Forgot password and open only the newest email.', 'error');
      return;
    }
    const hashType = api.consumeAuthHash();
    if (hashType === "recovery" || new URLSearchParams(window.location.search).get("mode") === "reset") {
      setMode("reset");
      passwordInput.value = '';
      if (!await api.getUser()) {
        setMessage('No valid reset session was found. Request a new reset email and open its newest link.', 'error');
        submit.disabled = true;
        const retry = document.createElement('a'); retry.href = 'login.html'; retry.textContent = 'Return to login and request a new link'; form.after(retry);
      }
      return;
    }
    const session = await api.getSession();
    if (session && await api.getUser()) window.location.replace(safeReturnTo());
  }

  modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.authMode)));

  forgotButton.addEventListener("click", async () => {
    const email = document.querySelector("#auth-email").value.trim();
    if (!email) {
      setMessage("Enter your email address first.", "error");
      document.querySelector("#auth-email").focus();
      return;
    }
    forgotButton.disabled = true;
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      await api.sendPasswordReset(email, redirectTo);
      setMessage("Password reset link sent. Please check your email.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      forgotButton.disabled = false;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    setBusy(true);
    setMessage("");
    try {
      if (mode === "reset") {
        await api.updatePassword(passwordInput.value);
        setMessage("Password updated. Opening your account…", "success");
        window.setTimeout(() => window.location.replace("account.html"), 700);
        return;
      }

      const email = document.querySelector("#auth-email").value;
      if (mode === "signup") {
        const result = await api.signUp(email, passwordInput.value, nameInput.value);
        if (result?.access_token) {
          setMessage("Account created. Opening your dashboard…", "success");
          window.setTimeout(() => window.location.replace(safeReturnTo()), 600);
        } else {
          setMessage("Account created. Open the confirmation link sent to your email, then sign in.", "success");
        }
      } else {
        await api.signIn(email, passwordInput.value);
        setMessage("Signed in. Opening your dashboard…", "success");
        window.setTimeout(() => window.location.replace(safeReturnTo()), 450);
      }
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      setBusy(false);
    }
  });

  setMode("signin");
  initialize();
})();

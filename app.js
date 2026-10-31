(() => {
  "use strict";

  const config = window.AMAPOLAS_CONFIG;
  const productStorageKey = "amapolas-storefront-products-v1";
  const categoriesStorageKey = "amapolas-storefront-categories-v1";
  const cartStorageKey = "amapolas-cart-v1";
  const accountsStorageKey = "amapolas-demo-accounts-v1";
  const sessionStorageKey = "amapolas-demo-session-v1";
  let publishedCatalogVersion = null;

  function saveCatalogToStorage() {
    try {
      localStorage.setItem(productStorageKey, JSON.stringify(window.AMAPOLAS_PRODUCTS || []));
      localStorage.setItem(categoriesStorageKey, JSON.stringify(window.AMAPOLAS_CATEGORIES || []));
    } catch (error) {
      console.warn("No se pudo guardar el catálogo.", error);
    }
  }

  function readCatalogFromStorage() {
    try {
      const saved = JSON.parse(localStorage.getItem(productStorageKey) || "null");
      if (Array.isArray(saved) && saved.length) return saved;
    } catch (error) {
      console.warn("No se pudo leer el catálogo guardado.", error);
    }
    return Array.isArray(window.AMAPOLAS_PRODUCTS) ? window.AMAPOLAS_PRODUCTS : [];
  }

  function readCategoriesFromStorage() {
    try {
      const saved = JSON.parse(localStorage.getItem(categoriesStorageKey) || "null");
      if (Array.isArray(saved) && saved.length) return saved;
    } catch (error) {
      console.warn("No se pudo leer las categorías guardadas localmente.", error);
    }
    return Array.isArray(window.AMAPOLAS_CATEGORIES) ? window.AMAPOLAS_CATEGORIES : [];
  }

  let products = readCatalogFromStorage();
  let categories = readCategoriesFromStorage();

  if (!Array.isArray(products) || !products.length) {
    products = Array.isArray(window.AMAPOLAS_PRODUCTS) ? window.AMAPOLAS_PRODUCTS : [];
  }
  if (!Array.isArray(categories) || !categories.length) {
    categories = Array.isArray(window.AMAPOLAS_CATEGORIES) ? window.AMAPOLAS_CATEGORIES : [];
  }

  if (!config || !Array.isArray(products) || !Array.isArray(categories)) {
    throw new Error("No se pudo cargar la configuración o los productos de Tienda Las Amapolas.");
  }

  if (!window.AMAPOLAS_PRODUCTS) window.AMAPOLAS_PRODUCTS = products;
  if (!window.AMAPOLAS_CATEGORIES) window.AMAPOLAS_CATEGORIES = categories;

  function syncCatalogFromStorage() {
    products = readCatalogFromStorage();
    categories = readCategoriesFromStorage();
    window.AMAPOLAS_PRODUCTS = products;
    window.AMAPOLAS_CATEGORIES = categories;
  }

  async function refreshCatalogFromApi() {
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      if (!response.ok) return;
      const items = await response.json();
      if (!Array.isArray(items)) return;
      products.splice(0, products.length, ...items);
      categories.splice(0, categories.length, ...Array.isArray(window.AMAPOLAS_CATEGORIES) ? window.AMAPOLAS_CATEGORIES : []);
      window.AMAPOLAS_PRODUCTS = products;
      window.AMAPOLAS_CATEGORIES = categories;
      saveCatalogToStorage();
    } catch (error) {
      console.warn("No se pudo sincronizar con el catálogo del servidor.", error);
    }
  }

  window.addEventListener("amapolas-products-updated", () => {
    syncCatalogFromStorage();
    if (typeof setupHome === "function") setupHome();
    if (typeof setupCatalog === "function") setupCatalog();
    updateCartCount();
    renderCart();
  });

  window.addEventListener("storage", (event) => {
    if (event.key === productStorageKey || event.key === categoriesStorageKey) {
      syncCatalogFromStorage();
      if (typeof setupHome === "function") setupHome();
      if (typeof setupCatalog === "function") setupCatalog();
      updateCartCount();
      renderCart();
    }
  });

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const formatPrice = (price) => new Intl.NumberFormat("es-CR", {
    style: "currency", currency: "CRC", maximumFractionDigits: 0
  }).format(price);
  const getCart = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(cartStorageKey) || "[]");
      if (!Array.isArray(saved)) throw new TypeError("El carrito guardado no tiene el formato esperado.");
      return saved.filter((item) => products.some((product) => product.id === item.id) && Number.isInteger(item.quantity) && item.quantity > 0);
    } catch (error) {
      console.error("No se pudo leer el carrito guardado.", error);
      return [];
    }
  };
  const saveCart = (cart) => {
    try {
      localStorage.setItem(cartStorageKey, JSON.stringify(cart));
    } catch (error) {
      console.error("No se pudo guardar el carrito.", error);
      showToast("No pudimos guardar el carrito en este dispositivo.");
    }
  };

  let toastTimer;
  function showToast(message) {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.append(toast);
    }
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
  }

  function getAccounts() {
    const saved = localStorage.getItem(accountsStorageKey);
    if (!saved) return [];
    const accounts = JSON.parse(saved);
    if (!Array.isArray(accounts)) throw new TypeError("Los perfiles guardados no tienen el formato esperado.");
    return accounts;
  }

  function saveAccounts(accounts) {
    localStorage.setItem(accountsStorageKey, JSON.stringify(accounts));
  }

  function getCurrentAccount() {
    const email = localStorage.getItem(sessionStorageKey);
    if (!email) return null;
    return getAccounts().find((account) => account.email === email) || null;
  }

  function updateAccountButtons() {
    let account = null;
    try {
      account = getCurrentAccount();
    } catch (error) {
      console.error("No se pudo cargar el perfil guardado.", error);
    }
    document.querySelectorAll("[data-login]").forEach((button) => {
      button.textContent = account ? "Mi perfil" : "Iniciar sesión";
      button.setAttribute("aria-label", account ? "Abrir mi perfil" : "Iniciar sesión");
    });
  }

  function passwordDigest(password, salt) {
    if (!window.isSecureContext || !window.crypto?.subtle) {
      throw new Error("El registro requiere una página segura HTTPS o localhost para proteger la contraseña.");
    }
    const encoder = new TextEncoder();
    return window.crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"])
      .then((key) => window.crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" }, key, 256
      ))
      .then((bits) => Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join(""));
  }

  function createAccountDialog() {
    const backdrop = document.createElement("div");
    backdrop.className = "account-backdrop";
    backdrop.hidden = true;
    backdrop.innerHTML = `<section class="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title" tabindex="-1">
      <button class="account-close" type="button" data-account-close aria-label="Cerrar ventana">×</button>
      <div class="account-content"></div>
    </section>`;
    document.body.append(backdrop);
    return backdrop;
  }

  let accountBackdrop;
  let accountReturnFocus;
  function showAccountError(message) {
    const error = accountBackdrop.querySelector(".account-error");
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
  }

  function accountAvatar(account, className = "account-avatar") {
    if (account.avatar) {
      return `<img class="${className}" src="${account.avatar}" alt="Foto de perfil de ${escapeHtml(account.displayName)}">`;
    }
    const initials = account.displayName.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toLocaleUpperCase("es-CR");
    return `<span class="${className} account-avatar-initials" aria-label="Sin foto de perfil">${escapeHtml(initials || "A")}</span>`;
  }

  function renderAccountView(view) {
    const content = accountBackdrop.querySelector(".account-content");
    const account = getCurrentAccount();
    if (account) view = "profile";
    const privacyNote = `<p class="account-privacy">Cuenta de demostración: tu perfil solo se guarda en este navegador. No usés una contraseña que ocupés en otros sitios.</p>`;

    if (view === "profile" && account) {
      content.innerHTML = `<span class="section-kicker">Tu cuenta</span><h2 id="account-title">Mi perfil</h2>
        <div class="profile-heading">${accountAvatar(account)}<div><strong>${escapeHtml(account.displayName)}</strong><span>@${escapeHtml(account.username)}</span></div></div>
        <form class="account-form" id="profile-form">
          <label>Nombre<input name="displayName" type="text" required minlength="2" maxlength="60" value="${escapeHtml(account.displayName)}" autocomplete="name"></label>
          <label>Usuario<input name="username" type="text" required minlength="3" maxlength="20" pattern="[A-Za-z0-9._\\x2d]+" value="${escapeHtml(account.username)}" autocomplete="username"></label>
          <label>Correo electrónico<input type="email" value="${escapeHtml(account.email)}" disabled></label>
          <label class="avatar-upload">Foto de perfil<input name="avatar" type="file" accept="image/*"><span>Elegí una imagen (máximo 5 MB)</span></label>
          <p class="account-error" role="alert" hidden></p>
          <button class="button button-primary" type="submit">Guardar cambios</button>
        </form>
        ${privacyNote}
        <button class="account-signout" type="button" data-account-signout>Cerrar sesión</button>`;
    } else if (view === "register") {
      content.innerHTML = `<span class="section-kicker">Creá tu cuenta de demostración</span><h2 id="account-title">Registrarse</h2>
        <form class="account-form" id="register-form">
          <label>Nombre<input name="displayName" type="text" required minlength="2" maxlength="60" autocomplete="name"></label>
          <label>Usuario<input name="username" type="text" required minlength="3" maxlength="20" pattern="[A-Za-z0-9._\\x2d]+" autocomplete="username"><span class="field-help">Usá letras, números, punto, guion o guion bajo.</span></label>
          <label>Correo electrónico<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
          <label>Contraseña<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"><span class="field-help">Al menos 8 caracteres.</span></label>
          <p class="account-error" role="alert" hidden></p>
          <button class="button button-primary" type="submit">Crear cuenta</button>
        </form>
        ${privacyNote}
        <p class="account-switch">¿Ya tenés cuenta? <button type="button" data-account-view="login">Iniciá sesión</button></p>`;
    } else {
      content.innerHTML = `<span class="section-kicker">Qué gusto verte de nuevo</span><h2 id="account-title">Iniciar sesión</h2>
        <form class="account-form" id="login-form">
          <label>Usuario o correo<input name="identity" type="text" required autocomplete="username"></label>
          <label>Contraseña<input name="password" type="password" required autocomplete="current-password"></label>
          <p class="account-error" role="alert" hidden></p>
          <button class="button button-primary" type="submit">Iniciar sesión</button>
        </form>
        ${privacyNote}
        <p class="account-switch">¿Primera vez? <button type="button" data-account-view="register">Creá tu cuenta</button></p>`;
    }
    const firstField = content.querySelector("input:not([disabled])");
    if (firstField) firstField.focus();
  }

  function openAccountDialog() {
    accountReturnFocus = document.activeElement;
    accountBackdrop.hidden = false;
    let view = "login";
    try {
      if (getCurrentAccount()) view = "profile";
    } catch (error) {
      console.error("No se pudo cargar el perfil guardado.", error);
      showToast("No pudimos leer los perfiles guardados en este navegador.");
    }
    renderAccountView(view);
    accountBackdrop.querySelector(".account-dialog").focus();
    const firstField = accountBackdrop.querySelector("input:not([disabled])");
    if (firstField) firstField.focus();
  }

  function closeAccountDialog() {
    accountBackdrop.hidden = true;
    if (accountReturnFocus instanceof HTMLElement) accountReturnFocus.focus();
  }

  function readProfileImage(file) {
    if (!file) return Promise.resolve(null);
    if (!file.type.startsWith("image/")) return Promise.reject(new Error("Elegí un archivo de imagen."));
    if (file.size > 5 * 1024 * 1024) return Promise.reject(new Error("La foto debe pesar menos de 5 MB."));
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const side = Math.min(image.naturalWidth, image.naturalHeight, 320);
        const canvas = document.createElement("canvas");
        canvas.width = side;
        canvas.height = side;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("No se pudo procesar la foto en este navegador."));
          return;
        }
        context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, side, side);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("No se pudo abrir la imagen elegida."));
      };
      image.src = objectUrl;
    });
  }

  async function handleAccountSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const data = new FormData(form);
    try {
      if (form.id === "register-form") {
        const displayName = String(data.get("displayName")).trim();
        const username = String(data.get("username")).trim();
        const email = String(data.get("email")).trim().toLocaleLowerCase("en");
        const password = String(data.get("password"));
        const accounts = getAccounts();
        if (accounts.some((account) => account.email === email)) throw new Error("Ya existe una cuenta con ese correo en este navegador.");
        if (accounts.some((account) => account.username.toLocaleLowerCase("en") === username.toLocaleLowerCase("en"))) throw new Error("Ese usuario ya está en uso en este navegador.");
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const passwordHash = await passwordDigest(password, salt);
        const account = {
          email, username, displayName, avatar: "",
          salt: Array.from(salt, (byte) => byte.toString(16).padStart(2, "0")).join(""),
          passwordHash
        };
        accounts.push(account);
        saveAccounts(accounts);
        localStorage.setItem(sessionStorageKey, email);
        updateAccountButtons();
        renderAccountView("profile");
        showToast("Cuenta creada en este navegador.");
      } else if (form.id === "login-form") {
        const identity = String(data.get("identity")).trim().toLocaleLowerCase("en");
        const password = String(data.get("password"));
        const account = getAccounts().find((item) =>
          item.email === identity || item.username.toLocaleLowerCase("en") === identity
        );
        if (!account) throw new Error("No encontramos esa cuenta en este navegador.");
        const salt = Uint8Array.from(account.salt.match(/.{2}/g), (byte) => parseInt(byte, 16));
        if (await passwordDigest(password, salt) !== account.passwordHash) throw new Error("La contraseña no coincide.");
        localStorage.setItem(sessionStorageKey, account.email);
        updateAccountButtons();
        renderAccountView("profile");
        showToast("Sesión iniciada.");
      } else if (form.id === "profile-form") {
        const account = getCurrentAccount();
        if (!account) throw new Error("Iniciá sesión para editar tu perfil.");
        const displayName = String(data.get("displayName")).trim();
        const username = String(data.get("username")).trim();
        const accounts = getAccounts();
        if (accounts.some((item) => item.email !== account.email && item.username.toLocaleLowerCase("en") === username.toLocaleLowerCase("en"))) {
          throw new Error("Ese usuario ya está en uso en este navegador.");
        }
        const avatarFile = data.get("avatar");
        const avatar = avatarFile instanceof File && avatarFile.size ? await readProfileImage(avatarFile) : account.avatar;
        const updatedAccounts = accounts.map((item) => item.email === account.email
          ? { ...item, displayName, username, avatar: avatar || "" }
          : item
        );
        saveAccounts(updatedAccounts);
        updateAccountButtons();
        renderAccountView("profile");
        showToast("Perfil actualizado.");
      }
    } catch (error) {
      console.error("No se pudo completar la acción de cuenta.", error);
      showAccountError(error instanceof Error ? error.message : "Ocurrió un error al guardar la cuenta.");
    }
  }

  function setupAccountDialog() {
    accountBackdrop = createAccountDialog();
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-login]")) {
        openAccountDialog();
        return;
      }
      if (target.closest("[data-account-close]") || target === accountBackdrop) {
        closeAccountDialog();
        return;
      }
      const viewButton = target.closest("[data-account-view]");
      if (viewButton) renderAccountView(viewButton.dataset.accountView);
      if (target.closest("[data-account-signout]")) {
        try {
          localStorage.removeItem(sessionStorageKey);
          updateAccountButtons();
          renderAccountView("login");
          showToast("Cerraste sesión en este navegador.");
        } catch (error) {
          console.error("No se pudo cerrar la sesión local.", error);
          showAccountError("No se pudo cerrar la sesión en este navegador.");
        }
      }
    });
    document.addEventListener("submit", (event) => {
      if (["register-form", "login-form", "profile-form"].includes(event.target.id)) {
        event.preventDefault();
        handleAccountSubmit(event);
      }
    });
    accountBackdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeAccountDialog();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...accountBackdrop.querySelectorAll("button:not([disabled]), input:not([disabled])")];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    updateAccountButtons();
  }

  function updateCartCount() {
    const count = getCart().reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll(".cart-count").forEach((element) => { element.textContent = String(count); });
  }

  function addToCart(id) {
    const product = products.find((item) => item.id === id);
    if (!product || product.availability === "sold-out") return;
    const cart = getCart();
    const current = cart.find((item) => item.id === id);
    if (current) current.quantity += 1;
    else cart.push({ id, quantity: 1 });
    saveCart(cart);
    updateCartCount();
    showToast(`${product.name} se agregó al carrito.`);
  }

  function productCard(product) {
    const availabilityLabels = { available: "Disponible", few: "Pocas unidades", "sold-out": "Agotado" };
    const unavailable = product.availability === "sold-out";
    const imageMarkup = product.image
      ? `<img class="product-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">`
      : `<div class="image-placeholder" aria-hidden="true"></div>`;
    return `<article class="product-card">
      <div class="product-image-wrap">
        ${imageMarkup}
        <span class="availability${unavailable ? " sold-out" : ""}">${escapeHtml(availabilityLabels[product.availability] || "Consultar")}</span>
      </div>
      <div class="product-info">
        <span class="product-category">${escapeHtml(product.category)}</span>
        <h3 class="product-name">${escapeHtml(product.name)}</h3>
        <div class="product-meta"><span class="product-price">${formatPrice(product.price)}</span></div>
      </div>
    </article>`;
  }

  function renderProductGrid(element, items) {
    if (element) element.innerHTML = items.map(productCard).join("");
  }

  function setupHome() {
    const categoryImages = {
      "Damas": "photo-1483985988355-763728e1935b",
      "Caballeros": "photo-1516257984-b1b4d707412e",
      "Infantil": "photo-1519238263530-99bdd11df2ea",
      "Bebés": "photo-1519689680058-324335c77eba",
      "Juguetería": "photo-1596461404969-9ae70f2830c1",
      "Librería y útiles escolares": "photo-1455390582262-044cdead277a",
      "Hogar": "photo-1616486338812-3dadae4b4ace",
      "Navidad y regalos": "photo-1513201099705-a9746e1e201f"
    };
    const categoryAlt = {
      "Damas": "Ropa femenina en un perchero",
      "Caballeros": "Prendas casuales para caballero",
      "Infantil": "Ropa infantil",
      "Bebés": "Artículos suaves para bebé",
      "Juguetería": "Juguetes para la familia",
      "Librería y útiles escolares": "Cuadernos y útiles escolares",
      "Hogar": "Artículos para el hogar",
      "Navidad y regalos": "Regalos envueltos"
    };
    const grid = document.getElementById("category-grid");
    if (grid) {
      grid.innerHTML = categories.map((category) => {
        const photo = categoryImages[category];
        return `<a class="category-card" href="productos.html?categoria=${encodeURIComponent(category)}">
          <img src="https://images.unsplash.com/${photo}?auto=format&fit=crop&w=700&q=78" alt="${escapeHtml(categoryAlt[category])}" loading="lazy">
          <span>${escapeHtml(category)}</span>
        </a>`;
      }).join("");
    }
    renderProductGrid(document.getElementById("featured-products"), products.filter((item) => item.featured).slice(0, 8));

    const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const weekdays = { Sun: "Domingo", Mon: "Lunes", Tue: "Martes", Wed: "Miércoles", Thu: "Jueves", Fri: "Viernes", Sat: "Sábado" };
    const updateOpenStatus = () => {
      const clockParts = new Intl.DateTimeFormat("en-US", {
        timeZone: config.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
      }).formatToParts(new Date());
      const weekdayShort = clockParts.find((part) => part.type === "weekday").value;
      const today = weekdays[weekdayShort] || dayNames[new Date().getDay()];
      const currentMinutes = Number(clockParts.find((part) => part.type === "hour").value) * 60 + Number(clockParts.find((part) => part.type === "minute").value);
      const hours = config.hours.find((item) => item.day === today);
      const isOpen = hours && currentMinutes >= timeToMinutes(hours.open) && currentMinutes < timeToMinutes(hours.close);
      const status = document.getElementById("open-status");
      if (status) {
        status.classList.toggle("is-open", Boolean(isOpen));
        status.innerHTML = `<span class="status-dot"></span><span>${isOpen ? "Abierto ahora" : "Cerrado"} · hora de Costa Rica</span>`;
      }
      return today;
    };
    const today = updateOpenStatus();
    window.setInterval(updateOpenStatus, 60_000);
    const todayIndex = config.hours.findIndex((item) => item.day === today);
    const orderedHours = todayIndex < 0 ? config.hours : [...config.hours.slice(todayIndex), ...config.hours.slice(0, todayIndex)];
    const hoursTable = document.getElementById("hours-table");
    if (hoursTable) {
      hoursTable.innerHTML = orderedHours.map((item) => `<div class="hours-row${item.day === today ? " today" : ""}"><span>${escapeHtml(item.day)}</span><span>${escapeHtml(formatHour(item.open))}–${escapeHtml(formatHour(item.close))}</span></div>`).join("");
    }
  }

  function timeToMinutes(value) {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  }
  function formatHour(value) {
    const [hour, minute] = value.split(":").map(Number);
    const period = hour >= 12 ? "p. m." : "a. m.";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
  }

  function setupCatalog() {
    const search = document.getElementById("product-search");
    const category = document.getElementById("category-filter");
    const sort = document.getElementById("sort-order");
    if (!search || !category || !sort) return;
    category.innerHTML = `<option value="">Todas las categorías</option>${categories.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
    const params = new URLSearchParams(window.location.search);
    const requestedCategory = params.get("categoria");
    if (categories.includes(requestedCategory)) category.value = requestedCategory;
    const render = () => {
      const query = search.value.trim().toLocaleLowerCase("es-CR");
      let filtered = products.filter((item) =>
        (!category.value || item.category === category.value) &&
        (!query || `${item.name} ${item.category}`.toLocaleLowerCase("es-CR").includes(query))
      );
      if (sort.value === "name") filtered.sort((a, b) => a.name.localeCompare(b.name, "es"));
      if (sort.value === "price-asc") filtered.sort((a, b) => a.price - b.price);
      if (sort.value === "price-desc") filtered.sort((a, b) => b.price - a.price);
      renderProductGrid(document.getElementById("catalog-products"), filtered);
      document.getElementById("result-count").textContent = `${filtered.length} ${filtered.length === 1 ? "producto" : "productos"}`;
      document.getElementById("empty-state").hidden = filtered.length > 0;
    };
    search.addEventListener("input", render);
    category.addEventListener("change", render);
    sort.addEventListener("change", render);
    document.getElementById("clear-filters").addEventListener("click", () => {
      search.value = "";
      category.value = "";
      sort.value = "featured";
      render();
    });
    render();
  }

  function renderCart() {
    const container = document.getElementById("cart-items");
    if (!container) return;
    const cart = getCart();
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const total = cart.reduce((sum, item) => {
      const product = products.find((entry) => entry.id === item.id);
      return sum + (product ? product.price * item.quantity : 0);
    }, 0);
    document.getElementById("cart-total-items").textContent = String(totalItems);
    document.getElementById("cart-total").textContent = formatPrice(total);
    const checkout = document.getElementById("checkout-whatsapp");
    if (!cart.length) {
      container.innerHTML = `<div class="cart-empty"><h2>El carrito está vacío.</h2><p>Buscá algo que te guste y aquí lo vamos guardando.</p><a class="button button-primary" href="productos.html">Ver productos</a></div>`;
      checkout.classList.add("is-disabled");
      checkout.setAttribute("aria-disabled", "true");
      checkout.removeAttribute("href");
      return;
    }
    checkout.classList.remove("is-disabled");
    checkout.removeAttribute("aria-disabled");
    const lines = cart.map((item) => {
      const product = products.find((entry) => entry.id === item.id);
      return `• ${product.name} x ${item.quantity} — ${formatPrice(product.price * item.quantity)}`;
    });
    const message = `Hola, quisiera consultar este pedido:\n${lines.join("\n")}\n\nTotal de referencia: ${formatPrice(total)}\n¿Me confirman disponibilidad y precio?`;
    checkout.href = `https://wa.me/${encodeURIComponent(config.whatsappNumber)}?text=${encodeURIComponent(message)}`;
    container.innerHTML = cart.map((item) => {
      const product = products.find((entry) => entry.id === item.id);
      const productImage = product.image
        ? `<img src="${product.image}" alt="${escapeHtml(product.name)}" class="cart-item-image" loading="lazy">`
        : `<div class="cart-image-placeholder" role="img" aria-label="Espacio para la foto de ${escapeHtml(product.name)}"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4.5" y="5.5" width="23" height="21" rx="1"/><circle cx="12" cy="12" r="2.5"/><path d="m6 24 7-7 4 4 3-3 6 6"/></svg></div>`;
      return `<article class="cart-row">
        ${productImage}
        <div><span class="product-category">${escapeHtml(product.category)}</span><h2>${escapeHtml(product.name)}</h2><span class="cart-row-price">${formatPrice(product.price)}</span></div>
        <div class="quantity-control" aria-label="Cantidad de ${escapeHtml(product.name)}">
          <button type="button" data-quantity="${escapeHtml(product.id)}" data-change="-1" aria-label="Quitar una unidad">−</button><span>${item.quantity}</span><button type="button" data-quantity="${escapeHtml(product.id)}" data-change="1" aria-label="Agregar una unidad">+</button>
        </div>
        <button class="remove-item" type="button" data-remove="${escapeHtml(product.id)}">Quitar</button>
      </article>`;
    }).join("");
  }

  function changeQuantity(id, delta) {
    const cart = getCart();
    const item = cart.find((entry) => entry.id === id);
    if (!item) return;
    item.quantity += delta;
    saveCart(cart.filter((entry) => entry.quantity > 0));
    updateCartCount();
    renderCart();
  }

  function setupContactForm() {
    const form = document.getElementById("contact-form");
    if (!form) return;
    const endpoint = config.contactFormEndpoint;
    if (!endpoint) {
      document.getElementById("form-config-note").hidden = false;
      form.querySelector("button[type=submit]").disabled = true;
      return;
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const submit = document.getElementById("contact-submit");
      const note = document.getElementById("form-note");
      submit.disabled = true;
      submit.textContent = "Enviando…";
      note.textContent = "";
      note.className = "form-note";
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: new FormData(form)
        });
        if (!response.ok) throw new Error(`El servicio de contacto respondió ${response.status}.`);
        note.textContent = "¡Listo! Recibimos tu mensaje. Pronto te responderemos.";
        note.classList.add("success");
        form.reset();
      } catch (error) {
        console.error("No se pudo enviar el mensaje de contacto.", error);
        note.textContent = "No pudimos enviar el mensaje. Probá de nuevo o escribinos directamente al correo.";
        note.classList.add("error");
      } finally {
        submit.disabled = false;
        submit.textContent = "Enviar mensaje";
      }
    });
  }

  function setupCommon() {
    document.querySelectorAll("[data-phone]").forEach((element) => {
      element.textContent = config.phoneDisplay;
      element.href = `tel:${config.phoneTel}`;
    });
    document.querySelectorAll("[data-email]").forEach((element) => {
      element.textContent = config.email;
      element.href = `mailto:${config.email}`;
    });
    document.querySelectorAll("[data-social]").forEach((element) => {
      const network = element.dataset.social;
      if (network === "whatsapp") {
        element.href = `https://wa.me/${encodeURIComponent(config.whatsappNumber)}`;
        element.target = "_blank";
        element.rel = "noopener";
      } else if (config.social[network]) {
        element.href = config.social[network];
        element.target = "_blank";
        element.rel = "noopener";
      } else {
        element.removeAttribute("href");
        element.setAttribute("aria-disabled", "true");
        element.title = "Enlace oficial por confirmar";
      }
    });
    document.querySelectorAll("[data-whatsapp]").forEach((element) => {
      if (element.id !== "checkout-whatsapp") {
        element.href = `https://wa.me/${encodeURIComponent(config.whatsappNumber)}?text=${encodeURIComponent("Hola, Tienda Las Amapolas. Quisiera hacer una consulta.")}`;
      }
    });
    document.querySelectorAll("[data-directions]").forEach((element) => {
      element.href = config.directionsUrl;
    });
    document.querySelectorAll("[data-google-review]").forEach((element) => { element.href = config.googleMapsReviewsUrl; });
    document.querySelectorAll("#footer-hours").forEach((element) => {
      element.innerHTML = config.hours.map((item) => `<div class="footer-hours-row"><span>${escapeHtml(item.day)}</span><span>${escapeHtml(formatHour(item.open))}–${escapeHtml(formatHour(item.close))}</span></div>`).join("");
    });
    const year = document.getElementById("current-year");
    if (year) year.textContent = String(new Date().getFullYear());

    const menuButton = document.querySelector(".menu-toggle");
    const nav = document.querySelector(".main-nav");
    if (menuButton && nav) {
      menuButton.addEventListener("click", () => {
        const expanded = menuButton.getAttribute("aria-expanded") === "true";
        menuButton.setAttribute("aria-expanded", String(!expanded));
        menuButton.setAttribute("aria-label", expanded ? "Abrir menú" : "Cerrar menú");
        nav.classList.toggle("is-open", !expanded);
      });
      nav.addEventListener("click", (event) => {
        if (event.target instanceof HTMLAnchorElement) {
          menuButton.setAttribute("aria-expanded", "false");
          menuButton.setAttribute("aria-label", "Abrir menú");
          nav.classList.remove("is-open");
        }
      });
    }

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const add = target.closest("[data-add]");
      const quantity = target.closest("[data-quantity]");
      const remove = target.closest("[data-remove]");
      if (add) addToCart(add.dataset.add);
      if (quantity) changeQuantity(quantity.dataset.quantity, Number(quantity.dataset.change));
      if (remove) changeQuantity(remove.dataset.remove, -getCart().find((item) => item.id === remove.dataset.remove).quantity);
    });
  }

  function addStructuredData() {
    if (document.body.dataset.page !== "home") return;
    const schema = {
      "@context": "https://schema.org",
      "@type": "Store",
      name: config.name,
      foundingDate: String(config.founded),
      telephone: config.phoneTel,
      email: config.email,
      address: {
        "@type": "PostalAddress",
        streetAddress: config.address,
        addressLocality: "La Guácima",
        addressRegion: "Alajuela",
        addressCountry: "CR"
      },
      openingHoursSpecification: config.hours.map((item, index) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][index],
        opens: item.open,
        closes: item.close
      })),
      aggregateRating: { "@type": "AggregateRating", ratingValue: "4.7", bestRating: "5" }
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema);
    document.head.append(script);
  }

  async function initializeStorefront() {
    await refreshCatalogFromApi();
    setupCommon();
    setupAccountDialog();
    updateCartCount();
    addStructuredData();
    if (typeof setupHome === "function") setupHome();
    if (typeof setupCatalog === "function") setupCatalog();
    renderCart();
    setupContactForm();
    if (document.body.dataset.page !== "admin") {
      try {
        const response = await fetch("/api/admin/publish-status", { cache: "no-store" });
        if (!response.ok) throw new Error(`El servidor respondió ${response.status}.`);
        const status = await response.json();
        publishedCatalogVersion = Number(status.version);
        window.setInterval(async () => {
          if (document.visibilityState === "hidden") return;
          try {
            const latestResponse = await fetch("/api/admin/publish-status", { cache: "no-store" });
            if (!latestResponse.ok) throw new Error(`El servidor respondió ${latestResponse.status}.`);
            const latest = await latestResponse.json();
            const latestVersion = Number(latest.version);
            if (Number.isFinite(latestVersion) && latestVersion !== publishedCatalogVersion) {
              window.location.reload();
            }
          } catch (error) {
            console.warn("No se pudo comprobar si la tienda publicó cambios.", error);
          }
        }, 5000);
      } catch (error) {
        console.warn("No se pudo consultar la versión publicada del catálogo.", error);
      }
    }
  }

  initializeStorefront();
})();

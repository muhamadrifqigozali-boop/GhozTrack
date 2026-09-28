// ================== CONFIG ==================
const SUPABASE_URL = "https://cfxeiiwcawxbemhjybhc.supabase.co";
const SUPABASE_KEY = "sb_publishable_qo21jEafkf1rfKWLurbEsw_pDWiLZXy";
const PIN = "200705"; // ← GANTI PIN LO
// ============================================

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentMonth = null;
let currentPin = "";
let editingId = null;
let editModal = null;

function formatRupiah(v) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(v || 0);
}

function escapeHtml(t) {
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}

// ========== THEME ==========
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-bs-theme") === "dark";
  const next = isDark ? "light" : "dark";
  html.setAttribute("data-bs-theme", next);
  localStorage.setItem("theme", next);
  document.getElementById("themeIcon").className = next === "dark" ? "bi bi-sun" : "bi bi-moon-stars";
}

function loadTheme() {
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-bs-theme", saved);
  const icon = document.getElementById("themeIcon");
  if (icon) icon.className = saved === "dark" ? "bi bi-sun" : "bi bi-moon-stars";
}

// ========== PIN ==========
function pressPin(n) {
  if (currentPin.length >= 6) return;
  currentPin += n;
  updateDots();
  if (currentPin.length === 6) setTimeout(checkPin, 180);
}

function deletePin() {
  currentPin = currentPin.slice(0, -1);
  updateDots();
  document.getElementById("pinError").textContent = "";
}

function updateDots() {
  document.querySelectorAll("#pinDots span").forEach((s, i) => {
    s.classList.toggle("filled", i < currentPin.length);
  });
}

function checkPin() {
  if (currentPin === PIN) {
    localStorage.setItem("keuangan_ok", "1");
    showApp();
  } else {
    document.getElementById("pinError").textContent = "PIN salah 😢";
    currentPin = "";
    updateDots();
  }
}

function logout() {
  localStorage.removeItem("keuangan_ok");
  currentMonth = null;
  currentPin = "";
  document.getElementById("appPage").classList.add("d-none");
  document.getElementById("pinPage").classList.remove("d-none");
  updateDots();
}

function showApp() {
  document.getElementById("pinPage").classList.add("d-none");
  document.getElementById("appPage").classList.remove("d-none");
  fillYearOptions();
  
  const now = new Date();
  document.getElementById("newMonth").value = String(now.getMonth() + 1).padStart(2, "0");
  generatePeriodName();

  // Set default tanggal hari ini
  const today = new Date().toISOString().split("T")[0];
  const dateInput = document.getElementById("txDate");
  if (dateInput) dateInput.value = today;

  loadMonths();
  showView("dashboard");
}

// ========== PERIOD NAME ==========
function fillYearOptions() {
  const select = document.getElementById("newYear");
  if (!select) return;
  const currentYear = new Date().getFullYear();
  select.innerHTML = "";
  for (let y = currentYear - 5; y <= currentYear + 2; y++) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    if (y === currentYear) opt.selected = true;
    select.appendChild(opt);
  }
}

function generatePeriodName() {
  const year = document.getElementById("newYear")?.value;
  const month = document.getElementById("newMonth")?.value;
  const startDay = document.getElementById("startDay")?.value || 1;
  const endDay = document.getElementById("endDay")?.value || 30;

  if (!year || !month) return;

  const monthNames = [
    "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const monthName = monthNames[parseInt(month)];

  let name = "";
  if (parseInt(startDay) === 1) {
    name = `${monthName} ${year}`;
  } else {
    name = `${startDay} ${monthName} – ${endDay} ${monthName} ${year}`;
  }
  document.getElementById("monthName").value = name;
}

// ========== NAV ==========
function showView(name) {
  document.querySelectorAll(".view-section").forEach(v => v.classList.add("d-none"));
  document.getElementById(`view-${name}`).classList.remove("d-none");

  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.view === name);
  });

  const titles = { dashboard: "Dashboard", transactions: "Transaksi", goals: "Target" };
  document.getElementById("pageTitle").textContent = titles[name];
}

// ========== MONTH / PERIOD ==========
async function loadMonths() {
  const { data } = await client.from("months").select("*").order("created_at", { ascending: false });
  const sel = document.getElementById("monthSelect");
  sel.innerHTML = `<option value="">-- Pilih periode --</option>`;
  (data || []).forEach(m => {
    const o = document.createElement("option");
    o.value = m.id;
    o.textContent = m.month;
    sel.appendChild(o);
  });
}

async function createMonth() {
  const name = document.getElementById("monthName").value.trim();
  const cash = Number(document.getElementById("openingCash").value) || 0;
  const nonCash = Number(document.getElementById("openingNonCash").value) || 0;
  if (!name) return alert("Isi nama periode dulu");

  const { data, error } = await client.from("months").insert({
    month: name,
    opening_cash: cash,
    opening_non_cash: nonCash
  }).select().single();

  if (error) return alert(error.message);

  document.getElementById("monthName").value = "";
  document.getElementById("openingCash").value = "";
  document.getElementById("openingNonCash").value = "";

  await loadMonths();
  document.getElementById("monthSelect").value = data.id;
  selectMonth();
}

async function usePreviousBalance() {
  const { data } = await client.from("months").select("*").order("created_at", { ascending: false }).limit(1);
  if (!data || !data.length) return alert("Belum ada periode sebelumnya");

  const last = data[0];
  const { data: txs } = await client.from("transactions").select("*").eq("month_id", last.id);

  let cash = Number(last.opening_cash);
  let nonCash = Number(last.opening_non_cash);

  (txs || []).forEach(t => {
    const a = Number(t.amount);
    if (t.type === "expense") {
      if (t.account === "cash") cash -= a; else nonCash -= a;
    }
    if (t.type === "income") {
      if (t.account === "cash") cash += a; else nonCash += a;
    }
    if (t.type === "transfer") {
      if (t.account === "cash" && t.transfer_to === "non_cash") { cash -= a; nonCash += a; }
      if (t.account === "non_cash" && t.transfer_to === "cash") { nonCash -= a; cash += a; }
    }
  });

  document.getElementById("openingCash").value = Math.max(0, Math.round(cash));
  document.getElementById("openingNonCash").value = Math.max(0, Math.round(nonCash));
  alert(`Sisa periode "${last.month}" sudah diisi:\nCash: ${formatRupiah(cash)}\nNon-Cash: ${formatRupiah(nonCash)}`);
}

async function selectMonth() {
  const id = document.getElementById("monthSelect").value;
  if (!id) {
    currentMonth = null;
    document.getElementById("summaryArea").classList.add("d-none");
    document.getElementById("pageSubtitle").textContent = "Pilih periode dulu";
    return;
  }

  const { data, error } = await client.from("months").select("*").eq("id", id).single();
  if (error) return alert(error.message);

  currentMonth = data;
  document.getElementById("pageSubtitle").textContent = data.month;
  document.getElementById("summaryArea").classList.remove("d-none");
  refreshAll();
}

async function deleteMonth() {
  if (!currentMonth) return alert("Pilih periode dulu");
  if (!confirm(`Hapus periode "${currentMonth.month}" beserta semua datanya?`)) return;

  await client.from("transactions").delete().eq("month_id", currentMonth.id);
  await client.from("goals").delete().eq("month_id", currentMonth.id);
  await client.from("months").delete().eq("id", currentMonth.id);

  currentMonth = null;
  document.getElementById("monthSelect").value = "";
  document.getElementById("summaryArea").classList.add("d-none");
  document.getElementById("pageSubtitle").textContent = "Pilih periode dulu";
  await loadMonths();
}

// ========== TRANSAKSI ==========
function toggleTxFields() {
  const type = document.getElementById("txType").value;
  document.getElementById("wrapCategory").classList.toggle("d-none", type === "transfer");
  document.getElementById("wrapAccount").classList.toggle("d-none", type === "transfer");
  document.getElementById("wrapTransfer").classList.toggle("d-none", type !== "transfer");
}

async function addTransaction() {
  if (!currentMonth) return alert("Pilih periode dulu");

  const name = document.getElementById("txName").value.trim();
  const amount = Number(document.getElementById("txAmount").value);
  const type = document.getElementById("txType").value;
  const note = document.getElementById("txNote").value.trim();
  const txDate = document.getElementById("txDate").value || new Date().toISOString().split("T")[0];

  if (!name || amount <= 0) return alert("Isi nama & nominal");

  let account = "cash";
  let transfer_to = null;
  let category = null;

  if (type === "transfer") {
    account = document.getElementById("txFrom").value;
    transfer_to = document.getElementById("txTo").value;
    if (account === transfer_to) return alert("Akun harus berbeda");
  } else {
    account = document.getElementById("txAccount").value;
    category = document.getElementById("txCategory").value;
  }

  const { error } = await client.from("transactions").insert({
    month_id: currentMonth.id,
    name,
    amount,
    type,
    category,
    account,
    transfer_to,
    note,
    transaction_date: txDate
  });

  if (error) return alert(error.message);

  // Reset form
  document.getElementById("txName").value = "";
  document.getElementById("txAmount").value = "";
  document.getElementById("txNote").value = "";
  document.getElementById("txDate").value = new Date().toISOString().split("T")[0];

  refreshAll();
}

async function getTransactions() {
  if (!currentMonth) return [];
  const { data } = await client.from("transactions").select("*")
    .eq("month_id", currentMonth.id)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });
  return data || [];
}

function renderTx(list, elId, limit = null) {
  const el = document.getElementById(elId);
  const items = limit ? list.slice(0, limit) : list;

  if (!items.length) {
    el.innerHTML = `<div class="empty-state">Belum ada transaksi ✨</div>`;
    return;
  }

  el.innerHTML = items.map(t => {
    const isExp = t.type === "expense";
    const isInc = t.type === "income";
    const sign = isExp ? "-" : (isInc ? "+" : "");
    const cls = isExp ? "expense" : (isInc ? "income" : "");

    let meta = "";
    if (t.type === "transfer") {
      meta = `Transfer • ${t.account === "cash" ? "Cash" : "Non-Cash"} → ${t.transfer_to === "cash" ? "Cash" : "Non-Cash"}`;
    } else {
      meta = `${t.category || "-"} • ${t.account === "cash" ? "Cash" : "Non-Cash"}`;
    }

    // Format tanggal
    let tgl = "";
    if (t.transaction_date) {
      tgl = new Date(t.transaction_date).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    }

    return `
      <div class="tx-item">
        <div>
          <div class="name">${escapeHtml(t.name)}</div>
          <div class="meta">\( {meta} \){tgl ? " • " + tgl : ""}</div>
        </div>
        <div>
          <div class="amount \( {cls}"> \){sign}${formatRupiah(t.amount)}</div>
          <div class="tx-actions mt-1">
            <button onclick="openEdit(\( {t.id}, ' \){escapeHtml(t.name)}', ${t.amount})">Edit</button>
            <button onclick="deleteTx(${t.id})">Hapus</button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// ========== GOALS ==========
async function addGoal() {
  if (!currentMonth) return alert("Pilih periode dulu");
  const name = document.getElementById("goalName").value.trim();
  const amount = Number(document.getElementById("goalAmount").value);
  const type = document.getElementById("goalType").value;
  if (!name || amount <= 0) return alert("Isi nama & jumlah");

  const { error } = await client.from("goals").insert({
    month_id: currentMonth.id, name, target_amount: amount, type
  });
  if (error) return alert(error.message);

  document.getElementById("goalName").value = "";
  document.getElementById("goalAmount").value = "";
  refreshAll();
}

async function getGoals() {
  if (!currentMonth) return [];
  const { data } = await client.from("goals").select("*")
    .eq("month_id", currentMonth.id).order("created_at", { ascending: false });
  return data || [];
}

function renderGoals(goals, txs, elId) {
  const el = document.getElementById(elId);
  if (!goals.length) {
    el.innerHTML = `<div class="empty-state">Belum ada target 🎯</div>`;
    return;
  }

  const bal = calc(txs);
  const totalExp = bal.expense;

  el.innerHTML = goals.map(g => {
    let current = g.type === "limit" ? totalExp : bal.total;
    let pct = Math.min(100, (current / g.target_amount) * 100);
    let barClass = g.type === "limit" ? (current > g.target_amount ? "bg-danger" : "bg-primary") : "bg-success";

    return `
      <div class="goal-item">
        <div class="d-flex justify-content-between mb-1">
          <strong style="font-size:14px">${escapeHtml(g.name)}</strong>
          <small class="text-secondary">${g.type === "saving" ? "Nabung" : "Batas"}</small>
        </div>
        <div class="progress mb-1">
          <div class="progress-bar \( {barClass}" style="width: \){pct}%"></div>
        </div>
        <div class="d-flex justify-content-between" style="font-size:12px;color:var(--bs-secondary-color)">
          <span>${formatRupiah(current)}</span>
          <span>dari ${formatRupiah(g.target_amount)}</span>
        </div>
      </div>`;
  }).join("");
}

// ========== CALC ==========
function calc(txs) {
  let cash = Number(currentMonth.opening_cash);
  let nonCash = Number(currentMonth.opening_non_cash);
  let expense = 0, income = 0;

  txs.forEach(t => {
    const a = Number(t.amount);
    if (t.type === "expense") {
      expense += a;
      if (t.account === "cash") cash -= a; else nonCash -= a;
    }
    if (t.type === "income") {
      income += a;
      if (t.account === "cash") cash += a; else nonCash += a;
    }
    if (t.type === "transfer") {
      if (t.account === "cash" && t.transfer_to === "non_cash") { cash -= a; nonCash += a; }
      if (t.account === "non_cash" && t.transfer_to === "cash") { nonCash -= a; cash += a; }
    }
  });
  return { cash, nonCash, total: cash + nonCash, expense, income };
}

async function refreshAll() {
  if (!currentMonth) return;
  const [txs, goals] = await Promise.all([getTransactions(), getGoals()]);
  const bal = calc(txs);

  document.getElementById("totalBalance").textContent = formatRupiah(bal.total);
  document.getElementById("cashBalance").textContent = formatRupiah(bal.cash);
  document.getElementById("nonCashBalance").textContent = formatRupiah(bal.nonCash);
  document.getElementById("totalExpense").textContent = formatRupiah(bal.expense);
  document.getElementById("totalIncome").textContent = formatRupiah(bal.income);

  renderTx(txs, "recentTx", 5);
  renderTx(txs, "allTx");
  renderGoals(goals, txs, "goalsPreview");
  renderGoals(goals, txs, "goalsList");
}

// ========== EDIT / DELETE ==========
function openEdit(id, name, amount) {
  editingId = id;
  document.getElementById("editName").value = name;
  document.getElementById("editAmount").value = amount;
  editModal.show();
}

async function saveEdit() {
  if (!editingId) return;
  const name = document.getElementById("editName").value.trim();
  const amount = Number(document.getElementById("editAmount").value);
  if (!name || amount <= 0) return alert("Data tidak valid");

  const { error } = await client.from("transactions").update({ name, amount }).eq("id", editingId);
  if (error) return alert(error.message);
  editModal.hide();
  refreshAll();
}

async function deleteTx(id) {
  if (!confirm("Hapus transaksi ini?")) return;
  await client.from("transactions").delete().eq("id", id);
  refreshAll();
}

// ========== INIT ==========
function init() {
  loadTheme();
  editModal = new bootstrap.Modal(document.getElementById("editModal"));

  if (localStorage.getItem("keuangan_ok") === "1") {
    showApp();
  }
}

init();

// ================= CONFIG =================
const SUPABASE_URL = "https://cfxeiiwcawxbemhjybhc.supabase.co";
const SUPABASE_KEY = "sb_publishable_qo21jEafkf1rfKWLurbEsw_pDWiLZXy";
const PIN = "123456"; // ← GANTI PIN LO DI SINI (6 digit)
// ==========================================

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentMonth = null;
let currentPin = "";
let editingId = null;

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

// ========== PIN ==========
function pressPin(num) {
  if (currentPin.length >= 6) return;
  currentPin += num;
  updatePinDots();

  if (currentPin.length === 6) {
    setTimeout(checkPin, 150);
  }
}

function deletePin() {
  currentPin = currentPin.slice(0, -1);
  updatePinDots();
  document.getElementById("pinError").textContent = "";
}

function updatePinDots() {
  const dots = document.querySelectorAll("#pinDots span");
  dots.forEach((dot, i) => {
    dot.classList.toggle("filled", i < currentPin.length);
  });
}

function checkPin() {
  if (currentPin === PIN) {
    localStorage.setItem("keuangan_pin", "ok");
    showApp();
  } else {
    document.getElementById("pinError").textContent = "PIN salah";
    currentPin = "";
    updatePinDots();
  }
}

function logout() {
  localStorage.removeItem("keuangan_pin");
  currentMonth = null;
  currentPin = "";
  document.getElementById("appPage").classList.add("hidden");
  document.getElementById("pinPage").classList.remove("hidden");
  updatePinDots();
}

function showApp() {
  document.getElementById("pinPage").classList.add("hidden");
  document.getElementById("appPage").classList.remove("hidden");
  loadMonths();
  showView("dashboard");
}

// ========== NAVIGATION ==========
function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById(`view-${name}`).classList.remove("hidden");

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });

  const titles = {
    dashboard: "Dashboard",
    transactions: "Transaksi",
    goals: "Target"
  };
  document.getElementById("headerTitle").textContent = titles[name];
}

// ========== MONTH ==========
async function loadMonths() {
  const { data } = await client
    .from("months")
    .select("*")
    .order("created_at", { ascending: false });

  const select = document.getElementById("monthSelect");
  select.innerHTML = `<option value="">-- Pilih bulan --</option>`;

  (data || []).forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.month;
    select.appendChild(opt);
  });
}

async function createMonth() {
  const month = document.getElementById("monthName").value.trim();
  const openingCash = Number(document.getElementById("openingCash").value) || 0;
  const openingNonCash = Number(document.getElementById("openingNonCash").value) || 0;

  if (!month) return alert("Isi nama bulan");

  const { data, error } = await client
    .from("months")
    .insert({ month, opening_cash: openingCash, opening_non_cash: openingNonCash })
    .select()
    .single();

  if (error) return alert(error.message);

  document.getElementById("monthName").value = "";
  document.getElementById("openingCash").value = "";
  document.getElementById("openingNonCash").value = "";

  await loadMonths();
  document.getElementById("monthSelect").value = data.id;
  selectMonth();
}

async function selectMonth() {
  const id = document.getElementById("monthSelect").value;
  if (!id) {
    currentMonth = null;
    document.getElementById("summaryCards").classList.add("hidden");
    document.getElementById("headerSubtitle").textContent = "Pilih bulan dulu";
    return;
  }

  const { data, error } = await client.from("months").select("*").eq("id", id).single();
  if (error) return alert(error.message);

  currentMonth = data;
  document.getElementById("headerSubtitle").textContent = data.month;
  document.getElementById("summaryCards").classList.remove("hidden");

  refreshAll();
}

// ========== TRANSACTIONS ==========
function toggleTxFields() {
  const type = document.getElementById("txType").value;
  document.getElementById("txCategoryWrap").classList.toggle("hidden", type === "transfer");
  document.getElementById("txAccountWrap").classList.toggle("hidden", type === "transfer");
  document.getElementById("txTransferWrap").classList.toggle("hidden", type !== "transfer");
}

async function addTransaction() {
  if (!currentMonth) return alert("Pilih bulan dulu");

  const name = document.getElementById("txName").value.trim();
  const amount = Number(document.getElementById("txAmount").value);
  const type = document.getElementById("txType").value;
  const note = document.getElementById("txNote").value.trim();

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
    note
  });

  if (error) return alert(error.message);

  document.getElementById("txName").value = "";
  document.getElementById("txAmount").value = "";
  document.getElementById("txNote").value = "";
  refreshAll();
}

async function getTransactions() {
  if (!currentMonth) return [];
  const { data } = await client
    .from("transactions")
    .select("*")
    .eq("month_id", currentMonth.id)
    .order("created_at", { ascending: false });
  return data || [];
}

function renderTransactions(list, containerId, limit = null) {
  const el = document.getElementById(containerId);
  const items = limit ? list.slice(0, limit) : list;

  if (!items.length) {
    el.innerHTML = `<div class="empty-state">Belum ada transaksi</div>`;
    return;
  }

  el.innerHTML = items.map(t => {
    const isExpense = t.type === "expense";
    const isIncome = t.type === "income";
    const sign = isExpense ? "-" : isIncome ? "+" : "";
    const cls = isExpense ? "expense" : isIncome ? "income" : "";

    let meta = "";
    if (t.type === "transfer") {
      meta = `Transfer • ${t.account === "cash" ? "Cash" : "Non-Cash"} → ${t.transfer_to === "cash" ? "Cash" : "Non-Cash"}`;
    } else {
      meta = `${t.category || "-"} • ${t.account === "cash" ? "Cash" : "Non-Cash"}`;
    }

    return `
      <div class="tx-item">
        <div class="tx-left">
          <strong>${escapeHtml(t.name)}</strong>
          <small>${meta}</small>
        </div>
        <div class="tx-right">
          <div class="amount \( {cls}"> \){sign}${formatRupiah(t.amount)}</div>
          <div class="tx-actions">
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
  if (!currentMonth) return alert("Pilih bulan dulu");

  const name = document.getElementById("goalName").value.trim();
  const amount = Number(document.getElementById("goalAmount").value);
  const type = document.getElementById("goalType").value;

  if (!name || amount <= 0) return alert("Isi nama & jumlah target");

  const { error } = await client.from("goals").insert({
    month_id: currentMonth.id,
    name,
    target_amount: amount,
    type
  });

  if (error) return alert(error.message);

  document.getElementById("goalName").value = "";
  document.getElementById("goalAmount").value = "";
  refreshAll();
}

async function getGoals() {
  if (!currentMonth) return [];
  const { data } = await client
    .from("goals")
    .select("*")
    .eq("month_id", currentMonth.id)
    .order("created_at", { ascending: false });
  return data || [];
}

function renderGoals(goals, transactions, containerId) {
  const el = document.getElementById(containerId);

  if (!goals.length) {
    el.innerHTML = `<div class="empty-state">Belum ada target</div>`;
    return;
  }

  const totalExpense = transactions
    .filter(t => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);

  // Untuk saving: kita anggap sisa saldo sebagai progress (sederhana)
  const totalBalance = calculateBalance(transactions).total;

  el.innerHTML = goals.map(g => {
    let current = 0;
    let percent = 0;
    let status = "";

    if (g.type === "limit") {
      current = totalExpense;
      percent = Math.min(100, (current / g.target_amount) * 100);
      status = current > g.target_amount ? "over" : "limit";
    } else {
      // saving: progress = total balance (sederhana)
      current = totalBalance;
      percent = Math.min(100, (current / g.target_amount) * 100);
      status = "saving";
    }

    return `
      <div class="goal-item">
        <div class="goal-top">
          <strong>${escapeHtml(g.name)}</strong>
          <span>${g.type === "saving" ? "Nabung" : "Batas"}</span>
        </div>
        <div class="progress-bar">
          <div class="fill \( {status}" style="width: \){percent}%"></div>
        </div>
        <div class="goal-bottom">
          <span>${formatRupiah(current)}</span>
          <span>dari ${formatRupiah(g.target_amount)}</span>
        </div>
      </div>
    `;
  }).join("");
}

// ========== CALCULATION ==========
function calculateBalance(transactions) {
  let cash = Number(currentMonth.opening_cash);
  let nonCash = Number(currentMonth.opening_non_cash);
  let expense = 0;
  let income = 0;

  for (const t of transactions) {
    const amt = Number(t.amount);

    if (t.type === "expense") {
      expense += amt;
      if (t.account === "cash") cash -= amt;
      else nonCash -= amt;
    }

    if (t.type === "income") {
      income += amt;
      if (t.account === "cash") cash += amt;
      else nonCash += amt;
    }

    if (t.type === "transfer") {
      if (t.account === "cash" && t.transfer_to === "non_cash") {
        cash -= amt;
        nonCash += amt;
      } else if (t.account === "non_cash" && t.transfer_to === "cash") {
        nonCash -= amt;
        cash += amt;
      }
    }
  }

  return { cash, nonCash, total: cash + nonCash, expense, income };
}

async function refreshAll() {
  if (!currentMonth) return;

  const [transactions, goals] = await Promise.all([
    getTransactions(),
    getGoals()
  ]);

  const bal = calculateBalance(transactions);

  document.getElementById("totalBalance").textContent = formatRupiah(bal.total);
  document.getElementById("cashBalance").textContent = formatRupiah(bal.cash);
  document.getElementById("nonCashBalance").textContent = formatRupiah(bal.nonCash);
  document.getElementById("totalExpense").textContent = formatRupiah(bal.expense);
  document.getElementById("totalIncome").textContent = formatRupiah(bal.income);

  renderTransactions(transactions, "recentTransactions", 5);
  renderTransactions(transactions, "allTransactions");
  renderGoals(goals, transactions, "goalsListPreview");
  renderGoals(goals, transactions, "goalsList");
}

// ========== EDIT / DELETE ==========
function openEdit(id, name, amount) {
  editingId = id;
  document.getElementById("editName").value = name;
  document.getElementById("editAmount").value = amount;
  document.getElementById("editModal").classList.remove("hidden");
}

function closeEdit() {
  editingId = null;
  document.getElementById("editModal").classList.add("hidden");
}

async function saveEdit() {
  if (!editingId) return;
  const name = document.getElementById("editName").value.trim();
  const amount = Number(document.getElementById("editAmount").value);

  if (!name || amount <= 0) return alert("Data tidak valid");

  const { error } = await client
    .from("transactions")
    .update({ name, amount })
    .eq("id", editingId);

  if (error) return alert(error.message);
  closeEdit();
  refreshAll();
}

async function deleteTx(id) {
  if (!confirm("Hapus transaksi ini?")) return;
  await client.from("transactions").delete().eq("id", id);
  refreshAll();
}

// ========== INIT ==========
function init() {
  if (localStorage.getItem("keuangan_pin") === "ok") {
    showApp();
  }
}

init();

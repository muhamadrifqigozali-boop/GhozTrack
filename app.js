// ====================== PENGATURAN ======================
const SUPABASE_URL = "https://cfxeiiwcawxbemhjybhc.supabase.co";
const SUPABASE_KEY = "sb_publishable_qo21jEafkf1rfKWLurbEsw_pDWiLZXy";

// GANTI PASSWORD INI
const PASSWORD = "Ghozali";   // ← ganti dengan password lo
// ========================================================

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentMonth = null;
let editingId = null;

function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ========== AUTH (Hardcoded) ==========
function login() {
  const password = document.getElementById("password").value;

  if (password === PASSWORD) {
    localStorage.setItem("keuangan_login", "true");
    showApp();
    loadMonths();
  } else {
    document.getElementById("authMessage").textContent = "Password salah.";
  }
}

function logout() {
  localStorage.removeItem("keuangan_login");
  currentMonth = null;

  document.getElementById("appPage").classList.add("hidden");
  document.getElementById("loginPage").classList.remove("hidden");
  document.getElementById("password").value = "";
  document.getElementById("authMessage").textContent = "";
}

function showApp() {
  document.getElementById("loginPage").classList.add("hidden");
  document.getElementById("appPage").classList.remove("hidden");
}

// ========== MONTH ==========
async function loadMonths() {
  const { data, error } = await client
    .from("months")
    .select("*")
    .order("created_at", { ascending: false });

  const select = document.getElementById("monthSelect");
  select.innerHTML = `<option value="">-- Pilih bulan --</option>`;

  if (data && data.length) {
    data.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.month;
      select.appendChild(opt);
    });
  }
}

async function createMonth() {
  const month = document.getElementById("monthName").value.trim();
  const openingCash = Number(document.getElementById("openingCash").value) || 0;
  const openingNonCash = Number(document.getElementById("openingNonCash").value) || 0;

  if (!month) {
    alert("Isi nama bulan dulu.");
    return;
  }

  const { data, error } = await client
    .from("months")
    .insert({
      month,
      opening_cash: openingCash,
      opening_non_cash: openingNonCash
    })
    .select()
    .single();

  if (error) {
    alert(error.message);
    return;
  }

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
    document.getElementById("summarySection").style.display = "none";
    document.getElementById("transactionSection").style.display = "none";
    document.getElementById("historySection").style.display = "none";
    return;
  }

  const { data, error } = await client
    .from("months")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    alert(error.message);
    return;
  }

  currentMonth = data;
  document.getElementById("currentMonthLabel").textContent = `(${data.month})`;

  document.getElementById("summarySection").style.display = "block";
  document.getElementById("transactionSection").style.display = "block";
  document.getElementById("historySection").style.display = "block";

  updateSummary();
}

// ========== TRANSAKSI ==========
function toggleTransfer() {
  const type = document.getElementById("transactionType").value;
  document.getElementById("expenseFields").classList.toggle("hidden", type === "transfer");
  document.getElementById("transferFields").classList.toggle("hidden", type === "expense");
}

async function addTransaction() {
  if (!currentMonth) {
    alert("Pilih atau buat bulan dulu.");
    return;
  }

  const name = document.getElementById("transactionName").value.trim();
  const amount = Number(document.getElementById("transactionAmount").value);
  const type = document.getElementById("transactionType").value;

  if (!name || amount <= 0) {
    alert("Isi nama dan nominal yang valid.");
    return;
  }

  let account = null;
  let transfer_to = null;

  if (type === "expense") {
    account = document.getElementById("account").value;
  } else {
    account = document.getElementById("transferFrom").value;
    transfer_to = document.getElementById("transferTo").value;

    if (account === transfer_to) {
      alert("Transfer harus beda akun.");
      return;
    }
  }

  const { error } = await client
    .from("transactions")
    .insert({
      month_id: currentMonth.id,
      name,
      amount,
      type,
      account,
      transfer_to
    });

  if (error) {
    alert(error.message);
    return;
  }

  document.getElementById("transactionName").value = "";
  document.getElementById("transactionAmount").value = "";
  updateSummary();
}

async function getTransactions() {
  if (!currentMonth) return [];

  const { data, error } = await client
    .from("transactions")
    .select("*")
    .eq("month_id", currentMonth.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

async function updateSummary() {
  if (!currentMonth) return;

  const transactions = await getTransactions();

  let cash = Number(currentMonth.opening_cash);
  let nonCash = Number(currentMonth.opening_non_cash);
  let expenses = 0;

  for (const t of transactions) {
    const amount = Number(t.amount);

    if (t.type === "expense") {
      expenses += amount;
      if (t.account === "cash") cash -= amount;
      if (t.account === "non_cash") nonCash -= amount;
    }

    if (t.type === "transfer") {
      if (t.account === "cash" && t.transfer_to === "non_cash") {
        cash -= amount;
        nonCash += amount;
      }
      if (t.account === "non_cash" && t.transfer_to === "cash") {
        nonCash -= amount;
        cash += amount;
      }
    }
  }

  const ending = cash + nonCash;

  document.getElementById("openingCashDisplay").textContent = formatRupiah(currentMonth.opening_cash);
  document.getElementById("openingNonCashDisplay").textContent = formatRupiah(currentMonth.opening_non_cash);
  document.getElementById("cash").textContent = formatRupiah(cash);
  document.getElementById("nonCash").textContent = formatRupiah(nonCash);
  document.getElementById("expenses").textContent = formatRupiah(expenses);
  document.getElementById("ending").textContent = formatRupiah(ending);

  renderTransactions(transactions);
}

function renderTransactions(transactions) {
  const container = document.getElementById("transactions");

  if (!transactions.length) {
    container.innerHTML = "Belum ada transaksi.";
    return;
  }

  container.innerHTML = transactions.map(t => {
    const typeLabel = t.type === "expense" ? "Pengeluaran" : "Transfer";
    const accountLabel = t.type === "expense"
      ? (t.account === "cash" ? "Cash" : "Non-Cash")
      : `${t.account === "cash" ? "Cash" : "Non-Cash"} → ${t.transfer_to === "cash" ? "Cash" : "Non-Cash"}`;

    return `
      <div class="transaction">
        <div class="transaction-info">
          <strong>${escapeHtml(t.name)}</strong>
          <div>${formatRupiah(t.amount)}</div>
          <small>${typeLabel} • ${accountLabel}</small>
        </div>
        <div class="transaction-actions">
          <button class="btn-edit" onclick="openEdit(\( {t.id}, ' \){escapeHtml(t.name)}', ${t.amount})">Edit</button>
          <button class="btn-delete" onclick="deleteTransaction(${t.id})">Hapus</button>
        </div>
      </div>
    `;
  }).join("");
}

// ========== EDIT & DELETE ==========
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

  if (!name || amount <= 0) {
    alert("Data tidak valid.");
    return;
  }

  const { error } = await client
    .from("transactions")
    .update({ name, amount })
    .eq("id", editingId);

  if (error) {
    alert(error.message);
    return;
  }

  closeEdit();
  updateSummary();
}

async function deleteTransaction(id) {
  if (!confirm("Yakin mau hapus transaksi ini?")) return;

  const { error } = await client
    .from("transactions")
    .delete()
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  updateSummary();
}

// ========== INIT ==========
function init() {
  if (localStorage.getItem("keuangan_login") === "true") {
    showApp();
    loadMonths();
  }
}

init();

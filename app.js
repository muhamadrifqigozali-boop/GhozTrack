const SUPABASE_URL = "PASTE_PROJECT_URL_DI_SINI";
const SUPABASE_KEY = "sb_publishable_qo21jEafkf1rfKWLurbEsw_pDWiLZXy";

const client = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let currentUser = null;
let currentMonth = null;


function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value || 0);
}


async function register() {

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { error } = await client.auth.signUp({
    email,
    password
  });

  if (error) {
    document.getElementById("authMessage").textContent =
      error.message;
    return;
  }

  document.getElementById("authMessage").textContent =
    "Akun berhasil dibuat. Silakan login.";
}


async function login() {

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    document.getElementById("authMessage").textContent =
      error.message;
    return;
  }

  currentUser = data.user;

  showApp();
}


async function logout() {

  await client.auth.signOut();

  currentUser = null;

  document.getElementById("appPage")
    .classList.add("hidden");

  document.getElementById("loginPage")
    .classList.remove("hidden");
}


function showApp() {

  document.getElementById("loginPage")
    .classList.add("hidden");

  document.getElementById("appPage")
    .classList.remove("hidden");

  document.getElementById("userEmail")
    .textContent = currentUser.email;
}


async function createMonth() {

  const month =
    document.getElementById("monthName").value;

  const openingBalance =
    Number(document.getElementById("openingBalance").value);

  if (!month || openingBalance < 0) {
    alert("Isi bulan dan saldo awal.");
    return;
  }

  const { data, error } = await client
    .from("months")
    .insert({
      user_id: currentUser.id,
      month,
      opening_balance: openingBalance
    })
    .select()
    .single();

  if (error) {
    alert(error.message);
    return;
  }

  currentMonth = data;

  updateSummary();
}


async function addTransaction() {

  if (!currentMonth) {
    alert("Buat bulan terlebih dahulu.");
    return;
  }

  const name =
    document.getElementById("transactionName").value;

  const amount =
    Number(document.getElementById("transactionAmount").value);

  const type =
    document.getElementById("transactionType").value;

  const account =
    document.getElementById("account").value;

  const transferTo =
    document.getElementById("transferTo").value || null;

  if (!name || amount <= 0) {
    alert("Isi nama dan nominal.");
    return;
  }

  const { error } = await client
    .from("transactions")
    .insert({
      user_id: currentUser.id,
      month_id: currentMonth.id,
      name,
      amount,
      type,
      account,
      transfer_to: type === "transfer"
        ? transferTo
        : null
    });

  if (error) {
    alert(error.message);
    return;
  }

  document.getElementById("transactionName").value = "";
  document.getElementById("transactionAmount").value = "";

  await updateSummary();
}


async function getTransactions() {

  if (!currentMonth) return [];

  const { data, error } = await client
    .from("transactions")
    .select("*")
    .eq("month_id", currentMonth.id)
    .order("created_at", {
      ascending: false
    });

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}


async function updateSummary() {

  if (!currentMonth) return;

  const transactions =
    await getTransactions();

  let cash = 0;
  let nonCash = currentMonth.opening_balance;
  let expenses = 0;

  for (const t of transactions) {

    if (t.type === "expense") {

      expenses += Number(t.amount);

      if (t.account === "cash") {
        cash -= Number(t.amount);
      }

      if (t.account === "non_cash") {
        nonCash -= Number(t.amount);
      }

    }

    if (t.type === "transfer") {

      if (
        t.account === "non_cash" &&
        t.transfer_to === "cash"
      ) {
        nonCash -= Number(t.amount);
        cash += Number(t.amount);
      }

      if (
        t.account === "cash" &&
        t.transfer_to === "non_cash"
      ) {
        cash -= Number(t.amount);
        nonCash += Number(t.amount);
      }

    }
  }

  const ending =
    cash + nonCash;

  document.getElementById("opening")
    .textContent =
    formatRupiah(currentMonth.opening_balance);

  document.getElementById("cash")
    .textContent =
    formatRupiah(cash);

  document.getElementById("nonCash")
    .textContent =
    formatRupiah(nonCash);

  document.getElementById("expenses")
    .textContent =
    formatRupiah(expenses);

  document.getElementById("ending")
    .textContent =
    formatRupiah(ending);

  document.getElementById("balance")
    .textContent =
    formatRupiah(
      currentMonth.opening_balance
      - expenses
      - ending
    );

  renderTransactions(transactions);
}


function renderTransactions(transactions) {

  const container =
    document.getElementById("transactions");

  if (!transactions.length) {
    container.textContent =
      "Belum ada transaksi.";
    return;
  }

  container.innerHTML =
    transactions.map(t => {

      const type =
        t.type === "expense"
          ? "Pengeluaran"
          : "Transfer";

      return `
        <div class="transaction">
          <strong>${escapeHtml(t.name)}</strong>
          <br>
          ${formatRupiah(t.amount)}
          <br>
          <small>
            ${type} • ${t.account}
          </small>
        </div>
      `;

    }).join("");
}


function escapeHtml(text) {

  const div = document.createElement("div");

  div.textContent = text;

  return div.innerHTML;
}


async function init() {

  const { data } =
    await client.auth.getSession();

  if (data.session) {

    currentUser =
      data.session.user;

    showApp();
  }
}


init();

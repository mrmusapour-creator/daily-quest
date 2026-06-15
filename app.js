const STORAGE_KEY = "dailyQuestState.v1";
const categoryLabels = {
  work: "کار",
  sport: "ورزش",
  health: "سلامتی",
  learn: "یادگیری",
  life: "زندگی"
};

let deferredInstallPrompt = null;
let state = loadState();

const screens = {
  onboarding: document.querySelector("#onboardingScreen"),
  dashboard: document.querySelector("#dashboardScreen")
};
const profileForm = document.querySelector("#profileForm");
const taskForm = document.querySelector("#taskForm");
const taskList = document.querySelector("#taskList");
const taskTemplate = document.querySelector("#taskTemplate");
const logList = document.querySelector("#logList");

document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("fa-IR", {
  weekday: "long",
  day: "numeric",
  month: "long"
}).format(new Date());

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  document.querySelector("#installBtn").hidden = false;
});

document.querySelector("#installBtn").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.querySelector("#installBtn").hidden = true;
});

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const profile = Object.fromEntries(new FormData(profileForm));
  state.profile = {
    business: profile.business.trim(),
    workGoal: profile.workGoal.trim(),
    age: Number(profile.age),
    height: Number(profile.height),
    weight: Number(profile.weight),
    sport: profile.sport,
    healthGoal: profile.healthGoal,
    penalty: Number(profile.penalty || 0)
  };
  if (!state.tasks.length) {
    state.tasks = buildStarterTasks(state.profile);
  }
  saveState();
  showDashboard();
});

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(taskForm));
  const payload = {
    id: data.id || createId(),
    title: data.title.trim(),
    time: data.time,
    category: data.category,
    penalty: Number(data.penalty || state.profile?.penalty || 0),
    done: false,
    settledLate: false
  };
  const index = state.tasks.findIndex((task) => task.id === payload.id);
  if (index >= 0) {
    state.tasks[index] = { ...state.tasks[index], ...payload };
  } else {
    state.tasks.push(payload);
  }
  taskForm.reset();
  taskForm.id.value = "";
  saveState();
  render();
});

document.querySelector("#cancelEditBtn").addEventListener("click", () => {
  taskForm.reset();
  taskForm.id.value = "";
});

document.querySelector("#editProfileBtn").addEventListener("click", () => {
  fillProfileForm();
  showScreen("onboarding");
});

document.querySelector("#resetTodayBtn").addEventListener("click", () => {
  state.tasks = state.tasks.map((task) => ({ ...task, done: false, doneAt: null, settledLate: false }));
  addLog("روز جدید شروع شد؛ ماموریت‌ها آماده‌اند.", "شروع");
  saveState();
  render();
});

document.querySelector("#clearLogBtn").addEventListener("click", () => {
  state.logs = [];
  saveState();
  renderLog();
});

function buildStarterTasks(profile) {
  const basePenalty = Number(profile.penalty || 50000);
  const isWeightLoss = profile.healthGoal === "کاهش وزن";
  const intenseSport = profile.sport === "بدنسازی" || profile.sport === "دویدن";
  return [
    task("08:00", "مرور هدف روز و نوشتن ۳ کار مهم", "life", basePenalty),
    task("09:30", `یک حرکت جدی برای ${profile.workGoal}`, "work", basePenalty * 2),
    task("12:30", isWeightLoss ? "ناهار سبک و آب کافی" : "وعده سالم و کامل", "health", basePenalty),
    task("16:00", `۳۰ دقیقه تمرکز روی ${profile.business}`, "work", basePenalty * 2),
    task("18:30", `${intenseSport ? "۴۵" : "۳۰"} دقیقه ${profile.sport}`, "sport", basePenalty * 2),
    task("21:30", "جمع‌بندی روز و آماده‌سازی فردا", "learn", basePenalty)
  ];
}

function task(time, title, category, penalty) {
  return {
    id: createId(),
    time,
    title,
    category,
    penalty,
    done: false,
    settledLate: false
  };
}

function markDone(id) {
  const selected = state.tasks.find((taskItem) => taskItem.id === id);
  if (!selected || selected.done) return;
  const late = isPastTime(selected.time);
  selected.done = true;
  selected.doneAt = new Date().toISOString();
  if (late) {
    state.score = Math.max(0, state.score - 5);
    addLog(`ماموریت «${selected.title}» دیر انجام شد. جریمه پیشنهادی: ${formatMoney(selected.penalty)} برای کمک به نیازمندان.`, "جریمه");
  } else {
    state.score += 10;
    state.coins += 3;
    state.streak += 1;
    addLog(`ماموریت «${selected.title}» به‌موقع انجام شد. ۳ سکه گرفتی.`, "پاداش");
  }
  saveState();
  render();
}

function settleExpiredTasks() {
  let changed = false;
  state.tasks.forEach((taskItem) => {
    if (!taskItem.done && !taskItem.settledLate && isPastTime(taskItem.time)) {
      taskItem.settledLate = true;
      state.score = Math.max(0, state.score - 3);
      addLog(`زمان «${taskItem.title}» گذشت. تعهد جریمه: ${formatMoney(taskItem.penalty)} برای کار خیر.`, "دیرکرد");
      changed = true;
    }
  });
  if (changed) saveState();
}

function render() {
  settleExpiredTasks();
  state.tasks.sort((a, b) => a.time.localeCompare(b.time));
  document.querySelector("#scoreValue").textContent = state.score;
  document.querySelector("#coinValue").textContent = state.coins;
  document.querySelector("#streakValue").textContent = state.streak;
  taskList.replaceChildren();

  if (!state.tasks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "هنوز ماموریتی نداری. از فرم پایین یک ماموریت اضافه کن.";
    taskList.append(empty);
  }

  state.tasks.forEach((taskItem) => {
    const row = taskTemplate.content.firstElementChild.cloneNode(true);
    row.classList.toggle("done", taskItem.done);
    row.classList.toggle("late", !taskItem.done && isPastTime(taskItem.time));
    row.querySelector(".time-chip").textContent = taskItem.time;
    row.querySelector("h3").textContent = taskItem.title;
    row.querySelector(".category-pill").textContent = categoryLabels[taskItem.category] || "ماموریت";
    row.querySelector(".task-meta").textContent = taskMeta(taskItem);
    const doneBtn = row.querySelector(".done-btn");
    doneBtn.disabled = taskItem.done;
    doneBtn.textContent = taskItem.done ? "انجام شد" : "تیک";
    doneBtn.addEventListener("click", () => markDone(taskItem.id));
    row.querySelector(".edit-btn").addEventListener("click", () => editTask(taskItem.id));
    row.querySelector(".delete-btn").addEventListener("click", () => deleteTask(taskItem.id));
    taskList.append(row);
  });

  renderLog();
}

function taskMeta(taskItem) {
  if (taskItem.done) return `پاداش ثبت شد. جریمه این ماموریت ${formatMoney(taskItem.penalty)} بود.`;
  if (isPastTime(taskItem.time)) return `زمان گذشته؛ با انجام دیرهنگام هم ثبت می‌شود، اما جریمه خیرخواهانه دارد.`;
  return `اگر تا ساعت ${taskItem.time} انجام شود، ۱۰ امتیاز و ۳ سکه می‌گیری.`;
}

function renderLog() {
  logList.replaceChildren();
  if (!state.logs.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "هنوز پاداش یا جریمه‌ای ثبت نشده است.";
    logList.append(empty);
    return;
  }
  state.logs.slice(0, 10).forEach((entry) => {
    const item = document.createElement("div");
    item.className = "log-item";
    const type = document.createElement("strong");
    type.textContent = entry.type;
    const text = document.createElement("span");
    text.textContent = entry.text;
    item.append(type, text);
    logList.append(item);
  });
}

function editTask(id) {
  const selected = state.tasks.find((taskItem) => taskItem.id === id);
  if (!selected) return;
  taskForm.id.value = selected.id;
  taskForm.title.value = selected.title;
  taskForm.time.value = selected.time;
  taskForm.category.value = selected.category;
  taskForm.penalty.value = selected.penalty;
  taskForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((taskItem) => taskItem.id !== id);
  saveState();
  render();
}

function fillProfileForm() {
  if (!state.profile) return;
  Object.entries(state.profile).forEach(([key, value]) => {
    if (profileForm.elements[key]) profileForm.elements[key].value = value;
  });
}

function isPastTime(time) {
  const [hour, minute] = time.split(":").map(Number);
  const deadline = new Date();
  deadline.setHours(hour, minute, 0, 0);
  return Date.now() > deadline.getTime();
}

function addLog(text, type) {
  state.logs.unshift({ text, type, at: new Date().toISOString() });
}

function showDashboard() {
  taskForm.penalty.value = state.profile?.penalty || 50000;
  showScreen("dashboard");
  render();
}

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[name].classList.add("active");
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  return { profile: null, tasks: [], logs: [], score: 0, coins: 0, streak: 0 };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatMoney(amount) {
  return `${Number(amount || 0).toLocaleString("fa-IR")} تومان`;
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

if (state.profile) {
  showDashboard();
} else {
  showScreen("onboarding");
}

setInterval(render, 60000);

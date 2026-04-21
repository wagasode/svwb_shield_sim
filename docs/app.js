const RARITY_ORDER = ["ブロンズレア", "シルバーレア", "ゴールドレア", "レジェンド"];
const CLASS_ORDER = [
  "エルフ",
  "ロイヤル",
  "ウィッチ",
  "ドラゴン",
  "ナイトメア",
  "ビショップ",
  "ネメシス",
  "ニュートラル",
];
const CLASS_COLOR_KEY = {
  エルフ: "elf",
  ロイヤル: "royal",
  ウィッチ: "witch",
  ドラゴン: "dragon",
  ナイトメア: "nightmare",
  ビショップ: "bishop",
  ネメシス: "nemesis",
  ニュートラル: "neutral",
};

const state = {
  cards: [],
  packs: [],
  cardsByPack: new Map(),
  cardsByPackRarity: new Map(),
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindBaseEvents();
  updateRateHint();
  try {
    await loadCardsFromCsv("./data/svwb_cards_ja.csv");
    initPackRows();
    setStatus(`カード ${state.cards.length} 件 / パック ${state.packs.length} 種類を読み込みました。`);
  } catch (error) {
    setStatus(`カードデータ読み込みに失敗しました: ${error.message}`, true);
  }
}

function bindBaseEvents() {
  document.getElementById("addPackRow").addEventListener("click", () => addPackRow());
  document.getElementById("simulateButton").addEventListener("click", runSimulation);
  ["rateBronze", "rateSilver", "rateGold", "rateLegend"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updateRateHint);
  });
}

async function loadCardsFromCsv(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const csvText = await response.text();
  const records = parseCsv(csvText)
    .map((row) => ({
      packName: cleanValue(row["パック名"]),
      cardName: cleanValue(row["カード名"]),
      className: cleanValue(row["クラス"]),
      rarity: cleanValue(row["レアリティ"]),
    }))
    .filter((row) => row.packName && row.cardName && row.className && row.rarity);

  if (!records.length) {
    throw new Error("有効なカード行がありません");
  }

  state.cards = records;
  state.packs = [...new Set(records.map((row) => row.packName))].sort((a, b) =>
    a.localeCompare(b, "ja"),
  );
  state.cardsByPack = new Map();
  state.cardsByPackRarity = new Map();

  for (const packName of state.packs) {
    state.cardsByPack.set(packName, []);
    state.cardsByPackRarity.set(packName, new Map());
  }

  for (const card of records) {
    state.cardsByPack.get(card.packName).push(card);
    const rarityMap = state.cardsByPackRarity.get(card.packName);
    if (!rarityMap.has(card.rarity)) {
      rarityMap.set(card.rarity, []);
    }
    rarityMap.get(card.rarity).push(card);
  }
}

function initPackRows() {
  const container = document.getElementById("packRows");
  container.innerHTML = "";
  addPackRow(state.packs[0], 1);
}

function addPackRow(defaultPackName = "", defaultCount = 1) {
  if (!state.packs.length) {
    return;
  }
  const template = document.getElementById("packRowTemplate");
  const row = template.content.firstElementChild.cloneNode(true);

  const select = row.querySelector(".pack-select");
  for (const pack of state.packs) {
    const option = document.createElement("option");
    option.value = pack;
    option.textContent = pack;
    select.appendChild(option);
  }

  select.value = defaultPackName || state.packs[0];
  const countInput = row.querySelector(".pack-count-input");
  countInput.value = String(defaultCount);

  row.querySelector(".remove-pack-row").addEventListener("click", () => {
    row.remove();
    ensurePackRowExists();
  });

  document.getElementById("packRows").appendChild(row);
}

function ensurePackRowExists() {
  const rows = document.querySelectorAll("#packRows .pack-row");
  if (!rows.length) {
    addPackRow(state.packs[0], 1);
  }
}

function runSimulation() {
  clearError();
  const setupResult = collectSetup();
  if (!setupResult.ok) {
    setError(setupResult.error);
    return;
  }

  const simulation = simulateDraw(setupResult.value);
  renderResults(simulation);
}

function collectSetup() {
  const cardsPerPack = Number.parseInt(document.getElementById("cardsPerPack").value, 10);
  if (!Number.isInteger(cardsPerPack) || cardsPerPack <= 0 || cardsPerPack > 20) {
    return { ok: false, error: "1パックあたりの排出枚数は 1〜20 の整数で指定してください。" };
  }

  const ratesResult = readRarityRates();
  if (!ratesResult.ok) {
    return ratesResult;
  }

  const plans = [];
  for (const row of document.querySelectorAll("#packRows .pack-row")) {
    const packName = row.querySelector(".pack-select").value;
    const count = Number.parseInt(row.querySelector(".pack-count-input").value, 10);
    if (!Number.isInteger(count) || count < 0) {
      return { ok: false, error: "開封数は 0 以上の整数で指定してください。" };
    }
    if (count > 0) {
      plans.push({ packName, count });
    }
  }

  if (!plans.length) {
    return { ok: false, error: "開封数が 1 以上のパックを少なくとも1つ指定してください。" };
  }

  return {
    ok: true,
    value: {
      cardsPerPack,
      rarityRates: ratesResult.value.rates,
      rarityTotalWeight: ratesResult.value.totalWeight,
      plans,
    },
  };
}

function readRarityRates() {
  const rates = [
    { rarity: "ブロンズレア", weight: readNumber("rateBronze") },
    { rarity: "シルバーレア", weight: readNumber("rateSilver") },
    { rarity: "ゴールドレア", weight: readNumber("rateGold") },
    { rarity: "レジェンド", weight: readNumber("rateLegend") },
  ];
  if (rates.some((entry) => !Number.isFinite(entry.weight) || entry.weight < 0)) {
    return { ok: false, error: "レアリティ抽選率は 0 以上の数値で入力してください。" };
  }
  const totalWeight = rates.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return { ok: false, error: "レアリティ抽選率の合計は 0 より大きくしてください。" };
  }
  return { ok: true, value: { rates, totalWeight } };
}

function simulateDraw(setup) {
  const drawRows = [];
  const byCard = new Map();
  const byPack = new Map();
  const byClass = new Map();
  const byRarity = new Map();
  let totalOpenedPacks = 0;

  for (const plan of setup.plans) {
    totalOpenedPacks += plan.count;
    for (let packIndex = 0; packIndex < plan.count; packIndex += 1) {
      for (let drawIndex = 0; drawIndex < setup.cardsPerPack; drawIndex += 1) {
        const rarity = pickRarity(setup.rarityRates, setup.rarityTotalWeight);
        const card = pickCard(plan.packName, rarity);
        if (!card) {
          continue;
        }

        drawRows.push(card);
        addCount(byPack, card.packName, 1);
        addCount(byClass, card.className, 1);
        addCount(byRarity, card.rarity, 1);

        const cardKey = [card.packName, card.cardName, card.className, card.rarity].join("\t");
        if (!byCard.has(cardKey)) {
          byCard.set(cardKey, { ...card, count: 0 });
        }
        byCard.get(cardKey).count += 1;
      }
    }
  }

  return {
    totalOpenedPacks,
    totalDrawnCards: drawRows.length,
    uniqueDrawnCards: byCard.size,
    byPack,
    byClass,
    byRarity,
    byCardRows: [...byCard.values()].sort(compareCardRows),
  };
}

function pickRarity(rates, totalWeight) {
  let cursor = Math.random() * totalWeight;
  for (const entry of rates) {
    cursor -= entry.weight;
    if (cursor <= 0) {
      return entry.rarity;
    }
  }
  return rates[rates.length - 1].rarity;
}

function pickCard(packName, rarity) {
  const rarityMap = state.cardsByPackRarity.get(packName);
  const rarityPool = rarityMap?.get(rarity) ?? [];
  if (rarityPool.length > 0) {
    return rarityPool[Math.floor(Math.random() * rarityPool.length)];
  }
  const packPool = state.cardsByPack.get(packName) ?? [];
  if (!packPool.length) {
    return null;
  }
  return packPool[Math.floor(Math.random() * packPool.length)];
}

function compareCardRows(a, b) {
  if (b.count !== a.count) {
    return b.count - a.count;
  }
  if (a.packName !== b.packName) {
    return a.packName.localeCompare(b.packName, "ja");
  }
  const rarityDelta = getRarityRank(a.rarity) - getRarityRank(b.rarity);
  if (rarityDelta !== 0) {
    return rarityDelta;
  }
  return a.cardName.localeCompare(b.cardName, "ja");
}

function getRarityRank(rarity) {
  const index = RARITY_ORDER.indexOf(rarity);
  return index >= 0 ? index : 99;
}

function getClassRank(className) {
  const index = CLASS_ORDER.indexOf(className);
  return index >= 0 ? index : 99;
}

function renderResults(result) {
  document.getElementById("resultsSection").hidden = false;
  document.getElementById("totalOpenedPacks").textContent = String(result.totalOpenedPacks);
  document.getElementById("totalDrawnCards").textContent = String(result.totalDrawnCards);
  document.getElementById("uniqueDrawnCards").textContent = String(result.uniqueDrawnCards);

  renderSummaryTable("packSummaryBody", [...result.byPack.entries()].sort((a, b) => b[1] - a[1]));
  renderSummaryTable(
    "classSummaryBody",
    [...result.byClass.entries()].sort((a, b) => {
      const rankDelta = getClassRank(a[0]) - getClassRank(b[0]);
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return b[1] - a[1];
    }),
    { colorizeClassLabel: true },
  );
  renderSummaryTable(
    "raritySummaryBody",
    [...result.byRarity.entries()].sort((a, b) => getRarityRank(a[0]) - getRarityRank(b[0])),
  );
  renderResultRows(result.byCardRows);
}

function renderSummaryTable(tbodyId, rows, options = {}) {
  const { colorizeClassLabel = false } = options;
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = "";
  for (const [label, count] of rows) {
    const tr = document.createElement("tr");
    const labelCell = appendCell(tr, label);
    if (colorizeClassLabel) {
      applyClassColor(labelCell, label);
    }
    appendCell(tr, String(count));
    tbody.appendChild(tr);
  }
}

function renderResultRows(rows) {
  const tbody = document.getElementById("resultTableBody");
  tbody.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    appendCell(tr, String(row.count));
    appendCell(tr, row.packName);
    appendCell(tr, row.cardName);
    const classCell = appendCell(tr, row.className);
    applyClassColor(classCell, row.className);
    appendCell(tr, row.rarity);
    tbody.appendChild(tr);
  }
}

function appendCell(tr, text) {
  const td = document.createElement("td");
  td.textContent = text;
  tr.appendChild(td);
  return td;
}

function applyClassColor(element, className) {
  const classKey = CLASS_COLOR_KEY[className];
  if (!classKey) {
    return;
  }
  element.classList.add("class-color-cell", `class-color-${classKey}`);
}

function updateRateHint() {
  const rates = ["rateBronze", "rateSilver", "rateGold", "rateLegend"].map(readNumber);
  const isValid = rates.every((value) => Number.isFinite(value) && value >= 0);
  const total = isValid ? rates.reduce((sum, value) => sum + value, 0) : 0;
  const rateHint = document.getElementById("rateHint");
  if (!isValid) {
    rateHint.textContent = "抽選率は 0 以上の数値で入力してください。";
    rateHint.style.color = "var(--danger)";
    return;
  }
  rateHint.textContent = `現在の合計: ${total.toFixed(1)}%（合計100%以外でも実行可能）`;
  rateHint.style.color = total <= 0 ? "var(--danger)" : "var(--ink-soft)";
}

function readNumber(inputId) {
  return Number.parseFloat(document.getElementById(inputId).value);
}

function setStatus(message, isError = false) {
  const status = document.getElementById("dataStatus");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function setError(message) {
  const error = document.getElementById("errorMessage");
  error.hidden = false;
  error.textContent = message;
}

function clearError() {
  const error = document.getElementById("errorMessage");
  error.hidden = true;
  error.textContent = "";
}

function addCount(map, key, count) {
  map.set(key, (map.get(key) ?? 0) + count);
}

function cleanValue(value) {
  return String(value ?? "").trim();
}

function parseCsv(csvText) {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length <= 1) {
    return [];
  }
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const columns = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = columns[index] ?? "";
    });
    return row;
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  values.push(current);
  return values;
}

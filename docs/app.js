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
const DEFAULT_PACK_PLANS = [
  { packName: "伝説の幕開け", count: 20 },
  { packName: "アポカリプス・パクト", count: 20 },
];
const FILTERABLE_CLASS_ORDER = CLASS_ORDER.filter((className) => className !== "ニュートラル");
const NEUTRAL_CLASS = "ニュートラル";
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
const GUARANTEED_SLOT_INDEX = 7;
const LEGEND_RARITY = "レジェンド";
const LEGEND_PITY_THRESHOLD = 10;
const NORMAL_RATE_INPUTS = [
  { rarity: "ブロンズレア", inputId: "rateNormalBronze" },
  { rarity: "シルバーレア", inputId: "rateNormalSilver" },
  { rarity: "ゴールドレア", inputId: "rateNormalGold" },
  { rarity: LEGEND_RARITY, inputId: "rateNormalLegend" },
];
const GUARANTEED_RATE_INPUTS = [
  { rarity: "ブロンズレア", inputId: "rateGuaranteedBronze" },
  { rarity: "シルバーレア", inputId: "rateGuaranteedSilver" },
  { rarity: "ゴールドレア", inputId: "rateGuaranteedGold" },
  { rarity: LEGEND_RARITY, inputId: "rateGuaranteedLegend" },
];
const OFFICIAL_CARD_URL_PREFIX = "https://shadowverse-wb.com";
const DEFAULT_DECK_TARGET_CLASS = FILTERABLE_CLASS_ORDER[0];
const DEFAULT_DECK_TARGET_SIZE = 40;
const DEFAULT_DECK_CARD_LIMIT = 3;
const CARD_DRAG_MIME_TYPE = "application/x-svwb-card";

const state = {
  cards: [],
  packs: [],
  cardsByPack: new Map(),
  cardsByPackRarity: new Map(),
  latestResultRows: [],
  deckByCard: new Map(),
  cardsLastModified: "",
  activeDragPayload: null,
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindBaseEvents();
  updateRateHints();
  try {
    await loadCardsFromCsv("./data/svwb_cards_ja.csv");
    initPackRows();
    setStatus(`カード ${state.cards.length} 件 / パック ${state.packs.length} 種類を読み込みました。`);
    updateDataUpdatedAt(state.cardsLastModified);
  } catch (error) {
    setStatus(`カードデータ読み込みに失敗しました: ${error.message}`, true);
    updateDataUpdatedAt("");
  }
}

function bindBaseEvents() {
  document.getElementById("addPackRow").addEventListener("click", () => addPackRow());
  document.getElementById("simulateButton").addEventListener("click", runSimulation);
  [...NORMAL_RATE_INPUTS, ...GUARANTEED_RATE_INPUTS].forEach((entry) => {
    document.getElementById(entry.inputId).addEventListener("input", updateRateHints);
  });
  document.getElementById("resultClassFilter").addEventListener("change", applyResultTableView);
  document.getElementById("resultRaritySort").addEventListener("change", applyResultTableView);
  document.getElementById("buildDeckFromResult").addEventListener("click", buildDeckFromResult);
  document.getElementById("clearDeckButton").addEventListener("click", clearDeck);
  document.getElementById("deckTargetClass").addEventListener("change", renderDeckEditor);
  document.getElementById("deckTargetSize").addEventListener("change", renderDeckEditor);
  document.getElementById("deckCardLimit").addEventListener("change", renderDeckEditor);
  document.getElementById("mobileDeckJump").addEventListener("click", scrollToDeckDropZone);
  initDeckDragAndDrop();
  initDeckEditorDefaults();
}

function initDeckEditorDefaults() {
  document.getElementById("deckTargetClass").value = DEFAULT_DECK_TARGET_CLASS;
  document.getElementById("deckTargetSize").value = String(DEFAULT_DECK_TARGET_SIZE);
  document.getElementById("deckCardLimit").value = String(DEFAULT_DECK_CARD_LIMIT);
  setDeckMessage("シミュレーション後にデッキ案を生成できます。");
  renderDeckEditor();
}

async function loadCardsFromCsv(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  state.cardsLastModified = response.headers.get("last-modified") || "";

  const csvText = await response.text();
  const records = parseCsv(csvText)
    .map((row) => {
      const cardId = cleanValue(row["カードID"]);
      const officialCardUrl = cleanValue(row["公式カードURL"]) || buildOfficialCardUrl(cardId);
      return {
        packName: cleanValue(row["パック名"]),
        cardId,
        cardName: cleanValue(row["カード名"]),
        className: cleanValue(row["クラス"]),
        rarity: cleanValue(row["レアリティ"]),
        officialCardUrl,
      };
    })
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

function updateDataUpdatedAt(lastModified) {
  const target = document.getElementById("dataUpdatedAt");
  if (!target) {
    return;
  }

  if (!lastModified) {
    target.textContent = "カードデータ更新日時: 不明";
    return;
  }

  const date = new Date(lastModified);
  if (Number.isNaN(date.getTime())) {
    target.textContent = "カードデータ更新日時: 不明";
    return;
  }

  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  target.textContent = `カードデータ更新日時: ${formatter.format(date)} (JST)`;
}

function initPackRows() {
  const container = document.getElementById("packRows");
  container.innerHTML = "";

  const addedPacks = new Set();
  for (const plan of DEFAULT_PACK_PLANS) {
    if (!state.packs.includes(plan.packName)) {
      continue;
    }
    addPackRow(plan.packName, plan.count);
    addedPacks.add(plan.packName);
  }

  if (addedPacks.size === 0) {
    addPackRow(state.packs[0], 1);
  }
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
      normalRarityRates: ratesResult.value.normal.rates,
      normalRarityTotalWeight: ratesResult.value.normal.totalWeight,
      guaranteedRarityRates: ratesResult.value.guaranteed.rates,
      guaranteedRarityTotalWeight: ratesResult.value.guaranteed.totalWeight,
      plans,
    },
  };
}

function readRarityRates() {
  const normalResult = readRarityRateGroup(NORMAL_RATE_INPUTS, "通常枠");
  if (!normalResult.ok) {
    return normalResult;
  }
  const guaranteedResult = readRarityRateGroup(GUARANTEED_RATE_INPUTS, "保証枠");
  if (!guaranteedResult.ok) {
    return guaranteedResult;
  }
  return {
    ok: true,
    value: {
      normal: normalResult.value,
      guaranteed: guaranteedResult.value,
    },
  };
}

function readRarityRateGroup(inputDefs, groupLabel) {
  const rates = inputDefs.map((entry) => ({
    rarity: entry.rarity,
    weight: readNumber(entry.inputId),
  }));
  if (rates.some((entry) => !Number.isFinite(entry.weight) || entry.weight < 0)) {
    return {
      ok: false,
      error: `${groupLabel}の抽選率は 0 以上の数値で入力してください。`,
    };
  }
  const totalWeight = rates.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return {
      ok: false,
      error: `${groupLabel}の抽選率の合計は 0 より大きくしてください。`,
    };
  }
  return { ok: true, value: { rates, totalWeight } };
}

function simulateDraw(setup) {
  const drawRows = [];
  const byCard = new Map();
  const byPack = new Map();
  const byClass = new Map();
  const byRarity = new Map();
  const noLegendPackStreakByPack = new Map();
  let totalOpenedPacks = 0;

  for (const plan of setup.plans) {
    totalOpenedPacks += plan.count;
    for (let packIndex = 0; packIndex < plan.count; packIndex += 1) {
      const currentNoLegendStreak = noLegendPackStreakByPack.get(plan.packName) ?? 0;
      const shouldForceLegendPack = currentNoLegendStreak >= LEGEND_PITY_THRESHOLD;
      let packHasLegend = false;

      for (let drawIndex = 0; drawIndex < setup.cardsPerPack; drawIndex += 1) {
        const isLastSlot = drawIndex === setup.cardsPerPack - 1;
        const isForcedLegendSlot = shouldForceLegendPack && !packHasLegend && isLastSlot;
        const isGuaranteedSlot =
          setup.cardsPerPack > GUARANTEED_SLOT_INDEX && drawIndex === GUARANTEED_SLOT_INDEX;
        const rarity = isForcedLegendSlot
          ? LEGEND_RARITY
          : isGuaranteedSlot
            ? pickRarity(setup.guaranteedRarityRates, setup.guaranteedRarityTotalWeight)
            : pickRarity(setup.normalRarityRates, setup.normalRarityTotalWeight);
        const card = isForcedLegendSlot
          ? pickCardExactRarity(plan.packName, LEGEND_RARITY) ?? pickCard(plan.packName, LEGEND_RARITY)
          : pickCard(plan.packName, rarity);
        if (!card) {
          continue;
        }
        if (card.rarity === LEGEND_RARITY) {
          packHasLegend = true;
        }

        drawRows.push(card);
        addCount(byPack, card.packName, 1);
        addCount(byClass, card.className, 1);
        addCount(byRarity, card.rarity, 1);

        const cardKey = getCardKey(card);
        if (!byCard.has(cardKey)) {
          byCard.set(cardKey, { ...card, count: 0 });
        }
        byCard.get(cardKey).count += 1;
      }

      if (packHasLegend) {
        noLegendPackStreakByPack.set(plan.packName, 0);
      } else {
        noLegendPackStreakByPack.set(plan.packName, currentNoLegendStreak + 1);
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

function pickCardExactRarity(packName, rarity) {
  const rarityMap = state.cardsByPackRarity.get(packName);
  const rarityPool = rarityMap?.get(rarity) ?? [];
  if (!rarityPool.length) {
    return null;
  }
  return rarityPool[Math.floor(Math.random() * rarityPool.length)];
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
  state.latestResultRows = [...result.byCardRows];
  state.deckByCard = new Map();
  setDeckMessage("シミュレーション結果を反映しました。デッキ案を生成するか、カードをドラッグして編集してください。");
  applyResultTableView();
  renderDeckEditor();
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
    appendCardCell(tr, row);
    const classCell = appendCell(tr, row.className);
    applyClassColor(classCell, row.className);
    appendCell(tr, row.rarity);
    tbody.appendChild(tr);
  }
}

function applyResultTableView() {
  const classFilter = document.getElementById("resultClassFilter").value;
  const raritySort = document.getElementById("resultRaritySort").value;

  let rows = [...state.latestResultRows];
  if (FILTERABLE_CLASS_ORDER.includes(classFilter)) {
    rows = rows.filter((row) => row.className === classFilter || row.className === NEUTRAL_CLASS);
  }

  if (raritySort === "desc") {
    rows.sort((a, b) => {
      const rarityDelta = getRarityRank(b.rarity) - getRarityRank(a.rarity);
      if (rarityDelta !== 0) {
        return rarityDelta;
      }
      return compareCardRows(a, b);
    });
  } else if (raritySort === "asc") {
    rows.sort((a, b) => {
      const rarityDelta = getRarityRank(a.rarity) - getRarityRank(b.rarity);
      if (rarityDelta !== 0) {
        return rarityDelta;
      }
      return compareCardRows(a, b);
    });
  }

  renderResultRows(rows);
}

function collectDeckSetup() {
  const targetClass = document.getElementById("deckTargetClass").value;
  const targetSize = Number.parseInt(document.getElementById("deckTargetSize").value, 10);
  const cardLimit = Number.parseInt(document.getElementById("deckCardLimit").value, 10);

  if (!FILTERABLE_CLASS_ORDER.includes(targetClass)) {
    return { ok: false, error: "対象クラスを指定してください。" };
  }
  if (!Number.isInteger(targetSize) || targetSize <= 0 || targetSize > 80) {
    return { ok: false, error: "目標デッキ枚数は 1〜80 の整数で指定してください。" };
  }
  if (!Number.isInteger(cardLimit) || cardLimit <= 0 || cardLimit > 20) {
    return { ok: false, error: "同名カード上限は 1〜20 の整数で指定してください。" };
  }

  return {
    ok: true,
    value: {
      targetClass,
      targetSize,
      cardLimit,
    },
  };
}

function buildDeckFromResult() {
  if (!state.latestResultRows.length) {
    setDeckMessage("先にシミュレーションを実行してください。", true);
    return;
  }

  const setupResult = collectDeckSetup();
  if (!setupResult.ok) {
    setDeckMessage(setupResult.error, true);
    return;
  }
  const setup = setupResult.value;

  const candidateRows = state.latestResultRows
    .filter((row) => isCardAllowedForClass(row, setup.targetClass))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      const rarityDelta = getRarityRank(b.rarity) - getRarityRank(a.rarity);
      if (rarityDelta !== 0) {
        return rarityDelta;
      }
      return compareCardRows(a, b);
    });

  state.deckByCard = new Map();
  let remaining = setup.targetSize;

  for (const row of candidateRows) {
    const copies = Math.min(row.count, setup.cardLimit, remaining);
    if (copies <= 0) {
      continue;
    }
    state.deckByCard.set(getCardKey(row), { ...row, count: copies });
    remaining -= copies;
    if (remaining === 0) {
      break;
    }
  }

  if (remaining > 0) {
    setDeckMessage(
      `候補が不足しているため ${setup.targetSize - remaining}/${setup.targetSize} 枚で生成しました。`,
      true,
    );
  } else {
    setDeckMessage(`${setup.targetClass} 用のデッキ案を ${setup.targetSize} 枚で生成しました。`);
  }
  renderDeckEditor();
}

function clearDeck() {
  state.deckByCard = new Map();
  setDeckMessage("デッキをクリアしました。");
  renderDeckEditor();
}

function addCardToDeck(row, copies = 1) {
  const setupResult = collectDeckSetup();
  if (!setupResult.ok) {
    setDeckMessage(setupResult.error, true);
    return;
  }
  const setup = setupResult.value;
  if (!isCardAllowedForClass(row, setup.targetClass)) {
    setDeckMessage(`対象外クラスのため追加できません（${setup.targetClass}+${NEUTRAL_CLASS}のみ）。`, true);
    return;
  }

  const key = getCardKey(row);
  const sourceRow = findResultRowByKey(key);
  if (!sourceRow) {
    setDeckMessage("このカードは直近シミュレーション結果にないため追加できません。", true);
    return;
  }

  const entry = state.deckByCard.get(key) ?? { ...sourceRow, count: 0 };
  const deckSpace = setup.targetSize - countDeckCards();
  const remainingByCardLimit = setup.cardLimit - entry.count;
  const remainingByResultCount = sourceRow.count - entry.count;
  const addable = Math.min(copies, deckSpace, remainingByCardLimit, remainingByResultCount);

  if (deckSpace <= 0) {
    setDeckMessage("デッキ枚数が上限です。", true);
    return;
  }
  if (remainingByCardLimit <= 0) {
    setDeckMessage("同名カード上限に達しています。", true);
    return;
  }
  if (remainingByResultCount <= 0) {
    setDeckMessage("シミュレーション結果内の所持枚数上限に達しています。", true);
    return;
  }
  if (addable <= 0) {
    setDeckMessage("追加できませんでした。", true);
    return;
  }

  entry.count += addable;
  state.deckByCard.set(key, entry);
  if (addable < copies) {
    setDeckMessage(`${entry.cardName} を ${addable} 枚のみ追加しました。`, true);
  } else {
    setDeckMessage(`${entry.cardName} を ${addable} 枚追加しました。`);
  }
  renderDeckEditor();
}

function removeCardFromDeckByKey(cardKey, copies = 1) {
  const entry = state.deckByCard.get(cardKey);
  if (!entry) {
    setDeckMessage("削除対象のカードがデッキにありません。", true);
    return;
  }
  const removedCount = Math.min(copies, entry.count);
  entry.count -= copies;
  if (entry.count <= 0) {
    state.deckByCard.delete(cardKey);
  } else {
    state.deckByCard.set(cardKey, entry);
  }
  setDeckMessage(`${entry.cardName} を ${removedCount} 枚削除しました。`);
  renderDeckEditor();
}

function renderDeckEditor() {
  const setupResult = collectDeckSetup();
  const targetSize = setupResult.ok ? setupResult.value.targetSize : 0;
  const totalCards = countDeckCards();
  const remainingCards = Math.max(0, targetSize - totalCards);

  document.getElementById("deckTotalCards").textContent = String(totalCards);
  document.getElementById("deckRemainingCards").textContent = setupResult.ok ? String(remainingCards) : "-";
  document.getElementById("deckUniqueCards").textContent = String(state.deckByCard.size);
  updateMobileDeckSummary(setupResult, totalCards, remainingCards);

  const byClass = new Map();
  const byRarity = new Map();
  for (const row of state.deckByCard.values()) {
    addCount(byClass, row.className, row.count);
    addCount(byRarity, row.rarity, row.count);
  }

  renderSummaryTable(
    "deckClassSummaryBody",
    [...byClass.entries()].sort((a, b) => {
      const rankDelta = getClassRank(a[0]) - getClassRank(b[0]);
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return b[1] - a[1];
    }),
    { colorizeClassLabel: true },
  );
  renderSummaryTable(
    "deckRaritySummaryBody",
    [...byRarity.entries()].sort((a, b) => getRarityRank(a[0]) - getRarityRank(b[0])),
  );

  renderDeckBuilder(setupResult, totalCards, remainingCards);
  renderDeckRows([...state.deckByCard.values()].sort(compareCardRows));
}

function renderDeckBuilder(setupResult, totalCards, remainingCards) {
  const sourceCards = document.getElementById("deckSourceCards");
  const deckCards = document.getElementById("deckCards");
  sourceCards.innerHTML = "";
  deckCards.innerHTML = "";

  const sourceRows = setupResult.ok
    ? state.latestResultRows
        .filter((row) => isCardAllowedForClass(row, setupResult.value.targetClass))
        .sort(compareCardRows)
    : [];
  const deckRows = [...state.deckByCard.values()].sort(compareCardRows);

  document.getElementById("deckSourceCount").textContent = `${sourceRows.length} 種類`;
  document.getElementById("deckDropCount").textContent = `${totalCards} 枚 / 残り ${remainingCards}`;

  if (!state.latestResultRows.length) {
    sourceCards.appendChild(createDeckPlaceholder("シミュレーション後に表示されます。"));
  } else if (!sourceRows.length) {
    sourceCards.appendChild(createDeckPlaceholder("対象クラスの候補がありません。"));
  } else {
    for (const row of sourceRows) {
      const cardKey = getCardKey(row);
      const deckCount = state.deckByCard.get(cardKey)?.count ?? 0;
      const availableCount = row.count - deckCount;
      sourceCards.appendChild(
        createDeckCardItem(row, {
          countLabel: `残 ${Math.max(0, availableCount)} / 所持 ${row.count}`,
          dragSource: "result",
          isDisabled: availableCount <= 0,
          actionLabel: "+",
          actionTitle: "デッキに1枚追加",
          onAction: () => addCardToDeck(row, 1),
        }),
      );
    }
  }

  if (!deckRows.length) {
    deckCards.appendChild(createDeckPlaceholder("カード未選択"));
  } else {
    for (const row of deckRows) {
      deckCards.appendChild(
        createDeckCardItem(row, {
          countLabel: `${row.count} 枚`,
          dragSource: "deck",
          isDanger: true,
          actionLabel: "-",
          actionTitle: "デッキから1枚削除",
          onAction: () => removeCardFromDeckByKey(getCardKey(row), 1),
        }),
      );
    }
  }
}

function updateMobileDeckSummary(setupResult, totalCards, remainingCards) {
  const summaryText = document.getElementById("mobileDeckSummaryText");
  if (!setupResult.ok) {
    summaryText.textContent = `デッキ ${totalCards} 枚`;
    return;
  }
  summaryText.textContent = `デッキ ${totalCards}/${setupResult.value.targetSize} / 残り ${remainingCards}`;
}

function scrollToDeckDropZone() {
  const dropZone = document.getElementById("deckDropZone");
  const top = dropZone.getBoundingClientRect().top + window.scrollY - 12;
  window.scrollTo({
    top: Math.max(0, top),
    behavior: "smooth",
  });
}

function createDeckPlaceholder(message) {
  const placeholder = document.createElement("p");
  placeholder.className = "deck-card-placeholder";
  placeholder.textContent = message;
  return placeholder;
}

function createDeckCardItem(row, options) {
  const {
    countLabel,
    dragSource,
    isDisabled = false,
    isDanger = false,
    actionLabel,
    actionTitle,
    onAction,
  } = options;
  const cardKey = getCardKey(row);
  const item = document.createElement("article");
  item.className = "deck-card";
  item.role = "listitem";
  item.draggable = !isDisabled;
  item.dataset.cardKey = cardKey;
  item.dataset.dragSource = dragSource;
  item.classList.toggle("is-disabled", isDisabled);
  item.addEventListener("dragstart", (event) => {
    if (isDisabled) {
      event.preventDefault();
      return;
    }
    handleCardDragStart(event, { source: dragSource, cardKey });
  });
  item.addEventListener("dragend", handleCardDragEnd);

  const topLine = document.createElement("div");
  topLine.className = "deck-card-topline";

  const count = document.createElement("span");
  count.className = "deck-card-count";
  count.textContent = countLabel;

  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = isDanger ? "deck-card-action is-danger" : "deck-card-action";
  actionButton.textContent = actionLabel;
  actionButton.dataset.symbol = actionLabel;
  actionButton.title = actionTitle;
  actionButton.setAttribute("aria-label", `${row.cardName}を${actionTitle}`);
  actionButton.disabled = isDisabled;
  actionButton.addEventListener("click", onAction);

  topLine.append(count, actionButton);

  const name = document.createElement("div");
  name.className = "deck-card-name";
  name.textContent = row.cardName;

  const meta = document.createElement("div");
  meta.className = "deck-card-meta";
  const classBadge = document.createElement("span");
  classBadge.className = "deck-card-class";
  classBadge.textContent = row.className;
  applyClassColor(classBadge, row.className);
  const rarityBadge = document.createElement("span");
  rarityBadge.className = "deck-card-rarity";
  rarityBadge.textContent = row.rarity;
  rarityBadge.dataset.shortLabel = getShortRarityLabel(row.rarity);
  meta.append(classBadge, rarityBadge);

  item.append(topLine, name, meta);
  return item;
}

function getShortRarityLabel(rarity) {
  if (rarity === "ブロンズレア") {
    return "ブロンズ";
  }
  if (rarity === "シルバーレア") {
    return "シルバー";
  }
  if (rarity === "ゴールドレア") {
    return "ゴールド";
  }
  return rarity;
}

function initDeckDragAndDrop() {
  bindDeckDropRegion(document.getElementById("deckDropZone"), "deck");
  bindDeckDropRegion(document.getElementById("deckSourceCards"), "source");
}

function bindDeckDropRegion(element, target) {
  element.addEventListener("dragenter", (event) => handleDeckDragEnter(event, target, element));
  element.addEventListener("dragover", (event) => handleDeckDragOver(event, target, element));
  element.addEventListener("dragleave", (event) => handleDeckDragLeave(event, element));
  element.addEventListener("drop", (event) => handleDeckDrop(event, target, element));
}

function handleCardDragStart(event, payload) {
  state.activeDragPayload = payload;
  event.dataTransfer.effectAllowed = payload.source === "result" ? "copy" : "move";
  const payloadText = JSON.stringify(payload);
  event.dataTransfer.setData(CARD_DRAG_MIME_TYPE, payloadText);
  event.dataTransfer.setData("text/plain", payloadText);
  event.currentTarget.classList.add("is-dragging");
}

function handleCardDragEnd(event) {
  state.activeDragPayload = null;
  event.currentTarget.classList.remove("is-dragging");
  clearDeckDropState();
}

function handleDeckDragEnter(event, target, element) {
  if (!canDropDeckPayload(state.activeDragPayload, target)) {
    return;
  }
  event.preventDefault();
  element.classList.add("is-drop-ready");
}

function handleDeckDragOver(event, target, element) {
  if (!canDropDeckPayload(state.activeDragPayload, target)) {
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = target === "deck" ? "copy" : "move";
  element.classList.add("is-drop-ready");
}

function handleDeckDragLeave(event, element) {
  if (element.contains(event.relatedTarget)) {
    return;
  }
  element.classList.remove("is-drop-ready");
}

function handleDeckDrop(event, target, element) {
  const payload = readDeckDragPayload(event);
  if (!canDropDeckPayload(payload, target)) {
    return;
  }
  event.preventDefault();
  element.classList.remove("is-drop-ready");

  if (target === "deck") {
    const row = findResultRowByKey(payload.cardKey);
    if (row) {
      addCardToDeck(row, 1);
    }
    return;
  }

  removeCardFromDeckByKey(payload.cardKey, 1);
}

function readDeckDragPayload(event) {
  const payloadText =
    event.dataTransfer.getData(CARD_DRAG_MIME_TYPE) || event.dataTransfer.getData("text/plain");
  if (!payloadText) {
    return state.activeDragPayload;
  }
  try {
    return JSON.parse(payloadText);
  } catch {
    return state.activeDragPayload;
  }
}

function canDropDeckPayload(payload, target) {
  if (!payload?.cardKey) {
    return false;
  }
  return (
    (target === "deck" && payload.source === "result") ||
    (target === "source" && payload.source === "deck")
  );
}

function clearDeckDropState() {
  document.querySelectorAll(".deck-drop-region.is-drop-ready").forEach((element) => {
    element.classList.remove("is-drop-ready");
  });
}

function renderDeckRows(rows) {
  const tbody = document.getElementById("deckTableBody");
  tbody.innerHTML = "";

  for (const row of rows) {
    const tr = document.createElement("tr");
    appendCell(tr, String(row.count));
    appendCardCell(tr, row);
    const classCell = appendCell(tr, row.className);
    applyClassColor(classCell, row.className);
    appendCell(tr, row.rarity);
    tbody.appendChild(tr);
  }
}

function setDeckMessage(message, isError = false) {
  const messageElement = document.getElementById("deckMessage");
  messageElement.textContent = message;
  messageElement.style.color = isError ? "var(--danger)" : "var(--ink-soft)";
}

function isCardAllowedForClass(row, targetClass) {
  return row.className === targetClass || row.className === NEUTRAL_CLASS;
}

function countDeckCards() {
  let total = 0;
  for (const row of state.deckByCard.values()) {
    total += row.count;
  }
  return total;
}

function findResultRowByKey(cardKey) {
  return state.latestResultRows.find((row) => getCardKey(row) === cardKey) ?? null;
}

function appendCell(tr, text) {
  const td = document.createElement("td");
  td.textContent = text;
  tr.appendChild(td);
  return td;
}

function appendCardCell(tr, row) {
  const td = document.createElement("td");
  const cardUrl = cleanValue(row.officialCardUrl);
  if (cardUrl) {
    const link = document.createElement("a");
    link.href = cardUrl;
    link.textContent = row.cardName;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "card-link";
    td.appendChild(link);
  } else {
    td.textContent = row.cardName;
  }
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

function updateRateHints() {
  updateRateHintForGroup(NORMAL_RATE_INPUTS, "rateHintNormal", "通常枠");
  updateRateHintForGroup(GUARANTEED_RATE_INPUTS, "rateHintGuaranteed", "保証枠");
}

function updateRateHintForGroup(inputDefs, hintId, groupLabel) {
  const rates = inputDefs.map((entry) => readNumber(entry.inputId));
  const isValid = rates.every((value) => Number.isFinite(value) && value >= 0);
  const total = isValid ? rates.reduce((sum, value) => sum + value, 0) : 0;
  const rateHint = document.getElementById(hintId);
  if (!isValid) {
    rateHint.textContent = `${groupLabel}の抽選率は 0 以上の数値で入力してください。`;
    rateHint.style.color = "var(--danger)";
    return;
  }
  rateHint.textContent = `${groupLabel} 合計: ${total.toFixed(2)}%（合計100%以外でも実行可能）`;
  rateHint.style.color = total <= 0 ? "var(--danger)" : "var(--ink-soft)";
}

function readNumber(inputId) {
  return Number.parseFloat(document.getElementById(inputId).value);
}

function buildOfficialCardUrl(cardId, lang = "ja") {
  const normalizedCardId = cleanValue(cardId);
  if (!normalizedCardId) {
    return "";
  }
  return `${OFFICIAL_CARD_URL_PREFIX}/${lang}/deck/cardslist/card/?card_id=${encodeURIComponent(normalizedCardId)}`;
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

function getCardKey(card) {
  return card.cardId || [card.packName, card.cardName, card.className, card.rarity].join("\t");
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

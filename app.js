/* global JSZip, UMA_APTITUDE_DB */
"use strict";

const DISTANCES = ["단거리", "마일", "중거리", "장거리", "더트"];
const STYLES = ["도주", "선행", "선입", "추입"];
const TOTAL_SLOTS = DISTANCES.length * STYLES.length;
const DB_NAME = "uma-love-matrix-db";
const DB_VERSION = 1;
const CHARACTER_STORE = "characters";
const SLOT_STORAGE_KEY = "uma-love-matrix-slots-v1";
const QUICK_DOCK_COLLAPSED_KEY = "uma-love-matrix-quick-dock-collapsed-v1";
const BUNDLED_DATA_URL = "./characters.json";
const BUNDLED_KIND = "bundled";

const matrixEl = document.getElementById("favoriteMatrix");
const poolEl = document.getElementById("characterPool");
const poolDropZone = document.getElementById("poolDropZone");
const completionCount = document.getElementById("completionCount");
const selectionHint = document.getElementById("selectionHint");
const searchInput = document.getElementById("searchInput");
const filterSelect = document.getElementById("filterSelect");
const statusBox = document.getElementById("statusBox");
const progressWrap = document.getElementById("progressWrap");
const progressText = document.getElementById("progressText");
const progressNumber = document.getElementById("progressNumber");
const importProgress = document.getElementById("importProgress");
const zipInput = document.getElementById("zipInput");
const jsonInput = document.getElementById("jsonInput");
const imageFolderInput = document.getElementById("imageFolderInput");
const separateImportButton = document.getElementById("separateImportButton");
const customForm = document.getElementById("customCharacterForm");
const customNameInput = document.getElementById("customNameInput");
const customImageInput = document.getElementById("customImageInput");
const clearSlotsButton = document.getElementById("clearSlotsButton");
const deleteAllButton = document.getElementById("deleteAllButton");
const exportJsonButton = document.getElementById("exportJsonButton");
const savePngButton = document.getElementById("savePngButton");
const cardTemplate = document.getElementById("poolCardTemplate");
const quickMatrixDock = document.getElementById("quickMatrixDock");
const quickMatrixEl = document.getElementById("quickMatrix");
const quickDockStatus = document.getElementById("quickDockStatus");
const quickDockToggle = document.getElementById("quickDockToggle");
const aptitudeTooltip = document.getElementById("aptitudeTooltip");

let db;
let characters = [];
let characterMap = new Map();
let imageUrls = new Map();
let slotMap = loadSlotMap();
let selectedCharacterId = null;
let draggingCharacterId = null;
let matrixIsVisible = true;
let autoScrollSpeed = 0;
let autoScrollFrame = 0;
const aptitudeByNormalizedName = new Map(
  Object.entries(window.UMA_APTITUDE_DB?.characters || {}).map(([name, data]) => [normalizeNameForMatch(name), data])
);

function slotKey(distance, style) {
  return `${distance}|${style}`;
}

function loadSlotMap() {
  try {
    const saved = JSON.parse(localStorage.getItem(SLOT_STORAGE_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function saveSlotMap() {
  localStorage.setItem(SLOT_STORAGE_KEY, JSON.stringify(slotMap));
}

function setStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.style.borderLeftColor = isError ? "#e65757" : "#ea7991";
}

function setProgress(value, message) {
  const number = Math.max(0, Math.min(100, Math.round(value)));
  progressWrap.hidden = false;
  importProgress.value = number;
  progressNumber.textContent = `${number}%`;
  progressText.textContent = message;
}

function hideProgress() {
  window.setTimeout(() => {
    progressWrap.hidden = true;
  }, 1000);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CHARACTER_STORE)) {
        const store = database.createObjectStore(CHARACTER_STORE, { keyPath: "id" });
        store.createIndex("name", "name", { unique: false });
        store.createIndex("kind", "kind", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("저장 작업이 중단되었습니다."));
  });
}

async function getAllCharacters() {
  const transaction = db.transaction(CHARACTER_STORE, "readonly");
  const request = transaction.objectStore(CHARACTER_STORE).getAll();
  const result = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  await transactionPromise(transaction);
  return result;
}

async function putCharacters(records) {
  const transaction = db.transaction(CHARACTER_STORE, "readwrite");
  const store = transaction.objectStore(CHARACTER_STORE);
  for (const record of records) {
    store.put(record);
  }
  await transactionPromise(transaction);
}

async function deleteCharacterRecord(id) {
  const transaction = db.transaction(CHARACTER_STORE, "readwrite");
  transaction.objectStore(CHARACTER_STORE).delete(id);
  await transactionPromise(transaction);
}

async function clearCharacterStore() {
  const transaction = db.transaction(CHARACTER_STORE, "readwrite");
  transaction.objectStore(CHARACTER_STORE).clear();
  await transactionPromise(transaction);
}

function normalizePath(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+/g, "/")
    .trim();
}

function basename(path) {
  const normalized = normalizePath(path);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function withoutExtension(filename) {
  return filename.replace(/\.[^.]+$/, "");
}

function normalizeNameForMatch(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\\/:*?"<>|()[\]{}_\-\s.]+/g, "");
}


function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character]));
}

function cleanCharacterName(value) {
  let name = String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  const prefixes = [
    /^(?:\[[^\]]*\]\s*)?(?:우마무스메\s*)?(?:캐릭터\s*)?프로필\s*이미지\s*(?:[:：|·\-–—]\s*)?/i,
    /^(?:우마무스메\s*)?(?:캐릭터\s*)?이미지\s*(?:[:：|·\-–—]\s*)?/i,
    /^프로필\s*(?:사진|이미지)\s*(?:[:：|·\-–—]\s*)?/i
  ];

  let previous;
  do {
    previous = name;
    for (const pattern of prefixes) {
      name = name.replace(pattern, "").trim();
    }
  } while (name !== previous);

  return name || String(value || "").trim();
}

function getAptitudeForCharacter(character) {
  return aptitudeByNormalizedName.get(normalizeNameForMatch(cleanCharacterName(character?.name))) || null;
}

function aptitudeChips(values) {
  return Object.entries(values)
    .map(([label, rank]) => `<span class="aptitude-chip"><span>${escapeHtml(label)}</span><b class="aptitude-rank" data-rank="${escapeHtml(rank)}">${escapeHtml(rank)}</b></span>`)
    .join("");
}

function aptitudeTooltipHtml(character) {
  const aptitude = getAptitudeForCharacter(character);
  if (!aptitude) {
    return `<h3>${escapeHtml(character.name)}</h3><p class="aptitude-unavailable">첨부된 DB에서 이 이름과 일치하는 적성 정보를 찾지 못했습니다.</p>`;
  }
  return `
    <h3>${escapeHtml(character.name)}</h3>
    <div class="aptitude-section"><span class="aptitude-section-title">거리</span><div class="aptitude-row">${aptitudeChips(aptitude.distance)}</div></div>
    <div class="aptitude-section"><span class="aptitude-section-title">마장</span><div class="aptitude-row">${aptitudeChips(aptitude.ground)}</div></div>
    <div class="aptitude-section"><span class="aptitude-section-title">각질</span><div class="aptitude-row">${aptitudeChips(aptitude.style)}</div></div>`;
}

function positionAptitudeTooltip(clientX, clientY) {
  const margin = 12;
  const offset = 16;
  const rect = aptitudeTooltip.getBoundingClientRect();
  let left = clientX + offset;
  let top = clientY + offset;
  if (left + rect.width + margin > window.innerWidth) left = clientX - rect.width - offset;
  if (top + rect.height + margin > window.innerHeight) top = clientY - rect.height - offset;
  aptitudeTooltip.style.left = `${Math.max(margin, left)}px`;
  aptitudeTooltip.style.top = `${Math.max(margin, top)}px`;
}

function showAptitudeTooltip(character, event) {
  aptitudeTooltip.innerHTML = aptitudeTooltipHtml(character);
  aptitudeTooltip.hidden = false;
  positionAptitudeTooltip(event.clientX, event.clientY);
}

function hideAptitudeTooltip() {
  aptitudeTooltip.hidden = true;
}

function bindAptitudeTooltip(element, character) {
  element.addEventListener("mouseenter", (event) => showAptitudeTooltip(character, event));
  element.addEventListener("mousemove", (event) => positionAptitudeTooltip(event.clientX, event.clientY));
  element.addEventListener("mouseleave", hideAptitudeTooltip);
  element.addEventListener("focus", () => {
    const rect = element.getBoundingClientRect();
    showAptitudeTooltip(character, { clientX: rect.right, clientY: rect.top });
  });
  element.addEventListener("blur", hideAptitudeTooltip);
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function makeImportedId(name, path) {
  return `import-${fnv1a(`${name}|${path}`)}`;
}

function extractRecordArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.characters)) return data.characters;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.items)) return data.items;
  throw new Error("characters.json에서 캐릭터 배열을 찾지 못했습니다.");
}

function normalizeRecord(raw, index) {
  const name = cleanCharacterName(
    raw?.name ??
    raw?.character_name ??
    raw?.characterName ??
    raw?.title ??
    raw?.label ??
    ""
  );

  const imagePath = String(
    raw?.local_path ??
    raw?.localPath ??
    raw?.image_path ??
    raw?.imagePath ??
    raw?.filename ??
    raw?.file ??
    raw?.image ??
    ""
  ).trim();

  if (!name) {
    return null;
  }

  return {
    name,
    imagePath: normalizePath(imagePath),
    raw,
    index
  };
}

function mimeFromName(filename) {
  const ext = String(filename).toLowerCase().split(".").pop();
  const types = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    svg: "image/svg+xml"
  };
  return types[ext] || "application/octet-stream";
}

function buildFileLookup(files, getPath) {
  const entries = files.map((file) => {
    const path = normalizePath(getPath(file));
    return {
      file,
      path,
      lowerPath: path.toLowerCase(),
      base: basename(path).toLowerCase(),
      bare: normalizeNameForMatch(withoutExtension(basename(path)))
    };
  });

  return {
    entries,
    find(path, characterName) {
      const target = normalizePath(path).toLowerCase();
      const targetBase = basename(target);
      const targetBare = normalizeNameForMatch(withoutExtension(targetBase));
      const nameBare = normalizeNameForMatch(characterName);

      if (target) {
        let match = entries.find((entry) => entry.lowerPath === target);
        if (match) return match.file;

        match = entries.find((entry) => entry.lowerPath.endsWith(`/${target}`));
        if (match) return match.file;

        match = entries.find((entry) => entry.base === targetBase);
        if (match) return match.file;

        if (targetBare) {
          match = entries.find((entry) => entry.bare === targetBare);
          if (match) return match.file;
        }
      }

      if (nameBare) {
        const exactName = entries.find((entry) => entry.bare === nameBare);
        if (exactName) return exactName.file;

        const partial = entries.find((entry) =>
          entry.bare.includes(nameBare) || nameBare.includes(entry.bare)
        );
        if (partial) return partial.file;
      }

      return null;
    }
  };
}

function getCharacterImageUrl(character) {
  if (character?.imageUrl) {
    return new URL(character.imageUrl, document.baseURI).href;
  }
  if (imageUrls.has(character.id)) {
    return imageUrls.get(character.id);
  }
  if (!(character?.imageBlob instanceof Blob)) {
    return "";
  }
  const url = URL.createObjectURL(character.imageBlob);
  imageUrls.set(character.id, url);
  return url;
}

function revokeAllImageUrls() {
  for (const url of imageUrls.values()) {
    URL.revokeObjectURL(url);
  }
  imageUrls.clear();
}

function getAssignedSlot(characterId) {
  for (const [key, id] of Object.entries(slotMap)) {
    if (id === characterId) return key;
  }
  return "";
}

function slotLabelFromKey(key) {
  if (!key) return "";
  const [distance, style] = key.split("|");
  return `${distance} · ${style}`;
}

function removeCharacterFromSlots(characterId) {
  let changed = false;
  for (const key of Object.keys(slotMap)) {
    if (slotMap[key] === characterId) {
      delete slotMap[key];
      changed = true;
    }
  }
  if (changed) {
    saveSlotMap();
  }
}

function placeCharacter(characterId, targetKey) {
  if (!characterMap.has(characterId)) return;

  const currentKey = getAssignedSlot(characterId);
  const targetCharacterId = slotMap[targetKey];

  if (currentKey === targetKey) return;

  if (currentKey && targetCharacterId) {
    slotMap[currentKey] = targetCharacterId;
    slotMap[targetKey] = characterId;
  } else if (currentKey) {
    delete slotMap[currentKey];
    slotMap[targetKey] = characterId;
  } else {
    slotMap[targetKey] = characterId;
  }

  saveSlotMap();
  selectedCharacterId = null;
  renderAll();
}

function clearSelection() {
  selectedCharacterId = null;
  renderAll();
}


function updateQuickDockVisibility() {
  const shouldShow = characters.length > 0 && (!matrixIsVisible || Boolean(draggingCharacterId) || Boolean(selectedCharacterId));
  quickMatrixDock.hidden = !shouldShow;
}

function beginCharacterDrag(characterId, event) {
  draggingCharacterId = characterId;
  document.body.classList.add("is-dragging");
  event.dataTransfer.setData("text/plain", characterId);
  event.dataTransfer.effectAllowed = "move";
  hideAptitudeTooltip();
  updateQuickDockVisibility();
}

function stopAutoScroll() {
  autoScrollSpeed = 0;
  if (autoScrollFrame) {
    cancelAnimationFrame(autoScrollFrame);
    autoScrollFrame = 0;
  }
}

function runAutoScroll() {
  if (!draggingCharacterId || autoScrollSpeed === 0) {
    autoScrollFrame = 0;
    return;
  }
  window.scrollBy(0, autoScrollSpeed);
  autoScrollFrame = requestAnimationFrame(runAutoScroll);
}

function updateAutoScroll(clientY) {
  if (!draggingCharacterId) return;
  const edge = Math.min(130, window.innerHeight * 0.2);
  let nextSpeed = 0;
  if (clientY < edge) {
    nextSpeed = -Math.max(5, ((edge - clientY) / edge) * 24);
  } else if (clientY > window.innerHeight - edge) {
    nextSpeed = Math.max(5, ((clientY - (window.innerHeight - edge)) / edge) * 24);
  }
  autoScrollSpeed = nextSpeed;
  if (nextSpeed && !autoScrollFrame) {
    autoScrollFrame = requestAnimationFrame(runAutoScroll);
  } else if (!nextSpeed) {
    stopAutoScroll();
  }
}

function endCharacterDrag() {
  draggingCharacterId = null;
  document.body.classList.remove("is-dragging");
  stopAutoScroll();
  document.querySelectorAll(".drag-over").forEach((element) => element.classList.remove("drag-over"));
  updateQuickDockVisibility();
}

function buildQuickMatrix() {
  quickMatrixEl.innerHTML = "";

  const corner = document.createElement("div");
  corner.className = "quick-corner";
  corner.textContent = "거리";
  quickMatrixEl.appendChild(corner);

  for (const style of STYLES) {
    const header = document.createElement("div");
    header.className = "quick-column-header";
    header.dataset.style = style;
    header.textContent = style;
    quickMatrixEl.appendChild(header);
  }

  for (const distance of DISTANCES) {
    const rowHeader = document.createElement("div");
    rowHeader.className = "quick-row-header";
    rowHeader.dataset.distance = distance;
    rowHeader.textContent = distance;
    quickMatrixEl.appendChild(rowHeader);

    for (const style of STYLES) {
      const key = slotKey(distance, style);
      const slot = document.createElement("div");
      slot.className = "quick-slot";
      slot.dataset.slotKey = key;
      slot.title = `${distance} · ${style}`;

      slot.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        slot.classList.add("drag-over");
      });
      slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
      slot.addEventListener("drop", (event) => {
        event.preventDefault();
        slot.classList.remove("drag-over");
        const id = event.dataTransfer.getData("text/plain") || draggingCharacterId;
        if (id) placeCharacter(id, key);
        endCharacterDrag();
      });
      slot.addEventListener("click", () => {
        if (selectedCharacterId) placeCharacter(selectedCharacterId, key);
      });
      slot.addEventListener("dblclick", () => {
        if (slotMap[key]) {
          delete slotMap[key];
          saveSlotMap();
          renderAll();
        }
      });

      const character = characterMap.get(slotMap[key]);
      if (character) {
        const card = document.createElement("div");
        card.className = "quick-slot-character";
        card.draggable = true;
        card.tabIndex = 0;
        card.dataset.characterId = character.id;
        card.setAttribute("aria-label", `${character.name}, ${distance} ${style}`);
        card.addEventListener("dragstart", (event) => beginCharacterDrag(character.id, event));
        card.addEventListener("dragend", endCharacterDrag);
        card.addEventListener("click", (event) => {
          event.stopPropagation();
          selectedCharacterId = character.id;
          renderAll();
        });

        const image = document.createElement("img");
        image.src = getCharacterImageUrl(character);
        image.alt = character.name;
        card.appendChild(image);
        bindAptitudeTooltip(card, character);
        slot.appendChild(card);
      }

      if (selectedCharacterId) slot.classList.add("selected-target");
      quickMatrixEl.appendChild(slot);
    }
  }

  const count = Object.values(slotMap).filter((id) => characterMap.has(id)).length;
  quickDockStatus.textContent = `${count} / ${TOTAL_SLOTS}`;
}

function buildMatrix() {
  matrixEl.innerHTML = "";

  const corner = document.createElement("div");
  corner.className = "matrix-corner";
  corner.textContent = "거리 \\ 각질";
  matrixEl.appendChild(corner);

  for (const style of STYLES) {
    const header = document.createElement("div");
    header.className = "matrix-column-header";
    header.dataset.style = style;
    header.textContent = style;
    matrixEl.appendChild(header);
  }

  for (const distance of DISTANCES) {
    const rowHeader = document.createElement("div");
    rowHeader.className = "matrix-row-header";
    rowHeader.dataset.distance = distance;
    rowHeader.textContent = distance;
    matrixEl.appendChild(rowHeader);

    for (const style of STYLES) {
      const key = slotKey(distance, style);
      const slot = document.createElement("div");
      slot.className = "matrix-slot";
      slot.dataset.slotKey = key;
      slot.dataset.label = `${distance} ${style}`;
      slot.setAttribute("role", "gridcell");
      slot.setAttribute("tabindex", "0");

      slot.addEventListener("dragover", (event) => {
        event.preventDefault();
        slot.classList.add("drag-over");
      });
      slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
      slot.addEventListener("drop", (event) => {
        event.preventDefault();
        slot.classList.remove("drag-over");
        const id = event.dataTransfer.getData("text/plain") || draggingCharacterId;
        if (id) placeCharacter(id, key);
        endCharacterDrag();
      });
      slot.addEventListener("click", (event) => {
        if (event.target.closest(".remove-slot")) return;
        if (selectedCharacterId) {
          placeCharacter(selectedCharacterId, key);
        }
      });
      slot.addEventListener("keydown", (event) => {
        if ((event.key === "Enter" || event.key === " ") && selectedCharacterId) {
          event.preventDefault();
          placeCharacter(selectedCharacterId, key);
        }
      });
      slot.addEventListener("dblclick", () => {
        if (slotMap[key]) {
          delete slotMap[key];
          saveSlotMap();
          renderAll();
        }
      });

      const characterId = slotMap[key];
      const character = characterMap.get(characterId);
      if (character) {
        const card = document.createElement("div");
        card.className = "slot-character";
        card.draggable = true;
        card.dataset.characterId = character.id;
        card.tabIndex = 0;
        card.setAttribute("aria-label", `${character.name} — 끌어서 다른 칸으로 이동할 수 있습니다.`);
        card.addEventListener("dragstart", (event) => beginCharacterDrag(character.id, event));
        card.addEventListener("dragend", endCharacterDrag);
        card.addEventListener("click", (event) => {
          if (event.target.closest(".remove-slot")) return;
          event.stopPropagation();
          selectedCharacterId = character.id;
          renderAll();
        });

        const image = document.createElement("img");
        image.src = getCharacterImageUrl(character);
        image.alt = character.name;

        const name = document.createElement("strong");
        name.textContent = character.name;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-slot";
        remove.textContent = "×";
        remove.title = "이 칸에서 제거";
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          delete slotMap[key];
          saveSlotMap();
          renderAll();
        });

        card.append(image, name, remove);
        bindAptitudeTooltip(card, character);
        slot.appendChild(card);
      } else if (characterId) {
        delete slotMap[key];
        saveSlotMap();
      }

      if (selectedCharacterId) {
        slot.classList.add("selected-target");
      }
      matrixEl.appendChild(slot);
    }
  }
}

function buildPool() {
  poolEl.innerHTML = "";
  const query = searchInput.value.trim().toLocaleLowerCase("ko-KR");
  const filter = filterSelect.value;

  const visible = characters
    .filter((character) => {
      const assigned = Boolean(getAssignedSlot(character.id));
      const nameMatch = !query || character.name.toLocaleLowerCase("ko-KR").includes(query);
      const filterMatch =
        filter === "all" ||
        (filter === "assigned" && assigned) ||
        (filter === "unassigned" && !assigned) ||
        (filter === "custom" && character.kind === "custom");
      return nameMatch && filterMatch;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko-KR"));

  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const title = document.createElement("strong");
    title.textContent = characters.length ? "조건에 맞는 캐릭터가 없습니다." : "아직 캐릭터가 없습니다.";
    const detail = document.createElement("span");
    detail.textContent = characters.length
      ? "검색어 또는 필터를 바꿔보세요."
      : "위에서 ZIP을 불러오거나 직접 추가하세요.";
    empty.append(title, detail);
    poolEl.appendChild(empty);
    return;
  }

  for (const character of visible) {
    const node = cardTemplate.content.firstElementChild.cloneNode(true);
    const assignedKey = getAssignedSlot(character.id);

    node.dataset.characterId = character.id;
    node.dataset.kind = character.kind || "imported";
    node.classList.toggle("assigned", Boolean(assignedKey));
    node.classList.toggle("selected", selectedCharacterId === character.id);
    node.setAttribute("aria-label", `${character.name}${assignedKey ? `, ${slotLabelFromKey(assignedKey)}에 배치됨` : ""}`);

    const image = node.querySelector("img");
    image.src = getCharacterImageUrl(character);
    image.alt = character.name;
    node.querySelector(".character-name").textContent = character.name;
    node.querySelector(".assigned-badge").textContent = assignedKey ? slotLabelFromKey(assignedKey) : "";

    node.addEventListener("dragstart", (event) => beginCharacterDrag(character.id, event));
    node.addEventListener("dragend", endCharacterDrag);
    bindAptitudeTooltip(node, character);

    node.addEventListener("click", (event) => {
      if (event.target.closest(".delete-character")) return;
      selectedCharacterId = selectedCharacterId === character.id ? null : character.id;
      renderAll();
    });

    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectedCharacterId = selectedCharacterId === character.id ? null : character.id;
        renderAll();
      }
    });

    const deleteButton = node.querySelector(".delete-character");
    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (character.kind !== "custom") return;
      const ok = confirm(`'${character.name}' 캐릭터를 삭제할까요?`);
      if (!ok) return;
      removeCharacterFromSlots(character.id);
      await deleteCharacterRecord(character.id);
      await refreshCharacters();
      setStatus(`'${character.name}' 캐릭터를 삭제했습니다.`);
    });

    poolEl.appendChild(node);
  }
}

function renderSelectionHint() {
  if (!selectedCharacterId) {
    selectionHint.textContent = "선택된 캐릭터가 없습니다.";
    return;
  }
  const character = characterMap.get(selectedCharacterId);
  selectionHint.textContent = character
    ? `'${character.name}' 선택 중 — 배치할 칸을 클릭하세요. 다시 클릭하면 선택이 해제됩니다.`
    : "선택된 캐릭터가 없습니다.";
}

function renderCompletion() {
  const count = Object.values(slotMap).filter((id) => characterMap.has(id)).length;
  completionCount.textContent = `${count} / ${TOTAL_SLOTS}`;
}

function renderAll() {
  buildMatrix();
  buildQuickMatrix();
  buildPool();
  renderSelectionHint();
  renderCompletion();
  updateQuickDockVisibility();
}


async function deleteCharacterRecords(ids) {
  if (!ids.length) return;
  const transaction = db.transaction(CHARACTER_STORE, "readwrite");
  const store = transaction.objectStore(CHARACTER_STORE);
  for (const id of ids) {
    store.delete(id);
  }
  await transactionPromise(transaction);
}

async function ensureBundledCharacters() {
  const response = await fetch(BUNDLED_DATA_URL, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`기본 characters.json을 불러오지 못했습니다. (HTTP ${response.status})`);
  }

  const data = await response.json();
  const normalizedRecords = extractRecordArray(data)
    .map(normalizeRecord)
    .filter(Boolean);

  const savedCharacters = await getAllCharacters();
  const existingByPath = new Map(
    savedCharacters
      .filter((character) => character.kind === "imported" || character.kind === BUNDLED_KIND)
      .map((character) => [normalizePath(character.sourcePath).toLowerCase(), character])
  );

  const bundledRecords = [];
  const staleIds = [];
  let changedSlots = false;

  for (const record of normalizedRecords) {
    if (!record.imagePath) continue;

    const id = makeImportedId(record.name, record.imagePath);
    const sourcePathKey = normalizePath(record.imagePath).toLowerCase();
    const previous = existingByPath.get(sourcePathKey);

    if (previous && previous.id !== id) {
      for (const key of Object.keys(slotMap)) {
        if (slotMap[key] === previous.id) {
          slotMap[key] = id;
          changedSlots = true;
        }
      }
      staleIds.push(previous.id);
    }

    bundledRecords.push({
      id,
      name: record.name,
      imageUrl: record.imagePath,
      sourcePath: record.imagePath,
      kind: BUNDLED_KIND,
      createdAt: data.scraped_at || new Date().toISOString()
    });
  }

  if (!bundledRecords.length) {
    throw new Error("기본 characters.json에 사용할 수 있는 캐릭터가 없습니다.");
  }

  await putCharacters(bundledRecords);
  await deleteCharacterRecords([...new Set(staleIds)]);

  if (changedSlots) {
    saveSlotMap();
  }

  return bundledRecords.length;
}

async function migrateStoredCharacterNames() {
  const savedCharacters = await getAllCharacters();
  const changed = [];
  for (const character of savedCharacters) {
    const cleanedName = cleanCharacterName(character.name);
    if (cleanedName && cleanedName !== character.name) {
      changed.push({ ...character, name: cleanedName });
    }
  }
  if (changed.length) {
    await putCharacters(changed);
  }
  return changed.length;
}

function findExistingImportedId(sourcePath) {
  const normalizedPath = normalizePath(sourcePath).toLowerCase();
  const existing = characters.find((character) =>
    character.kind === "imported" && normalizePath(character.sourcePath).toLowerCase() === normalizedPath
  );
  return existing?.id || null;
}

async function refreshCharacters() {
  revokeAllImageUrls();
  characters = await getAllCharacters();
  characterMap = new Map(characters.map((character) => [character.id, character]));

  for (const key of Object.keys(slotMap)) {
    if (!characterMap.has(slotMap[key])) {
      delete slotMap[key];
    }
  }
  saveSlotMap();
  renderAll();
}

async function importZip(file) {
  if (!file) return;
  if (typeof JSZip === "undefined") {
    throw new Error("JSZip 라이브러리를 불러오지 못했습니다.");
  }

  setProgress(2, "ZIP 파일 읽는 중");
  const zip = await JSZip.loadAsync(file);
  const allEntries = Object.values(zip.files).filter((entry) => !entry.dir);
  const jsonEntry = allEntries.find((entry) =>
    normalizePath(entry.name).toLowerCase().endsWith("characters.json")
  );

  if (!jsonEntry) {
    throw new Error("ZIP 안에서 characters.json을 찾지 못했습니다.");
  }

  const jsonText = await jsonEntry.async("string");
  const normalizedRecords = extractRecordArray(JSON.parse(jsonText))
    .map(normalizeRecord)
    .filter(Boolean);

  const imageEntries = allEntries.filter((entry) =>
    /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(entry.name)
  );
  const lookup = buildFileLookup(imageEntries, (entry) => entry.name);

  const imported = [];
  const failures = [];

  for (let i = 0; i < normalizedRecords.length; i += 1) {
    const record = normalizedRecords[i];
    const entry = lookup.find(record.imagePath, record.name);
    const percent = 5 + ((i + 1) / Math.max(1, normalizedRecords.length)) * 87;
    setProgress(percent, `이미지 처리 중: ${record.name}`);

    if (!entry) {
      failures.push(`${record.name}: 이미지 파일을 찾지 못함`);
      continue;
    }

    try {
      const bytes = await entry.async("uint8array");
      const blob = new Blob([bytes], { type: mimeFromName(entry.name) });
      imported.push({
        id: findExistingImportedId(entry.name) || makeImportedId(record.name, normalizePath(entry.name)),
        name: record.name,
        imageBlob: blob,
        sourcePath: normalizePath(entry.name),
        kind: "imported",
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      failures.push(`${record.name}: ${error.message}`);
    }
  }

  if (!imported.length) {
    throw new Error("불러올 수 있는 캐릭터 이미지가 하나도 없었습니다.");
  }

  setProgress(95, "브라우저에 저장 중");
  await putCharacters(imported);
  await refreshCharacters();
  setProgress(100, "완료");

  const failureText = failures.length
    ? `\n실패 ${failures.length}개: ${failures.slice(0, 5).join(" / ")}${failures.length > 5 ? " 외" : ""}`
    : "";
  setStatus(`${imported.length}명의 캐릭터를 불러왔습니다.${failureText}`, failures.length > 0);
  hideProgress();
}

async function importSeparateFiles(jsonFile, imageFiles) {
  if (!jsonFile) throw new Error("characters.json을 먼저 선택하세요.");
  if (!imageFiles.length) throw new Error("images 폴더를 선택하세요.");

  setProgress(3, "characters.json 읽는 중");
  const data = JSON.parse(await jsonFile.text());
  const normalizedRecords = extractRecordArray(data)
    .map(normalizeRecord)
    .filter(Boolean);

  const files = [...imageFiles].filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(file.name));
  const lookup = buildFileLookup(files, (file) => file.webkitRelativePath || file.name);

  const imported = [];
  const failures = [];

  for (let i = 0; i < normalizedRecords.length; i += 1) {
    const record = normalizedRecords[i];
    const file = lookup.find(record.imagePath, record.name);
    const percent = 5 + ((i + 1) / Math.max(1, normalizedRecords.length)) * 88;
    setProgress(percent, `이미지 연결 중: ${record.name}`);

    if (!file) {
      failures.push(`${record.name}: 이미지 파일을 찾지 못함`);
      continue;
    }

    imported.push({
      id: findExistingImportedId(file.webkitRelativePath || file.name) || makeImportedId(record.name, normalizePath(file.webkitRelativePath || file.name)),
      name: record.name,
      imageBlob: file,
      sourcePath: normalizePath(file.webkitRelativePath || file.name),
      kind: "imported",
      createdAt: new Date().toISOString()
    });
  }

  if (!imported.length) {
    throw new Error("JSON과 일치하는 이미지가 하나도 없었습니다.");
  }

  setProgress(95, "브라우저에 저장 중");
  await putCharacters(imported);
  await refreshCharacters();
  setProgress(100, "완료");

  const failureText = failures.length
    ? `\n실패 ${failures.length}개: ${failures.slice(0, 5).join(" / ")}${failures.length > 5 ? " 외" : ""}`
    : "";
  setStatus(`${imported.length}명의 캐릭터를 불러왔습니다.${failureText}`, failures.length > 0);
  hideProgress();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportResultJson() {
  const placements = [];
  for (const distance of DISTANCES) {
    for (const style of STYLES) {
      const key = slotKey(distance, style);
      const character = characterMap.get(slotMap[key]);
      placements.push({
        distance,
        style,
        character_id: character?.id || null,
        character_name: character?.name || null
      });
    }
  }

  const result = {
    title: "애정말딸 (각질/거리별)",
    exported_at: new Date().toISOString(),
    completed: placements.filter((item) => item.character_id).length,
    total: TOTAL_SLOTS,
    placements
  };

  downloadBlob(
    new Blob([JSON.stringify(result, null, 2)], { type: "application/json;charset=utf-8" }),
    `애정말딸_각질거리별_${new Date().toISOString().slice(0, 10)}.json`
  );
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지 로드 실패"));
    image.src = url;
  });
}

function drawContainedImage(ctx, image, x, y, width, height) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + height - drawHeight,
    drawWidth,
    drawHeight
  );
}

function drawCenteredText(ctx, text, x, y, width, maxWidth) {
  let fontSize = 23;
  do {
    ctx.font = `800 ${fontSize}px "Malgun Gothic", sans-serif`;
    if (ctx.measureText(text).width <= maxWidth || fontSize <= 15) break;
    fontSize -= 1;
  } while (fontSize > 15);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + width / 2, y);
}

async function saveResultPng() {
  const leftWidth = 165;
  const colWidth = 285;
  const titleHeight = 120;
  const headerHeight = 82;
  const rowHeight = 255;
  const width = leftWidth + colWidth * STYLES.length;
  const height = titleHeight + headerHeight + rowHeight * DISTANCES.length;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#111315";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#1b1e21";
  ctx.fillRect(0, 0, width, titleHeight);
  ctx.fillStyle = "#ffffff";
  ctx.font = '900 46px "Malgun Gothic", sans-serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("애정말딸", 34, 53);
  ctx.fillStyle = "#ff8ca4";
  ctx.font = '800 27px "Malgun Gothic", sans-serif';
  ctx.fillText("(각질/거리별)", 35, 91);

  ctx.fillStyle = "#171a1d";
  ctx.fillRect(0, titleHeight, leftWidth, headerHeight);
  ctx.fillStyle = "#9aa3ac";
  ctx.font = '800 20px "Malgun Gothic", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("거리 \\ 각질", leftWidth / 2, titleHeight + headerHeight / 2);

  const styleColors = {
    도주: "#ff726d",
    선행: "#f3c55c",
    선입: "#76c8ff",
    추입: "#be8cff"
  };

  STYLES.forEach((style, columnIndex) => {
    const x = leftWidth + columnIndex * colWidth;
    ctx.fillStyle = "#25292d";
    ctx.fillRect(x, titleHeight, colWidth, headerHeight);
    ctx.fillStyle = styleColors[style];
    ctx.font = '900 28px "Malgun Gothic", sans-serif';
    ctx.fillText(style, x + colWidth / 2, titleHeight + headerHeight / 2);
  });

  const rowColors = {
    단거리: "#ff858d",
    마일: "#ffbc7b",
    중거리: "#ffe183",
    장거리: "#b7ef7a",
    더트: "#76d5ec"
  };

  for (let rowIndex = 0; rowIndex < DISTANCES.length; rowIndex += 1) {
    const distance = DISTANCES[rowIndex];
    const y = titleHeight + headerHeight + rowIndex * rowHeight;

    ctx.fillStyle = rowColors[distance];
    ctx.fillRect(0, y, leftWidth, rowHeight);
    ctx.fillStyle = "#171717";
    ctx.font = '900 28px "Malgun Gothic", sans-serif';
    ctx.fillText(distance, leftWidth / 2, y + rowHeight / 2);

    for (let colIndex = 0; colIndex < STYLES.length; colIndex += 1) {
      const style = STYLES[colIndex];
      const x = leftWidth + colIndex * colWidth;
      const key = slotKey(distance, style);
      const character = characterMap.get(slotMap[key]);

      ctx.fillStyle = "#17191b";
      ctx.fillRect(x, y, colWidth, rowHeight);

      if (character) {
        try {
          const image = await loadImage(getCharacterImageUrl(character));
          drawContainedImage(ctx, image, x + 8, y + 6, colWidth - 16, rowHeight - 53);
        } catch {
          // 이름은 계속 출력합니다.
        }
        ctx.fillStyle = "#24282c";
        ctx.fillRect(x + 5, y + rowHeight - 46, colWidth - 10, 41);
        ctx.fillStyle = "#ffffff";
        drawCenteredText(ctx, character.name, x, y + rowHeight - 25, colWidth, colWidth - 28);
      }
    }
  }

  ctx.strokeStyle = "#4b5259";
  ctx.lineWidth = 2;
  for (let x = 0; x <= width; x += colWidth) {
    // 아래에서 별도로 정확한 세로선을 그립니다.
  }
  ctx.beginPath();
  ctx.moveTo(0, titleHeight);
  ctx.lineTo(width, titleHeight);
  ctx.moveTo(0, titleHeight + headerHeight);
  ctx.lineTo(width, titleHeight + headerHeight);
  for (let row = 1; row <= DISTANCES.length; row += 1) {
    const y = titleHeight + headerHeight + row * rowHeight;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.moveTo(leftWidth, titleHeight);
  ctx.lineTo(leftWidth, height);
  for (let col = 1; col <= STYLES.length; col += 1) {
    const x = leftWidth + col * colWidth;
    ctx.moveTo(x, titleHeight);
    ctx.lineTo(x, height);
  }
  ctx.stroke();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNG 파일을 만들지 못했습니다.");
  downloadBlob(blob, `애정말딸_각질거리별_${new Date().toISOString().slice(0, 10)}.png`);
}

zipInput.addEventListener("change", async () => {
  const [file] = zipInput.files;
  try {
    await importZip(file);
  } catch (error) {
    console.error(error);
    setStatus(`오류: ${error.message}`, true);
    hideProgress();
  } finally {
    zipInput.value = "";
  }
});

separateImportButton.addEventListener("click", async () => {
  try {
    await importSeparateFiles(jsonInput.files[0], imageFolderInput.files);
  } catch (error) {
    console.error(error);
    setStatus(`오류: ${error.message}`, true);
    hideProgress();
  }
});

customForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = cleanCharacterName(customNameInput.value);
  const imageFile = customImageInput.files[0];

  if (!name || !imageFile) return;

  const record = {
    id: `custom-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`,
    name,
    imageBlob: imageFile,
    sourcePath: imageFile.name,
    kind: "custom",
    createdAt: new Date().toISOString()
  };

  await putCharacters([record]);
  customForm.reset();
  await refreshCharacters();
  setStatus(`'${name}' 캐릭터를 직접 추가했습니다.`);
});

searchInput.addEventListener("input", buildPool);
filterSelect.addEventListener("change", buildPool);

clearSlotsButton.addEventListener("click", () => {
  if (!Object.keys(slotMap).length) return;
  if (!confirm("20칸의 배치를 모두 초기화할까요? 캐릭터 데이터는 삭제되지 않습니다.")) return;
  slotMap = {};
  selectedCharacterId = null;
  saveSlotMap();
  renderAll();
  setStatus("배치표를 초기화했습니다.");
});

deleteAllButton.addEventListener("click", async () => {
  const ok = confirm("직접 추가한 캐릭터와 배치 정보를 모두 삭제할까요? GitHub에 포함된 기본 캐릭터는 다시 복원됩니다.");
  if (!ok) return;
  await clearCharacterStore();
  slotMap = {};
  selectedCharacterId = null;
  saveSlotMap();
  const bundledCount = await ensureBundledCharacters();
  await refreshCharacters();
  setStatus(`사용자 저장 데이터를 삭제하고 기본 캐릭터 ${bundledCount}명을 복원했습니다.`);
});

exportJsonButton.addEventListener("click", exportResultJson);

savePngButton.addEventListener("click", async () => {
  try {
    savePngButton.disabled = true;
    savePngButton.textContent = "PNG 만드는 중...";
    await saveResultPng();
    setStatus("배치 결과를 PNG 파일로 저장했습니다.");
  } catch (error) {
    console.error(error);
    setStatus(`PNG 저장 오류: ${error.message}`, true);
  } finally {
    savePngButton.disabled = false;
    savePngButton.textContent = "결과 PNG 저장";
  }
});

poolDropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  poolDropZone.classList.add("drag-over");
});
poolDropZone.addEventListener("dragleave", () => poolDropZone.classList.remove("drag-over"));
poolDropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  poolDropZone.classList.remove("drag-over");
  const characterId = event.dataTransfer.getData("text/plain") || draggingCharacterId;
  if (!characterId) return;
  removeCharacterFromSlots(characterId);
  selectedCharacterId = null;
  renderAll();
  endCharacterDrag();
});


quickDockToggle.addEventListener("click", () => {
  const collapsed = quickMatrixDock.classList.toggle("collapsed");
  quickDockToggle.textContent = collapsed ? "+" : "−";
  quickDockToggle.setAttribute("aria-label", collapsed ? "빠른 배치표 펼치기" : "빠른 배치표 접기");
  localStorage.setItem(QUICK_DOCK_COLLAPSED_KEY, collapsed ? "1" : "0");
});

function setupMatrixObserver() {
  const target = document.querySelector(".matrix-panel");
  if (!target) return;

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      matrixIsVisible = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.12);
      updateQuickDockVisibility();
    }, { threshold: [0, 0.12, 0.4] });
    observer.observe(target);
  } else {
    const update = () => {
      const rect = target.getBoundingClientRect();
      matrixIsVisible = rect.bottom > 80 && rect.top < window.innerHeight - 80;
      updateQuickDockVisibility();
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }
}

document.addEventListener("dragover", (event) => {
  updateAutoScroll(event.clientY);
}, true);

document.addEventListener("dragend", endCharacterDrag, true);
document.addEventListener("drop", () => window.setTimeout(endCharacterDrag, 0), true);

document.addEventListener("wheel", (event) => {
  if (!draggingCharacterId) return;
  event.preventDefault();
  window.scrollBy(0, event.deltaY);
}, { passive: false, capture: true });

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && selectedCharacterId) {
    clearSelection();
  }
});

window.addEventListener("beforeunload", revokeAllImageUrls);

(async function initialize() {
  try {
    const collapsed = localStorage.getItem(QUICK_DOCK_COLLAPSED_KEY) === "1";
    quickMatrixDock.classList.toggle("collapsed", collapsed);
    quickDockToggle.textContent = collapsed ? "+" : "−";
    quickDockToggle.setAttribute("aria-label", collapsed ? "빠른 배치표 펼치기" : "빠른 배치표 접기");

    db = await openDatabase();

    let bundledCount = 0;
    let bundledError = null;
    try {
      bundledCount = await ensureBundledCharacters();
    } catch (error) {
      bundledError = error;
      console.warn("기본 캐릭터 자동 불러오기 실패:", error);
    }

    const migratedCount = await migrateStoredCharacterNames();
    await refreshCharacters();
    setupMatrixObserver();

    if (bundledError) {
      const localHint = location.protocol === "file:"
        ? " index.html을 직접 열기보다 GitHub Pages 또는 로컬 웹 서버에서 실행하세요."
        : "";
      setStatus(`기본 캐릭터 자동 불러오기 오류: ${bundledError.message}${localHint}`, true);
    } else {
      const migratedText = migratedCount
        ? ` 저장된 이름 ${migratedCount}개도 정리했습니다.`
        : "";
      setStatus(`GitHub에 포함된 기본 캐릭터 ${bundledCount}명을 불러왔습니다.${migratedText}`);
    }
  } catch (error) {
    console.error(error);
    setStatus(`초기화 오류: ${error.message}`, true);
  }
})();

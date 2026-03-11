let ws = null;
let myId = null;
let currentState = null;
let myHand = [];
let selectedCardId = null;
let lastSearchZone = null;
const FALLBACK_CARD_IMAGE = (typeof DEFAULT_CARD_IMAGE !== "undefined") ? DEFAULT_CARD_IMAGE : "";

const $ = (id) => document.getElementById(id);

function updateConnectionButtons() {
    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    $("btnConnect").disabled = isConnected;
    $("btnDisconnect").disabled = !isConnected;
}

function disconnect() {
    if (ws) {
        log("Disconnecting...");
        ws.close();
        ws = null;
        updateConnectionButtons(); 
    }
}

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) {
      log("Already connected.");
      return;
  }
  
  const url = $("serverUrl").value;
  const roomId = $("roomId").value;
  const role = $("role").value;
  ws = new WebSocket(url);
  
  $("btnConnect").disabled = true; 
  $("btnDisconnect").disabled = true; 

  ws.onopen = () => {
    log("Connected.");
    updateConnectionButtons(); 
    const playerName = $("playerName")?.value?.trim() || "";
    ws.send(JSON.stringify({
      type: "JOIN_ROOM",
      roomId: roomId,
      role: role,
      name: playerName
    }));
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);

    if (msg.type === "ERROR") {
      alert(msg.message); 
      disconnect();       
      return;
    }
    
    if (msg.type === "HELLO") {
      myId = msg.playerId;
      log("Your id: " + myId);
    } else if (msg.type === "STATE_PATCH") {
      currentState = msg.patch;
      renderState();
      if (msg.patch && typeof msg.patch.sharedNote === "string") {
        const note = $("sharedNote");
        if (note && note.value !== msg.patch.sharedNote) note.value = msg.patch.sharedNote;
      }
    } else if (msg.type === "HAND_UPDATE") {
      if (msg.player === myId) {
        myHand = msg.cards;
        renderHand();
      }
    } else if (msg.type === "SEARCH_RESULT") {
      lastSearchZone = msg.zone;
      renderSearchResults(msg.cards);
    } else if (msg.type === "NOTE_UPDATE") {
      const note = $("sharedNote");
      if (note && note.value !== msg.text) note.value = msg.text;
    } else if (msg.type === "COIN_RESULT") {
      const zh = (msg.side === "HEADS") ? "正面" : "反面";
      alert("擲硬幣結果：" + zh);
    }
  };
  ws.onclose = () => {
    log("Disconnected.");
    ws = null; 
    updateConnectionButtons(); 
  };
  ws.onerror = (e) => {
    log("Connection error: " + e.message);
    ws = null; 
    updateConnectionButtons(); 
  }
}

function log(s) {
  const el = $("log");
  el.textContent += s + "\n";
  el.scrollTop = el.scrollHeight;
}

function renderState() {
  if (!currentState) return;
  const oppId = (currentState.players || []).find(pid => pid !== myId);
  const opBoard = $("opFieldBoard");
  opBoard.innerHTML = "";
  if (oppId && currentState.zones[oppId]) {
    for (const c of currentState.zones[oppId].FIELD) {
      const img = document.createElement("div");
      img.className = "card-abs";
      img.style.left = (c.pos?.x || 0) + "px";
      img.style.top = (c.pos?.y || 0) + "px";
      
      let cardImageStyle = '';
      if (!c.faceDown && c.img) {
        const safeUrl = String(c.img).replace(/"/g, '\\"');
        cardImageStyle = `background-image: url("${safeUrl}"); background-size: cover; background-position: center;`;
      } else {
        cardImageStyle = 'background: #333;';
      }
      img.setAttribute('style', `${img.getAttribute('style') || ''} ${cardImageStyle}`);
      
      img.style.transform = (c.tapped ? "rotate(90deg)" : "rotate(0deg)");
      opBoard.appendChild(img);
    }
  }

  const counts = currentState.counts || {};
  const nameMap = currentState.names || {};
  const oppName = oppId ? (nameMap[oppId] || oppId) : "";
  if ($("opponentCounts")) {
    const oc = counts[oppId] || {};
    $("opponentCounts").textContent = oppId
      ? `${oppName} — DECK: ${oc.DECK ?? 0} | HAND: ${oc.HAND ?? 0} | GRAVE: ${oc.GRAVE ?? 0} | BANISH: ${oc.BANISH ?? 0} | EXTRA: ${oc.EXTRA ?? 0}`
      : "尚未有對手";
  }
  if ($("myCounts")) {
    const mc = counts[myId] || {};
    const myName = nameMap[myId] || "你";
    $("myCounts").textContent =
      `${myName} — DECK: ${mc.DECK ?? 0} | HAND: ${mc.HAND ?? 0} | GRAVE: ${mc.GRAVE ?? 0} | BANISH: ${mc.BANISH ?? 0} | EXTRA: ${mc.EXTRA ?? 0}`;
  }
  renderField();
  renderGrave();
  renderBanish();
  $("log").textContent = (currentState.logs || []).join("\n");
}

function renderHand() {
  const box = $("hand");
  if (!box) return;
  box.innerHTML = "";

  const cards = myHand || [];
  for (const c of cards) {
    const div = document.createElement("div");
    div.className = "zone-card";
    if (c.img) div.style.backgroundImage = `url(${c.img})`;
    else       div.classList.add("fallback");
    makeDraggable(div, { from: "HAND", cardId: c.id });
    box.appendChild(div);
  }
}

function renderField() {
  const z = currentState?.zones[myId];
  const board = $("fieldBoard");
  board.innerHTML = "";
  if (!z) return;

  for (const c of z.FIELD) {
    const div = document.createElement("div"); 
    div.className = "card-abs";
    
    const img = document.createElement("img"); 
    img.src = c.img || FALLBACK_CARD_IMAGE;
    img.onerror = () => { img.onerror = null; if (FALLBACK_CARD_IMAGE) img.src = FALLBACK_CARD_IMAGE; };
    
    div.style.left = (c.pos?.x || 0) + "px";
    div.style.top  = (c.pos?.y || 0) + "px";

    div.style.transform = (c.tapped ? "rotate(90deg)" : "rotate(0deg)");

    if (c.faceDown) div.classList.add("card-facedown-self");
    else            div.classList.remove("card-facedown-self");

    div.title = c.name || c.baseId;
    div.appendChild(img); 
    
    let previewImg = null;
    let isPreviewing = false;

    div.addEventListener("contextmenu", (e) => {
      e.preventDefault();

      if (isPreviewing) {
        if (previewImg) previewImg.remove();
        previewImg = null;
        isPreviewing = false;
        return;
      }

      previewImg = document.createElement("img");
      previewImg.src = img.src;
      previewImg.style.position = "fixed";
      previewImg.style.left = (e.clientX + 20) + "px";
      previewImg.style.top = (e.clientY - 200) + "px";
      previewImg.style.width = "400px";
      previewImg.style.border = "2px solid var(--color-accent)";
      previewImg.style.borderRadius = "8px";
      previewImg.style.boxShadow = "0 4px 20px rgba(0,0,0,0.8), 0 0 15px var(--color-accent)";
      previewImg.style.zIndex = "10000";
      previewImg.style.backgroundColor = "var(--color-bg-primary)";
      document.body.appendChild(previewImg);

      isPreviewing = true;
    });

    div.addEventListener("mousemove", (e) => {
      if (isPreviewing && previewImg) {
        previewImg.style.left = (e.clientX + 20) + "px";
        previewImg.style.top = (e.clientY - 200) + "px";
      }
    });

    document.addEventListener("click", (e) => {
      if (isPreviewing && previewImg && !div.contains(e.target)) {
        previewImg.remove();
        previewImg = null;
        isPreviewing = false;
      }
    });
    
    makeDraggable(div, { from: "FIELD", cardId: c.id });
    
    let tapTimer = null;
    div.addEventListener("click", (e) => {
      if (!ws || ws.readyState !== 1) return;
      if (tapTimer) return;
      tapTimer = setTimeout(() => {
        tapTimer = null;
        ws.send(JSON.stringify({ type: "SET_TAP", cardId: c.id, tapped: !c.tapped }));
      }, 220);
    });
    
    div.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!ws || ws.readyState !== 1) return;
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
      ws.send(JSON.stringify({
        type: "MOVE_CARD",
        from: "FIELD",
        to: "FIELD",
        cardId: c.id,
        faceDown: !c.faceDown,
        pos: { x: c.pos?.x || 0, y: c.pos?.y || 0 }
      }));
    });
    board.appendChild(div);
  }
}

function renderGrave() {
  const box = $("grave");                
  const z = currentState?.zones?.[myId];

  const cards = z?.GRAVE || [];
  if (!box) return;
  box.classList.add("zone-grid");
  box.innerHTML = "";

  for (const c of cards) {
    const div = document.createElement("div");
    div.className = "zone-card";
    if (c.img) div.style.backgroundImage = `url(${c.img})`;
    else       div.classList.add("fallback");
    makeDraggable(div, { from: "GRAVE", cardId: c.id });
    box.appendChild(div);
  }
}

function renderBanish() {
  const box = $("banish");               
  const z = currentState?.zones?.[myId];
  const cards = z?.BANISH || [];
  if (!box) return;
  box.classList.add("zone-grid");
  box.innerHTML = "";

  for (const c of cards) {
    const div = document.createElement("div");
    div.className = "zone-card";
    if (c.img) div.style.backgroundImage = `url(${c.img})`;
    else       div.classList.add("fallback");
    makeDraggable(div, { from: "BANISH", cardId: c.id });
    box.appendChild(div);
  }
}

function renderSearchResults(cards) {
  const ul = $("searchResults");
  ul.innerHTML = "";
  for (const c of cards) {
    const li = document.createElement("li");
    li.className = "search-card";
    const img = document.createElement("img");
    img.className = "search-card-img";
    img.src = c.img || FALLBACK_CARD_IMAGE || "";
    img.onerror = () => { img.onerror = null; if (FALLBACK_CARD_IMAGE) img.src = FALLBACK_CARD_IMAGE; };

    if (lastSearchZone) {
      makeDraggable(img, { from: lastSearchZone, cardId: c.id });
    }

    img.ondblclick = () => {
      if (!lastSearchZone || !ws || ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: "MOVE_CARD", from: lastSearchZone, to: "HAND", cardId: c.id }));
    };

    li.appendChild(img);
    ul.appendChild(li);
  }
}

function makeDraggable(el, payload) {
  el.setAttribute("draggable", "true");
  el.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    el.classList.add("dragging");
  });
  el.addEventListener("dragend", () => {
    el.classList.remove("dragging");
  });
}

function setupDropzone(el, onDrop) {
  el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("highlight"); });
  el.addEventListener("dragleave", () => el.classList.remove("highlight"));
  el.addEventListener("drop", (e) => {
    e.preventDefault(); el.classList.remove("highlight");
    let data = null;
    try { data = JSON.parse(e.dataTransfer.getData("application/json")); } catch {}
    onDrop(e, data);
  });
}

function setupFieldBoard() {
  const board = $("fieldBoard");
  setupDropzone(board, (e, data) => {
    if (!data || !ws || ws.readyState !== 1) return;
    const rect = board.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const cx = Math.max(0, Math.min(rect.width - 80, x - 40));
    const cy = Math.max(0, Math.min(rect.height - 120, y - 60));

    const wantFaceDown = ($("chkFaceDown")?.checked) || e.shiftKey;

    if (["HAND","DECK","GRAVE","BANISH","EXTRA"].includes(data.from)) {
      ws.send(JSON.stringify({
        type: "MOVE_CARD",
        from: data.from,
        to: "FIELD",
        cardId: data.cardId,
        faceDown: wantFaceDown,
        pos: { x: cx, y: cy }
      }));
    } else if (data.from === "FIELD") {
      ws.send(JSON.stringify({
        type: "MOVE_CARD",
        from: "FIELD",
        to: "FIELD",
        cardId: data.cardId,
        pos: { x: cx, y: cy }
      }));
    }
  });
}

function setupZoneDrops() {
  document.querySelectorAll(".dropzone[data-zone]").forEach(el => {
    const zone = el.getAttribute("data-zone");
    setupDropzone(el, (e, data) => {
      if (!data || !ws || ws.readyState !== 1) return;
      const from = data.from;
      let to = zone;
      if (from === "EXTRA" && to === "DECK") to = "EXTRA";
      if (from === to && to !== "FIELD") return;

      const toBottom = $("chkToBottom")?.checked || false;

      ws.send(JSON.stringify({ 
        type: "MOVE_CARD", 
        from, 
        to, 
        cardId: data.cardId,
        toBottom
      }));
    });
  });
}

function setupDnD() { setupFieldBoard(); setupZoneDrops(); }

$("btnConnect").onclick = () => { connect(); setupDnD(); bindSharedNote(); };
$("btnDisconnect").onclick = () => { disconnect(); }; 

$("btnImportCsv").onclick = async () => {
  if (!ws || ws.readyState !== 1) return alert("尚未連線");
  const file = $("deckCsvFile").files[0];
  if (!file) return alert("請選擇 CSV 檔");
  const text = await file.text();
  const records = parseCSV(text);
  if (!records.length) return alert("CSV 內容為空或格式不正確");
  const deck = csvToDeck(records);
  const m = deck.main.length, s = deck.side.length;
  if (m < 40 || m > 60) return alert("主牌組需 40–60 張，目前：" + m);
  if (s > 15) return alert("副牌組最多 15 張，目前：" + s);
  ws.send(JSON.stringify({ type: "IMPORT_DECK", main: deck.main, side: deck.side, extra: deck.extra }));
};
$("btnStart").onclick = () => {
  if (!ws || ws.readyState !== 1) return alert("尚未連線");
  ws.send(JSON.stringify({ type: "START_GAME" }));
};
$("btnShuffle").onclick = () => {
  if (!ws || ws.readyState !== 1) return alert("尚未連線");
  ws.send(JSON.stringify({ type: "SHUFFLE_DECK" }));
};
$("btnDraw1").onclick = () => {
  if (!ws || ws.readyState !== 1) return alert("尚未連線");
  ws.send(JSON.stringify({ type: "DRAW", count: 1 }));
};
$("btnDraw5").onclick = () => {
  if (!ws || ws.readyState !== 1) return alert("尚未連線");
  ws.send(JSON.stringify({ type: "DRAW", count: 5 }));
};
$("btnSearchDeck").onclick = () => {
  if (!ws || ws.readyState !== 1) return alert("尚未連線");
  ws.send(JSON.stringify({ type: "SEARCH", zone: "DECK" }));
};
$("btnSearchExtra").onclick = () => {
  ws.send(JSON.stringify({ type: "SEARCH", zone: "EXTRA" }));
};
$("btnReset").onclick = () => {
  if (!ws || ws.readyState !== 1) return alert("尚未連線");
  ws.send(JSON.stringify({ type: "RESET" }));
};
$("btnSummonToken").onclick = () => {
  if (!ws || ws.readyState !== 1) return alert("尚未連線");
  const board = $("fieldBoard");
  const x = 20;
  const y = 20;

  ws.send(JSON.stringify({
    type: "SUMMON_TOKEN",
    pos: { x, y },
    faceDown: true
  }));
};
$("btnClearDeck").onclick = () => {
  if (!ws || ws.readyState !== 1) return alert("尚未連線");
  ws.send(JSON.stringify({ type: "CLEAR_DECK" }));
  const sr = $("searchResults"); if (sr) sr.innerHTML = "";
  if (typeof renderHand === "function") renderHand([]);
};
$("btnFlipCoin").onclick = () => {
  if (!ws || ws.readyState !== 1) return alert("尚未連線");
  ws.send(JSON.stringify({ type: "COIN_FLIP" }));
};

function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  function pushField() { row.push(field); field=''; }
  function pushRow() { rows.push(row); row=[]; }
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i+1] === '"') { field += '"'; i += 2; continue; } inQuotes = false; i++; continue; }
      field += ch; i++; continue;
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { pushField(); i++; continue; }
      if (ch === '\n') { pushField(); pushRow(); i++; continue; }
      if (ch === '\r') { i++; continue; }
      field += ch; i++;
    }
  }
  if (field.length || row.length) { pushField(); pushRow(); }
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const rec = {}; const cols = rows[r];
    if (cols.length === 1 && cols[0] === '') continue;
    headers.forEach((h, idx) => rec[h] = (cols[idx] || '').trim());
    out.push(rec);
  }
  return out;
}

function csvToDeck(records) {
  const deck = { main: [], side: [], extra: [] };
  for (const rec of records) {
    const card = { baseId: rec.baseId || rec.id || rec.ID || "", name: rec.name || rec.cardName || rec.CardName || "", img: rec.img || rec.image || rec.Image || "" };
    const t = (rec.deckType || rec.DeckType || "").toLowerCase();
    if (t === "main") deck.main.push(card);
    else if (t === "side") deck.side.push(card);
    else if (t === "extra") deck.extra.push(card);
  }
  return deck;
}

function bindSharedNote() {
  const note = $("sharedNote");
  if (!note) return;
  note.addEventListener("input", () => {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "UPDATE_NOTE", text: note.value }));
  });
}

document.addEventListener("DOMContentLoaded", () => {
    updateConnectionButtons();
});
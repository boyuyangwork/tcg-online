/**
 * TCG Online Server - 單一檔案版本
 * 包含 WebSocket 伺服器、房間管理、牌組和遊戲邏輯。
 * 運行指令: node server.js
 */

const WebSocket = require('ws');

// --- 伺服器配置 ---
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// --- 核心資料結構 ---
const rooms = {}; // 儲存所有房間的狀態: { roomId: { players: {}, zones: {}, counts: {}, names: {}, logs: [], sharedNote: "" } }
const connections = {}; // 儲存 playerId 和 ws 連線的映射

// --- 輔助函數 ---

/** 產生唯一的 ID (簡單版本) */
const generateId = (prefix = 'id') => prefix + Date.now().toString(36) + Math.random().toString(36).substring(2);

/**
 * 發送狀態更新給房間內的所有人（除了排除的玩家）
 * @param {string} roomId
 * @param {string} type - 訊息類型 (e.g., STATE_PATCH)
 * @param {object} payload - 要發送的數據
 * @param {string | null} excludeId - 排除這個 playerId
 */
function broadcast(roomId, type, payload, excludeId = null) {
    const room = rooms[roomId];
    if (!room) return;

    const fullPayload = JSON.stringify({ type, ...payload });

    // 檢查是否有要發送給所有人的通用狀態
    if (type === 'STATE_PATCH') {
        // STATE_PATCH 包含通用狀態，不需要額外封裝
    } else if (type === 'NOTE_UPDATE') {
        // NOTE_UPDATE 只需要發送給所有人
    } else if (type === 'COIN_RESULT') {
        // COIN_RESULT 只需要發送給所有人
    }

    // 取得所有連線，除了排除的 ID
    const recipients = Object.keys(room.players).filter(pid => pid !== excludeId);

    recipients.forEach(playerId => {
        const conn = connections[playerId];
        if (conn && conn.readyState === WebSocket.OPEN) {
            conn.send(fullPayload);
        }
    });
}

/**
 * 發送個人專屬的訊息
 * @param {string} playerId
 * @param {string} type - 訊息類型
 * @param {object} payload - 要發送的數據
 */
function sendToPlayer(playerId, type, payload) {
    const conn = connections[playerId];
    if (conn && conn.readyState === WebSocket.OPEN) {
        conn.send(JSON.stringify({ type, ...payload }));
    }
}

/**
 * 獲取或創建房間
 * @param {string} roomId
 * @returns {object} 房間物件
 */
function getOrCreateRoom(roomId) {
    if (!rooms[roomId]) {
        console.log(`Creating new room: ${roomId}`);
        rooms[roomId] = {
            players: {}, // { playerId: { role: 'PLAYER'/'SPECTATOR', room: roomId } }
            zones: {},   // { playerId: { DECK: [], HAND: [], GRAVE: [], BANISH: [], FIELD: [], EXTRA: [] } }
            counts: {},  // { playerId: { DECK: N, HAND: M, ... } }
            names: {},   // { playerId: name }
            logs: [`房間 ${roomId} 已創建`],
            sharedNote: ""
        };
    }
    return rooms[roomId];
}

/**
 * 將房間狀態廣播給所有玩家 (STATE_PATCH)
 * @param {string} roomId
 */
function publishState(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    // 找出目前房間內所有的 PLAYER 身分 ID
    const activePlayers = Object.keys(room.players).filter(id => room.players[id].role === 'PLAYER');

    // 通用狀態
    const generalPatch = {
        players: activePlayers, // 傳送玩家列表給前端，方便觀戰者判斷誰是誰
        counts: room.counts,
        names: room.names,
        logs: room.logs,
        sharedNote: room.sharedNote,
    };

    // 針對每個連線發送個人化的 STATE_PATCH
    Object.keys(room.players).forEach(connId => {
        const conn = connections[connId];
        if (!conn || conn.readyState !== WebSocket.OPEN) return;

        const role = room.players[connId].role;
        const personalZones = {};

        if (role === 'SPECTATOR') {
            // *** 修改點：觀戰者需要看到所有 PLAYER 的 FIELD 區 ***
            activePlayers.forEach(pid => {
                if (room.zones[pid]) {
                    personalZones[pid] = { FIELD: room.zones[pid].FIELD };
                }
            });
        } else {
            // *** 原本邏輯：玩家看到自己(全部) + 對手(FIELD) ***
            Object.keys(room.zones).forEach(ownerId => {
                if (ownerId === connId) {
                    // 自己的區域 (包含 FIELD)
                    personalZones[ownerId] = { FIELD: room.zones[ownerId].FIELD, DECK: room.zones[ownerId].DECK, HAND: room.zones[ownerId].HAND, GRAVE: room.zones[ownerId].GRAVE, BANISH: room.zones[ownerId].BANISH, EXTRA: room.zones[ownerId].EXTRA, SIDE: room.zones[ownerId].SIDE };
                } else {
                    // 對手的區域 (只看 FIELD)
                    personalZones[ownerId] = { FIELD: room.zones[ownerId].FIELD };
                }
            });
        }

        const patch = { ...generalPatch, zones: personalZones };
        sendToPlayer(connId, 'STATE_PATCH', { patch });
    });

    // 針對每個玩家發送個人化的 HAND_UPDATE
    Object.keys(room.players).forEach(playerId => {
        if (room.players[playerId].role === 'PLAYER') {
            sendToPlayer(playerId, 'HAND_UPDATE', {
                player: playerId,
                cards: room.zones[playerId].HAND || []
            });
        }
    });
}

/**
 * 記錄日誌並通知房間
 * @param {string} roomId
 * @param {string} message
 */
function logRoomAction(roomId, message) {
    const room = rooms[roomId];
    if (!room) return;
    const timestamp = new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const fullMessage = `[${timestamp}] ${message}`;
    room.logs.push(fullMessage);
    if (room.logs.length > 50) room.logs.shift(); // 保持日誌長度
    console.log(`Room ${roomId} Log: ${fullMessage}`);
    publishState(roomId);
}

// --- 遊戲邏輯 ---

/**
 * 獲取玩家牌庫區的引用
 * @param {string} roomId
 * @param {string} playerId
 * @param {string} zoneName - 'DECK', 'HAND', 'GRAVE', 'BANISH', 'FIELD', 'EXTRA'
 * @returns {Array | null}
 */
function getPlayerZone(roomId, playerId, zoneName) {
    const room = rooms[roomId];
    if (!room || !room.zones[playerId]) return null;
    return room.zones[playerId][zoneName];
}

/**
 * 更新玩家卡片計數
 * @param {object} room
 * @param {string} playerId
 */
function updateCardCounts(room, playerId) {
    const zones = room.zones[playerId];
    room.counts[playerId] = {};
    for (const zone in zones) {
        room.counts[playerId][zone] = zones[zone].length;
    }
}

/**
 * 洗牌 (Fisher-Yates)
 * @param {Array} array
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

/**
 * 執行卡片移動
 * @param {string} roomId
 * @param {string} playerId
 * @param {string} fromZone
 * @param {string} toZone
 * @param {string} cardId
 * @param {boolean} [faceDown] - 僅當 toZone 為 'FIELD' 時有效
 * @param {object} [pos] - 僅當 toZone 為 'FIELD' 時有效
 * @param {boolean} [toBottom=false] - 僅當 toZone 為 'DECK' 或 'EXTRA' 時有效
 * @returns {boolean} 是否成功移動
 */
function moveCard(roomId, playerId, fromZone, toZone, cardId, faceDown, pos, toBottom = false) {
    const room = rooms[roomId];
    if (!room || !room.zones[playerId]) return false;

    const fromArr = getPlayerZone(roomId, playerId, fromZone);
    const toArr = getPlayerZone(roomId, playerId, toZone);

    if (!fromArr || !toArr) return false;

    const cardIndex = fromArr.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return false;

    const [card] = fromArr.splice(cardIndex, 1);

    // 處理卡片狀態變化
    card.tapped = false; // 重置橫置狀態

    if (toZone === 'FIELD') {
        card.pos = pos;
        card.faceDown = faceDown !== undefined ? faceDown : (card.faceDown || false);
    } else {
        card.pos = undefined;
        card.faceDown = false; // 離開場地，通常都是正面
        if (toZone === 'DECK' || toZone === 'EXTRA') {
            card.faceDown = true; // 進入牌組/額外牌組通常視為蓋牌
        }
    }

    if (toZone === 'DECK' && toBottom) {
        toArr.unshift(card); // 牌組底部
    } else {
        toArr.push(card); // 其他情況通常是加入末尾 (如墓地、手牌) 或牌組頂部
    }

    updateCardCounts(room, playerId);
    return true;
}

/**
 * 處理玩家的訊息
 * @param {string} playerId
 * @param {string} roomId
 * @param {object} message
 */
function handleMessage(playerId, roomId, message) {
    const room = rooms[roomId];
    const playerName = room.names[playerId];
    if (!room || !playerName) return;

    if (room.players[playerId].role !== 'PLAYER' && message.type !== 'UPDATE_NOTE') {
        // 觀戰者不能執行遊戲操作
        console.log(`Spectator ${playerId} attempted action: ${message.type}`);
        return;
    }

    switch (message.type) {
        case 'MOVE_CARD': {
            const { from, to, cardId, pos, faceDown, toBottom } = message;
            const success = moveCard(roomId, playerId, from, to, cardId, faceDown, pos, toBottom);
            if (success) {
                let logMsg = `${playerName} 將卡片從 ${from} 移動到 ${to}`;
                if (to === 'FIELD' && faceDown) logMsg += " (蓋牌)";
                logRoomAction(roomId, logMsg);
            }
            break;
        }
        case 'SET_TAP': {
            const { cardId, tapped } = message;
            const field = getPlayerZone(roomId, playerId, 'FIELD');
            const card = field?.find(c => c.id === cardId);
            if (card) {
                card.tapped = tapped;
                logRoomAction(roomId, `${playerName} ${tapped ? '橫置' : '直立'} 一張場地上的卡片`);
                publishState(roomId);
            }
            break;
        }
        case 'SHUFFLE_DECK': {
            const deck = getPlayerZone(roomId, playerId, 'DECK');
            if (deck) {
                shuffleArray(deck);
                logRoomAction(roomId, `${playerName} 洗牌了。`);
            }
            break;
        }
        case 'DRAW': {
            const { count } = message;
            const deck = getPlayerZone(roomId, playerId, 'DECK');
            const hand = getPlayerZone(roomId, playerId, 'HAND');
            let drawnCount = 0;
            if (deck && hand) {
                for (let i = 0; i < count && deck.length > 0; i++) {
                    const card = deck.pop();
                    card.faceDown = false; // 抽到手牌時，通常會正面顯示給玩家
                    hand.push(card);
                    drawnCount++;
                }
                updateCardCounts(room, playerId);
                if (drawnCount > 0) {
                    logRoomAction(roomId, `${playerName} 抽了 ${drawnCount} 張牌。`);
                }
            }
            break;
        }
        case 'START_GAME': {
            // 洗牌
            const deck = getPlayerZone(roomId, playerId, 'DECK');
            if (deck) shuffleArray(deck);

            // 抽 5 張
            const hand = getPlayerZone(roomId, playerId, 'HAND');
            let drawnCount = 0;
            if (deck && hand) {
                for (let i = 0; i < 5 && deck.length > 0; i++) {
                    const card = deck.pop();
                    card.faceDown = false;
                    hand.push(card);
                    drawnCount++;
                }
                updateCardCounts(room, playerId);
                if (drawnCount > 0) {
                    logRoomAction(roomId, `${playerName} 開始遊戲，洗牌並抽取了 ${drawnCount} 張起手牌。`);
                }
            }
            break;
        }
        case 'IMPORT_DECK': {
            const { main, side, extra } = message;
            const zones = room.zones[playerId];

            // 重置所有區
            zones.DECK.length = 0;
            zones.SIDE.length = 0;
            zones.EXTRA.length = 0;
            zones.HAND.length = 0;
            zones.GRAVE.length = 0;
            zones.BANISH.length = 0;
            zones.FIELD.length = 0;

            // 匯入主牌組 (Deck) - 牌組中的卡片預設為蓋牌
            main.forEach(cardData => {
                zones.DECK.push({
                    id: generateId('c'),
                    baseId: cardData.baseId,
                    name: cardData.name,
                    img: cardData.img,
                    faceDown: true,
                    tapped: false
                });
            });
            // 匯入額外牌組 (Extra) - 額外牌組中的卡片預設為蓋牌
            extra.forEach(cardData => {
                zones.EXTRA.push({
                    id: generateId('c'),
                    baseId: cardData.baseId,
                    name: cardData.name,
                    img: cardData.img,
                    faceDown: true,
                    tapped: false
                });
            });
            // 匯入備牌 (Side) - 備牌區中的卡片預設為正面
            side.forEach(cardData => {
                zones.SIDE.push({
                    id: generateId('c'),
                    baseId: cardData.baseId,
                    name: cardData.name,
                    img: cardData.img,
                    faceDown: false,
                    tapped: false
                });
            });

            // 預設洗牌主牌組
            shuffleArray(zones.DECK);
            updateCardCounts(room, playerId);
            logRoomAction(roomId, `${playerName} 匯入了牌組 (主牌: ${main.length}, 額外: ${extra.length}, 備牌: ${side.length})。`);
            break;
        }
        case 'CLEAR_DECK': {
            const zones = room.zones[playerId];
            for (const zone in zones) {
                zones[zone].length = 0; // 清空所有區域
            }
            updateCardCounts(room, playerId);
            logRoomAction(roomId, `${playerName} 清空了所有遊戲區域。`);
            break;
        }
        case 'RESET': {
            const zones = room.zones[playerId];
            if (zones) {
                const allCards = [
                    ...zones.HAND,
                    ...zones.GRAVE,
                    ...zones.BANISH,
                    ...zones.FIELD,
                    ...zones.SIDE, // 假設 Side 也重置回牌組
                    ...zones.EXTRA // 額外牌組重置回 EXTRA 區
                ];
                zones.HAND.length = 0;
                zones.GRAVE.length = 0;
                zones.BANISH.length = 0;
                zones.FIELD.length = 0;
                zones.SIDE.length = 0;

                allCards.forEach(card => {
                    card.tapped = false;
                    card.pos = undefined;
                    card.faceDown = true;
                    if (zones.EXTRA.includes(card)) {
                        // 額外牌組卡片留在 EXTRA 區
                    } else {
                        // 其他卡片移回 DECK
                        zones.DECK.push(card);
                    }
                });

                shuffleArray(zones.DECK);
                updateCardCounts(room, playerId);
                logRoomAction(roomId, `${playerName} 執行了重置操作（所有卡片洗回牌組/額外牌組）。`);
            }
            break;
        }
        case 'SEARCH': {
            const { zone } = message; // zone: 'DECK' 或 'EXTRA'
            const searchZone = getPlayerZone(roomId, playerId, zone);

            if (searchZone) {
                // 發送該區域的完整卡片列表給玩家
                sendToPlayer(playerId, 'SEARCH_RESULT', {
                    zone: zone,
                    cards: searchZone.map(c => ({
                        id: c.id,
                        baseId: c.baseId,
                        name: c.name,
                        img: c.img
                    }))
                });
                logRoomAction(roomId, `${playerName} 檢視了 ${zone} 區域。`);
            }
            break;
        }
        case 'SUMMON_TOKEN': {
            const { pos } = message;
            const field = getPlayerZone(roomId, playerId, 'FIELD');

            const tokenCard = {
                id: generateId('t'),
                baseId: 'TOKEN',
                name: 'Token',
                img: 'https://via.placeholder.com/80x120/000000/FFFFFF?text=TOKEN', // 預設圖片
                faceDown: false,
                tapped: false,
                pos: pos
            };
            if (field) {
                field.push(tokenCard);
                updateCardCounts(room, playerId);
                logRoomAction(roomId, `${playerName} 召喚了一個 Token。`);
            }
            break;
        }
        case 'UPDATE_NOTE': {
            const { text } = message;
            if (room.sharedNote !== text) {
                room.sharedNote = text;
                logRoomAction(roomId, `${playerName} 更新了房間記事。`); // 記事更新也要通知
                // 記事更新使用單獨的 UPDATE_NOTE 類型，避免頻繁的 STATE_PATCH
                broadcast(roomId, 'NOTE_UPDATE', { text: room.sharedNote }, playerId);
            }
            break;
        }
        case 'COIN_FLIP': {
            const result = Math.random() < 0.5 ? 'HEADS' : 'TAILS';
            logRoomAction(roomId, `${playerName} 擲硬幣結果：${result === 'HEADS' ? '正面' : '反面'}！`);
            broadcast(roomId, 'COIN_RESULT', { side: result });
            break;
        }
        default:
            console.log(`Unknown message type: ${message.type}`);
    }
    publishState(roomId);
}

// --- WebSocket 伺服器主體 ---
wss.on('connection', (ws) => {
    const newPlayerId = generateId('p');
    connections[newPlayerId] = ws;
    let currentRoomId = null;

    console.log(`New client connected. Assigned ID: ${newPlayerId}`);

    // 發送初始 ID
    ws.send(JSON.stringify({ type: 'HELLO', playerId: newPlayerId }));

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error("Invalid JSON received:", message);
            return;
        }

        if (data.type === 'JOIN_ROOM') {
            const { roomId, role, name } = data;
            if (currentRoomId) {
                // 離開舊房間 (簡單處理，不處理複雜的房間轉換)
                delete rooms[currentRoomId].players[newPlayerId];
                if (rooms[currentRoomId].players.length === 0) {
                    // 如果房間為空，可以考慮刪除房間 (這裡暫時保留)
                    // delete rooms[currentRoomId];
                }
                currentRoomId = null;
            }

            currentRoomId = roomId;
            const room = getOrCreateRoom(roomId);

            if (role === 'PLAYER') {
                // 計算目前房間內已經有多少個 PLAYER
                const currentPlayerCount = Object.values(room.players).filter(p => p.role === 'PLAYER').length;
                
                if (currentPlayerCount >= 2) {
                    // 發送錯誤訊息給該連線
                    ws.send(JSON.stringify({ 
                        type: 'ERROR', 
                        message: `房間 ${roomId} 玩家人數已滿 (2人)，請改選「觀戰」身分或更換房間。` 
                    }));
                    // 重置 currentRoomId 避免後續誤判
                    currentRoomId = null;
                    return; // 終止後續加入流程
                }
            }

            // 設置玩家資訊
            room.players[newPlayerId] = { role: role || 'PLAYER', room: roomId };
            room.names[newPlayerId] = name || newPlayerId;

            // 初始化玩家區域（如果不存在）
            if (!room.zones[newPlayerId]) {
                room.zones[newPlayerId] = {
                    DECK: [], HAND: [], GRAVE: [], BANISH: [], FIELD: [], EXTRA: [], SIDE: []
                };
            }
            updateCardCounts(room, newPlayerId); // 初始計數
            
            logRoomAction(roomId, `${name || '匿名玩家'} (${role}) 加入了房間。`);
            publishState(roomId);

        } else if (currentRoomId) {
            handleMessage(newPlayerId, currentRoomId, data);
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected: ${newPlayerId}`);

        if (currentRoomId && rooms[currentRoomId]) {
            const room = rooms[currentRoomId];
            const playerName = room.names[newPlayerId] || newPlayerId;

            delete room.players[newPlayerId];
            // 觀戰者或玩家離開時，日誌記錄
            logRoomAction(currentRoomId, `${playerName} 離開了房間。`);

            // 如果房間內沒有任何玩家或觀戰者，刪除房間
            if (Object.keys(room.players).length === 0) {
                delete rooms[currentRoomId];
                console.log(`Room ${currentRoomId} is empty and deleted.`);
            } else {
                publishState(currentRoomId);
            }
        }
        delete connections[newPlayerId];
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for ${newPlayerId}:`, error);
    });
});

console.log(`TCG Online MVP Server running on ws://localhost:${PORT}`);
console.log('Press Ctrl+C to stop the server.');
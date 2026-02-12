const SAVE_KEY = 'stronghold_web_rts_save_v3';
const DEFAULT_RESOURCES = Object.freeze({ wood: 1000, stone: 1000, food: 1000, gold: 1000 });

const START_POSITIONS = [
    { x: 5, y: 5 },
    { x: 34, y: 34 },
    { x: 34, y: 5 },
    { x: 5, y: 34 }
];

const PLAYER_COLORS = ['#89c9ff', '#ff8e8e', '#ffe08a', '#d5a2ff'];

function createImage(path, fallbackPath = null) {
    const img = new Image();
    img.src = path;
    if (fallbackPath) {
        img.onerror = () => {
            img.src = fallbackPath;
        };
    }
    return img;
}

const assets = {
    units: {
        villager: createImage('assets/units/villager.png', 'assets/units/soldier.png'),
        swordsman: createImage('assets/units/swordsman.png', 'assets/units/soldier.png')
    },
    buildings: {
        house: createImage('assets/buildings/house2.png', 'assets/buildings/house.png'),
        farm: createImage('assets/buildings/farm.png', 'assets/buildings/house.png'),
        barracks: createImage('assets/buildings/barracks.png', 'assets/buildings/house.png'),
        town_center: createImage('assets/buildings/town_center.png', 'assets/buildings/house.png')
    }
};

function cloneResources(resources) {
    return {
        wood: resources.wood,
        stone: resources.stone,
        food: resources.food,
        gold: resources.gold
    };
}

function normalizeResources(resources) {
    if (!resources || typeof resources !== 'object') {
        return cloneResources(DEFAULT_RESOURCES);
    }
    return {
        wood: Number.isFinite(resources.wood) ? resources.wood : DEFAULT_RESOURCES.wood,
        stone: Number.isFinite(resources.stone) ? resources.stone : DEFAULT_RESOURCES.stone,
        food: Number.isFinite(resources.food) ? resources.food : DEFAULT_RESOURCES.food,
        gold: Number.isFinite(resources.gold) ? resources.gold : DEFAULT_RESOURCES.gold
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function distanceSquared(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return (dx * dx) + (dy * dy);
}

function formatResource(value) {
    return Math.max(0, Math.floor(value)).toString();
}

class RTSGame {
    constructor(config = {}) {
        this.mode = config.mode || 'pve';
        this.botCount = Number.isFinite(config.botCount) ? config.botCount : 2;
        this.assets = assets;

        this.viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };

        this.rotation = 0;
        this.camera = { x: 0, y: 0 };
        this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, inside: true };
        this.moveKeys = { up: false, down: false, left: false, right: false };

        this.paused = false;
        this.ended = false;

        this.selectedUnits = new Set();
        this.selectedBuildingId = null;
        this.pendingBuildType = null;
        this.hoveredTile = null;

        this.drag = {
            active: false,
            startX: 0,
            startY: 0,
            endX: 0,
            endY: 0
        };

        this.statusText = 'Команда принята.';
        this.statusTimer = 0;

        this.economyTimer = 0;

        this.activeCommanderId = 0;
        this.initialGrantApplied = false;

        if (config.saveData) {
            this.loadFromData(config.saveData);
        } else {
            this.map = new GameMap(40, 40);
            this.units = new UnitManager();
            this.buildings = new BuildingManager();
            this.players = this.createPlayers(this.mode, this.botCount);
            this.spawnStartingState();
        }

        this.applyInitialResourceGrant();
        this.recalculatePopulationAll();
        this.centerCameraOnPlayer(this.activeCommanderId);
    }

    applyInitialResourceGrant() {
        if (this.initialGrantApplied) {
            return;
        }

        if (!Array.isArray(this.players) || this.players.length === 0) {
            this.players = this.createPlayers(this.mode, this.botCount);
        }

        for (const player of this.players) {
            player.resources = normalizeResources(player.resources);
            player.resources.wood = Math.max(player.resources.wood, DEFAULT_RESOURCES.wood);
            player.resources.stone = Math.max(player.resources.stone, DEFAULT_RESOURCES.stone);
            player.resources.food = Math.max(player.resources.food, DEFAULT_RESOURCES.food);
            player.resources.gold = Math.max(player.resources.gold, DEFAULT_RESOURCES.gold);
        }

        if (!Number.isInteger(this.activeCommanderId) || !this.players[this.activeCommanderId]) {
            this.activeCommanderId = 0;
        }

        this.initialGrantApplied = true;
    }

    createPlayers(mode, botCount) {
        const players = [];
        players.push({
            id: 0,
            name: 'Игрок 1',
            color: PLAYER_COLORS[0],
            isHuman: true,
            isBot: false,
            base: { x: 0, y: 0 },
            resources: cloneResources(DEFAULT_RESOURCES),
            pop: 0,
            popCap: 0,
            ai: { thinkCooldown: 0, attackCooldown: 5 }
        });

        if (mode === 'pvp') {
            players.push({
                id: 1,
                name: 'Игрок 2',
                color: PLAYER_COLORS[1],
                isHuman: true,
                isBot: false,
                base: { x: 0, y: 0 },
                resources: cloneResources(DEFAULT_RESOURCES),
                pop: 0,
                popCap: 0,
                ai: { thinkCooldown: 0, attackCooldown: 5 }
            });
            return players;
        }

        const bots = clamp(botCount || 1, 1, 3);
        for (let i = 0; i < bots; i += 1) {
            const id = players.length;
            players.push({
                id,
                name: `Бот ${i + 1}`,
                color: PLAYER_COLORS[id % PLAYER_COLORS.length],
                isHuman: false,
                isBot: true,
                base: { x: 0, y: 0 },
                resources: cloneResources(DEFAULT_RESOURCES),
                pop: 0,
                popCap: 0,
                ai: {
                    thinkCooldown: 0.4 + Math.random() * 0.8,
                    attackCooldown: 5 + Math.random() * 3
                }
            });
        }

        return players;
    }

    spawnStartingState() {
        for (let i = 0; i < this.players.length; i += 1) {
            const player = this.players[i];
            const position = START_POSITIONS[i % START_POSITIONS.length];

            player.base = { x: position.x, y: position.y };

            this.buildings.spawn(player.id, 'town_center', position.x, position.y);

            this.units.spawn(player.id, 'villager', position.x + 0.9, position.y + 0.2);
            this.units.spawn(player.id, 'villager', position.x - 0.3, position.y + 0.8);
            this.units.spawn(player.id, 'swordsman', position.x + 0.5, position.y - 0.6);
        }
    }

    loadFromData(data) {
        const hasCore = data && typeof data === 'object' && data.map && data.units && data.buildings;
        if (!hasCore) {
            this.mode = 'pve';
            this.botCount = 2;
            this.rotation = 0;
            this.camera = { x: 0, y: 0 };
            this.map = new GameMap(40, 40);
            this.units = new UnitManager();
            this.buildings = new BuildingManager();
            this.players = this.createPlayers(this.mode, this.botCount);
            this.spawnStartingState();
            this.activeCommanderId = 0;
            return;
        }

        this.mode = data.mode || 'pve';
        this.botCount = data.botCount || 2;
        this.rotation = data.rotation || 0;
        this.camera = data.camera || { x: 0, y: 0 };
        this.players = data.players || this.createPlayers(this.mode, this.botCount);
        this.activeCommanderId = data.activeCommanderId || 0;

        this.map = GameMap.fromData(data.map);
        this.units = UnitManager.fromData(data.units);
        this.buildings = BuildingManager.fromData(data.buildings);

        if (!Array.isArray(this.players) || this.players.length === 0) {
            this.players = this.createPlayers(this.mode, this.botCount);
        }

        for (const player of this.players) {
            player.resources = normalizeResources(player.resources);
        }
    }

    serialize() {
        return {
            version: 2,
            createdAt: Date.now(),
            mode: this.mode,
            botCount: this.botCount,
            rotation: this.rotation,
            camera: this.camera,
            players: this.players.map((player) => ({
                ...player,
                resources: cloneResources(player.resources),
                base: { ...player.base },
                ai: { ...player.ai }
            })),
            activeCommanderId: this.activeCommanderId,
            map: this.map.serialize(),
            units: this.units.serialize(),
            buildings: this.buildings.serialize()
        };
    }

    saveToLocalStorage() {
        const payload = this.serialize();
        localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
        this.setStatus('Игра сохранена локально.');
    }

    static tryLoadFromLocalStorage() {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) {
            return null;
        }

        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    centerCameraOnPlayer(playerId) {
        const player = this.players[playerId];
        if (!player) {
            return;
        }
        this.centerCameraOn(player.base.x, player.base.y);
    }

    centerCameraOn(worldX, worldY) {
        const rotated = this.map.rotatePoint(worldX, worldY, this.rotation);
        this.camera.x = -((rotated.x - rotated.y) * (this.map.tileWidth / 2));
        this.camera.y = -((rotated.x + rotated.y) * (this.map.tileHeight / 2)) + this.viewport.height * 0.12;
    }

    worldToScreen(worldX, worldY) {
        return this.map.project(worldX, worldY, this.camera, this.viewport, this.rotation);
    }

    screenToTile(screenX, screenY) {
        return this.map.screenToTile(screenX, screenY, this.camera, this.viewport, this.rotation);
    }

    setStatus(text, seconds = 2.6) {
        this.statusText = text;
        this.statusTimer = seconds;
    }

    setPaused(nextPaused) {
        this.paused = nextPaused;
        if (this.paused) {
            this.resetMoveKeys();
        }
        this.setStatus(this.paused ? 'Пауза' : 'Игра продолжается');
    }

    togglePause() {
        this.setPaused(!this.paused);
    }

    rotate(delta) {
        this.rotation = (this.rotation + delta + 4) % 4;
        this.centerCameraOnPlayer(this.activeCommanderId);
    }

    getCommanderId() {
        return this.mode === 'pvp' ? this.activeCommanderId : 0;
    }

    switchCommander() {
        if (this.mode !== 'pvp') {
            return;
        }

        const humans = this.players.filter((player) => player.isHuman);
        if (humans.length < 2) {
            return;
        }

        this.activeCommanderId = this.activeCommanderId === humans[0].id ? humans[1].id : humans[0].id;
        this.selectedUnits.clear();
        this.selectedBuildingId = null;
        this.pendingBuildType = null;
        this.centerCameraOnPlayer(this.activeCommanderId);
        this.setStatus(`Активный игрок: ${this.players[this.activeCommanderId].name}`);
    }

    updateViewport(width, height) {
        this.viewport.width = width;
        this.viewport.height = height;
    }

    update(dt) {
        this.applyInitialResourceGrant();

        if (this.statusTimer > 0) {
            this.statusTimer = Math.max(0, this.statusTimer - dt);
        }

        if (this.paused || this.ended) {
            return;
        }

        this.updateKeyboardScroll(dt);
        this.updateEdgeScroll(dt);

        this.economyTimer += dt;
        while (this.economyTimer >= 1) {
            this.economyTimer -= 1;
            this.applyEconomyTick();
        }

        this.updateBots(dt);

        this.units.update(dt, this);
        this.buildings.update();

        this.recalculatePopulationAll();
        this.cleanupSelection();
        this.checkVictory();

        if (this.pendingBuildType) {
            this.hoveredTile = this.screenToTile(this.mouse.x, this.mouse.y);
        }
    }

    updateEdgeScroll(dt) {
        if (!this.mouse.inside) {
            return;
        }

        const margin = 28;
        const speed = 860;

        if (this.mouse.x <= margin) {
            this.camera.x += speed * dt;
        }
        if (this.mouse.x >= this.viewport.width - margin) {
            this.camera.x -= speed * dt;
        }
        if (this.mouse.y <= margin) {
            this.camera.y += speed * dt;
        }
        if (this.mouse.y >= this.viewport.height - margin) {
            this.camera.y -= speed * dt;
        }
    }

    updateKeyboardScroll(dt) {
        const speed = 940;

        if (this.moveKeys.left) {
            this.camera.x += speed * dt;
        }
        if (this.moveKeys.right) {
            this.camera.x -= speed * dt;
        }
        if (this.moveKeys.up) {
            this.camera.y += speed * dt;
        }
        if (this.moveKeys.down) {
            this.camera.y -= speed * dt;
        }
    }

    setMoveKey(code, nextPressed) {
        if (code === 'KeyW' || code === 'ArrowUp') {
            this.moveKeys.up = nextPressed;
        }
        if (code === 'KeyS' || code === 'ArrowDown') {
            this.moveKeys.down = nextPressed;
        }
        if (code === 'KeyA' || code === 'ArrowLeft') {
            this.moveKeys.left = nextPressed;
        }
        if (code === 'KeyD' || code === 'ArrowRight') {
            this.moveKeys.right = nextPressed;
        }
    }

    setMoveKeyByKeyValue(keyValue, nextPressed) {
        if (keyValue === 'w' || keyValue === 'ц') {
            this.moveKeys.up = nextPressed;
        }
        if (keyValue === 's' || keyValue === 'ы') {
            this.moveKeys.down = nextPressed;
        }
        if (keyValue === 'a' || keyValue === 'ф') {
            this.moveKeys.left = nextPressed;
        }
        if (keyValue === 'd' || keyValue === 'в') {
            this.moveKeys.right = nextPressed;
        }
    }

    resetMoveKeys() {
        this.moveKeys.up = false;
        this.moveKeys.down = false;
        this.moveKeys.left = false;
        this.moveKeys.right = false;
    }

    recalculatePopulationAll() {
        for (const player of this.players) {
            const buildings = this.buildings.getBuildingsForOwner(player.id);
            const units = this.units.getUnitsForOwner(player.id);

            let popCap = 0;
            let pop = 0;

            for (const building of buildings) {
                popCap += BUILDING_TYPES[building.type].popCap;
            }
            for (const unit of units) {
                pop += UNIT_TYPES[unit.type].pop;
            }

            player.popCap = popCap;
            player.pop = pop;
        }
    }

    cleanupSelection() {
        for (const id of this.selectedUnits) {
            const unit = this.units.getById(id);
            if (!unit || !unit.isAlive()) {
                this.selectedUnits.delete(id);
            }
        }

        if (this.selectedBuildingId !== null) {
            const building = this.buildings.getById(this.selectedBuildingId);
            if (!building || !building.isAlive()) {
                this.selectedBuildingId = null;
            }
        }
    }

    applyEconomyTick() {
        for (const player of this.players) {
            const buildings = this.buildings.getBuildingsForOwner(player.id);
            const units = this.units.getUnitsForOwner(player.id);

            let incomeWood = 0;
            let incomeStone = 0;
            let incomeFood = 0;
            let incomeGold = 0;

            for (const building of buildings) {
                const income = BUILDING_TYPES[building.type].income;
                incomeWood += income.wood;
                incomeStone += income.stone;
                incomeFood += income.food;
                incomeGold += income.gold;
            }

            for (const unit of units) {
                if (unit.type === 'villager') {
                    incomeWood += 0.85;
                    incomeFood += 0.2;
                }
                if (unit.type === 'swordsman') {
                    incomeGold -= 0.12;
                }
            }

            player.resources.wood = clamp(player.resources.wood + incomeWood, 0, 99999);
            player.resources.stone = clamp(player.resources.stone + incomeStone, 0, 99999);
            player.resources.food = clamp(player.resources.food + incomeFood, 0, 99999);
            player.resources.gold = clamp(player.resources.gold + incomeGold, 0, 99999);
        }
    }

    canAfford(playerId, cost) {
        if (!cost) {
            return true;
        }
        const resources = this.players[playerId].resources;
        return resources.wood >= cost.wood
            && resources.stone >= cost.stone
            && resources.food >= cost.food
            && resources.gold >= cost.gold;
    }

    spendResources(playerId, cost) {
        if (!cost) {
            return true;
        }

        if (!this.canAfford(playerId, cost)) {
            return false;
        }

        const resources = this.players[playerId].resources;
        resources.wood -= cost.wood;
        resources.stone -= cost.stone;
        resources.food -= cost.food;
        resources.gold -= cost.gold;
        return true;
    }

    canPlaceBuilding(playerId, type, x, y) {
        void playerId;
        void type;

        if (!this.map.isInside(x, y)) {
            return false;
        }

        if (this.buildings.getAt(x, y)) {
            return false;
        }
        return true;
    }

    tryPlaceBuilding(playerId, type, x, y, silent = false) {
        const definition = BUILDING_TYPES[type];

        if (!this.canPlaceBuilding(playerId, type, x, y)) {
            if (!silent) {
                this.setStatus('Нельзя строить в этой точке.');
            }
            return false;
        }

        if (!this.spendResources(playerId, definition.cost)) {
            if (!silent) {
                this.setStatus('Недостаточно ресурсов для постройки.');
            }
            return false;
        }

        this.buildings.spawn(playerId, type, x, y);
        this.recalculatePopulationAll();

        if (!silent) {
            this.setStatus(`Построено: ${definition.label}`);
        }
        return true;
    }

    toggleBuildMode(type) {
        this.pendingBuildType = this.pendingBuildType === type ? null : type;
        this.selectedBuildingId = null;
        this.selectedUnits.clear();

        if (this.pendingBuildType) {
            this.setStatus(`Режим строительства: ${BUILDING_TYPES[type].label}`);
        } else {
            this.setStatus('Режим строительства отключен.');
        }
    }

    tryBuildAtScreen(screenX, screenY) {
        if (!this.pendingBuildType) {
            return;
        }

        let tile = this.screenToTile(screenX, screenY);
        if (!tile) {
            tile = this.screenToTile(this.viewport.width / 2, this.viewport.height / 2);
        }
        if (!tile) {
            const playerBase = this.players[this.getCommanderId()]?.base;
            if (playerBase) {
                tile = { x: Math.round(playerBase.x + 2), y: Math.round(playerBase.y + 2) };
            }
        }
        if (!tile) {
            this.setStatus('Не удалось определить клетку для строительства.');
            return;
        }

        const playerId = this.getCommanderId();
        const placed = this.tryPlaceBuilding(playerId, this.pendingBuildType, tile.x, tile.y);
        if (placed) {
            this.pendingBuildType = null;
        }
    }

    hasProducerForUnit(playerId, unitType) {
        const ownBuildings = this.buildings.getBuildingsForOwner(playerId);
        return ownBuildings.some((building) => BUILDING_TYPES[building.type].train.includes(unitType));
    }

    findSpawnPointNear(x, y) {
        for (let radius = 1; radius <= 5; radius += 1) {
            for (let oy = -radius; oy <= radius; oy += 1) {
                for (let ox = -radius; ox <= radius; ox += 1) {
                    const tx = Math.round(x + ox);
                    const ty = Math.round(y + oy);

                    if (!this.map.isInside(tx, ty)) {
                        continue;
                    }
                    if (this.buildings.getAt(tx, ty)) {
                        continue;
                    }

                    let occupied = false;
                    for (const unit of this.units.units) {
                        if (distanceSquared(unit.x, unit.y, tx, ty) < 0.35) {
                            occupied = true;
                            break;
                        }
                    }
                    if (occupied) {
                        continue;
                    }

                    return { x: tx + 0.2, y: ty + 0.2 };
                }
            }
        }

        return null;
    }

    tryTrainUnit(playerId, unitType, silent = false) {
        const definition = UNIT_TYPES[unitType];
        const player = this.players[playerId];

        if (player.pop + definition.pop > player.popCap) {
            if (!silent) {
                this.setStatus('Лимит населения достигнут. Постройте дома.');
            }
            return false;
        }

        if (!this.hasProducerForUnit(playerId, unitType)) {
            if (!silent) {
                this.setStatus('Нет подходящего здания для тренировки юнита.');
            }
            return false;
        }

        if (!this.spendResources(playerId, definition.cost)) {
            if (!silent) {
                this.setStatus('Недостаточно ресурсов для тренировки.');
            }
            return false;
        }

        const producer = this.buildings.getBuildingsForOwner(playerId)
            .find((building) => BUILDING_TYPES[building.type].train.includes(unitType));

        const spawnPoint = this.findSpawnPointNear(producer.x, producer.y);
        if (!spawnPoint) {
            if (!silent) {
                this.setStatus('Нет места для появления юнита рядом со зданием.');
            }
            return false;
        }

        this.units.spawn(playerId, unitType, spawnPoint.x, spawnPoint.y);
        this.recalculatePopulationAll();

        if (!silent) {
            this.setStatus(`Натренирован юнит: ${definition.label}`);
        }

        return true;
    }

    getEntityByRef(ref) {
        if (!ref) {
            return null;
        }

        if (ref.kind === 'unit') {
            return this.units.getById(ref.id);
        }
        if (ref.kind === 'building') {
            return this.buildings.getById(ref.id);
        }
        return null;
    }

    findNearestEnemyEntity(ownerId, x, y, radius) {
        const maxDist2 = radius * radius;
        let best = null;
        let bestDist = Infinity;

        for (const unit of this.units.units) {
            if (unit.ownerId === ownerId || !unit.isAlive()) {
                continue;
            }
            const dist2 = distanceSquared(x, y, unit.x, unit.y);
            if (dist2 <= maxDist2 && dist2 < bestDist) {
                bestDist = dist2;
                best = { kind: 'unit', id: unit.id };
            }
        }

        for (const building of this.buildings.buildings) {
            if (building.ownerId === ownerId || !building.isAlive()) {
                continue;
            }
            const dist2 = distanceSquared(x, y, building.x, building.y);
            if (dist2 <= maxDist2 && dist2 < bestDist) {
                bestDist = dist2;
                best = { kind: 'building', id: building.id };
            }
        }

        return best;
    }

    issueMoveOrder(playerId, tileX, tileY) {
        const selected = [...this.selectedUnits]
            .map((id) => this.units.getById(id))
            .filter((unit) => unit && unit.ownerId === playerId);

        const count = selected.length;
        if (count === 0) {
            return;
        }

        const columns = Math.ceil(Math.sqrt(count));
        const spacing = 0.72;

        for (let i = 0; i < count; i += 1) {
            const unit = selected[i];
            const column = i % columns;
            const row = Math.floor(i / columns);

            const offsetX = (column - (columns - 1) / 2) * spacing;
            const offsetY = row * spacing;

            const tx = clamp(tileX + offsetX, 0, this.map.width - 1);
            const ty = clamp(tileY + offsetY, 0, this.map.height - 1);

            unit.issueMove(tx, ty);
        }
    }

    issueAttackOrder(playerId, targetRef) {
        const selected = [...this.selectedUnits]
            .map((id) => this.units.getById(id))
            .filter((unit) => unit && unit.ownerId === playerId);

        for (const unit of selected) {
            unit.issueAttack(targetRef.kind, targetRef.id);
        }
    }

    selectUnit(unit) {
        this.selectedBuildingId = null;
        this.selectedUnits = new Set([unit.id]);
    }

    clearSelection() {
        this.selectedUnits.clear();
        this.selectedBuildingId = null;
    }

    findEntityAtScreen(screenX, screenY) {
        const unit = this.units.getFirstAtScreen(this, screenX, screenY);
        if (unit) {
            return { kind: 'unit', entity: unit };
        }

        const building = this.buildings.getFirstAtScreen(this, screenX, screenY);
        if (building) {
            return { kind: 'building', entity: building };
        }

        return null;
    }

    handleSingleSelection(screenX, screenY) {
        const playerId = this.getCommanderId();
        const hit = this.findEntityAtScreen(screenX, screenY);

        if (!hit) {
            this.clearSelection();
            return;
        }

        if (hit.kind === 'unit') {
            if (hit.entity.ownerId === playerId) {
                this.selectUnit(hit.entity);
                return;
            }

            if (this.selectedUnits.size > 0) {
                this.issueAttackOrder(playerId, { kind: 'unit', id: hit.entity.id });
                this.setStatus('Атаковать цель.');
            }
            return;
        }

        if (hit.kind === 'building') {
            if (hit.entity.ownerId === playerId) {
                this.selectedUnits.clear();
                this.selectedBuildingId = hit.entity.id;
                return;
            }

            if (this.selectedUnits.size > 0) {
                this.issueAttackOrder(playerId, { kind: 'building', id: hit.entity.id });
                this.setStatus('Атаковать здание.');
            }
            return;
        }
    }

    handleDragSelection() {
        const playerId = this.getCommanderId();
        const minX = Math.min(this.drag.startX, this.drag.endX);
        const maxX = Math.max(this.drag.startX, this.drag.endX);
        const minY = Math.min(this.drag.startY, this.drag.endY);
        const maxY = Math.max(this.drag.startY, this.drag.endY);

        const selected = [];

        for (const unit of this.units.getUnitsForOwner(playerId)) {
            const projected = this.worldToScreen(unit.x, unit.y);
            if (
                projected.x >= minX
                && projected.x <= maxX
                && projected.y >= minY
                && projected.y <= maxY
            ) {
                selected.push(unit.id);
            }
        }

        this.selectedBuildingId = null;
        this.selectedUnits = new Set(selected);

        if (selected.length > 0) {
            this.setStatus(`Выбрано юнитов: ${selected.length}`);
        }
    }

    handleRightClick(screenX, screenY) {
        const playerId = this.getCommanderId();
        if (this.selectedUnits.size === 0) {
            return;
        }

        const hit = this.findEntityAtScreen(screenX, screenY);
        if (hit && hit.entity.ownerId !== playerId) {
            this.issueAttackOrder(playerId, { kind: hit.kind, id: hit.entity.id });
            this.setStatus('Приказ: атаковать.');
            return;
        }

        const tile = this.screenToTile(screenX, screenY);
        if (!tile) {
            return;
        }

        this.issueMoveOrder(playerId, tile.x, tile.y);
        this.setStatus('Приказ: перемещение.');
    }

    handleMouseMove(screenX, screenY) {
        this.mouse.x = screenX;
        this.mouse.y = screenY;
        this.mouse.inside = true;

        if (this.drag.active) {
            this.drag.endX = screenX;
            this.drag.endY = screenY;
        }

        if (this.pendingBuildType) {
            this.hoveredTile = this.screenToTile(screenX, screenY);
        }
    }

    handleMouseLeave() {
        this.mouse.inside = false;
    }

    handleWindowMouseMove(clientX, clientY) {
        this.mouse.x = clientX;
        this.mouse.y = clientY;
        this.mouse.inside = true;
    }

    handleMouseDown(button, screenX, screenY) {
        if (this.paused || this.ended) {
            return;
        }

        if (button === 0) {
            if (this.pendingBuildType) {
                this.tryBuildAtScreen(screenX, screenY);
                return;
            }

            this.drag.active = true;
            this.drag.startX = screenX;
            this.drag.startY = screenY;
            this.drag.endX = screenX;
            this.drag.endY = screenY;
        }
    }

    handleMouseUp(button, screenX, screenY) {
        if (button !== 0 || this.pendingBuildType || !this.drag.active) {
            return;
        }

        const dragDistance = Math.hypot(this.drag.endX - this.drag.startX, this.drag.endY - this.drag.startY);

        if (dragDistance < 8) {
            this.handleSingleSelection(screenX, screenY);
        } else {
            this.handleDragSelection();
        }

        this.drag.active = false;
    }

    handleKeyDown(event) {
        const key = event.key;
        const code = event.code;
        const isRepeat = Boolean(event.repeat);
        const keyLower = key.toLowerCase();

        this.setMoveKey(code, true);
        this.setMoveKeyByKeyValue(keyLower, true);

        if (code === 'KeyQ' && !isRepeat) {
            this.rotate(-1);
        }
        if (code === 'KeyE' && !isRepeat) {
            this.rotate(1);
        }
        if (code === 'Space' && !isRepeat) {
            this.togglePause();
        }
        if ((code === 'Tab' || code === 'KeyT') && this.mode === 'pvp' && !isRepeat) {
            this.switchCommander();
        }
        if (key === 'Escape' && !isRepeat) {
            this.pendingBuildType = null;
            this.drag.active = false;
            this.setStatus('Выход из режима строительства.');
        }

        if (!isRepeat) {
            this.updateKeyboardScroll(0.033);
        }
    }

    handleKeyUp(event) {
        this.setMoveKey(event.code, false);
        this.setMoveKeyByKeyValue(event.key.toLowerCase(), false);
    }

    updateBots(dt) {
        if (this.mode !== 'pve') {
            return;
        }

        for (const player of this.players) {
            if (!player.isBot || !this.playerHasAssets(player.id)) {
                continue;
            }

            player.ai.thinkCooldown -= dt;
            player.ai.attackCooldown -= dt;

            if (player.ai.thinkCooldown <= 0) {
                player.ai.thinkCooldown = 0.8 + Math.random() * 0.8;
                this.runBotLogic(player);
            }
        }
    }

    runBotLogic(player) {
        const playerId = player.id;
        const ownUnits = this.units.getUnitsForOwner(playerId);
        const ownBuildings = this.buildings.getBuildingsForOwner(playerId);

        const villagers = ownUnits.filter((unit) => unit.type === 'villager').length;
        const swordsmen = ownUnits.filter((unit) => unit.type === 'swordsman').length;
        const houses = ownBuildings.filter((building) => building.type === 'house').length;
        const farms = ownBuildings.filter((building) => building.type === 'farm').length;
        const barracks = ownBuildings.filter((building) => building.type === 'barracks').length;

        if (player.pop >= player.popCap - 1) {
            this.tryBotBuildNearBase(player, 'house');
        }

        if (farms < 2) {
            this.tryBotBuildNearBase(player, 'farm');
        }

        if (barracks < 1 && villagers >= 3) {
            this.tryBotBuildNearBase(player, 'barracks');
        }

        if (villagers < 7) {
            this.tryTrainUnit(playerId, 'villager', true);
        }

        if (barracks > 0 && swordsmen < 12 && Math.random() > 0.22) {
            this.tryTrainUnit(playerId, 'swordsman', true);
        }

        if ((swordsmen >= 4 || player.ai.attackCooldown <= 0) && ownUnits.length > 0) {
            const target = this.findPriorityEnemyTarget(playerId);
            if (target) {
                this.issueBotAttack(playerId, target);
                player.ai.attackCooldown = 5 + Math.random() * 4;
            }
        }

        if (houses === 0 && player.popCap < 12) {
            this.tryBotBuildNearBase(player, 'house');
        }
    }

    tryBotBuildNearBase(player, type) {
        const cost = BUILDING_TYPES[type].cost;
        if (!this.canAfford(player.id, cost)) {
            return false;
        }

        const base = player.base;

        for (let attempt = 0; attempt < 28; attempt += 1) {
            const radius = 2 + Math.floor(Math.random() * 7);
            const angle = Math.random() * Math.PI * 2;

            const x = Math.round(base.x + Math.cos(angle) * radius);
            const y = Math.round(base.y + Math.sin(angle) * radius);

            if (this.tryPlaceBuilding(player.id, type, x, y, true)) {
                return true;
            }
        }

        return false;
    }

    findPriorityEnemyTarget(ownerId) {
        let best = null;
        let bestScore = Infinity;

        for (const building of this.buildings.buildings) {
            if (building.ownerId === ownerId || !building.isAlive()) {
                continue;
            }

            const type = building.type;
            const priority = type === 'town_center' ? 0 : 1;
            const score = priority * 1000 + distanceSquared(this.players[ownerId].base.x, this.players[ownerId].base.y, building.x, building.y);

            if (score < bestScore) {
                bestScore = score;
                best = { kind: 'building', id: building.id };
            }
        }

        if (best) {
            return best;
        }

        for (const unit of this.units.units) {
            if (unit.ownerId === ownerId || !unit.isAlive()) {
                continue;
            }

            const score = distanceSquared(this.players[ownerId].base.x, this.players[ownerId].base.y, unit.x, unit.y);
            if (score < bestScore) {
                bestScore = score;
                best = { kind: 'unit', id: unit.id };
            }
        }

        return best;
    }

    issueBotAttack(ownerId, targetRef) {
        for (const unit of this.units.getUnitsForOwner(ownerId)) {
            if (unit.type === 'swordsman') {
                unit.issueAttack(targetRef.kind, targetRef.id);
            }
        }
    }

    playerHasAssets(playerId) {
        return this.units.getUnitsForOwner(playerId).length > 0
            || this.buildings.getBuildingsForOwner(playerId).length > 0;
    }

    checkVictory() {
        const alivePlayers = this.players.filter((player) => this.playerHasAssets(player.id));

        if (alivePlayers.length <= 1 && !this.ended) {
            this.ended = true;
            this.paused = true;

            if (alivePlayers.length === 1) {
                this.setStatus(`Победа: ${alivePlayers[0].name}`, 8);
            } else {
                this.setStatus('Ничья', 8);
            }
        }
    }

    render(ctx) {
        ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);

        const gradient = ctx.createLinearGradient(0, 0, 0, this.viewport.height);
        gradient.addColorStop(0, '#264437');
        gradient.addColorStop(1, '#10271d');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

        this.map.draw(ctx, this.camera, this.viewport, this.rotation, this.pendingBuildType ? this.hoveredTile : null);

        const renderables = [];

        for (const building of this.buildings.buildings) {
            const projected = this.worldToScreen(building.x, building.y);
            renderables.push({
                y: projected.y + 10,
                draw: () => building.draw(ctx, this, this.selectedBuildingId === building.id)
            });
        }

        for (const unit of this.units.units) {
            const projected = this.worldToScreen(unit.x, unit.y);
            renderables.push({
                y: projected.y + 2,
                draw: () => unit.draw(ctx, this, this.selectedUnits.has(unit.id))
            });
        }

        renderables.sort((a, b) => a.y - b.y);
        for (const item of renderables) {
            item.draw();
        }

        if (this.drag.active) {
            const minX = Math.min(this.drag.startX, this.drag.endX);
            const minY = Math.min(this.drag.startY, this.drag.endY);
            const width = Math.abs(this.drag.endX - this.drag.startX);
            const height = Math.abs(this.drag.endY - this.drag.startY);

            ctx.save();
            ctx.strokeStyle = '#f2dd8f';
            ctx.fillStyle = 'rgba(242, 221, 143, 0.12)';
            ctx.setLineDash([6, 6]);
            ctx.lineWidth = 1.5;
            ctx.fillRect(minX, minY, width, height);
            ctx.strokeRect(minX, minY, width, height);
            ctx.restore();
        }

        if (this.paused && !this.ended) {
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
            ctx.fillStyle = '#f9f7e8';
            ctx.font = '700 36px Trebuchet MS';
            ctx.textAlign = 'center';
            ctx.fillText('Пауза', this.viewport.width / 2, this.viewport.height / 2);
            ctx.restore();
        }

        if (this.ended) {
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
            ctx.fillStyle = '#f9f7e8';
            ctx.font = '700 38px Trebuchet MS';
            ctx.textAlign = 'center';
            ctx.fillText(this.statusText, this.viewport.width / 2, this.viewport.height / 2);
            ctx.restore();
        }
    }
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const ui = {
    menuOverlay: document.getElementById('menuOverlay'),
    modeSelect: document.getElementById('modeSelect'),
    botCountSelect: document.getElementById('botCountSelect'),
    botCountField: document.getElementById('botCountField'),
    newGameBtn: document.getElementById('newGameBtn'),
    loadGameBtn: document.getElementById('loadGameBtn'),
    menuHint: document.getElementById('menuHint'),

    hud: document.getElementById('hud'),
    pauseBtn: document.getElementById('pauseBtn'),
    saveBtn: document.getElementById('saveBtn'),
    loadBtn: document.getElementById('loadBtn'),
    menuBtn: document.getElementById('menuBtn'),

    resWood: document.getElementById('resWood'),
    resStone: document.getElementById('resStone'),
    resFood: document.getElementById('resFood'),
    resGold: document.getElementById('resGold'),
    resPop: document.getElementById('resPop'),

    buildButtons: [...document.querySelectorAll('.build-btn')],
    trainVillagerBtn: document.getElementById('trainVillagerBtn'),
    trainSwordsmanBtn: document.getElementById('trainSwordsmanBtn'),
    controlsText: document.getElementById('controlsText'),
    activePlayerText: document.getElementById('activePlayerText'),
    statusText: document.getElementById('statusText')
};

let game = null;
let lastTimestamp = performance.now();

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (game) {
        game.updateViewport(window.innerWidth, window.innerHeight);
    }
}

function showMenu(show, hint = '') {
    ui.menuOverlay.classList.toggle('hidden', !show);
    ui.hud.classList.toggle('hidden', show);

    if (hint) {
        ui.menuHint.textContent = hint;
    }
}

function startNewGame() {
    const mode = ui.modeSelect.value;
    const botCount = Number.parseInt(ui.botCountSelect.value, 10);

    game = new RTSGame({ mode, botCount });

    showMenu(false);
    game.setStatus('Новая игра запущена.');
    ui.menuHint.textContent = 'Сохранение: localStorage браузера';
}

function loadSavedGame() {
    const saved = RTSGame.tryLoadFromLocalStorage();
    if (!saved) {
        showMenu(true, 'Сохранение не найдено. Сначала создайте новую игру и сохраните её.');
        return;
    }

    game = new RTSGame({ saveData: saved });
    showMenu(false);
    game.setStatus('Сохранение загружено.');
}

function refreshHud() {
    if (!game) {
        return;
    }

    const commander = game.players[game.getCommanderId()] || game.players[0] || { resources: cloneResources(DEFAULT_RESOURCES), pop: 0, popCap: 0, name: 'Игрок 1' };
    if (!commander) {
        return;
    }

    ui.resWood.textContent = formatResource(commander.resources.wood);
    ui.resStone.textContent = formatResource(commander.resources.stone);
    ui.resFood.textContent = formatResource(commander.resources.food);
    ui.resGold.textContent = formatResource(commander.resources.gold);
    ui.resPop.textContent = `${commander.pop}/${commander.popCap}`;

    ui.activePlayerText.textContent = `Активный игрок: ${commander.name}`;
    ui.controlsText.textContent = game.mode === 'pvp'
        ? 'Q/E поворот, WASD/стрелки двигают камеру, ПКМ движение/атака, Tab переключает игрока, у края экрана - прокрутка камеры.'
        : 'Q/E поворот, WASD/стрелки двигают камеру, ПКМ движение/атака, у края экрана - прокрутка камеры.';

    ui.statusText.textContent = `Статус: ${game.statusText}`;

    for (const button of ui.buildButtons) {
        const isActive = game.pendingBuildType === button.dataset.build;
        button.classList.toggle('active', isActive);
    }

    ui.pauseBtn.textContent = game.paused ? 'Снять паузу' : 'Пауза';
}

function toCanvasCoords(event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

ui.modeSelect.addEventListener('change', () => {
    const isPvp = ui.modeSelect.value === 'pvp';
    ui.botCountField.classList.toggle('hidden', isPvp);
});

ui.newGameBtn.addEventListener('click', () => {
    startNewGame();
});

ui.loadGameBtn.addEventListener('click', () => {
    loadSavedGame();
});

ui.pauseBtn.addEventListener('click', () => {
    if (!game) {
        return;
    }
    game.togglePause();
});

ui.saveBtn.addEventListener('click', () => {
    if (!game) {
        return;
    }
    game.saveToLocalStorage();
});

ui.loadBtn.addEventListener('click', () => {
    loadSavedGame();
});

ui.menuBtn.addEventListener('click', () => {
    if (game) {
        game.setPaused(true);
    }
    showMenu(true, 'Игра на паузе. Можете создать новую или загрузить сохранение.');
});

ui.trainVillagerBtn.addEventListener('click', () => {
    if (!game) {
        return;
    }
    game.tryTrainUnit(game.getCommanderId(), 'villager');
});

ui.trainSwordsmanBtn.addEventListener('click', () => {
    if (!game) {
        return;
    }
    game.tryTrainUnit(game.getCommanderId(), 'swordsman');
});

for (const button of ui.buildButtons) {
    button.addEventListener('click', () => {
        if (!game) {
            return;
        }
        game.toggleBuildMode(button.dataset.build);
    });
}

canvas.addEventListener('mousemove', (event) => {
    if (!game) {
        return;
    }
    const pos = toCanvasCoords(event);
    game.handleMouseMove(pos.x, pos.y);
});

window.addEventListener('mousemove', (event) => {
    if (!game || ui.menuOverlay.classList.contains('hidden') === false) {
        return;
    }
    game.handleWindowMouseMove(event.clientX, event.clientY);
});

canvas.addEventListener('mouseleave', () => {
    if (!game) {
        return;
    }
    game.handleMouseLeave();
});

window.addEventListener('mouseleave', () => {
    if (!game) {
        return;
    }
    game.handleMouseLeave();
});

canvas.addEventListener('mousedown', (event) => {
    if (!game || ui.menuOverlay.classList.contains('hidden') === false) {
        return;
    }

    const pos = toCanvasCoords(event);
    game.handleMouseMove(pos.x, pos.y);
    game.handleMouseDown(event.button, pos.x, pos.y);
});

canvas.addEventListener('mouseup', (event) => {
    if (!game || ui.menuOverlay.classList.contains('hidden') === false) {
        return;
    }

    const pos = toCanvasCoords(event);
    game.handleMouseMove(pos.x, pos.y);
    game.handleMouseUp(event.button, pos.x, pos.y);
});

canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();

    if (!game || ui.menuOverlay.classList.contains('hidden') === false) {
        return;
    }

    const pos = toCanvasCoords(event);
    game.handleMouseMove(pos.x, pos.y);
    game.handleRightClick(pos.x, pos.y);
});

window.addEventListener('keydown', (event) => {
    if (
        event.code === 'Tab'
        || event.code === 'Space'
        || event.code === 'ArrowUp'
        || event.code === 'ArrowDown'
        || event.code === 'ArrowLeft'
        || event.code === 'ArrowRight'
    ) {
        event.preventDefault();
    }

    if (event.key === 'Escape' && ui.menuOverlay.classList.contains('hidden') === false && game) {
        showMenu(false);
        game.setPaused(false);
        return;
    }

    if (!game || ui.menuOverlay.classList.contains('hidden') === false) {
        return;
    }

    game.handleKeyDown(event);
});

window.addEventListener('keyup', (event) => {
    if (!game) {
        return;
    }
    game.handleKeyUp(event);
});

window.addEventListener('blur', () => {
    if (!game) {
        return;
    }
    game.resetMoveKeys();
    game.handleMouseLeave();
});

window.addEventListener('resize', resizeCanvas);

function frame(timestamp) {
    const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    try {
        if (game) {
            game.update(dt);
            game.render(ctx);
            refreshHud();
        } else {
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        }
    } catch (error) {
        console.error('Frame error:', error);
        if (game) {
            game.setStatus('Ошибка выполнения. Откройте консоль браузера.');
        }
    }

    requestAnimationFrame(frame);
}

resizeCanvas();
startNewGame();
requestAnimationFrame(frame);

const BUILDING_TYPES = {
    town_center: {
        label: 'Центр города',
        maxHp: 540,
        cost: null,
        size: 74,
        popCap: 10,
        income: { wood: 0.4, stone: 0.4, food: 0.8, gold: 1.1 },
        sprite: 'town_center',
        train: ['villager']
    },
    house: {
        label: 'Дом',
        maxHp: 260,
        cost: { wood: 55, stone: 25, food: 0, gold: 0 },
        size: 60,
        popCap: 6,
        income: { wood: 0, stone: 0, food: 0.2, gold: 0.4 },
        sprite: 'house',
        train: []
    },
    farm: {
        label: 'Ферма',
        maxHp: 220,
        cost: { wood: 45, stone: 10, food: 0, gold: 0 },
        size: 56,
        popCap: 0,
        income: { wood: 0, stone: 0, food: 2.2, gold: 0 },
        sprite: 'farm',
        train: []
    },
    barracks: {
        label: 'Казарма',
        maxHp: 320,
        cost: { wood: 90, stone: 55, food: 0, gold: 30 },
        size: 66,
        popCap: 0,
        income: { wood: 0, stone: 0.2, food: 0, gold: 0.2 },
        sprite: 'barracks',
        train: ['swordsman']
    }
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

class Building {
    constructor(data) {
        this.id = data.id;
        this.ownerId = data.ownerId;
        this.type = data.type;
        this.x = data.x;
        this.y = data.y;

        const definition = BUILDING_TYPES[this.type];
        this.maxHp = definition.maxHp;
        this.hp = data.hp ?? definition.maxHp;
    }

    isAlive() {
        return this.hp > 0;
    }

    getWorldPosition() {
        return { x: this.x, y: this.y };
    }

    getCombatRadius() {
        return 0.75;
    }

    takeDamage(amount) {
        this.hp = clamp(this.hp - amount, 0, this.maxHp);
    }

    draw(ctx, game, isSelected) {
        const definition = BUILDING_TYPES[this.type];
        const projected = game.worldToScreen(this.x, this.y);
        const size = definition.size;

        const drawX = projected.x - size / 2;
        const drawY = projected.y - size * 0.88;

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.beginPath();
        ctx.ellipse(projected.x, projected.y + 7, size * 0.34, size * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();

        const sprite = game.assets.buildings[definition.sprite];
        if (sprite && sprite.complete) {
            ctx.drawImage(sprite, drawX, drawY, size, size);
        } else {
            ctx.fillStyle = game.players[this.ownerId].color;
            ctx.fillRect(projected.x - size * 0.3, projected.y - size * 0.3, size * 0.6, size * 0.5);
        }

        ctx.strokeStyle = game.players[this.ownerId].color;
        ctx.lineWidth = 2;
        ctx.strokeRect(projected.x - size * 0.3, projected.y - size * 0.2, size * 0.6, size * 0.44);

        if (isSelected) {
            ctx.strokeStyle = '#ffe18f';
            ctx.lineWidth = 2.4;
            ctx.strokeRect(projected.x - size * 0.36, projected.y - size * 0.26, size * 0.72, size * 0.56);
        }

        const hpRatio = Math.max(0, this.hp / this.maxHp);
        const barWidth = size * 0.7;
        const barHeight = 5;
        const barX = projected.x - barWidth / 2;
        const barY = drawY - 8;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = hpRatio > 0.45 ? '#63d96d' : '#ed6c5e';
        ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);

        ctx.restore();
    }

    serialize() {
        return {
            id: this.id,
            ownerId: this.ownerId,
            type: this.type,
            x: this.x,
            y: this.y,
            hp: this.hp
        };
    }

    static fromData(data) {
        return new Building(data);
    }
}

class BuildingManager {
    constructor() {
        this.buildings = [];
        this.nextId = 1;
    }

    spawn(ownerId, type, x, y) {
        const building = new Building({
            id: this.nextId,
            ownerId,
            type,
            x,
            y
        });
        this.nextId += 1;
        this.buildings.push(building);
        return building;
    }

    addFromData(buildingData) {
        const building = Building.fromData(buildingData);
        this.buildings.push(building);
        this.nextId = Math.max(this.nextId, building.id + 1);
        return building;
    }

    update() {
        this.buildings = this.buildings.filter((building) => building.isAlive());
    }

    getById(id) {
        return this.buildings.find((building) => building.id === id) || null;
    }

    draw(ctx, game, selectedBuildingId) {
        const renderables = this.buildings.map((building) => {
            const projected = game.worldToScreen(building.x, building.y);
            return {
                sortKey: projected.y,
                building
            };
        });

        renderables.sort((a, b) => a.sortKey - b.sortKey);

        for (const item of renderables) {
            item.building.draw(ctx, game, selectedBuildingId === item.building.id);
        }
    }

    getBuildingsForOwner(ownerId) {
        return this.buildings.filter((building) => building.ownerId === ownerId);
    }

    getAt(x, y) {
        return this.buildings.find((building) => building.x === x && building.y === y) || null;
    }

    getFirstAtScreen(game, screenX, screenY) {
        const sorted = [...this.buildings].reverse();

        for (const building of sorted) {
            const projected = game.worldToScreen(building.x, building.y);
            const definition = BUILDING_TYPES[building.type];
            const halfW = definition.size * 0.32;
            const halfH = definition.size * 0.26;

            const centerX = projected.x;
            const centerY = projected.y - definition.size * 0.08;

            if (
                screenX >= centerX - halfW
                && screenX <= centerX + halfW
                && screenY >= centerY - halfH
                && screenY <= centerY + halfH
            ) {
                return building;
            }
        }

        return null;
    }

    serialize() {
        return {
            nextId: this.nextId,
            buildings: this.buildings.map((building) => building.serialize())
        };
    }

    static fromData(data) {
        const manager = new BuildingManager();
        manager.nextId = data.nextId;
        for (const buildingData of data.buildings) {
            manager.addFromData(buildingData);
        }
        return manager;
    }
}

window.BUILDING_TYPES = BUILDING_TYPES;
window.Building = Building;
window.BuildingManager = BuildingManager;

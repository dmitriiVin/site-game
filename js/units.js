export const UNIT_TYPES = {
    villager: {
        label: 'Крестьянин',
        maxHp: 70,
        speed: 2.4,
        damage: 7,
        range: 0.9,
        cooldown: 1.1,
        aggroRange: 2.4,
        size: 34,
        cost: { wood: 0, stone: 0, food: 35, gold: 10 },
        pop: 1,
        sprite: 'villager'
    },
    swordsman: {
        label: 'Мечник',
        maxHp: 120,
        speed: 2.0,
        damage: 16,
        range: 1.0,
        cooldown: 0.9,
        aggroRange: 3.2,
        size: 38,
        cost: { wood: 10, stone: 0, food: 25, gold: 35 },
        pop: 1,
        sprite: 'swordsman'
    }
};

function distSq(a, b, c, d) {
    const dx = a - c;
    const dy = b - d;
    return dx * dx + dy * dy;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export class Unit {
    constructor(data) {
        this.id = data.id;
        this.ownerId = data.ownerId;
        this.type = data.type;
        this.x = data.x;
        this.y = data.y;

        const definition = UNIT_TYPES[this.type];
        this.maxHp = definition.maxHp;
        this.hp = data.hp ?? definition.maxHp;

        this.targetMove = data.targetMove || null;
        this.attackTarget = data.attackTarget || null;
        this.cooldown = data.cooldown || 0;
    }

    isAlive() {
        return this.hp > 0;
    }

    issueMove(targetX, targetY) {
        this.targetMove = { x: targetX, y: targetY };
        this.attackTarget = null;
    }

    issueAttack(kind, id) {
        this.attackTarget = { kind, id };
    }

    takeDamage(amount) {
        this.hp = clamp(this.hp - amount, 0, this.maxHp);
    }

    update(dt, game) {
        if (!this.isAlive()) {
            return;
        }

        const definition = UNIT_TYPES[this.type];

        this.cooldown = Math.max(0, this.cooldown - dt);

        if (this.attackTarget) {
            const entity = game.getEntityByRef(this.attackTarget);
            if (!entity || !entity.isAlive()) {
                this.attackTarget = null;
            }
        }

        if (!this.attackTarget) {
            const target = game.findNearestEnemyEntity(this.ownerId, this.x, this.y, definition.aggroRange);
            if (target) {
                this.attackTarget = target;
            }
        }

        if (this.attackTarget) {
            const entity = game.getEntityByRef(this.attackTarget);
            if (entity && entity.isAlive()) {
                const targetPos = entity.getWorldPosition();
                const range = definition.range + entity.getCombatRadius();
                const rangeSq = range * range;
                const currentDistSq = distSq(this.x, this.y, targetPos.x, targetPos.y);

                if (currentDistSq <= rangeSq) {
                    if (this.cooldown <= 0) {
                        entity.takeDamage(definition.damage, game, this.ownerId);
                        this.cooldown = definition.cooldown;
                    }
                    return;
                }

                this.moveTowards(targetPos.x, targetPos.y, definition.speed, dt, game.map);
                return;
            }
        }

        if (this.targetMove) {
            const done = this.moveTowards(this.targetMove.x, this.targetMove.y, definition.speed, dt, game.map);
            if (done) {
                this.targetMove = null;
            }
        }
    }

    moveTowards(targetX, targetY, speed, dt, map) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const len = Math.hypot(dx, dy);

        if (len < 0.05) {
            this.x = targetX;
            this.y = targetY;
            return true;
        }

        const step = speed * dt;
        const nx = this.x + (dx / len) * Math.min(step, len);
        const ny = this.y + (dy / len) * Math.min(step, len);

        this.x = clamp(nx, 0, map.width - 1);
        this.y = clamp(ny, 0, map.height - 1);

        return len <= step;
    }

    getCombatRadius() {
        return 0.45;
    }

    getWorldPosition() {
        return { x: this.x, y: this.y };
    }

    draw(ctx, game, isSelected) {
        const definition = UNIT_TYPES[this.type];
        const projected = game.worldToScreen(this.x, this.y);

        const size = definition.size;
        const drawX = projected.x - size / 2;
        const drawY = projected.y - size * 0.9;

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(projected.x, projected.y + 4, size * 0.24, size * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();

        const sprite = game.assets.units[definition.sprite];
        if (sprite && sprite.complete) {
            ctx.drawImage(sprite, drawX, drawY, size, size);
        } else {
            ctx.fillStyle = game.players[this.ownerId].color;
            ctx.beginPath();
            ctx.arc(projected.x, projected.y - size * 0.38, size * 0.23, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = game.players[this.ownerId].color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y + 2, size * 0.28, 0, Math.PI * 2);
        ctx.stroke();

        if (isSelected) {
            ctx.strokeStyle = '#ffe18f';
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.arc(projected.x, projected.y + 2, size * 0.35, 0, Math.PI * 2);
            ctx.stroke();
        }

        const hpRatio = Math.max(0, this.hp / this.maxHp);
        const barWidth = size * 0.66;
        const barHeight = 4;
        const barX = projected.x - barWidth / 2;
        const barY = drawY - 6;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = hpRatio > 0.45 ? '#58d15c' : '#ef6a5a';
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
            hp: this.hp,
            targetMove: this.targetMove,
            attackTarget: this.attackTarget,
            cooldown: this.cooldown
        };
    }

    static fromData(data) {
        return new Unit(data);
    }
}

export class UnitManager {
    constructor() {
        this.units = [];
        this.nextId = 1;
    }

    spawn(ownerId, type, x, y) {
        const unit = new Unit({
            id: this.nextId,
            ownerId,
            type,
            x,
            y
        });
        this.nextId += 1;
        this.units.push(unit);
        return unit;
    }

    addFromData(unitData) {
        const unit = Unit.fromData(unitData);
        this.units.push(unit);
        this.nextId = Math.max(this.nextId, unit.id + 1);
        return unit;
    }

    getById(id) {
        return this.units.find((unit) => unit.id === id) || null;
    }

    update(dt, game) {
        for (const unit of this.units) {
            unit.update(dt, game);
        }
        this.units = this.units.filter((unit) => unit.isAlive());
    }

    draw(ctx, game, selectedUnitIds) {
        const renderables = this.units.map((unit) => {
            const projected = game.worldToScreen(unit.x, unit.y);
            return {
                sortKey: projected.y,
                unit
            };
        });

        renderables.sort((a, b) => a.sortKey - b.sortKey);

        for (const item of renderables) {
            item.unit.draw(ctx, game, selectedUnitIds.has(item.unit.id));
        }
    }

    getUnitsForOwner(ownerId) {
        return this.units.filter((unit) => unit.ownerId === ownerId);
    }

    getFirstAtScreen(game, screenX, screenY) {
        const sorted = [...this.units].reverse();

        for (const unit of sorted) {
            const projected = game.worldToScreen(unit.x, unit.y);
            const definition = UNIT_TYPES[unit.type];
            const radius = definition.size * 0.22;

            const dx = screenX - projected.x;
            const dy = screenY - (projected.y - definition.size * 0.35);
            if ((dx * dx) + (dy * dy) <= radius * radius) {
                return unit;
            }
        }

        return null;
    }

    serialize() {
        return {
            nextId: this.nextId,
            units: this.units.map((unit) => unit.serialize())
        };
    }

    static fromData(data) {
        const manager = new UnitManager();
        manager.nextId = data.nextId;
        for (const unitData of data.units) {
            manager.addFromData(unitData);
        }
        return manager;
    }
}

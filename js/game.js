import { Map } from './map.js';
import { UnitManager } from './units.js';
import { BuildingManager } from './buildings.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const gameMap = new Map(32, 32);      // 32x32 тайла
const units = new UnitManager();
const buildings = new BuildingManager();

// Главный игровой цикл
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    gameMap.draw(ctx);
    buildings.draw(ctx);
    units.draw(ctx);

    requestAnimationFrame(gameLoop);
}

gameLoop();
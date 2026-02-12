const CLAMP_MIN_HEIGHT = 0;
const CLAMP_MAX_HEIGHT = 3;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

class GameMap {
    constructor(width, height, options = {}) {
        this.width = width;
        this.height = height;
        this.tileWidth = options.tileWidth || 92;
        this.tileHeight = options.tileHeight || 46;
        this.elevationStep = options.elevationStep || 10;
        this.tiles = [];
        this.heights = [];
        this.generateTerrain();
    }

    generateTerrain() {
        const baseHeight = [];

        for (let y = 0; y < this.height; y += 1) {
            this.tiles[y] = [];
            this.heights[y] = [];
            baseHeight[y] = [];

            for (let x = 0; x < this.width; x += 1) {
                const noise = Math.random() * 1.5;
                baseHeight[y][x] = noise;
                this.tiles[y][x] = Math.random() > 0.92 ? 'dirt' : 'grass';
            }
        }

        for (let pass = 0; pass < 3; pass += 1) {
            for (let y = 0; y < this.height; y += 1) {
                for (let x = 0; x < this.width; x += 1) {
                    let total = 0;
                    let count = 0;

                    for (let oy = -1; oy <= 1; oy += 1) {
                        for (let ox = -1; ox <= 1; ox += 1) {
                            const nx = x + ox;
                            const ny = y + oy;
                            if (this.isInside(nx, ny)) {
                                total += baseHeight[ny][nx];
                                count += 1;
                            }
                        }
                    }

                    baseHeight[y][x] = total / count;
                }
            }
        }

        for (let y = 0; y < this.height; y += 1) {
            for (let x = 0; x < this.width; x += 1) {
                this.heights[y][x] = clamp(Math.round(baseHeight[y][x] * 2), CLAMP_MIN_HEIGHT, CLAMP_MAX_HEIGHT);
            }
        }
    }

    isInside(x, y) {
        return x >= 0 && y >= 0 && x < this.width && y < this.height;
    }

    getTile(x, y) {
        if (!this.isInside(x, y)) {
            return null;
        }
        return this.tiles[y][x];
    }

    getHeight(x, y) {
        if (!this.isInside(x, y)) {
            return 0;
        }
        return this.heights[y][x];
    }

    rotatePoint(x, y, rotation) {
        const maxX = this.width - 1;
        const maxY = this.height - 1;
        const r = ((rotation % 4) + 4) % 4;

        if (r === 0) {
            return { x, y };
        }
        if (r === 1) {
            return { x: maxX - y, y: x };
        }
        if (r === 2) {
            return { x: maxX - x, y: maxY - y };
        }
        return { x: y, y: maxY - x };
    }

    project(worldX, worldY, camera, viewport, rotation) {
        const rotated = this.rotatePoint(worldX, worldY, rotation);
        const baseX = (rotated.x - rotated.y) * (this.tileWidth / 2);
        const baseY = (rotated.x + rotated.y) * (this.tileHeight / 2);
        const sampledHeight = this.getHeight(Math.round(worldX), Math.round(worldY));
        const elevation = sampledHeight * this.elevationStep;

        return {
            x: baseX + camera.x + viewport.width / 2,
            y: baseY + camera.y + viewport.height * 0.18 - elevation,
            baseY: baseY + camera.y + viewport.height * 0.18,
            elevation,
            depth: rotated.x + rotated.y
        };
    }

    screenToTile(screenX, screenY, camera, viewport, rotation) {
        const halfW = this.tileWidth / 2;
        const halfH = this.tileHeight / 2;

        let best = null;

        for (let y = 0; y < this.height; y += 1) {
            for (let x = 0; x < this.width; x += 1) {
                const projected = this.project(x, y, camera, viewport, rotation);
                const dx = Math.abs(screenX - projected.x) / halfW;
                const dy = Math.abs(screenY - projected.y) / halfH;

                if (dx + dy <= 1) {
                    if (!best || projected.depth > best.depth) {
                        best = { x, y, depth: projected.depth };
                    }
                }
            }
        }

        if (!best) {
            return null;
        }

        return { x: best.x, y: best.y };
    }

    draw(ctx, camera, viewport, rotation, hoveredTile) {
        const halfW = this.tileWidth / 2;
        const halfH = this.tileHeight / 2;

        const tilesToDraw = [];

        for (let y = 0; y < this.height; y += 1) {
            for (let x = 0; x < this.width; x += 1) {
                const projected = this.project(x, y, camera, viewport, rotation);
                tilesToDraw.push({ x, y, projected });
            }
        }

        tilesToDraw.sort((a, b) => a.projected.depth - b.projected.depth);

        for (const tile of tilesToDraw) {
            const { x, y, projected } = tile;
            const topCenterX = projected.x;
            const topCenterY = projected.y;
            const elevation = projected.elevation;

            const isHovered = hoveredTile && hoveredTile.x === x && hoveredTile.y === y;

            const topColor = this.tiles[y][x] === 'dirt' ? '#8d744f' : '#5d9654';
            const topHighlight = this.tiles[y][x] === 'dirt' ? '#a58a5f' : '#76b36d';
            const leftColor = this.tiles[y][x] === 'dirt' ? '#705d40' : '#4b7a45';
            const rightColor = this.tiles[y][x] === 'dirt' ? '#5e4f36' : '#3e6539';

            const top = { x: topCenterX, y: topCenterY - halfH };
            const right = { x: topCenterX + halfW, y: topCenterY };
            const bottom = { x: topCenterX, y: topCenterY + halfH };
            const left = { x: topCenterX - halfW, y: topCenterY };

            if (elevation > 0) {
                ctx.beginPath();
                ctx.moveTo(left.x, left.y);
                ctx.lineTo(bottom.x, bottom.y);
                ctx.lineTo(bottom.x, bottom.y + elevation);
                ctx.lineTo(left.x, left.y + elevation);
                ctx.closePath();
                ctx.fillStyle = leftColor;
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(right.x, right.y);
                ctx.lineTo(bottom.x, bottom.y);
                ctx.lineTo(bottom.x, bottom.y + elevation);
                ctx.lineTo(right.x, right.y + elevation);
                ctx.closePath();
                ctx.fillStyle = rightColor;
                ctx.fill();
            }

            const gradient = ctx.createLinearGradient(topCenterX, topCenterY - halfH, topCenterX, topCenterY + halfH);
            gradient.addColorStop(0, topHighlight);
            gradient.addColorStop(1, topColor);

            ctx.beginPath();
            ctx.moveTo(top.x, top.y);
            ctx.lineTo(right.x, right.y);
            ctx.lineTo(bottom.x, bottom.y);
            ctx.lineTo(left.x, left.y);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();
            ctx.strokeStyle = isHovered ? '#f8f39f' : 'rgba(0, 0, 0, 0.22)';
            ctx.lineWidth = isHovered ? 2.4 : 1;
            ctx.stroke();
        }
    }

    serialize() {
        return {
            width: this.width,
            height: this.height,
            tileWidth: this.tileWidth,
            tileHeight: this.tileHeight,
            elevationStep: this.elevationStep,
            tiles: this.tiles,
            heights: this.heights
        };
    }

    static fromData(data) {
        const map = new GameMap(data.width, data.height, {
            tileWidth: data.tileWidth,
            tileHeight: data.tileHeight,
            elevationStep: data.elevationStep
        });
        map.tiles = data.tiles;
        map.heights = data.heights;
        return map;
    }
}

window.GameMap = GameMap;

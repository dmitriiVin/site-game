export class Map {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.tileSize = 32;
        this.tiles = [];

        for (let y = 0; y < height; y++) {
            this.tiles[y] = [];
            for (let x = 0; x < width; x++) {
                this.tiles[y][x] = 'grass';
            }
        }

        this.tileImages = {
            'grass': new Image()
        };
        this.tileImages['grass'].src = '../assets/tiles/grass.png';
    }

    draw(ctx) {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                ctx.drawImage(this.tileImages[this.tiles[y][x]], x*this.tileSize, y*this.tileSize, this.tileSize, this.tileSize);
            }
        }
    }
}
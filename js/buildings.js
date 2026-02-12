export class Building {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 32;
        this.img = new Image();
        this.img.src = '../assets/buildings/house.png';
    }

    draw(ctx) {
        ctx.drawImage(this.img, this.x, this.y, this.size, this.size);
    }
}

export class BuildingManager {
    constructor() {
        this.buildings = [ new Building(200, 200) ];
    }

    draw(ctx) {
        this.buildings.forEach(building => building.draw(ctx));
    }
}
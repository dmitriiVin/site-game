export class Unit {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 28;
        this.img = new Image();
        this.img.src = '../assets/units/soldier.png';
    }

    draw(ctx) {
        ctx.drawImage(this.img, this.x, this.y, this.size, this.size);
    }
}

export class UnitManager {
    constructor() {
        this.units = [
            new Unit(50, 50),
            new Unit(100, 100)
        ];
    }

    draw(ctx) {
        this.units.forEach(unit => unit.draw(ctx));
    }
}
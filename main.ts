const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const context = canvas.getContext("2d");

// TODO: Update scaling, transformation on window "resize" event

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const scale = canvas.width / 32;
const width = 32;
const height = canvas.height / scale;
context.scale(scale, -scale);
context.translate(width / 2, -height / 2);

interface Bounds {
    x: number;
    y: number;
    radius: number;
}

interface Entity {
    getBounds(): Bounds;
    update(): void;
    draw(context: CanvasRenderingContext2D): void;
}

class MovingEntity implements Entity {
    constructor(
        public x: number,
        public y: number,
        public radius: number,
        private color: string,
        private speed: number,
        protected moveAngle: number,
        protected aimAngle: number,
        protected move: boolean) {
    }

    protected updateInternal() {}
    protected drawInternal() { }

    public getBounds() {
        return {
            x: this.x,
            y: this.y,
            radius: this.radius,
        };
    }

    public update() {
        this.updateInternal();

        if (this.move) {
            this.x += this.speed * Math.cos(this.moveAngle);
            this.y += this.speed * Math.sin(this.moveAngle);
        }
    }

    public draw(context: CanvasRenderingContext2D) {
        context.save();
        context.translate(this.x, this.y);
        context.rotate(this.aimAngle);

        context.fillStyle = this.color;
        context.beginPath();
        context.arc(0, 0, 1, 0, Math.PI * 2, true);
        context.closePath();
        context.fill();

        this.drawInternal();
        
        context.restore();
    }
}

class Ship extends MovingEntity {
    constructor(x: number, y: number, moveAngle: number) {
        super(x, y, 1, "gray", 0.1, moveAngle, moveAngle, true);
    }

    protected drawInternal() {
        context.lineWidth = 1 / 10;
        context.strokeStyle = "lightgray";
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(1, 0);
        context.stroke();
    }
}

const ships = [
    new Ship(-10, 0, 0),
    new Ship(10, 0, Math.PI),
];

function update() {
    ships.forEach(a => a.update());
}

function draw() {
    context.fillStyle = "black";
    context.fillRect(-width / 2, -height / 2, width, height);    

    ships.forEach(a => a.draw(context));
}

const fps = 10;
setInterval(function () {
    update();
    requestAnimationFrame(draw);
}, 1000 / fps);

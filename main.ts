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

interface Entity {
    x: number;
    y: number;
    radius: number;
    
    update(): void;

    draw(context: CanvasRenderingContext2D): void;
}

class MovingEntity implements Entity {
    private dx = 0;
    private dy = 0;

    constructor(
        public x: number,
        public y: number,
        public radius: number,
        private color: string,
        protected a: number,
        protected da: number,
        protected acceleration: number) {
    }

    protected updateInternal() {}
    protected drawInternal() { }

    public update() {
        this.dx += this.acceleration * Math.cos(this.a);
        this.dy += this.acceleration * Math.sin(this.a);

        this.x += this.dx;
        this.y += this.dy;

        this.a += this.da;

        this.updateInternal();
    }

    public draw(context: CanvasRenderingContext2D) {
        context.save();
        context.translate(this.x, this.y);
        context.rotate(this.a);

        context.fillStyle = this.color;
        context.beginPath();
        context.arc(0, 0, 1, 0, Math.PI * 2, true);
        context.closePath();
        context.fill();

        this.drawInternal();
        
        context.restore();
    }
}

class Bot extends MovingEntity {
    constructor(x: number, y: number, a: number) {
        super(x, y, 1, "gray", a, 0.1, 0.0001);
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

const bots = [
    new Bot(-10, 0, 0),
    new Bot(10, 0, Math.PI),
];

function update() {
    for (let bot of bots) {
        bot.update();
    }
}

function draw() {
    context.fillStyle = "black";
    context.fillRect(-width / 2, -height / 2, width, height);    

    for (let bot of bots) {
        bot.draw(context);
    }
}

const fps = 10;
setInterval(function () {
    update();
    requestAnimationFrame(draw);
}, 1000 / fps);

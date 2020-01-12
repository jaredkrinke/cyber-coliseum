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

enum CollisionClass {
    solid,      // Collides with solids (moving them apart), and also with massless
    massless,   // Collides with solids, but doesn't move anything
}

interface Collidable {
    collisionClass: CollisionClass;

    x: number;
    y: number;
    radius: number;

    /** Called on collisionClass.solid when colliding with collisionClass.massless */
    collided(other: Collidable): void;
}

interface Entity extends Collidable {
    dead: boolean;

    update(): void;
    draw(context: CanvasRenderingContext2D): void;
}

function isEntity(a: object): a is Entity {
    return "dead" in a;
}

class MovingEntity implements Entity {
    public dead = false;

    constructor(
        public collisionClass: CollisionClass,
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

    public collided(other: Collidable) {
        if (isEntity(other)) {
            other.dead = true;
        }
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
        context.arc(0, 0, this.radius, 0, Math.PI * 2, true);
        context.closePath();
        context.fill();

        this.drawInternal();
        
        context.restore();
    }
}

class Projectile extends MovingEntity {
    constructor(
        x: number,
        y: number,
        radius: number,
        color: string,
        moveAngle: number,
        speed: number,
        public damage: number
    ) {
        super(CollisionClass.massless, x, y, radius, color, speed, moveAngle, moveAngle, true);
    }
}

class Shot extends Projectile {
    constructor(x: number, y: number, moveAngle: number) {
        super(x, y, 0.1, "red", moveAngle, 0.5, 10);
    }
}

class Ship extends MovingEntity {
    constructor(x: number, y: number, moveAngle: number) {
        super(CollisionClass.solid, x, y, 1, "gray", 0.1, moveAngle, moveAngle, true);
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

let entities = [
    new Ship(-3, 0.2, 0),
    new Ship(3, 0, Math.PI),
];

function getCollisionOverlap(a: Collidable, b: Collidable) {
    const centerDistance = Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
    const overlapDistance = a.radius + b.radius - centerDistance;
    if (overlapDistance > 0) {
        return overlapDistance;
    }
    return 0;
}

function findAndResolveCollisions(entities: Entity[]) {
    // Loop through solids first
    for (const a of entities) {
        if (a.collisionClass === CollisionClass.solid) {
            // Loop through all other entities and check for collisions
            for (const b of entities) {
                if (a !== b) {
                    const overlapDistance = getCollisionOverlap(a, b);
                    if (overlapDistance > 0) {
                        if (b.collisionClass === CollisionClass.solid) {
                            // Collision with solid; resolve
                            // TODO: Consider mass or speed?
                            // TODO: Damage?
                            const angleAToB = Math.atan2(b.y - a.y, b.x - a.x);
                            const dax = -overlapDistance / 2 * Math.cos(angleAToB) * 1.0001;
                            const day = -overlapDistance / 2 * Math.sin(angleAToB) * 1.0001;
                            a.x += dax;
                            a.y += day;
                            b.x -= dax;
                            b.y -= day;
                        } else {
                            // Collision with massless
                            a.collided(b);
                        }
                    }
                }
            }
        }
    }
}

function update() {
    entities.forEach(a => a.update());
    findAndResolveCollisions(entities);

    entities = entities.filter(e => !e.dead);
}

function draw() {
    context.fillStyle = "black";
    context.fillRect(-width / 2, -height / 2, width, height);    

    entities.forEach(a => a.draw(context));
}

const fps = 10;
setInterval(function () {
    update();
    requestAnimationFrame(draw);
}, 1000 / fps);

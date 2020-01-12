const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const context = canvas.getContext("2d");

// TODO: Update scaling, transformation on window "resize" event

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let scale: number;
let width: number;
let height: number;
if (canvas.width < canvas.height) {
    scale = canvas.width / 32;
    width = 32;
    height = canvas.height / scale;
} else {
    scale = canvas.height / 32;
    height = 32;
    width = canvas.width / scale;
}

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

    update(): Entity[] | null;
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

    protected updateInternal(): Entity[] | null { return null; }
    protected collidedInternal(other: Collidable) {}
    protected drawInternal() { }

    public collided(other: Collidable) {
        if (isEntity(other)) {
            other.dead = true;
            this.collidedInternal(other);
        }
    }

    public update() {
        if (this.move) {
            this.x += this.speed * Math.cos(this.moveAngle);
            this.y += this.speed * Math.sin(this.moveAngle);
        }

        return this.updateInternal();
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

function isProjectile(a: object): a is Projectile {
    return "damage" in a;
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

const shotRadius = 0.1;
class Shot extends Projectile {
    constructor(x: number, y: number, moveAngle: number) {
        super(x, y, shotRadius, "red", moveAngle, 0.5, 10);
    }
}

class Ship extends MovingEntity {
    private shootTimer = 0;
    private health = 100;

    protected shoot = true;
    protected shootPeriod = 10;

    constructor(x: number, y: number, moveAngle: number) {
        super(CollisionClass.solid, x, y, 1, "gray", 0.1, moveAngle, moveAngle, true);
    }

    protected updateInternal(): Entity[] | null {
        let result = null;
        if (this.shoot && this.shootTimer <= 0) {
            this.shootTimer = this.shootPeriod;

            let x = this.x + (this.radius + shotRadius) * 1.001 * Math.cos(this.aimAngle);
            let y = this.y + (this.radius + shotRadius) * 1.001 * Math.sin(this.aimAngle);

            result = [new Shot(x, y, this.aimAngle)];
        } else if (this.shootTimer > 0) {
            this.shootTimer--;
        }
        return result;
    }

    protected collidedInternal(other: Collidable) {
        if (isProjectile(other)) {
            this.health -= other.damage;
            this.dead = (this.health <= 0);
            // TODO: Explosion?
        }
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
    new Ship(-10, 0, 0),
    new Ship(10, 0, Math.PI),
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

const maxDistance = 16;
function enforceBounds(entities: Entity[]) {
    for (const e of entities) {
        if (isProjectile(e)) {
            if (e.x < -maxDistance || e.x > maxDistance || e.y < -maxDistance || e.y > maxDistance) {
                e.dead = true;
            }
        } else {
            e.x = Math.max(-maxDistance, Math.min(maxDistance, e.x));
            e.y = Math.max(-maxDistance, Math.min(maxDistance, e.y));
        }
    }
}

function update() {
    // Update entities (and add any new ones they create)
    let newEntities = [];
    for (const e of entities) {
        const result = e.update();
        if (result) {
            newEntities = newEntities.concat(result);
        }
    }
    entities = entities.concat(newEntities);

    findAndResolveCollisions(entities);
    enforceBounds(entities);

    entities = entities.filter(e => !e.dead);

    if (entities.length <= 0) {
        clearInterval(updateToken);
    }
}

function draw() {
    context.fillStyle = "gray";
    context.fillRect(-width / 2, -height / 2, width, height);    
    context.fillStyle = "black";
    context.fillRect(-maxDistance, -maxDistance, maxDistance * 2, maxDistance * 2);

    entities.forEach(a => a.draw(context));
}

const fps = 30;
let updateToken = setInterval(function () {
    update();
    requestAnimationFrame(draw);
}, 1000 / fps);

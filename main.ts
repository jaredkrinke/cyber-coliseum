namespace Battle {
    const canvas = document.getElementById("canvas") as HTMLCanvasElement;
    const context = canvas.getContext("2d");

    const maxDistance = 10;
    
    // TODO: Update scaling, transformation on window "resize" event
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    let scale: number;
    let width: number;
    let height: number;
    if (canvas.width < canvas.height) {
        scale = canvas.width / (2 * maxDistance);
        width = (2 * maxDistance);
        height = canvas.height / scale;
    } else {
        scale = canvas.height / (2 * maxDistance);
        height = (2 * maxDistance);
        width = canvas.width / scale;
    }
    
    context.scale(scale, -scale);
    context.translate(width / 2, -height / 2);
    
    // Logic
    enum CollisionClass {
        solid,      // Collides with solids (moving them apart), and also with massless
        massless,   // Collides with solids, but doesn't move anything
    }
    
    interface Position {
        x: number;
        y: number;
    }

    // Utilities
    function getDistance(a: Position, b: Position) {
        return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
    }
    
    interface Circle extends Position {
        radius: number;
    }
    
    interface Collidable extends Circle {
        collisionClass: CollisionClass;
    
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
            public speed: number,
            public moveAngle: number,
            protected aimAngle: number,
            public move: boolean) {
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
    
            context.strokeStyle = this.color
            context.beginPath();
            context.arc(0, 0, this.radius, 0, Math.PI * 2, true);
            context.closePath();
            context.stroke();
    
            this.drawInternal();
            
            context.restore();
        }
    }

    function isMovingEntity(a: object): a is MovingEntity {
        return "moveAngle" in a;
    }
    
    class Projectile extends MovingEntity {
        constructor(
            public source: Entity,
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
    
    function isProjectile(a: object): a is Projectile {
        return "damage" in a;
    }
    
    const shotRadius = 0.1;
    class Shot extends Projectile {
        constructor(source: Entity, x: number, y: number, moveAngle: number) {
            super(source, x, y, shotRadius, "red", moveAngle, 0.5, 10);
        }
    }
    
    class Ship extends MovingEntity {
        private shootTimer = 0;
        private health = 100;
    
        protected shoot = false;
        protected shootPeriod = 10;
    
        constructor(x: number, y: number, moveAngle: number) {
            super(CollisionClass.solid, x, y, 1, "gray", 0.2, moveAngle, moveAngle, false);
        }
    
        protected think?(environment: Environment): void {}
    
        protected updateInternal(): Entity[] | null {
            if (this.think) {
                this.think(getEnvironment(this));
            }
    
            let result = null;
            if (this.shoot && this.shootTimer <= 0) {
                this.shootTimer = this.shootPeriod;
    
                let x = this.x + (this.radius + shotRadius) * 1.001 * Math.cos(this.aimAngle);
                let y = this.y + (this.radius + shotRadius) * 1.001 * Math.sin(this.aimAngle);
    
                result = [new Shot(this, x, y, this.aimAngle)];
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
            context.strokeStyle = "lightgray";
            context.beginPath();
            context.moveTo(0, 0);
            context.lineTo(1, 0);
            context.stroke();
        }
    }

    interface ProjectileState extends Position {
        angle: number;
        speed: number;
    }

    interface Bounds {
        xMin: number;
        xMax: number;
        yMin: number;
        yMax: number;
    }
    
    interface Environment {
        bounds: Bounds;
        enemies: Circle[];
        enemyProjectiles: ProjectileState[];
    }
    
    // Bots
    class BotTurret extends Ship {
        constructor(x: number, y: number) {
            super(x, y, 0);
        }
    
        protected think(environment: Environment) {
            if (environment.enemies.length > 0) {
                const enemy = environment.enemies[0];
                this.aimAngle = Math.atan2(enemy.y - this.y, enemy.x - this.x);
                this.shoot = true;
            } else {
                this.shoot = false;
            }
        }
    }

    interface Line {
        x: number;
        y: number;
        angle: number;
    }

    function square(x: number) {
        return x * x;
    }

    function circleIntersectsLine(circle: Circle, line: Line): boolean {
        const cosine = Math.cos(line.angle);
        const sine = Math.sin(line.angle)
        const x1 = line.x - circle.x;
        const y1 = line.y - circle.y;
        const x2 = x1 + cosine;
        const y2 = y1 + sine;
        const discriminant = square(circle.radius) * (square(cosine) + square(sine)) - square(x1 * y2 - x2 * y1);
        return discriminant >= 0;
    }

    class BotDodger extends Ship {
        private angleOffset = Math.PI / 2;

        constructor(x: number, y: number) {
            super(x, y, 0);
        }
    
        protected think(environment: Environment) {
            let closestProjectile: ProjectileState;
            let minimumDistance = 1000;

            // Projectiles that will hit us
            const projectiles = environment.enemyProjectiles.filter((e) => circleIntersectsLine(this, e));

            for (const p of projectiles) {
                const distance = getDistance(this, p);
                if (distance < minimumDistance) {
                    minimumDistance = distance;
                    closestProjectile = p;
                }
            }

            if (closestProjectile) {
                const angleToProjectile = Math.atan2(closestProjectile.y - this.y, closestProjectile.x - this.x);
                this.moveAngle = angleToProjectile + this.angleOffset;
                const nextX = this.x + Math.cos(this.moveAngle);
                const nextY = this.y + Math.sin(this.moveAngle);
                if (nextX < environment.bounds.xMin || nextX > environment.bounds.xMax || nextY < environment.bounds.yMin || nextY > environment.bounds.yMax) {
                    this.angleOffset = -this.angleOffset;
                    this.moveAngle = angleToProjectile + this.angleOffset;
                }

                this.move = true;
            } else {
                this.move = false;
            }
        }
    }
    
    let entities = [
        new BotTurret(-10 * Math.random(), 20 * Math.random() - 10),
        new BotDodger(10 * Math.random(), 20 * Math.random() - 10),
    ];

    const environmentBounds: Bounds = {
        xMin: -maxDistance,
        xMax: maxDistance,
        yMin: -maxDistance,
        yMax: maxDistance,
    };

    function getEnvironment(self: Entity): Environment {
        return {
            bounds: environmentBounds,
            enemies: entities.filter(e => e !== self && e.collisionClass === CollisionClass.solid),
            enemyProjectiles: entities
                .filter(e => isProjectile(e) && isMovingEntity(e) && e.source !== self)
                .map<ProjectileState>(e => ({
                    x: e.x,
                    y: e.y,
                    angle: e.moveAngle,
                    speed: e.move ? e.speed : 0,
                })),
        };
    }
    
    function getCollisionOverlap(a: Collidable, b: Collidable) {
        const centerDistance = getDistance(a, b);
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
    
        if (entities.length <= 1) {
            clearInterval(updateToken);
        }
    }
    
    function draw() {
        context.fillStyle = "gray";
        context.fillRect(-width / 2, -height / 2, width, height);    
        context.fillStyle = "black";
        context.fillRect(-maxDistance, -maxDistance, maxDistance * 2, maxDistance * 2);
    
        context.lineWidth = 0.1;
        entities.forEach(a => a.draw(context));
    }
    
    const fps = 30;
    let updateToken = setInterval(function () {
        update();
        requestAnimationFrame(draw);
    }, 1000 / fps);
}

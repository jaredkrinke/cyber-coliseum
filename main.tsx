declare const React: typeof import("react");
declare const ReactDOM: typeof import("react-dom");
import * as acorn from "./js-interpreter/acorn.js";
(window as any).acorn = acorn;
import { Interpreter } from "./js-interpreter/interpreter.js";
import { Bounds, EnemyState, Environment, ProjectileState, RobotState } from "./coliseum-interface"

namespace Battle {
    // TODO: Update scaling, transformation on window "resize" event
    
    // Logic
    // TODO: Could be inferred from "collided" handler
    enum CollisionClass {
        solid,      // Collides with solids (moving them apart), and also with massless
        massless,   // Collides with solids, but doesn't move anything
    }
    
    interface Position {
        x: number;
        y: number;
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
    
        update(): void;
        draw(context: CanvasRenderingContext2D): void;
    }
    
    function isEntity(a: object): a is Entity {
        return "dead" in a;
    }

    interface Scriptable extends Entity {
        updateWithEnvironment(getEnvironment: () => Environment): Entity[] | null;
    }

    function isScriptable(a: object): a is Scriptable {
        return "updateWithEnvironment" in a;
    }
    
    class MovingEntity implements Entity, Scriptable {
        public dead = false;
    
        constructor(
            public collisionClass: CollisionClass,
            public x: number,
            public y: number,
            public radius: number,
            protected strokeColor: string | null,
            protected fillColor: string,
            public speed: number,
            // TODO: Rename all these to moveDirection, shootDirection, etc. (here and in HTML)
            public moveDirection: number,
            protected shootDirection: number,
            public move: boolean) {
        }
    
        protected collidedInternal(other: Collidable) {}
        protected drawInternal(context: CanvasRenderingContext2D) { }
    
        public collided(other: Collidable) {
            if (isEntity(other)) {
                other.dead = true;
                this.collidedInternal(other);
            }
        }
    
        public update() {
            if (this.move) {
                this.x += this.speed * Math.cos(this.moveDirection);
                this.y += this.speed * Math.sin(this.moveDirection);
            }
        }

        public updateWithEnvironment(getEnvironment: () => Environment) {
            return null;
        }
    
        public draw(context: CanvasRenderingContext2D) {
            context.save();
            context.translate(this.x, this.y);
            context.rotate(this.shootDirection);
    
            context.beginPath();
            context.arc(0, 0, this.radius, 0, Math.PI * 2, true);
            context.closePath();

            context.fillStyle = this.fillColor;
            context.fill();

            if (this.strokeColor !== null) {
                context.strokeStyle = this.strokeColor;
                context.stroke();
            }
    
            this.drawInternal(context);
            
            context.restore();
        }
    }

    function isMovingEntity(a: object): a is MovingEntity {
        return "moveDirection" in a;
    }
    
    class Projectile extends MovingEntity {
        constructor(
            public source: Entity,
            x: number,
            y: number,
            radius: number,
            color: string,
            moveDirection: number,
            speed: number,
            public damage: number
        ) {
            super(CollisionClass.massless, x, y, radius, null, color, speed, moveDirection, moveDirection, true);
        }
    }
    
    function isProjectile(a: object): a is Projectile {
        return "damage" in a;
    }
    
    class Shot extends Projectile {
        public static readonly shotRadius = 0.15;

        constructor(source: Entity, x: number, y: number, moveDirection: number) {
            super(source, x, y, Shot.shotRadius, "red", moveDirection, 0.5, 10);
        }
    }
    
    class Ship extends MovingEntity {
        private shootTimer = 0;
        private health = 100;
    
        protected shoot = false;
        protected shootPeriod = 10;
    
        constructor(x: number, y: number, moveDirection: number) {
            super(CollisionClass.solid, x, y, 1, "lightgray", "rgb(128, 128, 128)", 0.2, moveDirection, moveDirection, false);
        }
    
        protected think(environment: Environment): void {}
    
        public updateWithEnvironment(getEnvironment: () => Environment): Entity[] | null {
            const value = 128 * (this.health / 100);
            this.fillColor = `rgb(${value}, ${value}, ${value})`;

            this.think(getEnvironment());
    
            let result = null;
            if (this.shoot && this.shootTimer <= 0) {
                this.shootTimer = this.shootPeriod;
    
                let x = this.x + (this.radius + Shot.shotRadius) * 1.001 * Math.cos(this.shootDirection);
                let y = this.y + (this.radius + Shot.shotRadius) * 1.001 * Math.sin(this.shootDirection);
    
                result = [new Shot(this, x, y, this.shootDirection)];
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
    
        protected drawInternal(context: CanvasRenderingContext2D) {
            context.strokeStyle = "white";
            context.beginPath();
            context.moveTo(0, 0);
            context.lineTo(1, 0);
            context.stroke();
        }
    }
    
    // Bots
    type BotThinkHandler = (self: RobotState, environment: Environment) => void;
    type BotInitializer = () => BotThinkHandler;

    class Bot extends Ship {
        private thinkHandler: BotThinkHandler;

        constructor (x: number, y: number, initialize: BotInitializer) {
            super(x, y, 0);

            this.thinkHandler = initialize();
        }

        protected think(environment: Environment) {
            const state: RobotState = {
                x: this.x,
                y: this.y,
                radius: this.radius,
                shootDirection: this.shootDirection,
                moveDirection: this.moveDirection,
                move: this.move,
                shoot: this.shoot,
            };

            this.thinkHandler(state, environment);

            this.move = state.move;
            this.shoot = state.shoot;
            this.shootDirection = state.shootDirection;
            this.moveDirection = state.moveDirection;
        }
    }

    const BehaviorTurret: BotInitializer = () => {
        return function (self:RobotState, environment: Environment) {
            if (environment.enemy) {
                const enemy = environment.enemy;
                self.shootDirection = Math.atan2(enemy.y - self.y, enemy.x - self.x);
                self.shoot = true;
            } else {
                self.shoot = false;
            }
        };
    };

    interface Line {
        x: number;
        y: number;
        direction: number;
    }

    function square(x: number) {
        return x * x;
    }

    function getDistance(a: Position, b: Position) {
        return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
    }

    function circleIntersectsLine(circle: Circle, line: Line): boolean {
        const cosine = Math.cos(line.direction);
        const sine = Math.sin(line.direction)
        const x1 = line.x - circle.x;
        const y1 = line.y - circle.y;
        const x2 = x1 + cosine;
        const y2 = y1 + sine;
        const discriminant = square(circle.radius) * (square(cosine) + square(sine)) - square(x1 * y2 - x2 * y1);
        return discriminant >= 0;
    }

    const BehaviorDodger: BotInitializer = () => {
        let directionOffset = Math.PI / 2;

        return function (self: RobotState, environment: Environment) {
            let closestProjectile: ProjectileState;
            let minimumDistance = 1000;

            // Projectiles that will hit us
            const projectiles = environment.enemyProjectiles.filter((e) => circleIntersectsLine(self, e));

            for (const p of projectiles) {
                const distance = getDistance(self, p);
                if (distance < minimumDistance) {
                    minimumDistance = distance;
                    closestProjectile = p;
                }
            }

            if (closestProjectile) {
                const directionToProjectile = Math.atan2(closestProjectile.y - self.y, closestProjectile.x - self.x);
                self.moveDirection = directionToProjectile + directionOffset;
                const nextX = self.x + Math.cos(self.moveDirection);
                const nextY = self.y + Math.sin(self.moveDirection);
                if (nextX < environment.bounds.xMin || nextX > environment.bounds.xMax || nextY < environment.bounds.yMin || nextY > environment.bounds.yMax) {
                    directionOffset = -directionOffset;
                    self.moveDirection = directionToProjectile + directionOffset;
                }

                self.move = true;
            } else {
                self.move = false;
            }
        };
    };

    class Coliseum extends React.Component<{width: number, height: number, left: BotInitializer, right: BotInitializer}> {
        private static readonly fps = 30;
        private static readonly maxDistance = 10;
        private static readonly environmentBounds: Bounds = {
            xMin: -Coliseum.maxDistance,
            xMax: Coliseum.maxDistance,
            yMin: -Coliseum.maxDistance,
            yMax: Coliseum.maxDistance,
        };
    
        private entities: MovingEntity[];

        private width: number;
        private height: number;
        private canvas: React.RefObject<HTMLCanvasElement> = React.createRef<HTMLCanvasElement>();
        private renderingContext?: CanvasRenderingContext2D = null;
        private updateToken?: number = null;
    
        constructor(props) {
            super(props);
        }

        private static getCollisionOverlap(a: Collidable, b: Collidable): number {
            const centerDistance = getDistance(a, b);
            const overlapDistance = a.radius + b.radius - centerDistance;
            if (overlapDistance > 0) {
                return overlapDistance;
            }
            return 0;
        }

        private visible(): boolean {
            return !!(this.canvas.current);
        }

        private hookUpdate() {
            this.updateToken = window.setInterval(this.update, 1000 / Coliseum.fps);
        }

        private unhookUpdate() {
            if (this.updateToken !== null) {
                window.clearInterval(this.updateToken);
                this.updateToken = null;
            }
        }

        private getEnvironment(self: Entity): Environment {
            return {
                bounds: Coliseum.environmentBounds,
                enemy: this.entities
                    .filter(e => e !== self && e.collisionClass === CollisionClass.solid)
                    .map<EnemyState>(e => ({
                        x: e.x,
                        y: e.y,
                        radius: e.radius,
                        direction: e.move ? e.moveDirection : null,
                        speed: e.move ? e.speed : 0,
                    }))
                    [0] || null,

                enemyProjectiles: this.entities
                    .filter(e => isProjectile(e) && isMovingEntity(e) && e.source !== self)
                    .map<ProjectileState>(e => ({
                        x: e.x,
                        y: e.y,
                        direction: e.moveDirection,
                        speed: e.speed,
                    })),
            };
        }

        private enforceBounds() {
            for (const e of this.entities) {
                if (isProjectile(e)) {
                    if (e.x < -Coliseum.maxDistance || e.x > Coliseum.maxDistance || e.y < -Coliseum.maxDistance || e.y > Coliseum.maxDistance) {
                        e.dead = true;
                    }
                } else {
                    e.x = Math.max(-Coliseum.maxDistance, Math.min(Coliseum.maxDistance, e.x));
                    e.y = Math.max(-Coliseum.maxDistance, Math.min(Coliseum.maxDistance, e.y));
                }
            }
        }
    
        private findAndResolveCollisions() {
            // Loop through solids first
            for (const a of this.entities) {
                if (a.collisionClass === CollisionClass.solid) {
                    // Loop through all other entities and check for collisions
                    for (const b of this.entities) {
                        if (a !== b) {
                            const overlapDistance = Coliseum.getCollisionOverlap(a, b);
                            if (overlapDistance > 0) {
                                if (b.collisionClass === CollisionClass.solid) {
                                    // Collision with solid; resolve
                                    const directionAToB = Math.atan2(b.y - a.y, b.x - a.x);
                                    const dax = -overlapDistance / 2 * Math.cos(directionAToB) * 1.0001;
                                    const day = -overlapDistance / 2 * Math.sin(directionAToB) * 1.0001;
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
        
        private updateEntities() {
            // Update entities (and add any new ones they create)
            let newEntities = [];
            for (const e of this.entities) {
                const getEnvironmentForEntity = () => this.getEnvironment(e);
                e.update();

                if (isScriptable(e)) {
                    const result = e.updateWithEnvironment(getEnvironmentForEntity);
                    if (result) {
                        newEntities = newEntities.concat(result);
                    }
                }
            }
            this.entities = this.entities.concat(newEntities);
        
            this.findAndResolveCollisions();
            this.enforceBounds();
        
            this.entities = this.entities.filter(e => !e.dead);
        
            if (this.entities.length <= 1) {
                this.unhookUpdate();
            }
        }

        private start() {
            this.entities = [
                new Bot(-10 * Math.random(), 20 * Math.random() - 10, this.props.left),
                new Bot(10 * Math.random(), 20 * Math.random() - 10, this.props.right),
            ];

            this.unhookUpdate();
            this.hookUpdate();
        }

        public draw = () => {
            this.renderingContext.fillStyle = "gray";
            this.renderingContext.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);    
            this.renderingContext.fillStyle = "black";
            this.renderingContext.fillRect(-Coliseum.maxDistance, -Coliseum.maxDistance, Coliseum.maxDistance * 2, Coliseum.maxDistance * 2);
        
            this.renderingContext.lineWidth = 0.1;
            this.entities.forEach(a => a.draw(this.renderingContext));
        }

        public update = () => {
            if (this.visible()) {
                this.updateEntities();
                requestAnimationFrame(this.draw);
            } else {
                this.unhookUpdate();
            }
        }

        public componentDidMount() {
            if (this.visible()) {
                this.renderingContext = this.canvas.current.getContext("2d");

                // TODO: Move to helper?
                let scale: number;
                const canvas = this.canvas.current;
                if (canvas.width < canvas.height) {
                    scale = canvas.width / (2 * Coliseum.maxDistance);
                    this.width = (2 * Coliseum.maxDistance);
                    this.height = canvas.height / scale;
                } else {
                    scale = canvas.height / (2 * Coliseum.maxDistance);
                    this.height = (2 * Coliseum.maxDistance);
                    this.width = canvas.width / scale;
                }
                
                this.renderingContext.scale(scale, -scale);
                this.renderingContext.translate(this.width / 2, -this.height / 2);

                this.start();
                this.canvas.current.scrollIntoView();
            }
        }

        public componentDidUpdate() {
            this.start();
        }

        public render() {
            return <canvas ref={this.canvas} width={this.props.width} height={this.props.height} tabIndex={1}></canvas>;
        }
    }

    const potentialOpponents: { name: string, initializer: BotInitializer}[] = [
        { name: "Sitting duck", initializer: () => (() => {}) },
        { name: "Turret", initializer: BehaviorTurret },
        { name: "Dodger", initializer: BehaviorDodger },
    ];

    const templateCode =
`// Declare any constants or variables here, if needed
var directionDelta = Math.PI / 100;

/**
 * Using the current state and information about the environment,
 * "think" determines what the robot should do next (by setting
 * self.shootDirection, self.shoot, etc.)
 * 
 * (Note: leave these annotations in place to support auto-suggest)
 * 
 * @param self {RobotState} State of the robot
 * @param environment {Environment} Information about the environment
 */

function think(self, environment) {
    // This example just spins around shooting constantly
    self.shootDirection += directionDelta;
    self.shoot = true;
}
`;

    const argumentStringPropertyName = "__COLISEUM_STRING";
    const argumentsParsedProperytName = "__COLISEUM_PARSED";
    const callbackWrapperCode =
        `${argumentsParsedProperytName} = JSON.parse(${argumentStringPropertyName});
        think(${argumentsParsedProperytName}.state, ${argumentsParsedProperytName}.environment);
        ${argumentStringPropertyName} = JSON.stringify(${argumentsParsedProperytName});`;

    class ColiseumEditor extends React.Component<{}, {error?: Error}> {
        private inputCode = React.createRef<HTMLTextAreaElement>();
        private inputEnemy = React.createRef<HTMLSelectElement>();

        constructor(props) {
            super(props);
            this.state = {};
        }

        private logErrorAndStop(error: Error) {
            this.setState({ error });
            ReactDOM.unmountComponentAtNode(document.getElementById("outputRoot"));
        }

        private createScriptedBot(): BotInitializer {
            if (this.state.error) {
                this.setState({ error: null });
            }

            try {
                const code = this.inputCode.current.value;
                const vm = new Interpreter(code);
                // TODO: Limit number of steps (here and especially below)
                vm.run();
                const customInitializer: BotInitializer = () => {
                    return (self: RobotState, environment: Environment) => {
                        try {
                            vm.setProperty(vm.global, argumentStringPropertyName, JSON.stringify({
                                state: self,
                                environment,
                            }));

                            vm.appendCode(callbackWrapperCode);
                            vm.run();
                            const resultState = JSON.parse(vm.getProperty(vm.global, argumentStringPropertyName) as string).state as RobotState;

                            self.shootDirection = resultState.shootDirection;
                            self.moveDirection = resultState.moveDirection;
                            self.move = resultState.move;
                            self.shoot = resultState.shoot;
                        } catch (error) {
                            // Error during execution
                            this.logErrorAndStop(error);
                        }
                    };
                };

                return customInitializer;
            } catch (error) {
                // Error during initialization
                this.logErrorAndStop(error);
            }
        }

        public runSimulation = () => {
                const index = parseInt(this.inputEnemy.current.value);
                const left = potentialOpponents[index].initializer;
                const right = this.createScriptedBot();
                const width = document.getElementById("outputRoot").clientWidth;
                ReactDOM.render(<Coliseum width={width} height={400} left={left} right={right} />, document.getElementById("outputRoot"));
        };

        public render() {
            return <>
                Code:
                <textarea cols={80} rows={25} ref={this.inputCode}>{templateCode}</textarea>
                Enemy:
                <select ref={this.inputEnemy}>{potentialOpponents.map((o, index) => <option value={index.toString()}>{o.name}</option>)}</select>
                <button onClick={this.runSimulation}>Run simulation</button>
                {this.state.error ? <p className="error">{this.state.error.toString()}</p> : null}
            </>;
        }
    }

    ReactDOM.render(<ColiseumEditor />, document.getElementById("inputRoot"));
}

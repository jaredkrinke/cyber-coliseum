/// <reference path="./node_modules/monaco-editor/monaco.d.ts" />

declare const React: typeof import("react");
declare const ReactDOM: typeof import("react-dom");
import * as acorn from "./js-interpreter/acorn.js";
(window as any).acorn = acorn;
import { Interpreter } from "./js-interpreter/interpreter.js";
import { coliseumDTS } from "./coliseum-interface-dts";
import { Bounds, EnemyState, Environment, ProjectileState, RobotState } from "./coliseum-interface"

const createNewInterpreter = (code: string) => new Interpreter(code);
type Interpreter = ReturnType<typeof createNewInterpreter>;

// Monaco Editor shim
const monacoShim = {
    loaded: false,
    handler: null,
    then: (f: () => void) => {
        if (monacoShim.loaded) {
            f();
        } else {
            monacoShim.handler = f;
        }
    },
    ready: () => {
        monacoShim.loaded = true;
        if (monacoShim.handler) {
            monacoShim.handler();
        }
    },
};
(window as any).monacoShim = monacoShim;

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

    function isBotInitializer(a: BotInitializer | CodeFile): a is BotInitializer {
        return typeof(a) === "function";
    }

    class Bot extends Ship {
        private thinkHandler: BotThinkHandler;

        constructor (x: number, y: number, public initialize: BotInitializer) {
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

    function isBot(a: MovingEntity): a is Bot {
        return "initialize" in a;
    }

    const BehaviorSittingDuck: BotInitializer = () => (() => {});
    const BehaviorMovingDuck: BotInitializer = () => {
        let moveDirectionDelta = Math.PI / 100;
        return function (self: RobotState, environment: Environment) {
            self.moveDirection += moveDirectionDelta;
            self.move = true;
        };
    };

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

    const BehaviorMovingTurret: BotInitializer = () => {
        const period = 60;
        let timer = period;
        let direction = Math.PI / 2;
        return function (self:RobotState, environment: Environment) {
            if (timer-- <= 0) {
                timer = period;
                direction = -direction;
            }
            self.moveDirection = direction;
            self.move = true;

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

    const BehaviorBoss: BotInitializer = () => {
        let directionOffset = Math.PI / 2;

        return function (self: RobotState, environment: Environment) {
            // Leading shots
            const enemy = environment.enemy;
            var d = getDistance(enemy, self);
            var x = enemy.x + d / 0.5 * enemy.speed * Math.cos(enemy.direction);
            var y = enemy.y + d / 0.5 * enemy.speed * Math.sin(enemy.direction);
            self.shootDirection = Math.atan2(y - self.y, x - self.x);
            self.shoot = true;

            // Dodging
            let closestProjectile: ProjectileState;
            let minimumDistance = 1000;

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

    enum SimulationResult {
        tie,
        leftWins,
        rightWins,
    }

    enum TextAlignment {
        left,
        center,
        right,
    }

    enum Scenario {
        youVersusEnemy,
        leftVersusRight,
    }

    interface ColiseumProperties {
        width: number;
        height: number;
        left: BotInitializer;
        right: BotInitializer;
        scenario: Scenario;
    }

    class Coliseum extends React.Component<ColiseumProperties> {
        private static readonly fps = 30;
        private static readonly maxDistance = 10;
        private static readonly startTimerPeriod = Coliseum.fps;
        private static readonly endTimerPeriod = 2 * Coliseum.fps;
        private static readonly environmentBounds: Bounds = {
            xMin: -Coliseum.maxDistance,
            xMax: Coliseum.maxDistance,
            yMin: -Coliseum.maxDistance,
            yMax: Coliseum.maxDistance,
        };

        private static readonly resultString = {
            [Scenario.youVersusEnemy]: {
                [SimulationResult.tie]: "Tie",
                [SimulationResult.leftWins]: "You lose",
                [SimulationResult.rightWins]: "You win",
            },
            [Scenario.leftVersusRight]: {
                [SimulationResult.tie]: "Tie",
                [SimulationResult.leftWins]: "Left wins",
                [SimulationResult.rightWins]: "Right wins",
            },
        };

        private static readonly robotLabels = {
            [Scenario.youVersusEnemy]: ["Enemy", "You"],
            [Scenario.leftVersusRight]: ["Left", "Right"],
        };

        private entities: MovingEntity[];
        private startTimer: number;
        private endTimer: number;
        private result?: SimulationResult;

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

        private enforceBoundsOnCoordinate(x: number): number {
            return Math.max(-Coliseum.maxDistance, Math.min(Coliseum.maxDistance, x));
        }

        private getEnvironment(self: Entity): Environment {
            return {
                bounds: Coliseum.environmentBounds,
                enemy: this.entities
                    .filter(e => e !== self && e.collisionClass === CollisionClass.solid)
                    .map<EnemyState>(e => {
                        let direction: number = null;
                        let speed = 0;

                        if (e.move) {
                            let nextX = this.enforceBoundsOnCoordinate(e.x + e.speed * Math.cos(e.moveDirection));
                            let nextY = this.enforceBoundsOnCoordinate(e.y + e.speed * Math.sin(e.moveDirection));
                            direction = Math.atan2(nextY - e.y, nextX - e.x);
                            speed = getDistance({ x: nextX, y: nextY }, e);
                        }

                        return {
                            x: e.x,
                            y: e.y,
                            radius: e.radius,
                            direction,
                            speed,
                        };
                    })
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
                    e.x = this.enforceBoundsOnCoordinate(e.x);
                    e.y = this.enforceBoundsOnCoordinate(e.y);
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
            // Check to see if we've started
            if (this.startTimer > 0) {
                this.startTimer--;
                return;
            }

            // Check to see if both robots are around
            const bots = this.entities.filter(e => isBot(e)) as Bot[];
            const inCombat = bots.length > 1;

            // Update entities (and add any new ones they create)
            let newEntities = [];
            for (const e of this.entities) {
                const getEnvironmentForEntity = () => this.getEnvironment(e);
                e.update();

                if (inCombat && isScriptable(e)) {
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

            // Check for end
            if (!inCombat) {
                // Wait bit to declare a victor
                if (this.endTimer-- <= 0) {
                    let simulationResult: SimulationResult;
                    if (bots.length === 1) {
                        simulationResult = (bots[0].initialize === this.props.left) ? SimulationResult.leftWins : SimulationResult.rightWins;
                    } else {
                        simulationResult = SimulationResult.tie;
                    }

                    this.result = simulationResult;
                    this.unhookUpdate();
                }
            }
        }

        private start() {
            this.result = null;
            this.startTimer = Coliseum.startTimerPeriod;
            this.endTimer = Coliseum.endTimerPeriod;
            this.entities = [
                new Bot(-10 * Math.random(), 20 * Math.random() - 10, this.props.left),
                new Bot(10 * Math.random(), 20 * Math.random() - 10, this.props.right),
            ];

            this.unhookUpdate();
            this.hookUpdate();
        }

        private drawText(text: string, x: number, y: number, alignment: TextAlignment) {
            this.renderingContext.font = "2px sans-serif";
            this.renderingContext.fillStyle = "white";

            const width = this.renderingContext.measureText(text).width;
            let offset: number;
            switch (alignment) {
                case TextAlignment.left: offset = 0; break;
                case TextAlignment.center: offset = -width / 2; break;
                case TextAlignment.right: offset = -width; break;
            }

            this.renderingContext.scale(1, -1);
            this.renderingContext.fillText(text, x + offset, y);
            this.renderingContext.scale(1, -1);
        }

        public draw = () => {
            this.renderingContext.fillStyle = "gray";
            this.renderingContext.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
            this.renderingContext.fillStyle = "black";
            this.renderingContext.fillRect(-Coliseum.maxDistance, -Coliseum.maxDistance, Coliseum.maxDistance * 2, Coliseum.maxDistance * 2);

            this.renderingContext.lineWidth = 0.1;
            this.entities.forEach(a => a.draw(this.renderingContext));

            if (this.startTimer > 0) {
                this.drawText(Coliseum.robotLabels[this.props.scenario][0], -Coliseum.maxDistance / 2, 0, TextAlignment.center);
                this.drawText(Coliseum.robotLabels[this.props.scenario][1], Coliseum.maxDistance / 2, 0, TextAlignment.center);
            }

            if (this.result !== null) {
                this.drawText(Coliseum.resultString[this.props.scenario][this.result], 0, 0, TextAlignment.center);
            }
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
            }
        }

        public componentDidUpdate() {
            this.start();
        }

        public render() {
            return <canvas className="bordered" ref={this.canvas} width={this.props.width} height={this.props.height} tabIndex={1}></canvas>;
        }
    }

    enum CodeFile {
        tutorial1,
        tutorial2,
        tutorial3,
        main,
        left,
        right,
    }

    const codeFileToDefaultCode = {
        [CodeFile.tutorial1]: createTemplateCode(`var directionDelta = Math.PI / 100`,
`
    // This example just spins around shooting constantly
    self.shootDirection += directionDelta;
    self.shoot = true;
`),

        [CodeFile.tutorial2]: createTemplateCode("",
`
    // Aim at the enemy using Math.atan2 to compute the correct angle
    if (environment.enemy) {
        self.shootDirection = Math.atan2(environment.enemy.y - self.y, environment.enemy.x - self.x);
        self.shoot = true;
    }
`),

        [CodeFile.tutorial3]: createTemplateCode("",
`
    if (environment.enemy) {
        self.shootDirection = Math.atan2(environment.enemy.y - self.y, environment.enemy.x - self.x);
        self.shoot = true;
    }
`),

        [CodeFile.main]: createTemplateCode("", "\n    // Code goes here\n"),
        [CodeFile.left]: createTemplateCode("", "\n    // Code goes here\n"),
        [CodeFile.right]: createTemplateCode("", "\n    // Code goes here\n"),
            };

    class CodeManager {
        private static codeFileToKey(codeFile: CodeFile): string {
            return `cc_${CodeFile[codeFile]}`;
        }

        public static loadCode(codeFile: CodeFile): string {
            let code: string = null;
            try {
                code = localStorage.getItem(CodeManager.codeFileToKey(codeFile));
            } catch (e) {}

            if (!code) {
                code = codeFileToDefaultCode[codeFile];
            }

            return code;
        }

        public static saveCode(codeFile: CodeFile, code: string): void {
            try {
                if (code !== CodeManager.loadCode(codeFile)) {
                    localStorage.setItem(CodeManager.codeFileToKey(codeFile), code);
                }
            } catch (e) {}
        }
    }

    class CodeEditor extends React.Component<{ codeFile: CodeFile }, { error?: string }> {
        private inputCodeRoot = React.createRef<HTMLDivElement>();
        private inputCode: monaco.editor.IStandaloneCodeEditor;

        constructor(props) {
            super(props);
            this.state = {};
        }

        public getCode(): string {
            if (this.inputCode) {
                return this.inputCode.getValue();
            }
        }

        public runCode(): Interpreter {
            try {
                const code = this.inputCode.getValue();

                // Take this opportunity to save
                CodeManager.saveCode(this.props.codeFile, code);

                // Compile and run
                // TODO: Limit number of steps (here and on each step)
                const vm = new Interpreter(code);
                vm.run();
                return vm;
            } catch (error) {
                // Error during initialization
                this.setState({ error });
            }
        }

        public componentWillUnmount() {
            this.inputCode = null;
        }

        public async componentDidMount() {
            this.inputCode = await attachCodeEditor(this.inputCodeRoot.current, CodeManager.loadCode(this.props.codeFile));
        }

        public componentDidUpdate(previousProps) {
            if (this.inputCode && this.props.codeFile !== previousProps.codeFile) {
                this.inputCode.setValue(CodeManager.loadCode(this.props.codeFile));
            }
        }

        public render() {
            return <>
                <div className="inputCodeRoot" ref={this.inputCodeRoot}></div>
                {this.state.error ? <p className="error">{this.state.error.toString()}</p> : null}
                </>;
        }
    }

    const argumentStringPropertyName = "__COLISEUM_STRING";
    const argumentsParsedProperytName = "__COLISEUM_PARSED";
    const callbackWrapperCode =
        `${argumentsParsedProperytName} = JSON.parse(${argumentStringPropertyName});
        think(${argumentsParsedProperytName}.state, ${argumentsParsedProperytName}.environment);
        ${argumentStringPropertyName} = JSON.stringify(${argumentsParsedProperytName});`;

    class ColiseumEditor extends React.Component<{ codeFile: CodeFile, opponent: BotInitializer | CodeFile }, {error?: Error}> {
        private codeEditorLeft = React.createRef<CodeEditor>();
        private codeEditorRight = React.createRef<CodeEditor>();
        private inputEnemy = React.createRef<HTMLSelectElement>();

        constructor(props) {
            super(props);
            this.state = {};
        }

        private logError(error: Error) {
            this.setState({ error });
        }

        private logErrorAndStop(error: Error) {
            this.setState({ error });
            ReactDOM.unmountComponentAtNode(document.getElementById("outputRoot"));
        }

        private createScriptedBot(editor: CodeEditor): BotInitializer {
            if (this.state.error) {
                this.setState({ error: null });
            }

            try {
                // Compile and run
                // TODO: Limit number of steps (here and especially below)
                const vm = editor.runCode();
                if (vm) {
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
                }
            } catch (error) {
                // Error during initialization
                this.logError(error);
            }
        }

        public runSimulation = () => {
                const left = isBotInitializer(this.props.opponent) ? this.props.opponent : this.createScriptedBot(this.codeEditorLeft.current);
                const right = this.createScriptedBot(this.codeEditorRight.current);
                if (right) {
                    const size = Math.min(window.innerWidth, window.innerHeight) * 0.8;
                    MessageBox.show("Simulation", <div id="outputRoot"><Coliseum width={size} height={size} left={left} right={right} scenario={isBotInitializer(this.props.opponent) ? Scenario.youVersusEnemy : Scenario.leftVersusRight} /></div>, true)
                }
        };

        public render() {
            return <>
                {
                    isBotInitializer(this.props.opponent)
                    ? null
                    : <>
                        <p>Code for left robot:</p>
                        <CodeEditor ref={this.codeEditorLeft} codeFile={this.props.opponent} />
                        <p>Code for right robot:</p>
                    </>
                }
                <CodeEditor ref={this.codeEditorRight} codeFile={this.props.codeFile} />
                <button onClick={this.runSimulation}>Run simulation</button>
                {this.state.error ? <p className="error">{this.state.error.toString()}</p> : null}
            </>;
        }
    }

    class MessageBox extends React.Component<{title: string, body: React.ReactFragment, closed: () => void, important: boolean}> {
        private static readonly messageBoxRoot = document.getElementById("messageBoxRoot");

        public static show(title: string, body: React.ReactFragment, important: boolean = false) {
            ReactDOM.unmountComponentAtNode(MessageBox.messageBoxRoot);
            ReactDOM.render(<MessageBox title={title} body={body} closed={MessageBox.hide} important={important}/>, MessageBox.messageBoxRoot);
        }

        public static hide() {
            ReactDOM.unmountComponentAtNode(MessageBox.messageBoxRoot);
        }

        public render() {
            return <>
                <div className="dimmer" onClick={this.props.important ? () => {} : this.props.closed}></div>
                <div className="messageBox">
                    <div className="messageBoxHeader">
                        <button className="messageBoxCloseButton" onClick={this.props.closed}>X</button>
                        {this.props.title}
                    </div>
                    <div className="messageBoxBody">
                        {this.props.body}
                    </div>
                </div>
            </>;
        }
    }

    class OptionBase {
        constructor(public title: string) {}
    }

    class OptionInformation extends OptionBase {
        constructor(title: string, public content: React.ReactFragment) {
            super(title);
        }
    }

    class OptionChallenge extends OptionBase {
        constructor (title: string, public opponent: BotInitializer, public blurb: React.ReactFragment, public codeFile: CodeFile = CodeFile.main) {
            super(title);
        }
    }

    class OptionArena extends OptionBase {
        constructor () {
            super("Arena");
        }
    }

    function isOptionInformation(o: OptionBase): o is OptionInformation {
        return "content" in o;
    }

    function isOptionChallenge(o: OptionBase): o is OptionChallenge {
        return "opponent" in o;
    }

    function isOptionArena(o: OptionBase): o is OptionArena {
        return o.title === "Arena";
    }

    function toClassName(classes: string[]): string {
        return classes.join(" ");
    }

    function createTemplateCode(init: string, body: string) {
        return `// Declare any constants or variables here, if needed
${init}
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

function think(self, environment) {${body}}
`;
    }

    class ColiseumRoot extends React.Component<{ options: OptionBase[] }, { index: number }> {
        constructor(props) {
            super(props);
            this.state = { index: 0 };
        }

        public render() {
            let rightBody: React.ReactFragment = null;
            const selected = this.props.options[this.state.index];
            if (isOptionInformation(selected)) {
                rightBody = selected.content;
            } else if (isOptionChallenge(selected)) {
                rightBody = <>
                    {selected.blurb}
                    <ColiseumEditor codeFile={selected.codeFile} opponent={selected.opponent} />
                </>;
            } else if (isOptionArena(selected)) {
                rightBody = <>
                    <p>In The Arena, you can paste in code for both robots, to test your creations against each other or against code posted online by other players.</p>
                    <ColiseumEditor codeFile={CodeFile.right} opponent={CodeFile.left} />
                </>;
            }

            return <>
                <div id="left">
                    <div className="header">Navigation</div>
                    {this.props.options.map((o, i) => {
                        let classNames = ["option"];
                        if (i === this.state.index) {
                            classNames.push("selected");
                        }
                        return <button className={toClassName(classNames)} onClick={() => this.setState({ index: i})}>{
                            isOptionChallenge(o) ? `Challenge: ${o.title}` : o.title
                        }</button>;
                    })}
                </div>
                <div id="right">
                    <h1>{selected.title}</h1>
                    {rightBody}
                </div>
            </>;
        }
    }

    function attachCodeEditor(root: HTMLElement, code: string, language:string = "javascript"): Promise<monaco.editor.IStandaloneCodeEditor> {
        return new Promise((resolve, reject) => {
            monacoShim.then(() => {
                const editor = monaco.editor.create(root, {
                    value: code,
                    theme: "vs-dark",
                    language,
                    folding: false,
                    minimap: { enabled: false },
                });

                monaco.languages.typescript.javascriptDefaults
                    .addExtraLib(coliseumDTS, "coliseum.d.ts");

                resolve(editor);
            });
        });
    }

    class TypeDeclarations extends React.Component {
        private container = React.createRef<HTMLDivElement>();

        constructor(props) {
            super(props);
        }

        public async componentDidMount() {
            attachCodeEditor(this.container.current, coliseumDTS, "typescript");
        }

        public render() {
            const size = Math.min(window.innerWidth, window.innerHeight) * 0.8;
            return <div style={{ width: `${size}px`, height: `${size}px` }} ref={this.container}></div>;
        }
    }

    const options: OptionBase[] = [
        new OptionInformation("Welcome", <>
            <p>The <strong>Cyber Coliseum</strong> hosts battles to the destruction between two robots that are programmed using JavaScript. The robots can move and shoot projectiles at each other. If a robot absorbs 10 direct hits, the robot is destroyed.</p>
            <p>Use the pane on the left to view information and attempt challenges.</p>
            <blockquote>"The wars of the future will not be fought on the battlefield or at sea. They will be fought in space, or possibly on top of a very tall mountain. In either case, most of the actual fighting will be done by small robots. And as you go forth today, remember always your duty is clear: to build and maintain those robots."<footer>Rommelwood Military School Commandant</footer></blockquote>
        </>),
        new OptionInformation("Introduction", <>
            <p>Robots are programmed by declaring a "think" function that accepts two arguments:
                <ul>
                    <li><strong>self</strong> (which represents your robot's internal state)</li>
                    <li><strong>environment</strong> (which represents the environment, e.g. boundaries and state of the enemy and its projectiles)</li>
                </ul>
            </p>
            <p>Some examples:</p>
            <ul>
                <li><strong>"self.shootDirection = Math.PI / 2;"</strong> causes the robot to aim straight up</li>
                <li><strong>"self.shoot = true;"</strong> causes the robot to try and shoot (in the direction of shootDirection)</li>
                <li><strong>"environment.enemy.x"</strong> is the enemy robot's position along the horizontal (x) axis</li>
            </ul>
            <p>Note: the code editor provides inline code suggestions that describe the available properties on these objects, but by clicking the following link, you can also <a href="#" onClick={(e) => { e.preventDefault(); MessageBox.show("Type declarations", <TypeDeclarations />); }}>view the full type delcarations</a>.</p>
            <p>Select the first challenge from the list on the left to get started.</p>
        </>),
        new OptionChallenge("Sitting Duck", BehaviorSittingDuck, <>
            <p>In this challenge, your opponent (the left robot) is a helpless sitting duck. All you need to do is program your robot (on the right) to aim and shoot.</p>
            <p>The starter code just spins and shoots constantly (by adding to "self.shootDirection" while "self.shoot" is true). This could be improved by aiming in the direction of "environment.enemy.x" and "environment.enemy.y" (see the following link for information on <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math" target="_blank">JavaScript's built-in math/geometry functions</a>).</p>
        </>, CodeFile.tutorial1),
        new OptionChallenge("Moving Duck", BehaviorMovingDuck, <>
            <p>This time, your opponent is still helpless, but at least it moves.</p>
            <p>The sample code has been updated to aim at the enemy using <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/atan2" target="_blank">Math.atan2(y, x)</a>.</p>
        </>, CodeFile.tutorial2),
        new OptionChallenge("Turret", BehaviorTurret, <>
            <p>You're in the big leagues now! This enemy fights back.</p>
            <p>The sample code aims and shoots. It's probably a good idea to add some movement.</p>
        </>, CodeFile.tutorial3),
        new OptionChallenge("Mobile Turret", BehaviorMovingTurret, <>
            <p>This is a real enemy that moves and attacks. Good luck!</p>
        </>),
        new OptionArena(),
        new OptionChallenge("Final Boss", BehaviorBoss, <>
            <p>You don't stand a chance...</p>
        </>),
    ];

    ReactDOM.render(<ColiseumRoot options={options} />, document.getElementById("root"));
}

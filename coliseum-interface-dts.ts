export const coliseumDTS =
`/** (Read-only) Current state of an enemy */
 interface EnemyState {
    /** Horizontal position of the enemy */
    x: number;

    /** Vertical position of the enemy */
    y: number;

    /** Radius of the enemy's bounding circle */
    radius: number;

    /** Direction in which the enemy is moving (or null if not moving) */
    direction: number | null;

    /** Speed at which the enemy is moving (zero if not moving) */
    speed: number;
}

/** (Read-only) Current state of an enemy projectile */
 interface ProjectileState {
    /** Horizontal position of the projectile */
    x: number;

    /** Vertical position of the projectile */
    y: number;

    /** Direction in which the projectile is moving */
    direction: number;

    /** Speed at which the projectile is moving */
    speed: number;
}

/** Defines the limits of the battlefield */
 interface Bounds {
    /** Farthest left position (-10) */
    xMin: number;

    /** Farthest right position (10) */
    xMax: number;

    /** Farthest down position (-10) */
    yMin: number;

    /** Farthest up position (10) */
    yMax: number;
}

/** 
 * State of the robot. Modify moveDirection, move, shootDirection, and shoot to
 * control the robot.
 */
 interface RobotState {
    /** (Read-only) Current horizontal position */
    x: number;

    /** (Read-only) Current vertical position */
    y: number;

    /** (Read-only) Radius of robot's bounding circle*/
    radius: number;

    /** Direction to move (in radians; zero means to the right) */
    moveDirection: number;

    /** Set this to true if the robot should move (in the direction of moveDirection) */
    move: boolean;

    /** Direction in which to shoot (in radians) */
    shootDirection: number;

    /** Set this to true if the robot should shoot (in the direction of shootDirection) */
    shoot: boolean;
}

/** (Read-only) Information about the robot's environment */
 interface Environment {
    /** Limits of the battlefield */
    bounds: Bounds;

    /** Current state of the enemy (or null if no enemy present) */
    enemy: EnemyState | null;

    /** Current state of enemy projectiles */
    enemyProjectiles: ProjectileState[];
}
`;

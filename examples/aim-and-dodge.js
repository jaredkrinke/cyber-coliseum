var directionOffset = Math.PI / 2;

function square(x) {
    return x * x;
}

function getDistance(a, b) {
    return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
}

function circleIntersectsLine(circle, line) {
    var cosine = Math.cos(line.direction);
    var sine = Math.sin(line.direction)
    var x1 = line.x - circle.x;
    var y1 = line.y - circle.y;
    var x2 = x1 + cosine;
    var y2 = y1 + sine;
    var discriminant = square(circle.radius) * (square(cosine) + square(sine)) - square(x1 * y2 - x2 * y1);
    return discriminant >= 0;
}

/**
 * Using the current state and information about the environment,
 * "think" determines what the robot should do next (by setting
 * self.shootDirection, self.shoot, etc.)
 * 
 * @param self {RobotState} State of the robot
 * @param environment {Environment} Information about the environment
 */
function think(self, environment) {
    var closestProjectile;
    var minimumDistance = 1000;

    // Projectiles that will hit us
    var projectiles = environment.enemyProjectiles.filter(function (e) { return circleIntersectsLine(self, e); });

    for (var i = 0; i < projectiles.length; i++) {
        var p = projectiles[i];
        var distance = getDistance(self, p);
        if (distance < minimumDistance) {
            minimumDistance = distance;
            closestProjectile = p;
        }
    }

    if (closestProjectile) {
        var directionToProjectile = Math.atan2(closestProjectile.y - self.y, closestProjectile.x - self.x);
        self.moveDirection = directionToProjectile + directionOffset;
        var nextX = self.x + Math.cos(self.moveDirection);
        var nextY = self.y + Math.sin(self.moveDirection);
        if (nextX < environment.bounds.xMin || nextX > environment.bounds.xMax || nextY < environment.bounds.yMin || nextY > environment.bounds.yMax) {
            directionOffset = -directionOffset;
            self.moveDirection = directionToProjectile + directionOffset;
        }

        self.move = true;
    } else {
        self.move = false;
    }

    if (environment.enemy) {
        var enemy = environment.enemy;
        self.shootDirection = Math.atan2(enemy.y - self.y, enemy.x - self.x);
        self.shoot = true;
    } else {
        self.shoot = false;
    }
}

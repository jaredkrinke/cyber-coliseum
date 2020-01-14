var angleOffset = Math.PI / 2;

function square(x) {
    return x * x;
}

function getDistance(a, b) {
    return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
}

function circleIntersectsLine(circle, line) {
    var cosine = Math.cos(line.angle);
    var sine = Math.sin(line.angle)
    var x1 = line.x - circle.x;
    var y1 = line.y - circle.y;
    var x2 = x1 + cosine;
    var y2 = y1 + sine;
    var discriminant = square(circle.radius) * (square(cosine) + square(sine)) - square(x1 * y2 - x2 * y1);
    return discriminant >= 0;
}

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
        var angleToProjectile = Math.atan2(closestProjectile.y - self.y, closestProjectile.x - self.x);
        self.moveAngle = angleToProjectile + angleOffset;
        var nextX = self.x + Math.cos(self.moveAngle);
        var nextY = self.y + Math.sin(self.moveAngle);
        if (nextX < environment.bounds.xMin || nextX > environment.bounds.xMax || nextY < environment.bounds.yMin || nextY > environment.bounds.yMax) {
            angleOffset = -angleOffset;
            self.moveAngle = angleToProjectile + angleOffset;
        }

        self.move = true;
    } else {
        self.move = false;
    }

    if (environment.enemies.length > 0) {
        var enemy = environment.enemies[0];
        self.aimAngle = Math.atan2(enemy.y - self.y, enemy.x - self.x);
        self.shoot = true;
    } else {
        self.shoot = false;
    }
}

/* =====================================================================
   CS42 Week 08 - Assignment 10: Adding UI + Sound
   ASTEROIDS built with Phaser 4 (Arcade Physics)

   Scenes:
     1. PreloadScene  - loads the two audio assets + generates textures
     2. TitleScene    - pre-gameplay "attractor" screen
     3. GameScene     - main gameplay (text UI: score / level / lives)
     4. GameOverScene - final score screen, returns to the title

   Audio assets (assets/ folder):
     - laser.wav     -> played every time the ship fires
     - explosion.wav -> played when an asteroid or the ship is destroyed

   Controls:  LEFT/RIGHT or A/D = rotate   UP or W = thrust
              SPACE = fire                 M = mute / unmute
   ===================================================================== */

// ---------------------------------------------------------------------
// GAME-WIDE CONSTANTS (tweak these to change the feel of the game)
// ---------------------------------------------------------------------
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

const SHIP_TURN_SPEED = 250;   // degrees per second
const SHIP_THRUST = 280;       // acceleration while thrusting
const SHIP_MAX_SPEED = 360;
const BULLET_SPEED = 520;
const BULLET_LIFETIME = 1000;  // ms before a bullet disappears
const FIRE_DELAY = 220;        // ms between shots
const STARTING_LIVES = 3;
const EXTRA_LIFE_EVERY = 2000; // award a life every N points

// Data for the three asteroid sizes. A large asteroid splits into two
// medium ones, a medium splits into two small ones, small just vanishes.
const ASTEROID_TYPES = {
  large:  { key: 'asteroid-large',  radius: 40, points: 20,  minSpeed: 30, maxSpeed: 70,  next: 'medium', boomRate: 0.8 },
  medium: { key: 'asteroid-medium', radius: 24, points: 50,  minSpeed: 50, maxSpeed: 110, next: 'small',  boomRate: 1.0 },
  small:  { key: 'asteroid-small',  radius: 13, points: 100, minSpeed: 80, maxSpeed: 160, next: null,     boomRate: 1.4 }
};

const UI_FONT = 'Courier New, monospace';

// ---------------------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------------------

// Wrap a game object around the screen edges (classic Asteroids behavior)
function wrapAround(obj, margin) {
  if (obj.x < -margin) obj.x = GAME_WIDTH + margin;
  else if (obj.x > GAME_WIDTH + margin) obj.x = -margin;
  if (obj.y < -margin) obj.y = GAME_HEIGHT + margin;
  else if (obj.y > GAME_HEIGHT + margin) obj.y = -margin;
}

// Create a texture by drawing on a canvas with the 2D context.
// This lets the game run with only the two audio files as external assets.
function makeTexture(scene, key, w, h, drawFn) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  drawFn(tex.getContext(), w, h);
  tex.refresh(); // push the canvas pixels to the GPU
}

// Draw a jagged, rock-like polygon centered in a w x h canvas
function drawRock(ctx, w, h, radius) {
  const points = 12;
  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = radius * Phaser.Math.FloatBetween(0.72, 1.0);
    const x = w / 2 + Math.cos(angle) * r;
    const y = h / 2 + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#111';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
}

// =====================================================================
// SCENE 1: PRELOAD - load audio and build all textures
// =====================================================================
class PreloadScene extends Phaser.Scene {
  constructor() { super('PreloadScene'); }

  preload() {
    // Simple "loading" text while the audio files download
    const loadingText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'LOADING...', {
      fontFamily: UI_FONT, fontSize: '28px', color: '#ffffff'
    }).setOrigin(0.5);
    this.load.on('progress', (p) => loadingText.setText('LOADING ' + Math.round(p * 100) + '%'));

    // ---- AUDIO ASSET #1 and #2 ----
    this.load.audio('laser', 'assets/laser.wav');
    this.load.audio('explosion', 'assets/explosion.wav');
  }

  create() {
    // High score lives in the game-wide registry so every scene can read it
    this.registry.set('highScore', 0);

    // ---- Ship (points to the RIGHT so rotation 0 = facing right) ----
    makeTexture(this, 'ship', 32, 32, (ctx) => {
      ctx.beginPath();
      ctx.moveTo(30, 16); ctx.lineTo(4, 4); ctx.lineTo(10, 16); ctx.lineTo(4, 28);
      ctx.closePath();
      ctx.fillStyle = '#111'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    });

    // ---- Engine flame (tip points left, drawn behind the ship) ----
    makeTexture(this, 'flame', 16, 10, (ctx) => {
      ctx.beginPath();
      ctx.moveTo(0, 5); ctx.lineTo(16, 0); ctx.lineTo(16, 10);
      ctx.closePath();
      ctx.fillStyle = '#ff9a1f'; ctx.fill();
    });

    // ---- Bullet ----
    makeTexture(this, 'bullet', 6, 6, (ctx) => {
      ctx.beginPath(); ctx.arc(3, 3, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
    });

    // ---- Asteroids (one texture per size) ----
    Object.values(ASTEROID_TYPES).forEach((t) => {
      const size = t.radius * 2 + 6;
      makeTexture(this, t.key, size, size, (ctx, w, h) => drawRock(ctx, w, h, t.radius));
    });

    this.scene.start('TitleScene');
  }
}

// =====================================================================
// SCENE 2: TITLE - the pre-gameplay "attractor" screen
// =====================================================================
class TitleScene extends Phaser.Scene {
  constructor() { super('TitleScene'); }

  create() {
    // Decorative asteroids drifting in the background to attract players
    this.drifters = [];
    for (let i = 0; i < 8; i++) {
      const type = Phaser.Utils.Array.GetRandom(Object.values(ASTEROID_TYPES));
      const rock = this.add.image(
        Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(0, GAME_HEIGHT), type.key
      ).setAlpha(0.55);
      rock.vx = Phaser.Math.FloatBetween(-40, 40);
      rock.vy = Phaser.Math.FloatBetween(-40, 40);
      rock.spin = Phaser.Math.FloatBetween(-40, 40);
      this.drifters.push(rock);
    }

    // ---- Text-based UI: title, instructions, high score ----
    this.add.text(GAME_WIDTH / 2, 150, 'ASTEROIDS', {
      fontFamily: UI_FONT, fontSize: '84px', fontStyle: 'bold', color: '#ffffff'
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 280, [
      'LEFT / RIGHT : rotate',
      'UP           : thrust',
      'SPACE        : fire',
      'M            : mute sound'
    ], {
      fontFamily: UI_FONT, fontSize: '22px', color: '#9ad1ff', align: 'left', lineSpacing: 6
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 410, 'HIGH SCORE: ' + this.registry.get('highScore'), {
      fontFamily: UI_FONT, fontSize: '26px', color: '#ffd84a'
    }).setOrigin(0.5);

    // Blinking prompt (a tween that fades the text in and out forever)
    const prompt = this.add.text(GAME_WIDTH / 2, 500, 'PRESS SPACE TO START', {
      fontFamily: UI_FONT, fontSize: '32px', color: '#ffffff'
    }).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.1, duration: 600, yoyo: true, repeat: -1 });

    // Start the game on SPACE or a click/tap. The user gesture also
    // unlocks browser audio, and we play the laser sound as a "confirm" beep.
    const startGame = () => {
      this.sound.play('laser', { volume: 0.5 });
      this.scene.start('GameScene');
    };
    this.input.keyboard.once('keydown-SPACE', startGame);
    this.input.once('pointerdown', startGame);
  }

  update(time, delta) {
    // Move the background rocks and wrap them around the screen
    const dt = delta / 1000;
    this.drifters.forEach((rock) => {
      rock.x += rock.vx * dt;
      rock.y += rock.vy * dt;
      rock.angle += rock.spin * dt;
      wrapAround(rock, 50);
    });
  }
}

// =====================================================================
// SCENE 3: GAME - the main gameplay scene
// =====================================================================
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    // ---- Values shown in the UI. They change as the game is played. ----
    this.score = 0;
    this.level = 1;
    this.lives = STARTING_LIVES;
    this.nextExtraLife = EXTRA_LIFE_EVERY;

    // ---- Game state flags ----
    this.shipAlive = true;
    this.invulnerableUntil = 0;
    this.lastShot = 0;
    this.levelTransition = false;
    this.gameEnding = false;

    // ---- Physics groups: bullets and asteroids ----
    this.bullets = this.physics.add.group();
    this.asteroids = this.physics.add.group();

    // ---- Player ship ----
    this.flame = this.add.image(0, 0, 'flame').setOrigin(1, 0.5).setVisible(false);
    this.ship = this.physics.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'ship');
    this.ship.body.setCircle(10, 6, 6);        // forgiving circular hitbox
    this.ship.setDamping(true).setDrag(0.55);  // slows down gradually in "space"
    this.ship.setMaxVelocity(SHIP_MAX_SPEED);

    // ---- Keyboard input ----
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,D,SPACE,M');
    this.input.keyboard.on('keydown-M', () => {   // mute toggle
      this.sound.mute = !this.sound.mute;
      this.soundText.setText(this.sound.mute ? 'SOUND: OFF  [M]' : 'SOUND: ON  [M]');
    });

    // ---- Text-based UI (HUD) ----
    const hud = { fontFamily: UI_FONT, fontSize: '24px', color: '#ffffff' };
    this.scoreText = this.add.text(16, 12, '', hud).setDepth(10);
    this.levelText = this.add.text(GAME_WIDTH / 2, 12, '', hud).setOrigin(0.5, 0).setDepth(10);
    this.livesText = this.add.text(GAME_WIDTH - 16, 12, '', hud).setOrigin(1, 0).setDepth(10);
    this.soundText = this.add.text(16, GAME_HEIGHT - 28, this.sound.mute ? 'SOUND: OFF  [M]' : 'SOUND: ON  [M]', {
      fontFamily: UI_FONT, fontSize: '16px', color: '#888888'
    }).setDepth(10);
    this.updateHUD();

    // ---- Collisions ----
    // bullet touches asteroid -> destroy both, add score, split the rock
    this.physics.add.overlap(this.bullets, this.asteroids, this.onBulletHitAsteroid, null, this);
    // ship touches asteroid -> lose a life (only if not in respawn shield)
    this.physics.add.overlap(this.ship, this.asteroids, this.onShipHitAsteroid,
      () => this.shipAlive && this.time.now > this.invulnerableUntil, this);

    // ---- Begin level 1 ----
    this.spawnWave();
    this.showBanner('LEVEL ' + this.level);
  }

  // -------------------------------------------------------------------
  // UI: refresh all of the on-screen text from the current values
  // -------------------------------------------------------------------
  updateHUD() {
    this.scoreText.setText('SCORE: ' + this.score);
    this.levelText.setText('LEVEL ' + this.level);
    this.livesText.setText('LIVES: ' + this.lives);
  }

  // Big text that appears in the middle of the screen and fades out
  showBanner(message) {
    const banner = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, message, {
      fontFamily: UI_FONT, fontSize: '56px', fontStyle: 'bold', color: '#ffd84a'
    }).setOrigin(0.5).setDepth(10);
    this.tweens.add({
      targets: banner, alpha: 0, duration: 1600, delay: 600,
      onComplete: () => banner.destroy()
    });
  }

  // -------------------------------------------------------------------
  // ASTEROIDS: creating, spawning waves and splitting
  // -------------------------------------------------------------------
  createAsteroid(x, y, typeName) {
    const type = ASTEROID_TYPES[typeName];
    const rock = this.asteroids.create(x, y, type.key);
    rock.typeName = typeName;
    const hit = type.radius * 0.88;
    const offset = rock.width / 2 - hit;
    rock.body.setCircle(hit, offset, offset);

    // Random drift direction and speed; later levels move a bit faster
    const speed = Phaser.Math.Between(type.minSpeed, type.maxSpeed) * (1 + (this.level - 1) * 0.06);
    const dir = Phaser.Math.FloatBetween(0, Math.PI * 2);
    rock.body.setVelocity(Math.cos(dir) * speed, Math.sin(dir) * speed);
    rock.spin = Phaser.Math.FloatBetween(-80, 80);
    return rock;
  }

  // Spawn a wave of large asteroids at the screen edges, away from the ship.
  // The number of asteroids grows with the level.
  spawnWave() {
    const count = Math.min(3 + this.level, 11);
    for (let i = 0; i < count; i++) {
      let x, y;
      do {
        x = Phaser.Math.Between(0, GAME_WIDTH);
        y = Phaser.Math.Between(0, GAME_HEIGHT);
      } while (Phaser.Math.Distance.Between(x, y, this.ship.x, this.ship.y) < 200);
      this.createAsteroid(x, y, 'large');
    }
  }

  // -------------------------------------------------------------------
  // SHOOTING (plays AUDIO ASSET #1: laser)
  // -------------------------------------------------------------------
  fireBullet(time) {
    this.lastShot = time;
    const angle = this.ship.rotation;
    const bullet = this.bullets.create(
      this.ship.x + Math.cos(angle) * 18,
      this.ship.y + Math.sin(angle) * 18,
      'bullet'
    );
    bullet.body.setVelocity(Math.cos(angle) * BULLET_SPEED, Math.sin(angle) * BULLET_SPEED);
    bullet.born = time; // remember when it was fired so it can expire

    this.sound.play('laser', { volume: 0.35 }); // <-- sound playback
  }

  // -------------------------------------------------------------------
  // COLLISION HANDLERS (play AUDIO ASSET #2: explosion)
  // -------------------------------------------------------------------
  onBulletHitAsteroid(bullet, asteroid) {
    if (!bullet.active || !asteroid.active) return;
    const type = ASTEROID_TYPES[asteroid.typeName];
    const { x, y } = asteroid;

    bullet.destroy();
    asteroid.destroy();
    this.spawnExplosion(x, y, type.radius, type.boomRate);

    // Split into two smaller asteroids (if this wasn't a small one)
    if (type.next) {
      this.createAsteroid(x, y, type.next);
      this.createAsteroid(x, y, type.next);
    }

    // ---- SCORE changes with player interaction ----
    this.addScore(type.points);
  }

  onShipHitAsteroid(ship, asteroid) {
    if (!this.shipAlive) return;
    this.shipAlive = false;
    this.lives--;
    this.updateHUD();

    this.spawnExplosion(ship.x, ship.y, 30, 0.7);
    ship.setVisible(false);
    ship.body.enable = false;
    this.flame.setVisible(false);

    if (this.lives <= 0) {
      // Out of lives -> go to the Game Over scene after a short pause
      this.gameEnding = true;
      this.time.delayedCall(1500, () => {
        this.scene.start('GameOverScene', { score: this.score, level: this.level });
      });
    } else {
      this.time.delayedCall(1500, () => this.respawnShip());
    }
  }

  addScore(points) {
    this.score += points;

    // Bonus life every EXTRA_LIFE_EVERY points
    if (this.score >= this.nextExtraLife) {
      this.lives++;
      this.nextExtraLife += EXTRA_LIFE_EVERY;
      this.showBanner('EXTRA LIFE!');
    }

    // Keep the high score up to date in the registry
    if (this.score > this.registry.get('highScore')) {
      this.registry.set('highScore', this.score);
    }
    this.updateHUD();
  }

  // Quick expanding ring + flash, plus the explosion sound.
  // "rate" changes playback speed so big rocks boom low and small ones pop high.
  spawnExplosion(x, y, size, rate) {
    this.sound.play('explosion', { volume: 0.5, rate: rate }); // <-- sound playback

    const ring = this.add.circle(x, y, size * 0.5, 0xffffff, 0).setStrokeStyle(3, 0xffffff);
    this.tweens.add({
      targets: ring, scale: 2.4, alpha: 0, duration: 400,
      onComplete: () => ring.destroy()
    });
    const flash = this.add.circle(x, y, size * 0.6, 0xffaa33, 0.9);
    this.tweens.add({
      targets: flash, scale: 1.8, alpha: 0, duration: 250,
      onComplete: () => flash.destroy()
    });
  }

  respawnShip() {
    this.ship.body.reset(GAME_WIDTH / 2, GAME_HEIGHT / 2); // also zeroes velocity
    this.ship.setRotation(-Math.PI / 2);                   // face up
    this.ship.setAcceleration(0, 0);
    this.ship.setVisible(true);
    this.ship.body.enable = true;
    this.shipAlive = true;
    this.invulnerableUntil = this.time.now + 2500; // brief shield after respawn
  }

  // -------------------------------------------------------------------
  // MAIN GAME LOOP - runs every frame
  // -------------------------------------------------------------------
  update(time, delta) {
    const dt = delta / 1000;

    // ---- Ship controls ----
    if (this.shipAlive) {
      const left = this.cursors.left.isDown || this.keys.A.isDown;
      const right = this.cursors.right.isDown || this.keys.D.isDown;
      const thrust = this.cursors.up.isDown || this.keys.W.isDown;

      if (left) this.ship.angle -= SHIP_TURN_SPEED * dt;
      if (right) this.ship.angle += SHIP_TURN_SPEED * dt;

      // Thrust accelerates the ship in the direction it is facing
      if (thrust) {
        this.ship.setAcceleration(
          Math.cos(this.ship.rotation) * SHIP_THRUST,
          Math.sin(this.ship.rotation) * SHIP_THRUST
        );
      } else {
        this.ship.setAcceleration(0, 0);
      }

      // Engine flame sits behind the ship while thrusting
      this.flame.setVisible(thrust);
      if (thrust) {
        this.flame.setPosition(
          this.ship.x - Math.cos(this.ship.rotation) * 8,
          this.ship.y - Math.sin(this.ship.rotation) * 8
        );
        this.flame.setRotation(this.ship.rotation);
      }

      // Fire (rate-limited by FIRE_DELAY)
      if (this.keys.SPACE.isDown && time - this.lastShot > FIRE_DELAY) {
        this.fireBullet(time);
      }

      // Blink while the respawn shield is active
      this.ship.setAlpha(time < this.invulnerableUntil ? (Math.floor(time / 100) % 2 ? 0.25 : 1) : 1);

      wrapAround(this.ship, 16);
    }

    // ---- Bullets: wrap around the screen and expire after BULLET_LIFETIME ----
    this.bullets.getChildren().slice().forEach((b) => {
      if (time - b.born > BULLET_LIFETIME) { b.destroy(); return; }
      wrapAround(b, 6);
    });

    // ---- Asteroids: spin and wrap ----
    this.asteroids.getChildren().forEach((a) => {
      a.angle += a.spin * dt;
      wrapAround(a, 45);
    });

    // ---- LEVEL PROGRESSION: when every asteroid is gone, start next level ----
    if (!this.levelTransition && !this.gameEnding && this.asteroids.countActive(true) === 0) {
      this.levelTransition = true;
      this.level++;
      this.updateHUD();
      this.showBanner('LEVEL ' + this.level);
      this.time.delayedCall(1800, () => {
        this.spawnWave();
        this.levelTransition = false;
      });
    }
  }
}

// =====================================================================
// SCENE 4: GAME OVER - shows final stats, then back to the title screen
// =====================================================================
class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOverScene'); }

  init(data) {
    // Receive the score and level from GameScene
    this.finalScore = data.score || 0;
    this.finalLevel = data.level || 1;
  }

  create() {
    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 150, 'GAME OVER', {
      fontFamily: UI_FONT, fontSize: '72px', fontStyle: 'bold', color: '#ff5555'
    }).setOrigin(0.5);
    this.add.text(cx, 260, 'FINAL SCORE: ' + this.finalScore, {
      fontFamily: UI_FONT, fontSize: '32px', color: '#ffffff'
    }).setOrigin(0.5);
    this.add.text(cx, 310, 'LEVEL REACHED: ' + this.finalLevel, {
      fontFamily: UI_FONT, fontSize: '26px', color: '#9ad1ff'
    }).setOrigin(0.5);
    this.add.text(cx, 360, 'HIGH SCORE: ' + this.registry.get('highScore'), {
      fontFamily: UI_FONT, fontSize: '26px', color: '#ffd84a'
    }).setOrigin(0.5);

    const prompt = this.add.text(cx, 470, 'PRESS SPACE TO CONTINUE', {
      fontFamily: UI_FONT, fontSize: '28px', color: '#ffffff'
    }).setOrigin(0.5).setAlpha(0);

    // Short delay so a held-down SPACE from gameplay doesn't skip this screen
    this.time.delayedCall(900, () => {
      prompt.setAlpha(1);
      this.tweens.add({ targets: prompt, alpha: 0.1, duration: 600, yoyo: true, repeat: -1 });
      const goToTitle = () => this.scene.start('TitleScene');
      this.input.keyboard.once('keydown-SPACE', goToTitle);
      this.input.once('pointerdown', goToTitle);
    });
  }
}

// =====================================================================
// PHASER GAME CONFIGURATION - registers all scenes and starts the game
// =====================================================================
const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#000000',
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  scale: {
    mode: Phaser.Scale.FIT,               // scale to fit the browser window
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  // The first scene in the list starts automatically
  scene: [PreloadScene, TitleScene, GameScene, GameOverScene]
};

const game = new Phaser.Game(config);

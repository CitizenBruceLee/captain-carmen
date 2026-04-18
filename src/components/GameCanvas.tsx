/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  GAME_WIDTH, 
  GAME_HEIGHT, 
  PLAYER_WIDTH, 
  PLAYER_HEIGHT, 
  PLAYER_SPEED,
  PROJECTILE_WIDTH,
  PROJECTILE_HEIGHT,
  PROJECTILE_SPEED,
  BOMB_WIDTH,
  BOMB_HEIGHT,
  BOMB_SPEED,
  BOMB_DISTANCE,
  ENEMY_WIDTH,
  ENEMY_HEIGHT,
  SCROLL_SPEED,
  COLORS
} from '../constants';
import { 
  Player, 
  Enemy, 
  Projectile, 
  Particle, 
  GameState,
  EnemyType,
  EnemyClass,
  ProjectileClass,
  PowerUp,
  PowerUpType
} from '../types';

interface GameCanvasProps {
  onScoreUpdate: (score: number) => void;
  onLivesUpdate: (lives: number) => void;
  onGameOver: () => void;
  gameState: GameState;
  onGameStart: () => void;
  onStateChange: (state: GameState) => void;
}

export default function GameCanvas({ 
  onScoreUpdate, 
  onLivesUpdate, 
  onGameOver,
  gameState,
  onGameStart,
  onStateChange
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  // Game Entities
  const playerRef = useRef<Player>({
    id: 'player',
    x: GAME_WIDTH / 2 - PLAYER_WIDTH / 2,
    y: GAME_HEIGHT - PLAYER_HEIGHT - 100,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    vx: 0,
    vy: 0,
    lives: 3,
    score: 0,
    bombX: GAME_WIDTH / 2,
    bombY: GAME_HEIGHT - PLAYER_HEIGHT - 100 - BOMB_DISTANCE,
    weaponTimer: 0,
    hasAutoFire: false,
    invisibleTimer: 5000,
  });

  const enemiesRef = useRef<Enemy[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const terrainRef = useRef<{x: number, y: number, color: string}[]>([]);
  const keysRef = useRef<Record<string, boolean>>({});
  const lastKeysRef = useRef<Record<string, boolean>>({});
  
  const lastSpawnTime = useRef<number>(0);
  const frameCount = useRef<number>(0);
  const scrollOffset = useRef<number>(0);
  const enemiesDefeatedInLevel = useRef(0);
  const bossSpawningRef = useRef(false);
  
  const resetGameState = useCallback(() => {
    playerRef.current = {
      id: 'player',
      x: GAME_WIDTH / 2 - PLAYER_WIDTH / 2,
      y: GAME_HEIGHT - PLAYER_HEIGHT - 100,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      vx: 0,
      vy: 0,
      lives: 3,
      score: 0,
      bombX: GAME_WIDTH / 2,
      bombY: GAME_HEIGHT - PLAYER_HEIGHT - 100 - BOMB_DISTANCE,
      weaponTimer: 0,
      hasAutoFire: false,
      invisibleTimer: 5000,
    };
    enemiesRef.current = [];
    projectilesRef.current = [];
    particlesRef.current = [];
    powerUpsRef.current = [];
    enemiesDefeatedInLevel.current = 0;
    bossSpawningRef.current = false;
    frameCount.current = 0;
    lastSpawnTime.current = 0;
    scrollOffset.current = 0;
  }, []);

  // Reset game on START
  useEffect(() => {
    if (gameState === 'START') {
      resetGameState();
    }
  }, [gameState, resetGameState]);

  // Touch Handling State
  const touchState = useRef({
    moveActive: false,
    moveX: 0,
    fireActive: false,
    lastFireTime: 0,
  });

  const getCanvasPoint = (e: React.TouchEvent | TouchEvent): { x: number, y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY
    };
  };

  const SPRITES = {
    PLAYER: [
      "   X   ", // Crown tip
      "  X X  ",
      " XXXXX ",
      "X  X  X", // Shoulder flourishes
      "XXXXXXX",
      " XXXXX ", // Diamond base start
      "  XXX  ",
      "   X   ",
    ],
    SCOUT: [
      "  X X  ", // Antennae/Sparkle
      "   X   ",
      " XXXXX ", // Chic body
      "X  X  X",
      " XXXXX ",
      "  X X  ", 
    ],
    FIGHTER: [
      " X   X ", // Diva wings
      "  XXX  ",
      " XXXXX ",
      "XXXXXXX",
      " XXXXX ",
      "  XXX  ",
      " X   X ",
    ],
    ORB: [
      "  X  ",
      " X X ",
      "X   X",
      " X X ",
      "  X  ",
    ],
    STRIKER: [
      "   X   ",
      "  XXX  ",
      " XXXXX ",
      "XXXXXXX",
      " X   X ",
      "X     X",
    ],
    MINELAYER: [
      " XXXXX ",
      "X     X",
      "X  X  X",
      "X     X",
      " XXXXX ",
    ],
    BOSS: [
      "      X      ",
      "     XXX     ", // Master Crown
      "    XXXXX    ",
      "  XXXXXXXXX  ",
      " XXXXXXXXXXX ",
      "XXXXX X XXXXX", // Piercing eye look
      " XXX     XXX ",
      "  X       X  ",
    ],
    AUTO_FIRE: [
      "  X  ",
      " X X ",
      "X X X",
      " X X ",
      "  X  ",
    ]
  };

  const drawArcadeSprite = (ctx: CanvasRenderingContext2D, sprite: string[], x: number, y: number, width: number, height: number, color: string) => {
    const rows = sprite.length;
    const cols = sprite[0].length;
    const pW = width / cols;
    const pH = height / rows;

    ctx.fillStyle = color;
    sprite.forEach((row, ri) => {
      for (let ci = 0; ci < row.length; ci++) {
        if (row[ci] === 'X') {
          ctx.fillRect(x + ci * pW, y + ri * pH, pW - 1, pH - 1);
        }
      }
    });
  };

  // Initialize terrain
  useEffect(() => {
    const terrain = [];
    for (let i = 0; i < 20; i++) {
      terrain.push({
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * GAME_HEIGHT,
        color: Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(255,16,240,0.02)'
      });
    }
    terrainRef.current = terrain;
  }, []);

  const spawnEnemy = useCallback(() => {
    const x = Math.random() * (GAME_WIDTH - ENEMY_WIDTH);
    const id = Math.random().toString(36).substr(2, 9);
    
    // Weighted selection
    const r = Math.random();
    let type: EnemyType = 'SCOUT';
    let isGround = false;

    if (r < 0.3) {
      type = 'SCOUT';
    } else if (r < 0.5) {
      type = 'FIGHTER';
    } else if (r < 0.6) {
      type = 'ORB';
    } else if (r < 0.7) {
      type = 'STRIKER';
    } else if (r < 0.8) {
      type = 'MINELAYER';
    } else if (r < 0.9) {
      type = 'BASE';
      isGround = true;
    } else if (r < 0.95) {
      type = 'CORE';
      isGround = true;
    } else {
      type = 'TURRET';
      isGround = true;
    }
    
    const newEnemy: Enemy = {
      id,
      x,
      y: -ENEMY_HEIGHT,
      width: ENEMY_WIDTH,
      height: ENEMY_HEIGHT,
      vx: isGround ? 0 : (Math.random() - 0.5) * 2,
      vy: isGround ? SCROLL_SPEED : (type === 'STRIKER' ? 5 : 2 + Math.random() * 2),
      type,
      class: isGround ? 'GROUND' : 'AIR',
      color: COLORS.GREY_VOID,
      health: type === 'FIGHTER' || type === 'CORE' || type === 'STRIKER' ? 2 : 1,
      maxHealth: type === 'FIGHTER' || type === 'CORE' || type === 'STRIKER' ? 2 : 1,
      points: isGround ? 500 : 200,
      phase: Math.random() * Math.PI * 2,
      lastFireTime: 0,
      fireRate: type === 'TURRET' ? 2000 : (type === 'ORB' ? 1500 : 3000),
      currentPhase: 1,
    };
    
    enemiesRef.current.push(newEnemy);
  }, []);

  const spawnPowerUp = useCallback((x: number, y: number) => {
    powerUpsRef.current.push({
      id: Math.random().toString(36).substr(2, 9),
      x,
      y,
      width: 25,
      height: 25,
      vx: 0,
      vy: SCROLL_SPEED,
      type: 'AUTO_FIRE',
      color: COLORS.NEON.YELLOW
    });
  }, []);

  const spawnBoss = useCallback(() => {
    const id = "BOSS_" + Math.random().toString(36).substr(2, 9);
    const newBoss: Enemy = {
      id,
      x: GAME_WIDTH / 2 - 60,
      y: -150,
      width: 120,
      height: 100,
      vx: 2,
      vy: 1.5,
      type: 'BOSS',
      class: 'AIR',
      color: COLORS.NEON.PINK,
      health: 50,
      maxHealth: 50,
      points: 10000,
      phase: 0,
      lastFireTime: 0,
      fireRate: 800,
      currentPhase: 1,
    };
    enemiesRef.current.push(newBoss);
    bossSpawningRef.current = false;
  }, []);

  const shootBlaster = useCallback(() => {
    const p = playerRef.current;
    
    const newProjectile: Projectile = {
      id: Math.random().toString(36).substr(2, 9),
      x: p.x + p.width / 2 - PROJECTILE_WIDTH / 2,
      y: p.y,
      width: PROJECTILE_WIDTH,
      height: PROJECTILE_HEIGHT,
      vx: 0,
      vy: -PROJECTILE_SPEED,
      owner: 'player',
      color: '#FFFFFF',
      class: 'BLASTER'
    };
    
    projectilesRef.current.push(newProjectile);
  }, []);

  const enemyShoot = useCallback((enemy: Enemy, type: ProjectileClass, targetX?: number, targetY?: number) => {
    const vx = targetX !== undefined ? (targetX - enemy.x) / 50 : 0;
    const vy = targetY !== undefined ? (targetY - enemy.y) / 50 : 4;

    const newProjectile: Projectile = {
      id: Math.random().toString(36).substr(2, 9),
      x: enemy.x + enemy.width / 2,
      y: enemy.y + enemy.height / 2,
      width: type === 'MINE' ? 15 : 8,
      height: type === 'MINE' ? 15 : 8,
      vx: type === 'MINE' ? 0 : vx,
      vy: type === 'MINE' ? SCROLL_SPEED : vy,
      owner: 'enemy',
      color: type === 'MISSILE' ? COLORS.NEON.PINK : (type === 'MINE' ? COLORS.NEON.YELLOW : COLORS.NEON.CYAN),
      class: type,
    };
    projectilesRef.current.push(newProjectile);
  }, []);

  const dropBomb = useCallback(() => {
    const p = playerRef.current;
    
    const newProjectile: Projectile = {
      id: Math.random().toString(36).substr(2, 9),
      x: p.x + p.width / 2 - BOMB_WIDTH / 2,
      y: p.y + p.height / 2,
      width: BOMB_WIDTH,
      height: BOMB_HEIGHT,
      vx: (p.bombX - (p.x + p.width / 2)) / 30, // Lead towards reticle
      vy: (p.bombY - (p.y + p.height / 2)) / 30,
      owner: 'player',
      color: COLORS.NEON.PINK,
      class: 'BOMB'
    };
    
    projectilesRef.current.push(newProjectile);
  }, []);

  const createExplosion = useCallback((x: number, y: number, color: string) => {
    for (let i = 0; i < 15; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1,
        maxLife: 0.5 + Math.random() * 0.5,
        color,
        size: 2 + Math.random() * 4,
      });
    }
  }, []);

  const update = useCallback((time: number) => {
    if (gameState !== 'PLAYING' && gameState !== 'BOSS_WARNING') return;

    const p = playerRef.current;

    // Handle Boss Warning state
    if (gameState === 'BOSS_WARNING') {
       if (!bossSpawningRef.current) {
         bossSpawningRef.current = true;
         setTimeout(() => {
           onStateChange('PLAYING');
           spawnBoss();
         }, 3000);
       }
       // Minor player movement allowed in warning
    }
    
    // Keyboard
    if (keysRef.current['ArrowLeft'] || keysRef.current['a']) p.x -= PLAYER_SPEED;
    if (keysRef.current['ArrowRight'] || keysRef.current['d']) p.x += PLAYER_SPEED;
    if (keysRef.current['ArrowUp'] || keysRef.current['w']) p.y -= PLAYER_SPEED;
    if (keysRef.current['ArrowDown'] || keysRef.current['s']) p.y += PLAYER_SPEED;
    
    // Update bomb reticle (fixed distance ahead of player)
    p.bombX = p.x + p.width / 2;
    p.bombY = p.y - BOMB_DISTANCE;
    
    // Touch Movement (Swipe in bottom left)
    if (touchState.current.moveActive) {
      const targetX = touchState.current.moveX;
      p.x += (targetX - (p.x + p.width / 2)) * 0.15;
    }
    
    // Clamp player
    p.x = Math.max(0, Math.min(GAME_WIDTH - p.width, p.x));
    p.y = Math.max(GAME_HEIGHT * 0.5, Math.min(GAME_HEIGHT - p.height - 20, p.y));

    // Weapon Timer
    if (p.weaponTimer > 0) {
      p.weaponTimer -= 16.67; // approx ms per frame
      if (p.weaponTimer <= 0) {
        p.hasAutoFire = false;
        p.weaponTimer = 0;
      }
    }

    // Invisibility Timer
    if (p.invisibleTimer > 0) {
      p.invisibleTimer -= 16.67;
      if (p.invisibleTimer < 0) p.invisibleTimer = 0;
    }

    // Blaster (Space) - Auto fire if powered up, otherwise manual
    const spacePressed = !!keysRef.current['Space'];
    const spaceJustPressed = spacePressed && !lastKeysRef.current['Space'];
    
    if (p.hasAutoFire) {
      if (spacePressed && frameCount.current % 8 === 0) {
        shootBlaster();
      }
    } else if (spaceJustPressed) {
      shootBlaster();
    }
    
    // Bomb (Shift / Enter / B) - Manual
    const bombPressed = !!(keysRef.current['ShiftLeft'] || keysRef.current['KeyB']);
    const bombJustPressed = bombPressed && !lastKeysRef.current['ShiftLeft'] && !lastKeysRef.current['KeyB'];

    if (bombJustPressed) {
      dropBomb();
    }
    
    // Touch Fire - Only auto-fire if powered up, otherwise tap
    if (touchState.current.fireActive) {
      if (p.hasAutoFire) {
        if (frameCount.current % 10 === 0) shootBlaster();
      } else if (frameCount.current % 60 === 0) { // Very slow accidental auto if held, mostly relies on taps
         // shootBlaster(); 
      }
    }

    // Update last keys
    lastKeysRef.current = { ...keysRef.current };

    // Scroll Background
    scrollOffset.current = (scrollOffset.current + SCROLL_SPEED) % GAME_HEIGHT;

    // Spawn enemies
    const hasBoss = enemiesRef.current.some(e => e.type === 'BOSS');
    if (gameState === 'PLAYING' && !hasBoss) {
      if (enemiesDefeatedInLevel.current >= 15) {
        onStateChange('BOSS_WARNING');
        enemiesDefeatedInLevel.current = 0;
      } else if (time - lastSpawnTime.current > 1200) {
        spawnEnemy();
        lastSpawnTime.current = time;
      }
    }

    // Update PowerUps
    powerUpsRef.current.forEach((pu, idx) => {
      pu.y += pu.vy;
      if (pu.y > GAME_HEIGHT) powerUpsRef.current.splice(idx, 1);
      
      // Collection
      if (
        pu.x < p.x + p.width &&
        pu.x + pu.width > p.x &&
        pu.y < p.y + p.height &&
        pu.y + pu.height > p.y
      ) {
        p.hasAutoFire = true;
        p.weaponTimer = 10000; // 10 seconds
        powerUpsRef.current.splice(idx, 1);
        // Visual feedback
        createExplosion(pu.x + pu.width / 2, pu.y + pu.height / 2, COLORS.NEON.YELLOW);
      }
    });

    // Update Projectiles
    projectilesRef.current.forEach((proj, idx) => {
      // ... missile tracking ...
      // Missile tracking
      if (proj.class === 'MISSILE' && proj.owner === 'enemy') {
        const dx = (p.x + p.width / 2) - proj.x;
        const dy = (p.y + p.height / 2) - proj.y;
        const angle = Math.atan2(dy, dx);
        proj.vx += Math.cos(angle) * 0.2;
        proj.vy += Math.sin(angle) * 0.2;
        // Cap speed
        const speed = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy);
        if (speed > 6) {
          proj.vx = (proj.vx / speed) * 6;
          proj.vy = (proj.vy / speed) * 6;
        }
      }

      proj.x += proj.vx;
      proj.y += proj.vy;
      
      // Bomb behavior: shrink as it "falls"
      if (proj.class === 'BOMB') {
        proj.width *= 0.98;
        proj.height *= 0.98;
      }

      // Mine behavior: static until triggered or scrolled off
      if (proj.class === 'MINE') {
        const dist = Math.sqrt(Math.pow(p.x + p.width / 2 - proj.x, 2) + Math.pow(p.y + p.height / 2 - proj.y, 2));
        if (dist < 80) {
          // Trigger mine - simple explosion or immediate damage
          createExplosion(proj.x, proj.y, COLORS.NEON.YELLOW);
          projectilesRef.current.splice(idx, 1);
        }
      }

      // Bounds check
      if (proj.y < -100 || proj.y > GAME_HEIGHT + 100 || (proj.class === 'BOMB' && proj.width < 1)) {
        projectilesRef.current.splice(idx, 1);
      }

      // Projectile vs Player collision
      if (
        p.invisibleTimer <= 0 &&
        proj.owner === 'enemy' &&
        proj.x < p.x + p.width &&
        proj.x + proj.width > p.x &&
        proj.y < p.y + p.height &&
        proj.y + proj.height > p.y
      ) {
        p.lives -= 1;
        onLivesUpdate(p.lives);
        projectilesRef.current.splice(idx, 1);
        createExplosion(p.x + p.width / 2, p.y + p.height / 2, '#FF0000');
        if (p.lives <= 0) onGameOver();
      }
    });

    // Update Enemies
    enemiesRef.current.forEach((enemy, eIdx) => {
      // Movement Patterns
      if (enemy.type === 'ORB') {
        enemy.phase += 0.05;
        enemy.x += Math.sin(enemy.phase) * 3;
      } else if (enemy.type === 'MINELAYER') {
        enemy.x += Math.sin(enemy.phase) * 5;
        enemy.phase += 0.02;
        enemy.y = 100 + Math.sin(enemy.phase * 0.5) * 50;
      } else if (enemy.type === 'BOSS') {
        // Boss Movement
        if (enemy.y < 100) {
           enemy.y += enemy.vy;
        } else {
           enemy.phase += 0.02;
           enemy.x = (GAME_WIDTH / 2 - enemy.width / 2) + Math.sin(enemy.phase) * (GAME_WIDTH * 0.35);
           
           // Phase transitions
           const hpRatio = enemy.health / enemy.maxHealth;
           if (hpRatio < 0.3) enemy.currentPhase = 3;
           else if (hpRatio < 0.6) enemy.currentPhase = 2;
        }
      }
      
      enemy.x += enemy.vx;
      enemy.y += enemy.vy;

      // Attack Behaviors
      const canFire = time - enemy.lastFireTime > enemy.fireRate;
      if (canFire && enemy.y > 0 && enemy.y < GAME_HEIGHT * 0.8) {
        if (enemy.type === 'ORB') {
          enemyShoot(enemy, 'BULLET');
        } else if (enemy.type === 'STRIKER' && Math.abs(enemy.x - p.x) < 50) {
          enemyShoot(enemy, 'MISSILE');
          enemy.fireRate = 10000; // Only fire one missile
        } else if (enemy.type === 'MINELAYER' && frameCount.current % 60 === 0) {
          enemyShoot(enemy, 'MINE');
        } else if (enemy.type === 'TURRET') {
          enemyShoot(enemy, 'BULLET', p.x + p.width / 2, p.y + p.height / 2);
        } else if (enemy.type === 'BOSS') {
          // Boss Attacks based on Phase
          if (enemy.currentPhase === 1) {
            enemyShoot(enemy, 'BULLET', p.x, p.y);
            enemyShoot(enemy, 'BULLET', p.x + 50, p.y);
          } else if (enemy.currentPhase === 2) {
            enemyShoot(enemy, 'BULLET', p.x, p.y);
            enemyShoot(enemy, 'MISSILE');
            enemy.fireRate = 600;
          } else if (enemy.currentPhase === 3) {
            // Circular burst
            for(let i=0; i<8; i++) {
               const angle = (i / 8) * Math.PI * 2;
               const bx = enemy.x + enemy.width/2 + Math.cos(angle) * 20;
               const by = enemy.y + enemy.height/2 + Math.sin(angle) * 20;
               enemyShoot(enemy, 'BULLET', bx + Math.cos(angle) * 100, by + Math.sin(angle) * 100);
            }
            if (frameCount.current % 120 === 0) enemyShoot(enemy, 'MISSILE');
            enemy.fireRate = 1200;
          }
        }
        enemy.lastFireTime = time;
      }

      // Enemy vs Player collision (Only Air enemies hit player)
      if (
        p.invisibleTimer <= 0 &&
        enemy.class === 'AIR' &&
        enemy.x < p.x + p.width &&
        enemy.x + enemy.width > p.x &&
        enemy.y < p.y + p.height &&
        enemy.y + enemy.height > p.y
      ) {
        p.lives -= 1;
        onLivesUpdate(p.lives);
        enemiesRef.current.splice(eIdx, 1);
        createExplosion(enemy.x, enemy.y, '#FF0000');
        if (p.lives <= 0) onGameOver();
      }

      // Projectile vs Enemy collision
      projectilesRef.current.forEach((proj, pIdx) => {
        const isBlasterHit = proj.class === 'BLASTER' && enemy.class === 'AIR';
        const isBombHit = proj.class === 'BOMB' && enemy.class === 'GROUND' && proj.width < BOMB_WIDTH * 0.6; // Bomb must be "low" enough

        if (
          (isBlasterHit || isBombHit) &&
          proj.x < enemy.x + enemy.width &&
          proj.x + proj.width > enemy.x &&
          proj.y < enemy.y + enemy.height &&
          proj.y + proj.height > enemy.y
        ) {
          enemy.health -= 1;
          projectilesRef.current.splice(pIdx, 1);
          
          if (enemy.health <= 0) {
            p.score += enemy.points;
            onScoreUpdate(p.score);
            createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, proj.color);
            
            // Random powerup drop
            if (Math.random() < 0.1) {
              spawnPowerUp(enemy.x, enemy.y);
            }

            enemiesRef.current.splice(eIdx, 1);
            
            if (enemy.type === 'BOSS') {
               onStateChange('LEVEL_UP');
            } else {
               enemiesDefeatedInLevel.current += 1;
            }
          }
        }
      });

      // Bounds check
      if (enemy.y > GAME_HEIGHT + 50) {
        enemiesRef.current.splice(eIdx, 1);
      }
    });

    // Update Particles
    particlesRef.current.forEach((particle, idx) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.1; // gravity-ish
      particle.life -= 0.02;
      if (particle.life <= 0) {
        particlesRef.current.splice(idx, 1);
      }
    });

    draw();
    requestRef.current = requestAnimationFrame(update);
  }, [gameState, shootBlaster, dropBomb, enemyShoot, spawnEnemy, spawnBoss, createExplosion, onScoreUpdate, onLivesUpdate, onGameOver, onStateChange]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear with a very slight fade for motion blur feel
    ctx.fillStyle = COLORS.SPACE_BLACK;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Background terrain scroller
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
        const y = ((i * 100 + scrollOffset.current) % GAME_HEIGHT);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(GAME_WIDTH, y);
        ctx.stroke();
    }
    terrainRef.current.forEach(t => {
      ctx.fillStyle = t.color;
      const y = (t.y + scrollOffset.current) % GAME_HEIGHT;
      ctx.fillRect(t.x, y, 40, 40);
    });

    const p = playerRef.current;

    // Boss Health Bar
    const boss = enemiesRef.current.find(e => e.type === 'BOSS');
    if (boss) {
      const barWidth = GAME_WIDTH * 0.6;
      const x = (GAME_WIDTH - barWidth) / 2;
      const y = 60;
      const hpPercent = boss.health / boss.maxHealth;
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(x, y, barWidth, 4);
      
      ctx.fillStyle = COLORS.NEON.PINK;
      ctx.shadowBlur = 10;
      ctx.shadowColor = COLORS.NEON.PINK;
      ctx.fillRect(x, y, barWidth * hpPercent, 4);
      
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px Inter';
      ctx.fillText(`ANOMALY CORE INTEGRITY: ${Math.ceil(hpPercent * 100)}%`, x, y - 8);
    }

    // Power Weapon Timer Bar
    if (p.weaponTimer > 0) {
      const barWidth = GAME_WIDTH * 0.4;
      const x = (GAME_WIDTH - barWidth) / 2;
      const y = GAME_HEIGHT - 120;
      const timerPercent = p.weaponTimer / 10000;
      
      ctx.fillStyle = 'rgba(255, 237, 0, 0.2)';
      ctx.fillRect(x, y, barWidth, 4);
      ctx.fillStyle = COLORS.NEON.YELLOW;
      ctx.fillRect(x, y, barWidth * timerPercent, 4);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px Inter';
      ctx.fillText(`OVERDRIVE ACTIVE: ${(p.weaponTimer / 1000).toFixed(1)}s`, x, y - 8);
    }

    // Draw Bomb Reticle
    if (gameState === 'PLAYING') {
      ctx.save();
      ctx.strokeStyle = COLORS.NEON.CYAN;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.bombX, p.bombY, 15, 0, Math.PI * 2);
      ctx.stroke();
      
      // Pulsing crosshair
      const s = 5 + Math.sin(frameCount.current * 0.1) * 3;
      ctx.beginPath();
      ctx.moveTo(p.bombX - s, p.bombY);
      ctx.lineTo(p.bombX + s, p.bombY);
      ctx.moveTo(p.bombX, p.bombY - s);
      ctx.lineTo(p.bombX, p.bombY + s);
      ctx.stroke();
      ctx.restore();
    }

    // Draw Player
    ctx.save();
    
    // Startup Invisibility Effect
    if (p.invisibleTimer > 0) {
      ctx.globalAlpha = 0.3 + Math.sin(frameCount.current * 0.2) * 0.2;
      // Modern Cloak Halo
      ctx.strokeStyle = '#FFFFFF';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x + p.width / 2, p.y + p.height / 2, p.width * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Modern Diva Pride Aura
    const auraGradient = ctx.createRadialGradient(
      p.x + p.width / 2, p.y + p.height / 2, 0,
      p.x + p.width / 2, p.y + p.height / 2, p.width * 1.5
    );
    COLORS.PRIDE_RAINBOW.forEach((color, i) => {
      auraGradient.addColorStop(i / (COLORS.PRIDE_RAINBOW.length - 1), color + '22'); // very faint
    });
    ctx.fillStyle = auraGradient;
    ctx.beginPath();
    ctx.arc(p.x + p.width / 2, p.y + p.height / 2, p.width * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Arcade Fighter Sprite (Refined Diva Shape)
    drawArcadeSprite(
      ctx, 
      SPRITES.PLAYER, 
      p.x, 
      p.y, 
      p.width, 
      p.height, 
      '#FFFFFF'
    );
    
    // Engine glow - DIVA SPECTRAL
    const engineGradient = ctx.createLinearGradient(p.x, p.y + p.height, p.x, p.y + p.height + 15);
    engineGradient.addColorStop(0, COLORS.NEON.PINK);
    engineGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = engineGradient;
    ctx.globalAlpha = (p.invisibleTimer > 0 ? 0.2 : 0.6) + Math.sin(frameCount.current * 0.3) * 0.2;
    ctx.fillRect(p.x + p.width / 2 - 4, p.y + p.height - 2, 8, 15);
    ctx.globalAlpha = 1.0;
    ctx.restore();

    // Draw Projectiles
    projectilesRef.current.forEach(proj => {
      ctx.save();
      
      if (proj.owner === 'player' && proj.class === 'BLASTER') {
        const beamGradient = ctx.createLinearGradient(proj.x, proj.y, proj.x, proj.y + proj.height);
        COLORS.PRIDE_RAINBOW.forEach((color, i) => {
          beamGradient.addColorStop(i / (COLORS.PRIDE_RAINBOW.length - 1), color);
        });
        ctx.fillStyle = beamGradient;
        ctx.shadowBlur = 10;
        ctx.shadowColor = proj.color;
        ctx.fillRect(proj.x, proj.y, proj.width, proj.height);
      } else if (proj.class === 'BOMB') {
        ctx.fillStyle = proj.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = proj.color;
        ctx.beginPath();
        ctx.arc(proj.x + proj.width / 2, proj.y + proj.height / 2, proj.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (proj.class === 'MISSILE') {
        ctx.fillStyle = proj.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = proj.color;
        ctx.beginPath();
        ctx.moveTo(proj.x, proj.y);
        ctx.lineTo(proj.x + proj.width, proj.y + proj.height / 2);
        ctx.lineTo(proj.x, proj.y + proj.height);
        ctx.fill();
      } else if (proj.class === 'MINE') {
        ctx.strokeStyle = proj.color;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = proj.color;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.width / 2, 0, Math.PI * 2);
        ctx.stroke();
        // Pulsing core
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, (proj.width / 4) * (1 + Math.sin(frameCount.current * 0.1)), 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Standard Enemy Bullet
        ctx.fillStyle = proj.color;
        ctx.shadowBlur = 5;
        ctx.shadowColor = proj.color;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.width / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.restore();
    });

    // Draw Enemies (Separate behavior for ground)
    enemiesRef.current.forEach(enemy => {
      ctx.save();
      
      if (enemy.class === 'AIR') {
        const hpRatio = enemy.health / enemy.maxHealth;
        // Pride-based logic for enemies
        const prideIndex = Math.floor((frameCount.current * 0.05 + enemy.phase) % COLORS.PRIDE_RAINBOW.length);
        const baseColor = COLORS.PRIDE_RAINBOW[prideIndex];
        
        const color = enemy.type === 'BOSS' 
          ? (hpRatio > 0.6 ? COLORS.NEON.PINK : (hpRatio > 0.3 ? COLORS.NEON.YELLOW : COLORS.NEON.CYAN))
          : baseColor;

        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        
        // Fine Diva Details: Sparkle/Halo
        if (frameCount.current % 30 < 5) {
           ctx.fillStyle = '#FFFFFF';
           ctx.fillRect(enemy.x + Math.random() * enemy.width, enemy.y + Math.random() * enemy.height, 2, 2);
        }

        if (enemy.type === 'BOSS') {
           // Modern Boss Halo
           ctx.strokeStyle = color;
           ctx.setLineDash([10, 5]);
           ctx.lineWidth = 1;
           ctx.beginPath();
           ctx.arc(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.width * 0.7, 0, Math.PI * 2);
           ctx.stroke();
           ctx.setLineDash([]);
           
           drawArcadeSprite(ctx, SPRITES.BOSS, enemy.x, enemy.y, enemy.width, enemy.height, color);
           // Pulsing core - DIVA GEM
           ctx.beginPath();
           ctx.arc(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 12 * (1 + Math.sin(frameCount.current * 0.1)), 0, Math.PI * 2);
           ctx.fillStyle = '#fff';
           ctx.shadowBlur = 30;
           ctx.shadowColor = '#fff';
           ctx.fill();
        } else {
           const spriteKey = (enemy.type as keyof typeof SPRITES) || 'SCOUT';
           const sprite = SPRITES[spriteKey] || SPRITES.SCOUT;
           drawArcadeSprite(ctx, sprite, enemy.x, enemy.y, enemy.width, enemy.height, color);
        }
      } else {
        // Ground targets - use rectangular blocky base
        const color = enemy.type === 'TURRET' ? COLORS.NEON.CYAN : COLORS.NEON.PINK;
        ctx.fillStyle = '#1A1A1E';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(enemy.x, enemy.y, enemy.width, enemy.height);
        
        // Blocky alien detail inside ground targets
        ctx.fillStyle = color;
        ctx.fillRect(enemy.x + 2, enemy.y + 2, enemy.width - 4, enemy.height - 4);
        ctx.fillStyle = '#000';
        ctx.fillRect(enemy.x + 4, enemy.y + 4, 4, 4); // Eyes/Detail
        ctx.fillRect(enemy.x + enemy.width - 8, enemy.y + 4, 4, 4);
      }
      
      ctx.restore();
    });

    // Draw Particles
    particlesRef.current.forEach(particle => {
      ctx.globalAlpha = particle.life / particle.maxLife;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Draw PowerUps
    powerUpsRef.current.forEach(pu => {
      drawArcadeSprite(ctx, SPRITES.AUTO_FIRE, pu.x, pu.y, pu.width, pu.height, pu.color);
      ctx.shadowBlur = 15;
      ctx.shadowColor = pu.color;
      ctx.strokeRect(pu.x - 2, pu.y - 2, pu.width + 4, pu.height + 4);
    });

  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (gameState === 'START' && e.code === 'Space') {
        onGameStart();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (gameState !== 'PLAYING') {
        if (gameState === 'START') onGameStart();
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const { x, y } = getCanvasPoint(e);
      
      // Check zones (Bottom 30%)
      if (y > GAME_HEIGHT * 0.6) {
        if (x < GAME_WIDTH / 2) {
          touchState.current.moveActive = true;
          touchState.current.moveX = x;
        } else {
          touchState.current.fireActive = true;
          // Manual fire on tap
          if (!playerRef.current.hasAutoFire) {
             shootBlaster();
             if (Math.random() > 0.7) dropBomb(); // Chance to drop bomb on tap for easier mobile play
          }
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // Prevent scrolling AND selection
      if (gameState !== 'PLAYING') return;
      
      const { x, y } = getCanvasPoint(e);
      
      // Update movement if finger is in the left zone
      if (x < GAME_WIDTH / 2 && y > GAME_HEIGHT * 0.4) {
        touchState.current.moveActive = true;
        touchState.current.moveX = x;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      // If no touches remain, clear all
      if (e.touches.length === 0) {
        touchState.current.moveActive = false;
        touchState.current.fireActive = false;
      } else {
        touchState.current.moveActive = false;
        touchState.current.fireActive = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Canvas specific touch
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
      canvas.addEventListener('touchend', handleTouchEnd);
    }
    
    requestRef.current = requestAnimationFrame(update);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (canvas) {
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchend', handleTouchEnd);
      }
      cancelAnimationFrame(requestRef.current);
    };
  }, [update, gameState, onGameStart, shootBlaster, dropBomb]);

  return (
    <div className="relative w-full h-full bg-black touch-none flex items-center justify-center">
      <canvas 
        ref={canvasRef} 
        width={GAME_WIDTH} 
        height={GAME_HEIGHT}
        className="block w-full h-full object-contain"
      />
      
      {/* Visual Touch Indicators (Optional, but helps user know where they can press) */}
      {gameState === 'PLAYING' && (
        <>
          <div className="absolute bottom-4 left-4 w-1/2 h-40 border-2 border-white/5 bg-white/5 rounded-2xl flex items-center justify-center opacity-30">
            <span className="text-[10px] uppercase tracking-widest text-white/40 drop-shadow-md">Move Zone</span>
          </div>
          <div className="absolute bottom-4 right-4 w-[40%] h-40 border-2 border-[#FF10F0]/10 bg-[#FF10F0]/5 rounded-2xl flex items-center justify-center opacity-30">
            <span className="text-[10px] uppercase tracking-widest text-[#FF10F0]/40 drop-shadow-md">Fire Zone</span>
          </div>
        </>
      )}
    </div>
  );
}

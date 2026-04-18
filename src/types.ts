/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Point {
  x: number;
  y: number;
}

export type EnemyType = 'SCOUT' | 'FIGHTER' | 'BASE' | 'CORE' | 'ORB' | 'STRIKER' | 'MINELAYER' | 'TURRET' | 'BOSS';
export type EnemyClass = 'AIR' | 'GROUND';
export type ProjectileClass = 'BLASTER' | 'LASER' | 'BOMB' | 'BULLET' | 'MISSILE' | 'MINE' | 'BOSS_BEAM';
export type PowerUpType = 'AUTO_FIRE';

export interface GameObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
}

export interface Player extends GameObject {
  lives: number;
  score: number;
  bombStock: number;
  bombX: number; // For reticle
  bombY: number;
  weaponTimer: number; // For power-ups
  hasAutoFire: boolean;
  invisibleTimer: number; // For startup invincibility
}

export interface Enemy extends GameObject {
  type: EnemyType;
  class: EnemyClass;
  color: string;
  health: number;
  maxHealth: number;
  points: number;
  phase: number; // for movement patterns
  lastFireTime: number;
  fireRate: number;
  currentPhase: number;
}

export interface Projectile extends GameObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  owner: 'player' | 'enemy';
  color: string;
  class: ProjectileClass;
  damage?: number;
  penetration?: number;
  sourceType?: EnemyType;
  expiresAt?: number;
  targetId?: string; // For tracking missiles
}

export interface Particle extends Point {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface PowerUp extends GameObject {
  type: PowerUpType;
  color: string;
}

export type GameState = 'START' | 'PLAYING' | 'BOSS_WARNING' | 'LEVEL_UP' | 'GAME_OVER';

export interface GameContext {
  state: GameState;
  level: number;
  score: number;
  lives: number;
}

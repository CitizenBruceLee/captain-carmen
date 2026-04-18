/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const GAME_WIDTH = 600;
export const GAME_HEIGHT = 800;

export const PLAYER_WIDTH = 50;
export const PLAYER_HEIGHT = 50;
export const PLAYER_SPEED = 7;

export const PROJECTILE_WIDTH = 6;
export const PROJECTILE_HEIGHT = 20;
export const PROJECTILE_SPEED = 12;

export const BOMB_WIDTH = 20;
export const BOMB_HEIGHT = 20;
export const BOMB_SPEED = 4;
export const BOMB_DISTANCE = 150; // Distance reticle is ahead of player

export const ENEMY_WIDTH = 40;
export const ENEMY_HEIGHT = 40;

export const SCROLL_SPEED = 2;

export const COLORS = {
  PRIDE_RAINBOW: [
    '#FF0018', // pride-red
    '#FFA52C', // pride-orange
    '#FFFF41', // pride-yellow
    '#008018', // pride-green
    '#0000F9', // pride-blue
    '#86007D', // pride-purple
  ],
  NEON: {
    PINK: '#FF10F0',
    CYAN: '#00FFFF',
    YELLOW: '#FFFF00',
    GREEN: '#39FF14',
  },
  SPACE_BLACK: '#080310',
  GREY_VOID: '#4A4A4A',
  VOID_ACCENT: '#2D2D2D',
  ACCENT_GLOW: '#FFFFFF88',
};

export const LEVELS = [
  {
    enemyCount: 15,
    enemySpeed: 1,
    spawnRate: 2000,
  },
  {
    enemyCount: 20,
    enemySpeed: 1.5,
    spawnRate: 1500,
  },
  {
    enemyCount: 30,
    enemySpeed: 2,
    spawnRate: 1000,
  },
];

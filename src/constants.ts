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

export const STAGE_THEMES = [
  {
    pattern: 'runway',
    backgroundTop: '#0f4d74',
    backgroundBottom: '#12395f',
    haze: 'rgba(128, 179, 102, 0.22)',
    gridColor: 'rgba(218, 244, 255, 0.08)',
    terrainColors: ['#5e8d52', '#7aaa61'],
    airPalette: ['#FF7A8A', '#FFB347', '#FFF36D', '#6FFFB0'],
    groundFill: '#30553d',
    groundAccent: '#d7567b',
    bossBar: '#FF4F8B',
    bossCore: '#FFFFFF',
    reticle: '#00FFFF',
    sunColor: 'rgba(207, 233, 255, 0.28)',
    surfaceBase: '#0d4974',
    surfaceMid: '#186389',
    surfaceShadow: '#07273f',
    featurePrimary: '#c9a172',
    featureSecondary: '#e2bf91',
    trackColor: 'rgba(231, 220, 171, 0.56)',
  },
  {
    pattern: 'diagonal',
    backgroundTop: '#214b67',
    backgroundBottom: '#2e5d70',
    haze: 'rgba(133, 171, 156, 0.2)',
    gridColor: 'rgba(216, 246, 255, 0.07)',
    terrainColors: ['#6f8b7f', '#8ca79b'],
    airPalette: ['#9DF9EF', '#44D9E6', '#7B8CFF', '#E9F7FF'],
    groundFill: '#324a49',
    groundAccent: '#54bfd0',
    bossBar: '#00E5FF',
    bossCore: '#CFFBFF',
    reticle: '#7B8CFF',
    sunColor: 'rgba(228, 247, 255, 0.32)',
    surfaceBase: '#174864',
    surfaceMid: '#24607b',
    surfaceShadow: '#0b2637',
    featurePrimary: '#b5b9b1',
    featureSecondary: '#d7d8cd',
    trackColor: 'rgba(222, 236, 194, 0.44)',
  },
  {
    pattern: 'lattice',
    backgroundTop: '#3c4431',
    backgroundBottom: '#665b30',
    haze: 'rgba(181, 173, 92, 0.18)',
    gridColor: 'rgba(245, 224, 155, 0.08)',
    terrainColors: ['#70713c', '#95914d'],
    airPalette: ['#FFE066', '#FF8A5B', '#FF5C5C', '#FFD1DC'],
    groundFill: '#4c4928',
    groundAccent: '#e0b84e',
    bossBar: '#FFD43B',
    bossCore: '#FFF7D6',
    reticle: '#FFD43B',
    sunColor: 'rgba(249, 224, 149, 0.28)',
    surfaceBase: '#364255',
    surfaceMid: '#43576b',
    surfaceShadow: '#1a2230',
    featurePrimary: '#b8945f',
    featureSecondary: '#d7b87f',
    trackColor: 'rgba(239, 216, 154, 0.48)',
  },
] as const;

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

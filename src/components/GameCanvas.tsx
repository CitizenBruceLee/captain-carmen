/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useCallback } from 'react';
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
  COLORS,
  LEVELS,
  STAGE_THEMES,
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
  PowerUpType,
} from '../types';

interface GameCanvasProps {
  onScoreUpdate: (score: number) => void;
  onLivesUpdate: (lives: number) => void;
  onBombStateUpdate: (bombs: number, charge: number) => void;
  onComboUpdate: (comboCount: number, comboMultiplier: number) => void;
  onGameOver: () => void;
  gameState: GameState;
  level: number;
  onGameStart: () => void;
  onRestart: () => void;
  onStateChange: (state: GameState) => void;
}

type TerrainFeature = {
  x: number;
  y: number;
  color: string;
};

type FormationSpawn = {
  delay: number;
  x: number;
  type: EnemyType;
  class?: EnemyClass;
  vx?: number;
  vy?: number;
  phase?: number;
};

type SpritePalette = {
  primary: string;
  secondary: string;
  highlight: string;
  shadow: string;
};

type SoundCue =
  | 'blaster'
  | 'laser'
  | 'bomb'
  | 'enemyShot'
  | 'explosion'
  | 'pickup'
  | 'playerExplosion'
  | 'gameOverExplosion'
  | 'bossAlert'
  | 'bossSpawn'
  | 'bossDown'
  | 'waveClear';

type ExplosionOptions = {
  particleCount?: number;
  speed?: number;
  lifeMin?: number;
  lifeMax?: number;
  sizeMin?: number;
  sizeMax?: number;
  soundCue?: SoundCue | null;
};

export default function GameCanvas({
  onScoreUpdate,
  onLivesUpdate,
  onBombStateUpdate,
  onComboUpdate,
  onGameOver,
  gameState,
  level,
  onGameStart,
  onRestart,
  onStateChange,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const lastBombHudRef = useRef({ bombs: 3, charge: 1 });

  const MAX_BOMB_STOCK = 3;
  const BOMB_RECHARGE_MS = 3200;
  const COMBO_TIMEOUT_MS = 2200;
  const WAVE_ENTRY_SHIELD_MS = 5000;
  const BOSS_MISSILE_GRACE_MS = 5000;
  const MAX_PARTICLES = 220;
  const MAX_ENEMY_PROJECTILES = 42;
  const SOFT_EFFECT_LOAD = 55;
  const HEAVY_EFFECT_LOAD = 95;

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
    bombStock: MAX_BOMB_STOCK,
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
  const terrainRef = useRef<TerrainFeature[]>([]);
  const keysRef = useRef<Record<string, boolean>>({});
  const lastKeysRef = useRef<Record<string, boolean>>({});

  const lastSpawnTime = useRef<number>(0);
  const frameCount = useRef<number>(0);
  const currentFrameTimeRef = useRef<number>(0);
  const scrollOffset = useRef<number>(0);
  const enemiesDefeatedInLevel = useRef(0);
  const bossSpawningRef = useRef(false);
  const comboCountRef = useRef(0);
  const comboExpiresAtRef = useRef(0);
  const activeFormationRef = useRef<FormationSpawn[] | null>(null);
  const formationStartedAtRef = useRef(0);
  const formationStepIndexRef = useRef(0);
  const formationCursorRef = useRef(0);
  const lastFormationTriggerRef = useRef(0);
  const stageThemeRef = useRef(STAGE_THEMES[0]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioMasterGainRef = useRef<GainNode | null>(null);
  const noiseBufferRef = useRef<AudioBuffer | null>(null);
  const soundCooldownRef = useRef<Record<string, number>>({});
  const gameOverSequenceEndsAtRef = useRef(0);
  const finalExplosionRef = useRef<{ x: number; y: number; startedAt: number } | null>(null);

  const createNoiseBuffer = useCallback((audioContext: AudioContext) => {
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.25, audioContext.sampleRate);
    const channel = buffer.getChannelData(0);

    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }

    return buffer;
  }, []);

  const ensureAudioReady = useCallback(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor = window.AudioContext ?? audioWindow.webkitAudioContext;

    if (!AudioContextCtor) {
      return null;
    }

    if (!audioContextRef.current) {
      const audioContext = new AudioContextCtor();
      const masterGain = audioContext.createGain();
      masterGain.gain.value = 0.18;
      masterGain.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      audioMasterGainRef.current = masterGain;
      noiseBufferRef.current = createNoiseBuffer(audioContext);
    }

    if (audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, [createNoiseBuffer]);

  const shouldPlaySound = useCallback((cue: SoundCue, cooldownMs: number) => {
    const now = performance.now();
    const lastPlayedAt = soundCooldownRef.current[cue] ?? 0;

    if (now - lastPlayedAt < cooldownMs) {
      return false;
    }

    soundCooldownRef.current[cue] = now;
    return true;
  }, []);

  const playTone = useCallback((
    audioContext: AudioContext,
    masterGain: GainNode,
    frequency: number,
    duration: number,
    options: {
      type?: OscillatorType;
      volume?: number;
      when?: number;
      slideTo?: number;
      detune?: number;
    } = {}
  ) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const startAt = options.when ?? audioContext.currentTime;

    oscillator.type = options.type ?? 'triangle';
    oscillator.frequency.setValueAtTime(frequency, startAt);

    if (options.slideTo !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(options.slideTo, 1), startAt + duration);
    }

    if (options.detune !== undefined) {
      oscillator.detune.setValueAtTime(options.detune, startAt);
    }

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(options.volume ?? 0.06, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.03);
  }, []);

  const playNoiseBurst = useCallback((
    audioContext: AudioContext,
    masterGain: GainNode,
    duration: number,
    options: {
      volume?: number;
      filterFrequency?: number;
      when?: number;
    } = {}
  ) => {
    if (!noiseBufferRef.current) {
      noiseBufferRef.current = createNoiseBuffer(audioContext);
    }

    const noiseSource = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    const startAt = options.when ?? audioContext.currentTime;

    noiseSource.buffer = noiseBufferRef.current;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(options.filterFrequency ?? 850, startAt);
    filter.Q.value = 0.7;

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(options.volume ?? 0.05, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    noiseSource.start(startAt);
    noiseSource.stop(startAt + duration + 0.03);
  }, [createNoiseBuffer]);

  const playSound = useCallback((cue: SoundCue) => {
    const audioContext = ensureAudioReady();
    const masterGain = audioMasterGainRef.current;

    if (!audioContext || !masterGain) {
      return;
    }

    const now = audioContext.currentTime;

    switch (cue) {
      case 'blaster':
        if (!shouldPlaySound(cue, 65)) return;
        playTone(audioContext, masterGain, 980, 0.05, { type: 'square', volume: 0.04, slideTo: 720, when: now });
        playTone(audioContext, masterGain, 1440, 0.03, { type: 'triangle', volume: 0.025, when: now + 0.01 });
        break;
      case 'laser':
        if (!shouldPlaySound(cue, 70)) return;
        playTone(audioContext, masterGain, 1240, 0.08, { type: 'sawtooth', volume: 0.05, slideTo: 920, when: now });
        playTone(audioContext, masterGain, 1860, 0.06, { type: 'sine', volume: 0.028, when: now + 0.01, slideTo: 1480 });
        break;
      case 'bomb':
        if (!shouldPlaySound(cue, 180)) return;
        playTone(audioContext, masterGain, 220, 0.2, { type: 'sawtooth', volume: 0.06, slideTo: 90, when: now });
        playNoiseBurst(audioContext, masterGain, 0.12, { volume: 0.035, filterFrequency: 500, when: now + 0.03 });
        break;
      case 'enemyShot':
        if (!shouldPlaySound(cue, 120)) return;
        playTone(audioContext, masterGain, 430, 0.08, { type: 'square', volume: 0.03, slideTo: 240, when: now });
        break;
      case 'explosion':
        if (!shouldPlaySound(cue, 90)) return;
        playNoiseBurst(audioContext, masterGain, 0.22, { volume: 0.07, filterFrequency: 760, when: now });
        playTone(audioContext, masterGain, 160, 0.15, { type: 'triangle', volume: 0.025, slideTo: 60, when: now });
        break;
      case 'pickup':
        if (!shouldPlaySound(cue, 160)) return;
        playTone(audioContext, masterGain, 660, 0.08, { type: 'triangle', volume: 0.05, when: now });
        playTone(audioContext, masterGain, 990, 0.1, { type: 'triangle', volume: 0.04, when: now + 0.06 });
        break;
      case 'playerExplosion':
        if (!shouldPlaySound(cue, 250)) return;
        playNoiseBurst(audioContext, masterGain, 0.18, { volume: 0.06, filterFrequency: 440, when: now });
        playTone(audioContext, masterGain, 280, 0.2, { type: 'sawtooth', volume: 0.05, slideTo: 90, when: now });
        break;
      case 'gameOverExplosion':
        if (!shouldPlaySound(cue, 900)) return;
        playNoiseBurst(audioContext, masterGain, 0.5, { volume: 0.1, filterFrequency: 320, when: now });
        playTone(audioContext, masterGain, 180, 0.46, { type: 'sawtooth', volume: 0.08, slideTo: 38, when: now });
        playTone(audioContext, masterGain, 320, 0.38, { type: 'triangle', volume: 0.05, slideTo: 70, when: now + 0.08 });
        break;
      case 'bossAlert':
        if (!shouldPlaySound(cue, 2200)) return;
        playTone(audioContext, masterGain, 220, 0.16, { type: 'sawtooth', volume: 0.045, when: now });
        playTone(audioContext, masterGain, 277, 0.16, { type: 'sawtooth', volume: 0.045, when: now + 0.2 });
        playTone(audioContext, masterGain, 330, 0.22, { type: 'sawtooth', volume: 0.05, when: now + 0.4 });
        break;
      case 'bossSpawn':
        if (!shouldPlaySound(cue, 1200)) return;
        playTone(audioContext, masterGain, 180, 0.28, { type: 'sawtooth', volume: 0.05, slideTo: 420, when: now });
        playNoiseBurst(audioContext, masterGain, 0.16, { volume: 0.03, filterFrequency: 1200, when: now + 0.1 });
        break;
      case 'bossDown':
        if (!shouldPlaySound(cue, 1600)) return;
        playTone(audioContext, masterGain, 520, 0.12, { type: 'triangle', volume: 0.05, when: now });
        playTone(audioContext, masterGain, 390, 0.14, { type: 'triangle', volume: 0.05, when: now + 0.12 });
        playTone(audioContext, masterGain, 260, 0.2, { type: 'triangle', volume: 0.06, when: now + 0.26 });
        playNoiseBurst(audioContext, masterGain, 0.25, { volume: 0.06, filterFrequency: 950, when: now + 0.1 });
        break;
      case 'waveClear':
        if (!shouldPlaySound(cue, 2200)) return;
        playTone(audioContext, masterGain, 523.25, 0.12, { type: 'triangle', volume: 0.045, when: now });
        playTone(audioContext, masterGain, 659.25, 0.12, { type: 'triangle', volume: 0.045, when: now + 0.11 });
        playTone(audioContext, masterGain, 783.99, 0.14, { type: 'triangle', volume: 0.05, when: now + 0.22 });
        playTone(audioContext, masterGain, 1046.5, 0.28, { type: 'sine', volume: 0.04, when: now + 0.38, slideTo: 1174.66 });
        playTone(audioContext, masterGain, 1318.51, 0.24, { type: 'sine', volume: 0.03, when: now + 0.48 });
        break;
      default:
        break;
    }
  }, [ensureAudioReady, playNoiseBurst, playTone, shouldPlaySound]);

  const syncBombHud = useCallback((bombStock: number) => {
    const bombs = Math.floor(bombStock);
    const charge = bombStock >= MAX_BOMB_STOCK ? 1 : Number((bombStock - bombs).toFixed(2));

    if (lastBombHudRef.current.bombs !== bombs || lastBombHudRef.current.charge !== charge) {
      lastBombHudRef.current = { bombs, charge };
      onBombStateUpdate(bombs, charge);
    }
  }, [onBombStateUpdate]);

  const resetCombo = useCallback(() => {
    if (comboCountRef.current !== 0) {
      comboCountRef.current = 0;
      comboExpiresAtRef.current = 0;
      onComboUpdate(0, 1);
    }
  }, [onComboUpdate]);

  const getSceneLoad = useCallback(() => {
    return enemiesRef.current.length
      + projectilesRef.current.length
      + powerUpsRef.current.length
      + Math.floor(particlesRef.current.length * 0.35);
  }, []);

  const registerKill = useCallback((enemy: Enemy, projectileClass: ProjectileClass, time: number) => {
    const p = playerRef.current;

    if (time > comboExpiresAtRef.current) {
      comboCountRef.current = 0;
    }

    comboCountRef.current += 1;
    comboExpiresAtRef.current = time + COMBO_TIMEOUT_MS;

    const comboMultiplier = Math.min(1 + Math.floor((comboCountRef.current - 1) / 3), 5);
    const styleBonus = projectileClass === 'BOMB' && enemy.class === 'GROUND' ? 150 : 0;
    const scoreAward = enemy.points * comboMultiplier + styleBonus;

    p.score += scoreAward;
    onScoreUpdate(p.score);
    onComboUpdate(comboCountRef.current, comboMultiplier);

    if (enemy.class === 'GROUND') {
      p.bombStock = Math.min(MAX_BOMB_STOCK, p.bombStock + 0.35);
      syncBombHud(p.bombStock);
    }
  }, [onComboUpdate, onScoreUpdate, syncBombHud]);
  
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
      bombStock: MAX_BOMB_STOCK,
      bombX: GAME_WIDTH / 2,
      bombY: GAME_HEIGHT - PLAYER_HEIGHT - 100 - BOMB_DISTANCE,
      weaponTimer: 0,
      hasAutoFire: false,
      invisibleTimer: WAVE_ENTRY_SHIELD_MS,
    };
    enemiesRef.current = [];
    projectilesRef.current = [];
    particlesRef.current = [];
    powerUpsRef.current = [];
    enemiesDefeatedInLevel.current = 0;
    bossSpawningRef.current = false;
    activeFormationRef.current = null;
    formationStartedAtRef.current = 0;
    formationStepIndexRef.current = 0;
    formationCursorRef.current = 0;
    lastFormationTriggerRef.current = 0;
    frameCount.current = 0;
    lastSpawnTime.current = 0;
    scrollOffset.current = 0;
    gameOverSequenceEndsAtRef.current = 0;
    finalExplosionRef.current = null;
    lastBombHudRef.current = { bombs: MAX_BOMB_STOCK, charge: 1 };
    onBombStateUpdate(MAX_BOMB_STOCK, 1);
    comboCountRef.current = 0;
    comboExpiresAtRef.current = 0;
    onComboUpdate(0, 1);
  }, [onBombStateUpdate, onComboUpdate]);

  const buildTerrainFeatures = useCallback(() => {
    const features: TerrainFeature[] = [];

    for (let index = 0; index < 20; index += 1) {
      features.push({
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * GAME_HEIGHT,
        color: Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(255,16,240,0.02)',
      });
    }

    return features;
  }, []);

  const refreshTerrainForTheme = useCallback((themeIndex: number) => {
    const theme = STAGE_THEMES[Math.min(themeIndex, STAGE_THEMES.length - 1)];
    stageThemeRef.current = theme;
    terrainRef.current = buildTerrainFeatures();
  }, [buildTerrainFeatures]);

  // Reset game on START
  useEffect(() => {
    if (gameState === 'START') {
      resetGameState();
    }
  }, [gameState, resetGameState]);

  // Touch Handling State
  const touchState = useRef({
    moveTouchId: null as number | null,
    moveLastX: 0,
    fireActive: false,
    bombPressed: false,
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
      "   +   ",
      "  OXO  ",
      " OXXXO ",
      "XOXXXOX",
      "XXXXXXX",
      " OXOXO ",
      "  X X  ",
      "  O O  ",
    ],
    SCOUT: [
      "  + +  ",
      "  OXO  ",
      " OXXXO ",
      "XXOXOXX",
      " OXXXO ",
      "  X X  ", 
    ],
    FIGHTER: [
      " +   + ",
      " OXXXO ",
      "XXXXXXX",
      "XXOXOXX",
      "XXXXXXX",
      " OXXXO ",
      " X   X ",
    ],
    ORB: [
      "  +  ",
      " OXO ",
      "XXOXX",
      " OXO ",
      "  +  ",
    ],
    STRIKER: [
      "   +   ",
      "  OXO  ",
      " OXXXO ",
      "XXXXXXX",
      " OXXXO ",
      "X  X  X",
    ],
    BASE: [
      "   O+O   ",
      "  OXXXO  ",
      " OXXXXXO ",
      "XXXXXXXXX",
      "XOXXXXXOX",
      "XXXXXXXXX",
      "XX#X#X#XX",
    ],
    CORE: [
      "   O+O   ",
      "  OOXOO  ",
      " OXXXXXO ",
      "XXXXXXXXX",
      "XOXXOXXOX",
      "XXXXXXXXX",
      "XX#X#X#XX",
    ],
    MINELAYER: [
      " OXXXO ",
      "XXO OXX",
      "XO + OX",
      "XXO OXX",
      " OXXXO ",
    ],
    TURRET: [
      "   O+O   ",
      "  OOXOO  ",
      " OXXXXXO ",
      "XXXXXXXXX",
      "XOXXXXXOX",
      "XXXXXXXXX",
      " XX# #XX ",
    ],
    BOSS: [
      "      +      ",
      "    OOXOO    ",
      "   OXXXXXO   ",
      "  OXXXXXXXO  ",
      " OXXXXXXXXXO ",
      "XOXXXO+OXXXOX",
      " XXOO   OOXX ",
      "  OX     XO  ",
    ],
    AUTO_FIRE: [
      "  +  ",
      " OXO ",
      "XO+OX",
      " OXO ",
      "  +  ",
    ]
  };

  const drawArcadeSprite = (
    ctx: CanvasRenderingContext2D,
    sprite: string[],
    x: number,
    y: number,
    width: number,
    height: number,
    palette: SpritePalette | string
  ) => {
    const rows = sprite.length;
    const cols = sprite[0].length;
    const pW = width / cols;
    const pH = height / rows;

    const resolvedPalette: SpritePalette = typeof palette === 'string'
      ? {
          primary: palette,
          secondary: '#F6F7FB',
          highlight: '#FFFFFF',
          shadow: 'rgba(8, 3, 16, 0.72)',
        }
      : palette;

    sprite.forEach((row, ri) => {
      for (let ci = 0; ci < row.length; ci++) {
        const pixel = row[ci];
        if (pixel === ' ') {
          continue;
        }

        let fill = resolvedPalette.primary;
        if (pixel === 'O') fill = resolvedPalette.secondary;
        if (pixel === '+') fill = resolvedPalette.highlight;
        if (pixel === '#') fill = resolvedPalette.shadow;

        const drawX = x + ci * pW;
        const drawY = y + ri * pH;
        const pixelWidth = Math.max(pW - 1, 1);
        const pixelHeight = Math.max(pH - 1, 1);

        if (pixel !== '#') {
          ctx.fillStyle = resolvedPalette.shadow;
          ctx.fillRect(drawX + 1, drawY + 1, pixelWidth, pixelHeight);
        }

        ctx.fillStyle = fill;
        ctx.fillRect(drawX, drawY, pixelWidth, pixelHeight);
      }
    });
  };

  const closeAudio = useCallback(() => {
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      void audioContextRef.current.close();
    }

    audioContextRef.current = null;
    audioMasterGainRef.current = null;
    noiseBufferRef.current = null;
  }, []);

  // Initialize terrain
  useEffect(() => {
    terrainRef.current = buildTerrainFeatures();
  }, [buildTerrainFeatures]);

  useEffect(() => {
    refreshTerrainForTheme(level - 1);
    playerRef.current.invisibleTimer = WAVE_ENTRY_SHIELD_MS;
    activeFormationRef.current = null;
    formationStartedAtRef.current = 0;
    formationStepIndexRef.current = 0;
    formationCursorRef.current = 0;
    lastFormationTriggerRef.current = 0;
  }, [level, refreshTerrainForTheme]);

  const buildFormationWave = useCallback((stageLevel: number, formationIndex: number): FormationSpawn[] => {
    const centerX = GAME_WIDTH / 2 - ENEMY_WIDTH / 2;
    const leftLane = GAME_WIDTH * 0.18;
    const rightLane = GAME_WIDTH * 0.72;

    const stageFormations: FormationSpawn[][][] = [
      [
        [
          { delay: 0, x: centerX, type: 'FIGHTER', vy: 2.6 },
          { delay: 140, x: centerX - 70, type: 'SCOUT', vx: 0.55, vy: 2.4 },
          { delay: 140, x: centerX + 70, type: 'SCOUT', vx: -0.55, vy: 2.4 },
          { delay: 280, x: centerX - 140, type: 'SCOUT', vx: 0.8, vy: 2.8 },
          { delay: 280, x: centerX + 140, type: 'SCOUT', vx: -0.8, vy: 2.8 },
        ],
        [
          { delay: 0, x: leftLane, type: 'ORB', vx: 1.2, vy: 2.2, phase: 0 },
          { delay: 120, x: rightLane, type: 'ORB', vx: -1.2, vy: 2.2, phase: Math.PI },
          { delay: 240, x: leftLane + 90, type: 'SCOUT', vx: 0.9, vy: 2.6 },
          { delay: 360, x: rightLane - 90, type: 'SCOUT', vx: -0.9, vy: 2.6 },
          { delay: 480, x: centerX, type: 'STRIKER', vy: 4.8 },
        ],
        [
          { delay: 0, x: GAME_WIDTH * 0.16, type: 'BASE', class: 'GROUND', vy: SCROLL_SPEED },
          { delay: 130, x: GAME_WIDTH * 0.41, type: 'CORE', class: 'GROUND', vy: SCROLL_SPEED },
          { delay: 260, x: GAME_WIDTH * 0.66, type: 'TURRET', class: 'GROUND', vy: SCROLL_SPEED },
          { delay: 120, x: GAME_WIDTH * 0.08, type: 'FIGHTER', vx: 0.7, vy: 2.1 },
          { delay: 120, x: GAME_WIDTH * 0.78, type: 'FIGHTER', vx: -0.7, vy: 2.1 },
        ],
      ],
      [
        [
          { delay: 0, x: leftLane - 10, type: 'STRIKER', vy: 5.2 },
          { delay: 90, x: leftLane + 65, type: 'SCOUT', vx: 0.75, vy: 2.8 },
          { delay: 180, x: centerX, type: 'FIGHTER', vy: 3 },
          { delay: 270, x: rightLane - 65, type: 'SCOUT', vx: -0.75, vy: 2.8 },
          { delay: 360, x: rightLane + 10, type: 'STRIKER', vy: 5.2 },
        ],
        [
          { delay: 0, x: GAME_WIDTH * 0.12, type: 'ORB', vx: 1.4, vy: 2.4, phase: 0 },
          { delay: 110, x: GAME_WIDTH * 0.82, type: 'ORB', vx: -1.4, vy: 2.4, phase: Math.PI },
          { delay: 220, x: GAME_WIDTH * 0.28, type: 'MINELAYER', vx: 0.4, vy: 1.9, phase: Math.PI / 2 },
          { delay: 330, x: GAME_WIDTH * 0.56, type: 'FIGHTER', vy: 2.9 },
          { delay: 440, x: GAME_WIDTH * 0.72, type: 'MINELAYER', vx: -0.4, vy: 1.9, phase: Math.PI },
        ],
        [
          { delay: 0, x: GAME_WIDTH * 0.14, type: 'BASE', class: 'GROUND', vy: SCROLL_SPEED },
          { delay: 150, x: GAME_WIDTH * 0.5, type: 'CORE', class: 'GROUND', vy: SCROLL_SPEED },
          { delay: 300, x: GAME_WIDTH * 0.76, type: 'TURRET', class: 'GROUND', vy: SCROLL_SPEED },
          { delay: 90, x: GAME_WIDTH * 0.08, type: 'SCOUT', vx: 0.9, vy: 2.5 },
          { delay: 180, x: GAME_WIDTH * 0.34, type: 'FIGHTER', vx: 0.55, vy: 2.5 },
          { delay: 90, x: GAME_WIDTH * 0.84, type: 'SCOUT', vx: -0.9, vy: 2.5 },
        ],
      ],
      [
        [
          { delay: 0, x: GAME_WIDTH * 0.08, type: 'SCOUT', vx: 1, vy: 3.1 },
          { delay: 75, x: GAME_WIDTH * 0.22, type: 'FIGHTER', vx: 0.7, vy: 3 },
          { delay: 150, x: centerX, type: 'STRIKER', vy: 5.4 },
          { delay: 225, x: GAME_WIDTH * 0.7, type: 'FIGHTER', vx: -0.7, vy: 3 },
          { delay: 300, x: GAME_WIDTH * 0.84, type: 'SCOUT', vx: -1, vy: 3.1 },
          { delay: 375, x: centerX, type: 'ORB', vy: 2.5, phase: Math.PI / 3 },
        ],
        [
          { delay: 0, x: GAME_WIDTH * 0.12, type: 'MINELAYER', vx: 0.35, vy: 2 },
          { delay: 0, x: GAME_WIDTH * 0.76, type: 'MINELAYER', vx: -0.35, vy: 2, phase: Math.PI },
          { delay: 130, x: GAME_WIDTH * 0.3, type: 'ORB', vx: 1.1, vy: 2.6, phase: 0 },
          { delay: 130, x: GAME_WIDTH * 0.58, type: 'ORB', vx: -1.1, vy: 2.6, phase: Math.PI },
          { delay: 260, x: centerX, type: 'STRIKER', vy: 5.8 },
        ],
        [
          { delay: 0, x: GAME_WIDTH * 0.12, type: 'BASE', class: 'GROUND', vy: SCROLL_SPEED },
          { delay: 90, x: GAME_WIDTH * 0.3, type: 'CORE', class: 'GROUND', vy: SCROLL_SPEED },
          { delay: 180, x: GAME_WIDTH * 0.48, type: 'TURRET', class: 'GROUND', vy: SCROLL_SPEED },
          { delay: 270, x: GAME_WIDTH * 0.66, type: 'CORE', class: 'GROUND', vy: SCROLL_SPEED },
          { delay: 360, x: GAME_WIDTH * 0.84, type: 'BASE', class: 'GROUND', vy: SCROLL_SPEED },
          { delay: 120, x: GAME_WIDTH * 0.18, type: 'FIGHTER', vx: 0.8, vy: 2.8 },
          { delay: 120, x: GAME_WIDTH * 0.7, type: 'FIGHTER', vx: -0.8, vy: 2.8 },
        ],
      ],
    ];

    const stageIndex = Math.min(stageLevel - 1, stageFormations.length - 1);
    const formations = stageFormations[stageIndex];
    return formations[formationIndex % formations.length];
  }, []);

  const spawnEnemy = useCallback((override?: Partial<Enemy>) => {
    const x = override?.x ?? Math.random() * (GAME_WIDTH - ENEMY_WIDTH);
    const id = Math.random().toString(36).substr(2, 9);
    const hasTypeOverride = override?.type !== undefined;
    const forceAirOnly = override?.class === 'AIR';
    
    // Weighted selection
    const r = Math.random();
    let type: EnemyType = override?.type ?? 'SCOUT';
    let isGround = override?.class === 'GROUND';

    if (!hasTypeOverride) {
      if (forceAirOnly) {
        if (r < 0.32) {
          type = 'SCOUT';
        } else if (r < 0.56) {
          type = 'FIGHTER';
        } else if (r < 0.74) {
          type = 'ORB';
        } else if (r < 0.88) {
          type = 'STRIKER';
        } else {
          type = 'MINELAYER';
        }
      } else {
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
      }
    }

    if (type === 'BASE' || type === 'CORE' || type === 'TURRET') {
      isGround = true;
    }
    
    const newEnemy: Enemy = {
      id,
      x,
      y: override?.y ?? -ENEMY_HEIGHT,
      width: override?.width ?? ENEMY_WIDTH,
      height: override?.height ?? ENEMY_HEIGHT,
      vx: override?.vx ?? (isGround ? 0 : (Math.random() - 0.5) * 2),
      vy: override?.vy ?? (isGround ? SCROLL_SPEED : (type === 'STRIKER' ? 5 : 2 + Math.random() * 2)),
      type,
      class: override?.class ?? (isGround ? 'GROUND' : 'AIR'),
      color: override?.color ?? COLORS.GREY_VOID,
      health: override?.health ?? (type === 'FIGHTER' || type === 'CORE' || type === 'STRIKER' ? 2 : 1),
      maxHealth: override?.maxHealth ?? (type === 'FIGHTER' || type === 'CORE' || type === 'STRIKER' ? 2 : 1),
      points: override?.points ?? (isGround ? 500 : 200),
      phase: override?.phase ?? Math.random() * Math.PI * 2,
      lastFireTime: override?.lastFireTime ?? 0,
      fireRate: override?.fireRate ?? (type === 'TURRET' ? 2000 : (type === 'ORB' ? 1500 : 3000)),
      currentPhase: override?.currentPhase ?? 1,
    };
    
    enemiesRef.current.push(newEnemy);
  }, []);

  const startFormation = useCallback((time: number) => {
    activeFormationRef.current = buildFormationWave(level, formationCursorRef.current);
    formationCursorRef.current += 1;
    formationStartedAtRef.current = time;
    formationStepIndexRef.current = 0;
  }, [buildFormationWave, level]);

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
    playSound('bossSpawn');
  }, [playSound]);

  const shootBlaster = useCallback(() => {
    const p = playerRef.current;
    if (p.hasAutoFire) {
      const laserOrigins = [-14, 0, 14];
      laserOrigins.forEach((offset, index) => {
        projectilesRef.current.push({
          id: Math.random().toString(36).substr(2, 9),
          x: p.x + p.width / 2 - 4 + offset,
          y: p.y - 6,
          width: index === 1 ? 8 : 5,
          height: 34,
          vx: 0,
          vy: -(PROJECTILE_SPEED + 4),
          owner: 'player',
          color: index === 1 ? COLORS.NEON.CYAN : '#FFFFFF',
          class: 'LASER',
          damage: index === 1 ? 2 : 1,
          penetration: index === 1 ? 2 : 1,
        });
      });
      playSound('laser');
      return;
    }

    projectilesRef.current.push({
      id: Math.random().toString(36).substr(2, 9),
      x: p.x + p.width / 2 - PROJECTILE_WIDTH / 2,
      y: p.y,
      width: PROJECTILE_WIDTH,
      height: PROJECTILE_HEIGHT,
      vx: 0,
      vy: -PROJECTILE_SPEED,
      owner: 'player',
      color: '#FFFFFF',
      class: 'BLASTER',
      damage: 1,
      penetration: 0,
    });
    playSound('blaster');
  }, [playSound]);

  const enemyShoot = useCallback((enemy: Enemy, type: ProjectileClass, targetX?: number, targetY?: number) => {
    let enemyProjectileCount = 0;
    for (let index = 0; index < projectilesRef.current.length; index += 1) {
      if (projectilesRef.current[index].owner === 'enemy') {
        enemyProjectileCount += 1;
      }
    }

    if (enemyProjectileCount >= MAX_ENEMY_PROJECTILES) {
      return;
    }

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
      damage: 1,
      penetration: 0,
      sourceType: enemy.type,
    };
    projectilesRef.current.push(newProjectile);
    if (enemy.class === 'GROUND' && type === 'BULLET') {
      createTankShotDebris(enemy);
    }
    playSound('enemyShot');
  }, [createTankShotDebris, playSound]);

  const expireBossMissiles = useCallback((time: number) => {
    projectilesRef.current.forEach((projectile) => {
      if (projectile.owner === 'enemy' && projectile.class === 'MISSILE' && projectile.sourceType === 'BOSS') {
        projectile.expiresAt = Math.min(projectile.expiresAt ?? Number.POSITIVE_INFINITY, time + BOSS_MISSILE_GRACE_MS);
      }
    });
  }, []);

  const dropBomb = useCallback(() => {
    const p = playerRef.current;

    if (p.bombStock < 1) {
      return false;
    }

    p.bombStock = Math.max(0, p.bombStock - 1);
    syncBombHud(p.bombStock);
    
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
      class: 'BOMB',
      damage: 1,
      penetration: 0,
    };
    
    projectilesRef.current.push(newProjectile);
    playSound('bomb');
    return true;
  }, [playSound, syncBombHud]);

  const createExplosion = useCallback((x: number, y: number, color: string, options: ExplosionOptions = {}) => {
    const sceneLoad = getSceneLoad();
    const requestedParticleCount = options.particleCount ?? 15;
    const particleScale = sceneLoad > HEAVY_EFFECT_LOAD ? 0.45 : sceneLoad > SOFT_EFFECT_LOAD ? 0.7 : 1;
    const particleBudget = Math.max(0, MAX_PARTICLES - particlesRef.current.length);
    const particleCount = Math.min(Math.max(0, Math.ceil(requestedParticleCount * particleScale)), particleBudget);
    const speed = options.speed ?? 10;
    const lifeMin = options.lifeMin ?? 0.5;
    const lifeMax = options.lifeMax ?? 1;
    const sizeMin = options.sizeMin ?? 2;
    const sizeMax = options.sizeMax ?? 6;

    for (let i = 0; i < particleCount; i++) {
      const maxLife = lifeMin + Math.random() * Math.max(lifeMax - lifeMin, 0.01);
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
        life: maxLife,
        maxLife,
        color,
        size: sizeMin + Math.random() * Math.max(sizeMax - sizeMin, 0.5),
      });
    }

    if (options.soundCue === undefined) {
      playSound('explosion');
    } else if (options.soundCue !== null) {
      playSound(options.soundCue);
    }
  }, [getSceneLoad, playSound]);

  function createTankShotDebris(enemy: Enemy) {
    if (particlesRef.current.length >= MAX_PARTICLES - 10) {
      return;
    }

    const lowEffects = getSceneLoad() > SOFT_EFFECT_LOAD;
    const stageTheme = stageThemeRef.current;
    const isTurret = enemy.type === 'TURRET';
    const visualWidth = enemy.width * 1.18;
    const visualHeight = enemy.height * 1.14;
    const visualX = enemy.x - (visualWidth - enemy.width) / 2;
    const visualY = enemy.y - enemy.height * 0.1;
    const turretBaseX = visualX + visualWidth * 0.5;
    const turretBaseY = visualY + visualHeight * 0.34;
    const barrelLength = visualHeight * (isTurret ? 0.45 : 0.31);
    const muzzleY = turretBaseY - barrelLength;

    for (let index = 0; index < (lowEffects ? 3 : 6); index += 1) {
      const maxLife = 0.18 + Math.random() * 0.2;
      particlesRef.current.push({
        x: turretBaseX + (Math.random() - 0.5) * 5,
        y: muzzleY + (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.5) * 1.6,
        vy: -0.8 - Math.random() * 1.1,
        life: maxLife,
        maxLife,
        color: index < 2 ? 'rgba(255,255,255,0.9)' : 'rgba(160,170,180,0.55)',
        size: 2.5 + Math.random() * 2.5,
      });
    }

    for (let index = 0; index < (lowEffects ? 2 : 5); index += 1) {
      const maxLife = 0.16 + Math.random() * 0.12;
      particlesRef.current.push({
        x: turretBaseX + visualWidth * 0.12,
        y: turretBaseY + visualHeight * 0.02,
        vx: 1.4 + Math.random() * 2.2,
        vy: -0.7 - Math.random() * 1.4,
        life: maxLife,
        maxLife,
        color: index % 2 === 0 ? stageTheme.bossCore : stageTheme.groundAccent,
        size: 1.5 + Math.random() * 1.8,
      });
    }
  }

  function createTrackDust(enemy: Enemy) {
    if (particlesRef.current.length >= MAX_PARTICLES - 4 || getSceneLoad() > HEAVY_EFFECT_LOAD) {
      return;
    }

    const visualWidth = enemy.width * 1.24;
    const visualHeight = enemy.height * 1.02;
    const visualX = enemy.x - (visualWidth - enemy.width) / 2;
    const visualY = enemy.y - enemy.height * 0.01;
    const groundLineY = visualY + visualHeight * 0.91;
    const treadOffsets = [0.22, 0.78];

    treadOffsets.forEach((offset, index) => {
      const maxLife = 0.22 + Math.random() * 0.14;
      particlesRef.current.push({
        x: visualX + visualWidth * offset + (Math.random() - 0.5) * 4,
        y: groundLineY + Math.random() * 2,
        vx: (index === 0 ? -1 : 1) * (0.25 + Math.random() * 0.4),
        vy: -0.45 - Math.random() * 0.35,
        life: maxLife,
        maxLife,
        color: index === 0 ? 'rgba(145, 136, 132, 0.34)' : 'rgba(255, 248, 220, 0.24)',
        size: 2 + Math.random() * 2.2,
      });
    });
  }

  const updateParticles = useCallback(() => {
    for (let idx = particlesRef.current.length - 1; idx >= 0; idx -= 1) {
      const particle = particlesRef.current[idx];
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.1;
      particle.life -= 0.02;
      if (particle.life <= 0) {
        particlesRef.current.splice(idx, 1);
      }
    }
  }, []);

  const handlePlayerDamage = useCallback((x: number, y: number, time: number) => {
    const player = playerRef.current;

    player.lives -= 1;
    onLivesUpdate(player.lives);
    resetCombo();

    if (player.lives <= 0) {
      finalExplosionRef.current = { x, y, startedAt: time };
      gameOverSequenceEndsAtRef.current = time + 1400;
      createExplosion(x, y, COLORS.NEON.PINK, {
        particleCount: 52,
        speed: 15,
        lifeMin: 1.4,
        lifeMax: 2.2,
        sizeMin: 3,
        sizeMax: 9,
        soundCue: 'gameOverExplosion',
      });
      createExplosion(x, y, '#FFFFFF', {
        particleCount: 18,
        speed: 9,
        lifeMin: 1,
        lifeMax: 1.5,
        sizeMin: 2,
        sizeMax: 5,
        soundCue: null,
      });
      return true;
    }

    createExplosion(x, y, '#FF6B6B', {
      particleCount: 28,
      speed: 11,
      lifeMin: 0.7,
      lifeMax: 1.15,
      sizeMin: 2,
      sizeMax: 6,
      soundCue: 'playerExplosion',
    });
    return false;
  }, [createExplosion, onLivesUpdate, resetCombo]);

  const update = useCallback((time: number) => {
    currentFrameTimeRef.current = time;
    frameCount.current += 1;

    if (gameOverSequenceEndsAtRef.current > 0) {
      updateParticles();
      draw();

      if (time >= gameOverSequenceEndsAtRef.current) {
        gameOverSequenceEndsAtRef.current = 0;
        finalExplosionRef.current = null;
        onGameOver();
        return;
      }

      requestRef.current = requestAnimationFrame(update);
      return;
    }

    if (gameState !== 'PLAYING' && gameState !== 'BOSS_WARNING' && gameState !== 'LEVEL_UP') return;

    const p = playerRef.current;

    if (comboCountRef.current > 0 && time > comboExpiresAtRef.current) {
      resetCombo();
    }

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

    if (p.bombStock < MAX_BOMB_STOCK) {
      p.bombStock = Math.min(MAX_BOMB_STOCK, p.bombStock + (16.67 / BOMB_RECHARGE_MS));
      syncBombHud(p.bombStock);
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
    
    // Bomb (Command / B) - Manual
    const bombPressed = !!(keysRef.current['MetaLeft'] || keysRef.current['MetaRight'] || keysRef.current['KeyB']);
    const bombJustPressed = bombPressed && !(lastKeysRef.current['MetaLeft'] || lastKeysRef.current['MetaRight'] || lastKeysRef.current['KeyB']);

    if (bombJustPressed) {
      dropBomb();
    }
    
    // Touch Fire - bottom-right outer lane fires, inner lane bombs
    if (touchState.current.fireActive) {
      if (p.hasAutoFire) {
        if (time - touchState.current.lastFireTime >= 90) {
          shootBlaster();
          touchState.current.lastFireTime = time;
        }
      } else if (time - touchState.current.lastFireTime >= 180) {
        shootBlaster();
        touchState.current.lastFireTime = time;
      }
    }

    // Update last keys
    lastKeysRef.current = { ...keysRef.current };

    // Scroll Background
    scrollOffset.current = (scrollOffset.current + SCROLL_SPEED) % GAME_HEIGHT;

    const stageProfile = LEVELS[Math.min(level - 1, LEVELS.length - 1)];
    const formationTriggerInterval = Math.max(3, 6 - Math.min(level, 3));
    const fallbackSpawnDelay = Math.max(900, stageProfile.spawnRate - 150);
    const maxGroundEnemies = level === 1 ? 3 : level === 2 ? 2 : 3;
    let activeGroundEnemies = enemiesRef.current.reduce((count, enemy) => count + (enemy.class === 'GROUND' ? 1 : 0), 0);

    // Spawn enemies
    const hasBoss = enemiesRef.current.some(e => e.type === 'BOSS');
    if (gameState === 'PLAYING' && !hasBoss) {
      if (enemiesDefeatedInLevel.current >= 15) {
        activeFormationRef.current = null;
        formationStepIndexRef.current = 0;
        onStateChange('BOSS_WARNING');
        enemiesDefeatedInLevel.current = 0;
      } else {
        const shouldTriggerFormation =
          enemiesDefeatedInLevel.current > 0 &&
          enemiesDefeatedInLevel.current % formationTriggerInterval === 0 &&
          lastFormationTriggerRef.current !== enemiesDefeatedInLevel.current &&
          !activeFormationRef.current;

        if (shouldTriggerFormation) {
          lastFormationTriggerRef.current = enemiesDefeatedInLevel.current;
          startFormation(time);
        }

        if (activeFormationRef.current) {
          while (
            formationStepIndexRef.current < activeFormationRef.current.length &&
            time - formationStartedAtRef.current >= activeFormationRef.current[formationStepIndexRef.current].delay
          ) {
            const formationEnemy = activeFormationRef.current[formationStepIndexRef.current];
            if (formationEnemy.class === 'GROUND' && activeGroundEnemies >= maxGroundEnemies) {
              formationStepIndexRef.current += 1;
              continue;
            }

            spawnEnemy({
              x: formationEnemy.x,
              type: formationEnemy.type,
              class: formationEnemy.class,
              vx: formationEnemy.vx,
              vy: formationEnemy.vy,
              phase: formationEnemy.phase,
            });

            if (formationEnemy.class === 'GROUND') {
              activeGroundEnemies += 1;
            }

            formationStepIndexRef.current += 1;
            lastSpawnTime.current = time;
          }

          if (formationStepIndexRef.current >= activeFormationRef.current.length) {
            activeFormationRef.current = null;
            formationStepIndexRef.current = 0;
          }
        } else if (time - lastSpawnTime.current > fallbackSpawnDelay) {
          spawnEnemy(activeGroundEnemies >= maxGroundEnemies ? { class: 'AIR' } : undefined);
          lastSpawnTime.current = time;
        }
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
        playSound('pickup');
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

        if (proj.expiresAt !== undefined && time >= proj.expiresAt) {
          projectilesRef.current.splice(idx, 1);
          return;
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
        projectilesRef.current.splice(idx, 1);
        handlePlayerDamage(p.x + p.width / 2, p.y + p.height / 2, time);
      }
    });

    // Update Enemies
    enemiesRef.current.forEach((enemy, eIdx) => {
      let applyVelocity = true;

      // Movement Patterns
      if (enemy.type === 'ORB') {
        enemy.phase += 0.05;
        enemy.x += Math.sin(enemy.phase) * 3;
      } else if (enemy.type === 'MINELAYER') {
        enemy.x += Math.sin(enemy.phase) * 5;
        enemy.phase += 0.02;
        enemy.y = 100 + Math.sin(enemy.phase * 0.5) * 50;
      } else if (enemy.type === 'BOSS') {
        const bossAnchorX = GAME_WIDTH / 2 - enemy.width / 2;
        const bossAnchorY = 96;

        applyVelocity = false;

        if (enemy.y < bossAnchorY) {
          enemy.y = Math.min(bossAnchorY, enemy.y + enemy.vy);
          enemy.x += (bossAnchorX - enemy.x) * 0.12;
        } else {
          enemy.phase += 0.02;
          enemy.x = bossAnchorX + Math.sin(enemy.phase) * (GAME_WIDTH * 0.35);
          enemy.y = bossAnchorY + Math.sin(enemy.phase * 0.5) * 18;

          // Phase transitions
          const hpRatio = enemy.health / enemy.maxHealth;
          if (hpRatio < 0.3) enemy.currentPhase = 3;
          else if (hpRatio < 0.6) enemy.currentPhase = 2;
        }
      } else if (enemy.class === 'GROUND') {
        enemy.phase += 0.08;
      }

      if (applyVelocity) {
        enemy.x += enemy.vx;
        enemy.y += enemy.vy;
      }

      if (
        enemy.class === 'GROUND' &&
        enemy.y > 20 &&
        enemy.y < GAME_HEIGHT - 30 &&
        (frameCount.current + Math.floor(enemy.x)) % 14 === 0
      ) {
        createTrackDust(enemy);
      }

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
            if (level >= 2) {
              enemyShoot(enemy, 'BULLET', p.x - 50, p.y);
            }
          } else if (enemy.currentPhase === 2) {
            enemyShoot(enemy, 'BULLET', p.x, p.y);
            enemyShoot(enemy, 'MISSILE');
            if (level >= 3 && frameCount.current % 180 === 0) {
              enemyShoot(enemy, 'BULLET', p.x + 120, p.y);
            }
            enemy.fireRate = 600;
          } else if (enemy.currentPhase === 3) {
            // Circular burst
            const burstCount = 8 + Math.min(level - 1, 2) * 2;
            for(let i=0; i<burstCount; i++) {
               const angle = (i / burstCount) * Math.PI * 2;
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
        enemiesRef.current.splice(eIdx, 1);
        handlePlayerDamage(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, time);
      }

      // Projectile vs Enemy collision
      projectilesRef.current.forEach((proj, pIdx) => {
        const isBlasterHit = (proj.class === 'BLASTER' || proj.class === 'LASER') && enemy.class === 'AIR';
        const isBombHit = proj.class === 'BOMB' && enemy.class === 'GROUND' && proj.width < BOMB_WIDTH * 0.6; // Bomb must be "low" enough

        if (
          (isBlasterHit || isBombHit) &&
          proj.x < enemy.x + enemy.width &&
          proj.x + proj.width > enemy.x &&
          proj.y < enemy.y + enemy.height &&
          proj.y + proj.height > enemy.y
        ) {
          enemy.health -= proj.damage ?? 1;

          if (proj.class === 'LASER' && (proj.penetration ?? 0) > 0) {
            proj.penetration = (proj.penetration ?? 0) - 1;
          } else {
            projectilesRef.current.splice(pIdx, 1);
          }
          
          if (enemy.health <= 0) {
            registerKill(enemy, proj.class, time);
            createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, proj.color);
            
            // Random powerup drop
            if (Math.random() < 0.1) {
              spawnPowerUp(enemy.x, enemy.y);
            }

            enemiesRef.current.splice(eIdx, 1);
            
            if (enemy.type === 'BOSS') {
              expireBossMissiles(time);
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
    updateParticles();

    draw();
    requestRef.current = requestAnimationFrame(update);
  }, [createExplosion, dropBomb, enemyShoot, expireBossMissiles, gameState, handlePlayerDamage, level, onGameOver, onLivesUpdate, onStateChange, registerKill, resetCombo, shootBlaster, spawnBoss, spawnEnemy, syncBombHud, updateParticles]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const stageTheme = stageThemeRef.current;
    const finalExplosion = finalExplosionRef.current;
    const playerDestroyed = gameOverSequenceEndsAtRef.current > 0;
    const sceneLoad = enemiesRef.current.length
      + projectilesRef.current.length
      + powerUpsRef.current.length
      + Math.floor(particlesRef.current.length * 0.35);
    const lowEffects = sceneLoad > SOFT_EFFECT_LOAD;
    const minimalEffects = sceneLoad > HEAVY_EFFECT_LOAD;

    ctx.fillStyle = COLORS.SPACE_BLACK;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let index = 0; index < 10; index += 1) {
      const y = (index * 100 + scrollOffset.current) % GAME_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(GAME_WIDTH, y);
      ctx.stroke();
    }

    terrainRef.current.forEach((terrain) => {
      ctx.fillStyle = terrain.color;
      const y = (terrain.y + scrollOffset.current) % GAME_HEIGHT;
      ctx.fillRect(terrain.x, y, 40, 40);
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
      
      ctx.fillStyle = stageTheme.bossBar;
      ctx.shadowBlur = lowEffects ? 0 : 10;
      ctx.shadowColor = stageTheme.bossBar;
      ctx.fillRect(x, y, barWidth * hpPercent, 4);
      
      ctx.fillStyle = '#fff';
      ctx.font = "6px 'Press Start 2P', monospace";
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
      ctx.font = "6px 'Press Start 2P', monospace";
      ctx.fillText(`OVERDRIVE ACTIVE: ${(p.weaponTimer / 1000).toFixed(1)}s`, x, y - 8);
    }

    // Draw Bomb Reticle
    if (gameState === 'PLAYING') {
      ctx.save();
      ctx.strokeStyle = stageTheme.reticle;
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

    if (!playerDestroyed) {
      // Draw Player
      ctx.save();
      
      // Startup Invisibility Effect
      if (p.invisibleTimer > 0) {
        ctx.globalAlpha = 0.3 + Math.sin(frameCount.current * 0.2) * 0.2;
        ctx.strokeStyle = '#FFFFFF';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x + p.width / 2, p.y + p.height / 2, p.width * 0.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (!minimalEffects) {
        const auraGradient = ctx.createRadialGradient(
          p.x + p.width / 2, p.y + p.height / 2, 0,
          p.x + p.width / 2, p.y + p.height / 2, p.width * 1.5
        );
        COLORS.PRIDE_RAINBOW.forEach((color, i) => {
          auraGradient.addColorStop(i / (COLORS.PRIDE_RAINBOW.length - 1), color + '22');
        });
        ctx.fillStyle = auraGradient;
        ctx.beginPath();
        ctx.arc(p.x + p.width / 2, p.y + p.height / 2, p.width * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      drawArcadeSprite(
        ctx,
        SPRITES.PLAYER,
        p.x,
        p.y,
        p.width,
        p.height,
        {
          primary: '#FFFFFF',
          secondary: COLORS.NEON.PINK,
          highlight: COLORS.NEON.CYAN,
          shadow: 'rgba(8, 3, 16, 0.82)',
        }
      );
      
      const engineGradient = ctx.createLinearGradient(p.x, p.y + p.height, p.x, p.y + p.height + 15);
      engineGradient.addColorStop(0, COLORS.NEON.PINK);
      engineGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = engineGradient;
      ctx.globalAlpha = (p.invisibleTimer > 0 ? 0.2 : 0.6) + Math.sin(frameCount.current * 0.3) * 0.2;
      ctx.fillRect(p.x + p.width / 2 - 4, p.y + p.height - 2, 8, 15);
      ctx.globalAlpha = 1.0;
      ctx.restore();
    }

    // Draw Projectiles
    projectilesRef.current.forEach(proj => {
      ctx.save();
      
      if (proj.owner === 'player' && proj.class === 'BLASTER') {
        if (lowEffects) {
          ctx.fillStyle = proj.color;
        } else {
          const beamGradient = ctx.createLinearGradient(proj.x, proj.y, proj.x, proj.y + proj.height);
          COLORS.PRIDE_RAINBOW.forEach((color, i) => {
            beamGradient.addColorStop(i / (COLORS.PRIDE_RAINBOW.length - 1), color);
          });
          ctx.fillStyle = beamGradient;
        }
        ctx.shadowBlur = lowEffects ? 0 : 10;
        ctx.shadowColor = proj.color;
        ctx.fillRect(proj.x, proj.y, proj.width, proj.height);
      } else if (proj.owner === 'player' && proj.class === 'LASER') {
        if (lowEffects) {
          ctx.fillStyle = COLORS.NEON.CYAN;
        } else {
          const laserGradient = ctx.createLinearGradient(proj.x, proj.y, proj.x, proj.y + proj.height);
          laserGradient.addColorStop(0, 'rgba(255,255,255,0.98)');
          laserGradient.addColorStop(0.25, COLORS.NEON.CYAN);
          laserGradient.addColorStop(0.7, '#8AF5FF');
          laserGradient.addColorStop(1, 'rgba(0,255,255,0)');
          ctx.fillStyle = laserGradient;
        }
        ctx.shadowBlur = lowEffects ? 0 : 18;
        ctx.shadowColor = COLORS.NEON.CYAN;
        ctx.fillRect(proj.x, proj.y, proj.width, proj.height);
        if (!minimalEffects) {
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.fillRect(proj.x + proj.width * 0.35, proj.y, Math.max(2, proj.width * 0.3), proj.height);
          ctx.beginPath();
          ctx.arc(proj.x + proj.width / 2, proj.y, proj.width * 0.7, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fill();
        }
      } else if (proj.class === 'BOMB') {
        ctx.fillStyle = proj.color;
        ctx.shadowBlur = lowEffects ? 0 : 10;
        ctx.shadowColor = proj.color;
        ctx.beginPath();
        ctx.arc(proj.x + proj.width / 2, proj.y + proj.height / 2, proj.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (proj.class === 'MISSILE') {
        ctx.fillStyle = proj.color;
        ctx.shadowBlur = lowEffects ? 0 : 15;
        ctx.shadowColor = proj.color;
        ctx.beginPath();
        ctx.moveTo(proj.x, proj.y);
        ctx.lineTo(proj.x + proj.width, proj.y + proj.height / 2);
        ctx.lineTo(proj.x, proj.y + proj.height);
        ctx.fill();
      } else if (proj.class === 'MINE') {
        ctx.strokeStyle = proj.color;
        ctx.lineWidth = 2;
        ctx.shadowBlur = lowEffects ? 0 : 10;
        ctx.shadowColor = proj.color;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.width / 2, 0, Math.PI * 2);
        ctx.stroke();
        // Pulsing core
        if (!minimalEffects) {
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, (proj.width / 4) * (1 + Math.sin(frameCount.current * 0.1)), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Standard Enemy Bullet
        ctx.fillStyle = proj.color;
        ctx.shadowBlur = lowEffects ? 0 : 5;
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
        const paletteIndex = Math.floor((frameCount.current * 0.05 + enemy.phase) % stageTheme.airPalette.length);
        const baseColor = stageTheme.airPalette[paletteIndex];
        
        const color = enemy.type === 'BOSS' 
          ? (hpRatio > 0.6 ? stageTheme.bossBar : (hpRatio > 0.3 ? stageTheme.reticle : stageTheme.airPalette[0]))
          : baseColor;

        ctx.shadowBlur = lowEffects ? 6 : 15;
        ctx.shadowColor = color;
        
        // Fine Diva Details: Sparkle/Halo
        if (!lowEffects && frameCount.current % 30 < 5) {
           ctx.fillStyle = '#FFFFFF';
           ctx.fillRect(enemy.x + Math.random() * enemy.width, enemy.y + Math.random() * enemy.height, 2, 2);
        }

        if (enemy.type === 'BOSS') {
           // Modern Boss Halo
           if (!lowEffects) {
             ctx.strokeStyle = color;
             ctx.setLineDash([10, 5]);
             ctx.lineWidth = 1;
             ctx.beginPath();
             ctx.arc(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.width * 0.7, 0, Math.PI * 2);
             ctx.stroke();
             ctx.setLineDash([]);
           }
           
           drawArcadeSprite(ctx, SPRITES.BOSS, enemy.x, enemy.y, enemy.width, enemy.height, {
             primary: color,
             secondary: stageTheme.reticle,
             highlight: stageTheme.bossCore,
             shadow: 'rgba(4, 2, 8, 0.84)',
           });
           // Pulsing core - DIVA GEM
           if (!minimalEffects) {
             ctx.beginPath();
             ctx.arc(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 12 * (1 + Math.sin(frameCount.current * 0.1)), 0, Math.PI * 2);
             ctx.fillStyle = stageTheme.bossCore;
             ctx.shadowBlur = 30;
             ctx.shadowColor = stageTheme.bossCore;
             ctx.fill();
           }
        } else {
           const spriteKey = (enemy.type as keyof typeof SPRITES) || 'SCOUT';
           const sprite = SPRITES[spriteKey] || SPRITES.SCOUT;
            drawArcadeSprite(ctx, sprite, enemy.x, enemy.y, enemy.width, enemy.height, {
             primary: color,
             secondary: stageTheme.reticle,
             highlight: '#FFFFFF',
             shadow: 'rgba(8, 3, 16, 0.75)',
            });
        }
      } else {
        const isTurret = enemy.type === 'TURRET';
        const isCore = enemy.type === 'CORE';
        const recentFireMs = currentFrameTimeRef.current - enemy.lastFireTime;
        const recoilProgress = isTurret ? Math.max(0, 1 - recentFireMs / 130) : 0;
        const rumbleOffset = Math.sin(enemy.phase * 6) * 0.9;
        const groundPrimary = isTurret ? stageTheme.reticle : stageTheme.groundAccent;
        const groundSecondary = isCore ? '#FFFFFF' : stageTheme.bossCore;
        const spriteKey = (enemy.type as keyof typeof SPRITES) || 'BASE';
        const sprite = SPRITES[spriteKey] || SPRITES.BASE;
        const visualWidth = enemy.width * 1.24;
        const visualHeight = enemy.height * 1.02;
        const visualX = enemy.x - (visualWidth - enemy.width) / 2;
        const visualY = enemy.y - enemy.height * 0.01 + recoilProgress * 2 + rumbleOffset;
        const groundLineY = visualY + visualHeight * 0.9;

        ctx.shadowBlur = lowEffects ? 6 : 14;
        ctx.shadowColor = groundPrimary;

        const groundShadow = ctx.createRadialGradient(
          visualX + visualWidth * 0.5,
          groundLineY,
          visualWidth * 0.08,
          visualX + visualWidth * 0.5,
          groundLineY,
          visualWidth * 0.65
        );
        groundShadow.addColorStop(0, 'rgba(0,0,0,0.42)');
        groundShadow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = groundShadow;
        ctx.beginPath();
        ctx.ellipse(visualX + visualWidth * 0.5, groundLineY, visualWidth * 0.62, visualHeight * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `${stageTheme.groundFill}88`;
        ctx.beginPath();
        ctx.moveTo(visualX + visualWidth * 0.06, groundLineY + 1);
        ctx.lineTo(visualX + visualWidth * 0.94, groundLineY + 1);
        ctx.lineTo(visualX + visualWidth * 0.84, groundLineY + visualHeight * 0.12);
        ctx.lineTo(visualX + visualWidth * 0.16, groundLineY + visualHeight * 0.12);
        ctx.closePath();
        ctx.fill();

        if (frameCount.current % 24 < 12) {
          ctx.strokeStyle = `${stageTheme.gridColor.slice(0, -2)}22`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(visualX + visualWidth * 0.18, groundLineY + visualHeight * 0.08);
          ctx.lineTo(visualX + visualWidth * 0.02, groundLineY + visualHeight * 0.15);
          ctx.moveTo(visualX + visualWidth * 0.82, groundLineY + visualHeight * 0.08);
          ctx.lineTo(visualX + visualWidth * 0.98, groundLineY + visualHeight * 0.15);
          ctx.stroke();
        }

        drawArcadeSprite(ctx, sprite, visualX, visualY, visualWidth, visualHeight * 0.92, {
          primary: groundPrimary,
          secondary: groundSecondary,
          highlight: '#FFFFFF',
          shadow: 'rgba(8, 3, 16, 0.82)',
        });

        const treadY = visualY + visualHeight * 0.76;
        const treadHeight = visualHeight * 0.18;
        ctx.fillStyle = 'rgba(8, 3, 16, 0.9)';
        ctx.fillRect(visualX + visualWidth * 0.09, treadY, visualWidth * 0.82, treadHeight);
        const wheelRadius = treadHeight * 0.46;
        const wheelY = treadY + treadHeight * 0.58;
        const wheelCount = isTurret ? 5 : 4;
        const wheelStartX = visualX + visualWidth * 0.18;
        const wheelSpacing = visualWidth * (isTurret ? 0.14 : 0.17);

        for (let wheelIndex = 0; wheelIndex < wheelCount; wheelIndex += 1) {
          const wheelX = wheelStartX + wheelIndex * wheelSpacing;
          ctx.fillStyle = minimalEffects ? `${groundPrimary}BB` : ctx.createRadialGradient(
            wheelX - wheelRadius * 0.2,
            wheelY - wheelRadius * 0.25,
            wheelRadius * 0.15,
            wheelX,
            wheelY,
            wheelRadius
          );
          if (!minimalEffects) {
            const wheelGradient = ctx.fillStyle as CanvasGradient;
            wheelGradient.addColorStop(0, 'rgba(255,255,255,0.38)');
            wheelGradient.addColorStop(0.25, `${groundPrimary}BB`);
            wheelGradient.addColorStop(1, 'rgba(12, 8, 12, 0.95)');
          }
          ctx.beginPath();
          ctx.arc(wheelX, wheelY, wheelRadius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(wheelX, wheelY, wheelRadius * 0.72, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = groundSecondary;
          ctx.beginPath();
          ctx.arc(wheelX, wheelY, wheelRadius * 0.24, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        for (let treadIndex = 0; treadIndex < 4; treadIndex += 1) {
          const treadX = visualX + visualWidth * (0.18 + treadIndex * 0.165);
          ctx.beginPath();
          ctx.moveTo(treadX, treadY + 1);
          ctx.lineTo(treadX, treadY + treadHeight - 1);
          ctx.stroke();
        }

        ctx.fillStyle = `${stageTheme.backgroundBottom}CC`;
        ctx.fillRect(visualX + visualWidth * 0.08, treadY + treadHeight * 0.6, visualWidth * 0.84, treadHeight * 0.62);

        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(visualX + visualWidth * 0.12, treadY + treadHeight * 0.08, visualWidth * 0.76, treadHeight * 0.12);

        ctx.strokeStyle = `${groundPrimary}66`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(visualX + visualWidth * 0.13, treadY + treadHeight);
        ctx.lineTo(visualX + visualWidth * 0.87, treadY + treadHeight);
        ctx.stroke();

        if (isTurret || isCore) {
          const turretBaseX = visualX + visualWidth * 0.5;
          const turretBaseY = visualY + visualHeight * 0.34 + recoilProgress * 2;
          const barrelLength = visualHeight * (isTurret ? 0.45 : 0.31);
          const barrelRecoil = recoilProgress * (isTurret ? visualHeight * 0.12 : 0);
          const playerCenterX = p.x + p.width / 2;
          const horizontalBias = Math.max(-1, Math.min(1, (playerCenterX - turretBaseX) / (GAME_WIDTH * 0.24)));
          const barrelTraverse = horizontalBias * visualWidth * (isTurret ? 0.24 : 0.16);
          const muzzleX = turretBaseX + barrelTraverse;
          const muzzleY = turretBaseY - barrelLength + Math.abs(horizontalBias) * visualHeight * 0.06 + barrelRecoil;
          const supportX = turretBaseX - visualWidth * 0.08 + barrelTraverse * 0.45;
          const supportY = turretBaseY - barrelLength * 0.72 + Math.abs(horizontalBias) * visualHeight * 0.04 + barrelRecoil * 0.9;

          ctx.strokeStyle = groundPrimary;
          ctx.lineWidth = isTurret ? 5 : 4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(turretBaseX, turretBaseY);
          ctx.lineTo(muzzleX, muzzleY);
          if (isTurret) {
            ctx.moveTo(turretBaseX - visualWidth * 0.08, turretBaseY + 2);
            ctx.lineTo(supportX, supportY);
          }
          ctx.stroke();

          ctx.fillStyle = groundSecondary;
          ctx.beginPath();
          ctx.arc(turretBaseX, turretBaseY, visualWidth * 0.11, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(muzzleX, muzzleY, isTurret ? 2.6 : 2, 0, Math.PI * 2);
          ctx.fill();

          if (isTurret && recoilProgress > 0) {
            const flashRadius = 6 + recoilProgress * 9;
            const flashGradient = ctx.createRadialGradient(
              muzzleX,
              muzzleY,
              0,
              muzzleX,
              muzzleY,
              flashRadius
            );

            flashGradient.addColorStop(0, `rgba(255,255,255,${0.95 * recoilProgress})`);
            flashGradient.addColorStop(0.35, `rgba(255,245,180,${0.7 * recoilProgress})`);
            flashGradient.addColorStop(1, 'rgba(255,180,0,0)');

            ctx.fillStyle = flashGradient;
            ctx.beginPath();
            ctx.arc(turretBaseX, muzzleY, flashRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = `rgba(255,255,255,${0.9 * recoilProgress})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(muzzleX - 7, muzzleY);
            ctx.lineTo(muzzleX + 7, muzzleY);
            ctx.moveTo(muzzleX, muzzleY - 7);
            ctx.lineTo(muzzleX, muzzleY + 7);
            ctx.stroke();
          }

          ctx.lineCap = 'butt';
        }
      }
      
      ctx.restore();
    });

    // Draw Particles
    particlesRef.current.forEach(particle => {
      ctx.globalAlpha = particle.life / particle.maxLife;
      ctx.fillStyle = particle.color;
      if (minimalEffects) {
        const size = Math.max(1, particle.size);
        ctx.fillRect(particle.x, particle.y, size, size);
      } else {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1.0;

    if (finalExplosion) {
      const elapsed = Math.max(0, performance.now() - finalExplosion.startedAt);
      const progress = Math.min(elapsed / 1400, 1);
      const radius = 36 + progress * 180;
      const flash = ctx.createRadialGradient(
        finalExplosion.x,
        finalExplosion.y,
        0,
        finalExplosion.x,
        finalExplosion.y,
        radius
      );

      flash.addColorStop(0, `rgba(255,255,255,${0.42 * (1 - progress)})`);
      flash.addColorStop(0.35, `rgba(255,16,240,${0.26 * (1 - progress)})`);
      flash.addColorStop(1, 'rgba(255,16,240,0)');

      ctx.save();
      ctx.fillStyle = flash;
      ctx.beginPath();
      ctx.arc(finalExplosion.x, finalExplosion.y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - progress)})`;
      ctx.lineWidth = 5 - progress * 2;
      ctx.shadowBlur = 30;
      ctx.shadowColor = COLORS.NEON.PINK;
      ctx.beginPath();
      ctx.arc(finalExplosion.x, finalExplosion.y, radius * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Draw PowerUps
    powerUpsRef.current.forEach(pu => {
      drawArcadeSprite(ctx, SPRITES.AUTO_FIRE, pu.x, pu.y, pu.width, pu.height, {
        primary: pu.color,
        secondary: COLORS.NEON.CYAN,
        highlight: '#FFFFFF',
        shadow: 'rgba(8, 3, 16, 0.72)',
      });
      ctx.shadowBlur = lowEffects ? 0 : 15;
      ctx.shadowColor = pu.color;
      ctx.strokeRect(pu.x - 2, pu.y - 2, pu.width + 4, pu.height + 4);
    });

  }, [gameState]);

  useEffect(() => {
    if (gameState === 'BOSS_WARNING') {
      playSound('bossAlert');
    }

    if (gameState === 'LEVEL_UP') {
      playSound('waveClear');
    }
  }, [gameState, playSound]);

  useEffect(() => {
    return () => {
      closeAudio();
    };
  }, [closeAudio]);

  useEffect(() => {
    const syncTouchZones = (touches: TouchList) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const zoneTop = GAME_HEIGHT * 0.6;
      const moveZoneEnd = GAME_WIDTH * 0.5;
      const bombSplit = GAME_WIDTH * 0.75;
      const moveThreshold = 3;
      const dragScale = 1.35;

      let nextMoveTouchId: number | null = null;
      let nextMoveX = touchState.current.moveLastX;
      let fireActive = false;
      let bombPressed = false;

      for (let index = 0; index < touches.length; index += 1) {
        const touch = touches[index];
        const x = (touch.clientX - rect.left) * scaleX;
        const y = (touch.clientY - rect.top) * scaleY;

        if (y < zoneTop) {
          continue;
        }

        if (x < moveZoneEnd) {
          if (nextMoveTouchId === null) {
            nextMoveTouchId = touch.identifier;

            if (touchState.current.moveTouchId === touch.identifier) {
              const deltaX = x - touchState.current.moveLastX;
              if (Math.abs(deltaX) >= moveThreshold) {
                const player = playerRef.current;
                player.x = Math.max(0, Math.min(GAME_WIDTH - player.width, player.x + deltaX * dragScale));
              }
            }

            nextMoveX = x;
          }
        } else if (x < bombSplit) {
          bombPressed = true;
        } else {
          fireActive = true;
        }
      }

      if (bombPressed && !touchState.current.bombPressed) {
        dropBomb();
      }

      if (fireActive && !touchState.current.fireActive) {
        shootBlaster();
        touchState.current.lastFireTime = performance.now();
      }

      touchState.current.moveTouchId = nextMoveTouchId;
      touchState.current.moveLastX = nextMoveX;
      touchState.current.fireActive = fireActive;
      touchState.current.bombPressed = bombPressed;

      if (nextMoveTouchId === null) {
        touchState.current.moveLastX = 0;
      }

      if (!fireActive) {
        touchState.current.lastFireTime = 0;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'MetaLeft' || e.code === 'MetaRight') {
        e.preventDefault();
      }
      ensureAudioReady();
      keysRef.current[e.code] = true;
      if (gameState === 'START' && e.code === 'Space') {
        onGameStart();
      } else if (gameState === 'GAME_OVER' && e.code === 'Space') {
        onRestart();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      ensureAudioReady();
      if (gameState !== 'PLAYING' && gameState !== 'LEVEL_UP') {
        if (gameState === 'START') onGameStart();
        if (gameState === 'GAME_OVER') onRestart();
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      syncTouchZones(e.touches);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // Prevent scrolling AND selection
      if (gameState !== 'PLAYING' && gameState !== 'LEVEL_UP') return;

      syncTouchZones(e.touches);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      syncTouchZones(e.touches);
    };

    const handleTouchCancel = (e: TouchEvent) => {
      e.preventDefault();
      syncTouchZones(e.touches);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Canvas specific touch
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
      canvas.addEventListener('touchend', handleTouchEnd);
      canvas.addEventListener('touchcancel', handleTouchCancel);
    }
    
    requestRef.current = requestAnimationFrame(update);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (canvas) {
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchend', handleTouchEnd);
        canvas.removeEventListener('touchcancel', handleTouchCancel);
      }
      cancelAnimationFrame(requestRef.current);
    };
  }, [ensureAudioReady, update, gameState, onGameStart, onRestart, shootBlaster, dropBomb]);

  return (
    <div className="relative w-full h-full bg-black touch-none flex items-center justify-center">
      <canvas 
        ref={canvasRef} 
        width={GAME_WIDTH} 
        height={GAME_HEIGHT}
        className="block w-full h-full object-contain"
      />
      
      {/* Visual Touch Indicators (Optional, but helps user know where they can press) */}
      {(gameState === 'PLAYING' || gameState === 'LEVEL_UP') && (
        <>
          <div className="absolute bottom-4 left-4 w-[calc(50%-1.5rem)] h-40 border-2 border-white/5 bg-white/5 rounded-2xl opacity-30 overflow-hidden">
            <div className="grid h-full grid-cols-2">
              <div className="flex items-center justify-center border-r border-white/10">
                <span className="text-[10px] uppercase tracking-widest text-white/40 drop-shadow-md">Drag</span>
              </div>
              <div className="flex items-center justify-center">
                <span className="text-[10px] uppercase tracking-widest text-white/40 drop-shadow-md">Steer</span>
              </div>
            </div>
          </div>
          <div className="absolute bottom-4 right-4 w-[calc(50%-1.5rem)] h-40 border-2 border-[#FF10F0]/10 bg-[#FF10F0]/5 rounded-2xl opacity-30 overflow-hidden">
            <div className="grid h-full grid-cols-2">
              <div className="flex items-center justify-center border-r border-[#FF10F0]/10">
                <span className="text-[10px] uppercase tracking-widest text-[#FF10F0]/40 drop-shadow-md">Bomb</span>
              </div>
              <div className="flex items-center justify-center">
                <span className="text-[10px] uppercase tracking-widest text-[#FF10F0]/40 drop-shadow-md">Fire</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

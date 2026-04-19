/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Stars, Trophy, Play, RotateCcw } from 'lucide-react';
import { GameState } from '../types';
import captainCarmenPortrait from '../../pixel_portrait_8bit.svg';

const STAGE_PRESENTATION = [
  {
    kicker: 'Wave 1 Transmission',
    title: 'Prism Uprising',
    subtitle: 'Fan formations and escort screens spill into the void.',
  },
  {
    kicker: 'Wave 2 Transmission',
    title: 'Velvet Crossfire',
    subtitle: 'Cross-sweeps, mine layers, and sharper diagonals cut the lane.',
  },
  {
    kicker: 'Wave 3 Transmission',
    title: 'Cathedral Of Noise',
    subtitle: 'Dense mixed convoys turn the battlefield into a ritual grid.',
  },
];

const BOSS_PRESENTATION = [
  {
    kicker: 'Sovereign Signal',
    title: 'Herald Of Silence',
    subtitle: 'A crowned anomaly is descending through the static veil.',
  },
  {
    kicker: 'Sovereign Signal',
    title: 'Mirror Dominion',
    subtitle: 'Twin-vector hostility detected. Maintain formation discipline.',
  },
  {
    kicker: 'Sovereign Signal',
    title: 'Crown Of Static',
    subtitle: 'The void is collapsing into one radiant hostile core.',
  },
];

interface GameUIProps {
  gameState: GameState;
  score: number;
  lives: number;
  level: number;
  bombs: number;
  bombCharge: number;
  comboCount: number;
  comboMultiplier: number;
  onStart: () => void;
  onRestart: () => void;
}

export default function GameUI({ 
  gameState, 
  score, 
  lives, 
  level, 
  bombs,
  bombCharge,
  comboCount,
  comboMultiplier,
  onStart, 
  onRestart 
}: GameUIProps) {
  const [showStageCard, setShowStageCard] = useState(false);
  const announcedLevelRef = useRef(0);

  const stageCard = STAGE_PRESENTATION[Math.min(level - 1, STAGE_PRESENTATION.length - 1)];
  const bossCard = BOSS_PRESENTATION[Math.min(level - 1, BOSS_PRESENTATION.length - 1)];
  const bossTitleWords = bossCard.title.split(' ');
  const bossTitlePivot = Math.ceil(bossTitleWords.length / 2);
  const bossTitleLineOne = bossTitleWords.slice(0, bossTitlePivot).join(' ');
  const bossTitleLineTwo = bossTitleWords.slice(bossTitlePivot).join(' ');

  useEffect(() => {
    if (gameState === 'START') {
      announcedLevelRef.current = 0;
      setShowStageCard(false);
      return;
    }

    if (gameState === 'PLAYING' && announcedLevelRef.current !== level) {
      announcedLevelRef.current = level;
      setShowStageCard(true);

      const timer = window.setTimeout(() => {
        setShowStageCard(false);
      }, 2200);

      return () => window.clearTimeout(timer);
    }

    if (gameState !== 'PLAYING') {
      setShowStageCard(false);
    }
  }, [gameState, level]);

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col items-stretch justify-between p-8 font-arcade-body">
      {/* Side Detail Row */}
      <div className="absolute left-[15px] top-1/2 -translate-y-1/2 pointer-events-none">
      <div className="font-arcade [writing-mode:vertical-rl] text-[7px] uppercase tracking-[0.32em] text-white/40 rotate-180">
          SCROLLER PROTOCOL: XEVIUS JOY // MULTI-LAYER RADIANCE
        </div>
      </div>

      {/* Header HUD */}
      <div className="w-full grid grid-cols-3 items-start pointer-events-auto z-20">
        <div className="flex flex-col">
          <span className="font-arcade text-[7px] tracking-[0.18em] text-[#00FFFF] mb-1">1P SCORE</span>
          <span className="font-arcade text-[18px] font-black tabular-nums leading-none tracking-tight">
            {score.toLocaleString('en-US', { minimumIntegerDigits: 6 })}
          </span>
        </div>
        
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            {gameState === 'PLAYING' && (
              <div className="shrink-0 border border-cyan-300/30 bg-black/35 p-1 shadow-[0_0_16px_rgba(0,255,255,0.14)]">
                <img
                  src={captainCarmenPortrait}
                  alt="Captain Carmen portrait"
                  className="block h-10 w-10 md:h-11 md:w-11 object-cover"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            )}
            <h1 className="font-arcade text-[24px] font-black tracking-[0.01em] leading-[1.1] bg-gradient-to-r from-[#FF0018] via-[#FFED00] to-[#86007D] bg-clip-text text-transparent">
              CAPTAIN CARMEN
            </h1>
          </div>
          <div className="font-arcade text-[8px] font-bold tracking-[0.1em] text-[#FFFF00] whitespace-nowrap">
            WAVE {level} • RADIANCY
          </div>
        </div>

        <div className="flex flex-col items-end text-right">
          <span className="font-arcade text-[7px] tracking-[0.18em] text-[#00FFFF] mb-1">HIGH SCORE</span>
          <span className="font-arcade text-[18px] font-black tabular-nums leading-none tracking-tight">
            {Math.max(score, 1240000).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Center Overlays */}
      <div className="flex-1 flex items-center justify-center">
        <AnimatePresence>
          {comboCount > 1 && gameState === 'PLAYING' && (
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.92 }}
              animate={{ opacity: 0.72, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.92 }}
              className="absolute flex flex-col items-center text-center pointer-events-none"
            >
              <div className="font-arcade text-[7px] tracking-[0.2em] text-[#FFED00]/60 mb-2">Spectrum Chain</div>
              <div className="font-arcade text-[18px] font-black tracking-[0.03em] text-white/75">x{comboMultiplier}</div>
              <div className="text-[15px] text-white/45">{comboCount} linked takedowns</div>
            </motion.div>
          )}

          {showStageCard && gameState === 'PLAYING' && (
            <motion.div
              initial={{ opacity: 0, scale: 1.8, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.65, y: -10 }}
              className="absolute flex flex-col items-center text-center"
            >
              <div className="font-arcade text-[6px] tracking-[0.24em] text-cyan-200/55 mb-2 font-black">{stageCard.kicker}</div>
              <div className="font-arcade text-[8px] tracking-[0.32em] text-cyan-300/45 mb-3 font-black animate-pulse">INCOMING</div>
              <h2 className="font-arcade text-[20px] font-black tracking-[0.03em] leading-[1.2] text-white/18 drop-shadow-[0_0_14px_rgba(0,255,255,0.18)] text-center">
                {stageCard.title}
              </h2>
              <div className="mt-3 text-[11px] text-white/40 max-w-md text-center leading-[1.1]">
                {stageCard.subtitle}
              </div>
            </motion.div>
          )}

          {gameState === 'START' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="pointer-events-auto flex flex-col items-center p-8 md:p-10 bg-white/5 border border-white/10 rounded-sm backdrop-blur-3xl max-w-xl text-center shadow-[0_0_100px_rgba(255,255,255,0.1)]"
            >
              <div className="mb-6 border border-cyan-300/30 bg-black/25 p-2 shadow-[0_0_28px_rgba(0,255,255,0.12)]">
                <img
                  src={captainCarmenPortrait}
                  alt="Captain Carmen portrait"
                  className="block h-40 w-40 md:h-48 md:w-48 object-cover"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              <div className="font-arcade text-[8px] tracking-[0.24em] text-[#FF10F0] mb-4">Good Luck Captain</div>
              <h1 className="font-arcade text-[30px] font-black tracking-[0.03em] leading-[1.22] mb-5">
                 Captain <br /> Carmen
              </h1>
              <p className="text-white/70 mb-7 text-[16px] leading-[1.02] tracking-[0.03em] max-w-sm">
                Initiate the protocol of joy. Spread the rainbow spectrum across the grey void of silence.
              </p>
              <button 
                onClick={onStart}
                className="font-arcade w-full py-5 bg-white text-black text-[12px] tracking-[0.12em] hover:bg-[#00FFFF] hover:scale-[1.02] transition-all cursor-pointer"
              >
                Launch Mission
              </button>
              <div className="mt-8 grid grid-cols-2 gap-6 text-[9px] tracking-[0.16em] font-bold text-white/30">
                <div className="border-t border-white/10 pt-4 flex flex-col gap-2">
                  <span className="font-arcade text-[8px]">Navigation</span>
                  <span className="text-white/80 text-[15px]">Swipe / WASD</span>
                </div>
                <div className="border-t border-white/10 pt-4 flex flex-col gap-2">
                  <span className="font-arcade text-[8px]">Tactical Array</span>
                  <span className="text-white/80 text-[15px]">Blaster & Bomb</span>
                </div>
              </div>
            </motion.div>
          )}

          {gameState === 'GAME_OVER' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="pointer-events-auto flex flex-col items-center p-10 bg-black/60 border border-rose-500/40 rounded-sm backdrop-blur-2xl"
            >
              <div className="mb-5 border border-rose-300/20 bg-black/35 p-2 shadow-[0_0_24px_rgba(255,16,240,0.14)]">
                <img
                  src={captainCarmenPortrait}
                  alt="Captain Carmen portrait"
                  className="block h-28 w-28 object-cover"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              <div className="font-arcade text-[8px] tracking-[0.22em] text-rose-500 mb-4 font-black">Link Fractured</div>
              <h2 className="font-arcade text-[26px] font-black tracking-[0.02em] leading-[1.22] mb-7 text-center">
                Game Over<br />Captain
              </h2>
              <div className="font-arcade text-[8px] tracking-[0.14em] text-white/40 mb-2">Final Resonance</div>
              <div className="font-arcade text-[28px] font-black tabular-nums tracking-[0.03em] text-white mb-9">{score.toLocaleString()}</div>
              <button 
                onClick={onRestart}
                className="font-arcade px-10 py-4 bg-rose-500 text-white text-[12px] tracking-[0.12em] hover:bg-rose-600 transition-all cursor-pointer shadow-2xl"
              >
                Launch Mission
              </button>
            </motion.div>
          )}

          {gameState === 'BOSS_WARNING' && (
            <motion.div 
              initial={{ opacity: 0, scale: 2 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="pointer-events-none flex flex-col items-center"
            >
              <div className="font-arcade text-[6px] tracking-[0.24em] text-rose-300/80 mb-2 font-black">{bossCard.kicker}</div>
              <div className="font-arcade text-[8px] tracking-[0.32em] text-rose-500 mb-3 font-black animate-pulse">WARNING</div>
              <h2 className="font-arcade text-[21px] font-black tracking-[0.04em] leading-[1.18] text-rose-600 drop-shadow-[0_0_14px_rgba(255,16,240,0.5)] text-center">
                {bossTitleLineOne}
                {bossTitleLineTwo && (
                  <>
                    <br />
                    {bossTitleLineTwo}
                  </>
                )}
              </h2>
              <div className="mt-3 text-[11px] text-white/55 max-w-md text-center leading-[1.1]">
                {bossCard.subtitle}
              </div>
            </motion.div>
          )}

          {gameState === 'LEVEL_UP' && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 0.72, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="pointer-events-none flex flex-col items-center"
            >
              <div className="font-arcade text-[6px] tracking-[0.22em] text-cyan-200/55 mb-3 font-bold">Resonance Reached</div>
              <h2 className="font-arcade text-[22px] font-black tracking-[0.04em] leading-[1.18] text-white/22 drop-shadow-[0_0_12px_rgba(255,255,255,0.06)] text-center">
                WAVE <br /> SECURED
              </h2>
              <div className="mt-3 text-white/35 text-[11px] leading-[1.1]">Sector cleared. Stabilizing link...</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer HUD */}
      <div className="w-full flex justify-between items-end pointer-events-auto z-20">
        <div className="flex flex-col">
          <div className="font-arcade text-[8px] tracking-[0.22em] text-white/50 mb-4">JOY RESERVES</div>
          <div className="flex gap-4">
            {[...Array(3)].map((_, i) => (
              <div 
                key={i} 
                className={`w-6 h-6 transition-all duration-500 ${i < lives ? 'bg-[#FF0018]' : 'bg-white/10 grayscale opacity-20'}`}
                style={{
                  clipPath: "path('M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z')"
                }}
              />
            ))}
          </div>
        </div>

        <div className="w-[140px]" />

        <div className="flex flex-col items-end gap-3">
          <div className="font-arcade text-[8px] tracking-[0.16em] text-white/50">Bomb Fabricator</div>
          <div className="flex gap-2">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className={`h-3 w-8 border transition-all ${i < bombs ? 'border-[#FF10F0] bg-[#FF10F0]/70 shadow-[0_0_12px_rgba(255,16,240,0.45)]' : 'border-white/10 bg-white/5'}`}
              />
            ))}
          </div>
          <div className="flex gap-4 items-center">
            <div className="font-arcade text-[7px] text-white/30 tracking-[0.14em]">BOMBS x{bombs}</div>
            <div className="w-[180px] h-3 bg-white/10 rounded-full overflow-hidden border border-white/10">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(0, Math.min(100, bombCharge * 100))}%` }}
                className="h-full bg-gradient-to-r from-[#FF0018] via-[#FFED00] to-[#86007D] shadow-[0_0_15px_rgba(255,255,255,0.4)]"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

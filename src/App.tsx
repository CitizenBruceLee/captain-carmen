/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import GameCanvas from './components/GameCanvas';
import GameUI from './components/GameUI';
import { GameState } from './types';

export default function App() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);

  const handleStart = useCallback(() => {
    setGameState('PLAYING');
    setScore(0);
    setLives(3);
    setLevel(1);
  }, []);

  const handleRestart = useCallback(() => {
    setGameState('START');
    setScore(0);
    setLives(3);
    setLevel(1);
  }, []);

  const handleGameOver = useCallback(() => {
    setGameState('GAME_OVER');
  }, []);

  const handleScoreUpdate = useCallback((newScore: number) => {
    setScore(newScore);
  }, []);

  const handleStateChange = useCallback((newState: GameState) => {
    if (newState === 'LEVEL_UP') {
      setLevel(prev => prev + 1);
      setGameState('LEVEL_UP');
      setTimeout(() => setGameState('PLAYING'), 3000);
    } else {
      setGameState(newState);
    }
  }, []);

  return (
    <main className="relative flex items-center justify-center w-full h-screen bg-[#050505] overflow-hidden selection:bg-fuchsia-500/30">
      {/* Immersive Background Blur */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-rose-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-indigo-500/20 rounded-full blur-[150px] animate-pulse delay-700" />
      </div>

      <GameCanvas 
        gameState={gameState}
        onScoreUpdate={handleScoreUpdate}
        onLivesUpdate={setLives}
        onGameOver={handleGameOver}
        onGameStart={handleStart}
        onStateChange={handleStateChange}
      />
      
      <GameUI 
        gameState={gameState}
        score={score}
        lives={lives}
        level={level}
        onStart={handleStart}
        onRestart={handleRestart}
      />

      {/* Screen Glitch Overlay for Game Over */}
      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 pointer-events-none bg-rose-950/20 backdrop-invert-[0.05] z-50 animate-pulse" />
      )}
    </main>
  );
}


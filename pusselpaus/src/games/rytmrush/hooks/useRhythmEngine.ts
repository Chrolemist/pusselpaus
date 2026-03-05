/* ── RytmRush – game engine hook (Tone.Transport synced) ── */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import type {
  Song,
  BlockState,
  Difficulty,
  HitGrade,
  SongResult,
} from '../core/types';
import {
  TIMING_WINDOWS,
  GRADE_SCORES,
} from '../core/types';
import { recordResult } from '../core/storage';
import { getMarimba, ensureAudio, disposeAudio } from '../audio/rhythmAudio';

export type Phase = 'menu' | 'countdown' | 'playing' | 'results';

export function useRhythmEngine() {
  const [phase, setPhase] = useState<Phase>('menu');
  const [song, setSong] = useState<Song | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [blocks, setBlocks] = useState<BlockState[]>([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [perfects, setPerfects] = useState(0);
  const [greats, setGreats] = useState(0);
  const [goods, setGoods] = useState(0);
  const [misses, setMisses] = useState(0);
  const [lastGrade, setLastGrade] = useState<HitGrade | null>(null);
  const [gradeSeq, setGradeSeq] = useState(0);
  const [transportTime, setTransportTime] = useState(0);
  const [countdownValue, setCountdownValue] = useState(3);
  const [pressedLanes, setPressedLanes] = useState<Set<number>>(new Set());

  const blocksRef = useRef<BlockState[]>([]);
  const heldLanesRef = useRef<Set<number>>(new Set());
  const rafRef = useRef<number>(0);
  const songRef = useRef<Song | null>(null);
  const diffRef = useRef<Difficulty>('easy');

  // Keep refs in sync
  useEffect(() => { songRef.current = song; }, [song]);
  useEffect(() => { diffRef.current = difficulty; }, [difficulty]);

  /* ── Frame loop: update transport time for rendering ── */
  const frameLoopRef = useRef<() => void>(undefined);

  useEffect(() => {
    frameLoopRef.current = () => {
      if (Tone.getTransport().state === 'started') {
        setTransportTime(Tone.getTransport().seconds);
      }
      rafRef.current = requestAnimationFrame(() => frameLoopRef.current?.());
    };
  });

  const startFrameLoop = useCallback(() => {
    rafRef.current = requestAnimationFrame(() => frameLoopRef.current?.());
  }, []);

  /* ── Finish song ── */
  const finishSong = useCallback(() => {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    cancelAnimationFrame(rafRef.current);

    setPhase('results');
  }, []);

  /* ── Start a song ── */
  const startSong = useCallback(async (selectedSong: Song, diff: Difficulty) => {
    await ensureAudio();
    
    setSong(selectedSong);
    setDifficulty(diff);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setPerfects(0);
    setGreats(0);
    setGoods(0);
    setMisses(0);
    setLastGrade(null);

    // Create block states for every note in the chart
    const newBlocks: BlockState[] = selectedSong.notes.map((note, i) => ({
      id: `${selectedSong.id}-${i}`,
      chartNote: note,
      grade: null,
      holding: false,
      holdProgress: 0,
    }));
    blocksRef.current = newBlocks;
    setBlocks(newBlocks);

    // Setup transport
    const transport = Tone.getTransport();
    transport.cancel();
    transport.stop();
    transport.bpm.value = selectedSong.bpm;
    transport.position = 0;

    // Schedule auto-miss for notes the player doesn't hit
    const windows = TIMING_WINDOWS[diff];
    selectedSong.notes.forEach((note, i) => {
      const missTime = note.time + windows.miss;
      transport.schedule(() => {
        const block = blocksRef.current[i];
        if (block && block.grade === null) {
          // Auto-miss
          blocksRef.current = blocksRef.current.map((b, idx) =>
            idx === i ? { ...b, grade: 'miss' } : b,
          );
          setBlocks([...blocksRef.current]);
          setCombo(0);
          setMisses((m) => m + 1);
          setLastGrade('miss');
          setGradeSeq((s) => s + 1);
        }
      }, missTime);
    });

    // Schedule end of song
    const lastNote = selectedSong.notes[selectedSong.notes.length - 1];
    const endTime = lastNote.time + lastNote.duration + 2;
    transport.schedule(() => {
      finishSong();
    }, endTime);

    // Countdown
    setPhase('countdown');
    setCountdownValue(3);
    
    setTimeout(() => setCountdownValue(2), 1000);
    setTimeout(() => setCountdownValue(1), 2000);
    setTimeout(() => {
      setPhase('playing');
      transport.start();
      startFrameLoop();
    }, 3000);
  }, [startFrameLoop, finishSong]);

  /* ── Judge a tap input ── */
  const judgeTap = useCallback((lane: number) => {
    if (!songRef.current) return;
    const now = Tone.getTransport().seconds;
    const windows = TIMING_WINDOWS[diffRef.current];
    const synth = getMarimba();

    // Find the earliest unjudged note in this lane within miss window
    let bestIdx = -1;
    let bestDiff = Infinity;
    blocksRef.current.forEach((block, i) => {
      if (block.grade !== null) return;
      if (block.chartNote.lane !== lane) return;
      const diff = Math.abs(now - block.chartNote.time);
      if (diff < bestDiff && diff <= windows.miss) {
        bestDiff = diff;
        bestIdx = i;
      }
    });

    if (bestIdx === -1) return; // No note to hit

    const block = blocksRef.current[bestIdx];
    const timeDiff = Math.abs(now - block.chartNote.time);

    let grade: HitGrade;
    if (timeDiff <= windows.perfect) grade = 'perfect';
    else if (timeDiff <= windows.great) grade = 'great';
    else if (timeDiff <= windows.good) grade = 'good';
    else grade = 'miss';

    // Play the note only on hit (not on miss)
    if (grade !== 'miss') {
      const noteData = block.chartNote;
      if (noteData.type === 'hold') {
        synth.triggerAttack(noteData.note, Tone.now(), 0.7);
      } else {
        synth.triggerAttackRelease(noteData.note, '16n', Tone.now(), 0.7);
      }
    }

    // Update block
    const isHold = block.chartNote.type === 'hold' && grade !== 'miss';
    blocksRef.current = blocksRef.current.map((b, idx) =>
      idx === bestIdx ? { ...b, grade, holding: isHold } : b,
    );
    setBlocks([...blocksRef.current]);

    // Scoring
    const points = GRADE_SCORES[grade];
    if (grade === 'miss') {
      setCombo(0);
      setMisses((m) => m + 1);
    } else {
      setCombo((c) => {
        const next = c + 1;
        setMaxCombo((mc) => Math.max(mc, next));
        return next;
      });
      setScore((s) => s + points * (1 + Math.floor(combo / 10) * 0.1));
      if (grade === 'perfect') setPerfects((p) => p + 1);
      else if (grade === 'great') setGreats((g) => g + 1);
      else setGoods((g) => g + 1);
    }
    setLastGrade(grade);
    setGradeSeq((s) => s + 1);
  }, [combo]);

  /* ── Release a hold ── */
  const releaseHold = useCallback((lane: number) => {
    const synth = getMarimba();
    // Find the active hold in this lane
    blocksRef.current.forEach((block, i) => {
      if (!block.holding || block.chartNote.lane !== lane) return;
      // Release the audio
      synth.triggerRelease(block.chartNote.note, Tone.now());
      blocksRef.current = blocksRef.current.map((b, idx) =>
        idx === i ? { ...b, holding: false } : b,
      );
    });
    setBlocks([...blocksRef.current]);
  }, []);

  /* ── Keyboard input handling ── */
  const handleKeyDown = useCallback((lane: number) => {
    if (heldLanesRef.current.has(lane)) return; // ignore repeat
    heldLanesRef.current.add(lane);
    setPressedLanes(new Set(heldLanesRef.current));
    judgeTap(lane);
  }, [judgeTap]);

  const handleKeyUp = useCallback((lane: number) => {
    heldLanesRef.current.delete(lane);
    setPressedLanes(new Set(heldLanesRef.current));
    releaseHold(lane);
  }, [releaseHold]);

  /* ── Get final result ── */
  const getResult = useCallback((): SongResult | null => {
    if (!song) return null;
    const result: SongResult = {
      songId: song.id,
      difficulty,
      score: Math.round(score),
      maxCombo,
      perfects,
      greats,
      goods,
      misses,
      elapsed: song.notes[song.notes.length - 1].time + 2,
    };
    return result;
  }, [song, difficulty, score, maxCombo, perfects, greats, goods, misses]);

  const saveResult = useCallback(() => {
    const result = getResult();
    if (result) recordResult(result);
  }, [getResult]);

  /* ── Cleanup ── */
  const cleanup = useCallback(() => {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    cancelAnimationFrame(rafRef.current);
    disposeAudio();
  }, []);

  return {
    phase,
    setPhase,
    song,
    difficulty,
    blocks,
    score,
    combo,
    maxCombo,
    perfects,
    greats,
    goods,
    misses,
    lastGrade,
    gradeSeq,
    pressedLanes,
    transportTime,
    countdownValue,
    startSong,
    handleKeyDown,
    handleKeyUp,
    judgeTap,
    releaseHold,
    getResult,
    saveResult,
    cleanup,
  } as const;
}

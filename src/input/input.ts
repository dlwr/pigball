import type { GameState } from "../game/game";

export interface Controls {
  state(): GameState;
  flipper(side: "left" | "right", pressed: boolean): void;
  plunger(held: boolean, limit: number): void;
  nudge(dx: number, dy: number): void;
  restart(): void;
  interact(): void;
}

const LEFT_KEYS = new Set(["ShiftLeft", "KeyZ"]);
const RIGHT_KEYS = new Set(["ShiftRight", "Slash"]);
const NUDGE_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
};
const PLUNGER_SWIPE_PX = 160;
const NUDGE_SWIPE_PX = 40;

interface TouchTrack {
  side: "left" | "right" | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
  plunger: boolean;
}

export const bindInput = (target: HTMLElement, controls: Controls): (() => void) => {
  let spaceHeld = false;
  const touches = new Map<number, TouchTrack>();
  let nudgedPair = false;

  const onKeyDown = (e: KeyboardEvent) => {
    controls.interact();
    if (e.repeat) {
      e.preventDefault();
      return;
    }
    if (LEFT_KEYS.has(e.code)) controls.flipper("left", true);
    else if (RIGHT_KEYS.has(e.code)) controls.flipper("right", true);
    else if (e.code === "Space") {
      spaceHeld = true;
      if (controls.state() === "over") controls.restart();
      else controls.plunger(true, 1);
    } else if (e.code in NUDGE_KEYS && spaceHeld) {
      const [dx, dy] = NUDGE_KEYS[e.code];
      controls.nudge(dx, dy);
    } else if (e.code === "Enter" && controls.state() === "over") controls.restart();
    else return;
    e.preventDefault();
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (LEFT_KEYS.has(e.code)) controls.flipper("left", false);
    else if (RIGHT_KEYS.has(e.code)) controls.flipper("right", false);
    else if (e.code === "Space") {
      spaceHeld = false;
      controls.plunger(false, 1);
    }
  };

  const sideOf = (x: number) => (x < target.clientWidth / 2 ? "left" : "right");

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    controls.interact();
    target.setPointerCapture(e.pointerId);
    const state = controls.state();
    if (state === "over") {
      controls.restart();
      return;
    }
    const track: TouchTrack = { side: null, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, plunger: false };
    if (state === "ready") {
      track.plunger = true;
      controls.plunger(true, 0);
    } else {
      track.side = sideOf(e.clientX);
      controls.flipper(track.side, true);
    }
    touches.set(e.pointerId, track);
  };

  const onPointerMove = (e: PointerEvent) => {
    const track = touches.get(e.pointerId);
    if (!track) return;
    track.x = e.clientX;
    track.y = e.clientY;
    if (track.plunger) {
      controls.plunger(true, Math.max(0, Math.min(1, (track.y - track.startY) / PLUNGER_SWIPE_PX)));
    }
    if (touches.size === 2 && !nudgedPair) {
      const [a, b] = [...touches.values()];
      const ax = a.x - a.startX;
      const bx = b.x - b.startX;
      const ay = a.y - a.startY;
      const by = b.y - b.startY;
      if (Math.sign(ax) === Math.sign(bx) && Math.min(Math.abs(ax), Math.abs(bx)) > NUDGE_SWIPE_PX) {
        controls.nudge(Math.sign(ax), 0);
        nudgedPair = true;
      } else if (Math.min(-ay, -by) > NUDGE_SWIPE_PX) {
        controls.nudge(0, 1);
        nudgedPair = true;
      }
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    const track = touches.get(e.pointerId);
    if (!track) return;
    touches.delete(e.pointerId);
    if (touches.size < 2) nudgedPair = false;
    if (track.plunger) controls.plunger(false, 1);
    if (track.side && ![...touches.values()].some((t) => t.side === track.side)) controls.flipper(track.side, false);
  };

  const onBlur = () => {
    controls.flipper("left", false);
    controls.flipper("right", false);
    controls.plunger(false, 1);
    touches.clear();
    spaceHeld = false;
  };

  const preventDefault = (e: Event) => e.preventDefault();

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  target.addEventListener("pointerdown", onPointerDown);
  target.addEventListener("pointermove", onPointerMove);
  target.addEventListener("pointerup", onPointerUp);
  target.addEventListener("pointercancel", onPointerUp);
  target.addEventListener("contextmenu", preventDefault);
  target.addEventListener("touchstart", preventDefault, { passive: false });

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    target.removeEventListener("pointerdown", onPointerDown);
    target.removeEventListener("pointermove", onPointerMove);
    target.removeEventListener("pointerup", onPointerUp);
    target.removeEventListener("pointercancel", onPointerUp);
    target.removeEventListener("contextmenu", preventDefault);
    target.removeEventListener("touchstart", preventDefault);
  };
};

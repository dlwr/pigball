import type { Game, GameEvent } from "../game/game";

const isTouch = () => matchMedia("(pointer: coarse)").matches;

export class Hud {
  private readonly root: HTMLElement;
  private readonly score: HTMLElement;
  private readonly high: HTMLElement;
  private readonly balls: HTMLElement;
  private readonly multiplier: HTMLElement;
  private readonly message: HTMLElement;
  private readonly toast: HTMLElement;
  private toastTime = 0;
  private readonly toastQueue: string[] = [];
  private shownScore = 0;
  private lastText = "";

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "hud";
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-score"></div>
        <div class="hud-meta">
          <span class="hud-balls"></span>
          <span class="hud-mult"></span>
          <span class="hud-high"></span>
        </div>
      </div>
      <div class="hud-message"></div>
      <div class="hud-toast"></div>`;
    container.appendChild(this.root);
    this.score = this.root.querySelector(".hud-score")!;
    this.high = this.root.querySelector(".hud-high")!;
    this.balls = this.root.querySelector(".hud-balls")!;
    this.multiplier = this.root.querySelector(".hud-mult")!;
    this.message = this.root.querySelector(".hud-message")!;
    this.toast = this.root.querySelector(".hud-toast")!;
  }

  onEvent(event: GameEvent, game: Game): void {
    if (event.kind === "ramp") this.showToast(event.speed > 1 ? `RAMP COMBO ×${event.speed}` : "RAMP");
    else if (event.kind === "lanes") this.showToast(`MULTIPLIER ×${game.multiplier}`);
    else if (event.kind === "bank") this.showToast("TARGET BANK");
    else if (event.kind === "skill") this.showToast("SKILL SHOT");
    else if (event.kind === "save") this.showToast("BALL SAVED");
    else if (event.kind === "extraBall") this.showToast("EXTRA BALL");
    else if (event.kind === "shootAgain") this.showToast("SHOOT AGAIN");
    else if (event.kind === "multiball") this.showToast("MULTIBALL");
    else if (event.kind === "jackpot") this.showToast("JACKPOT");
    else if (event.kind === "kickback") this.showToast("KICKBACK");
    else if (event.kind === "bonus") this.showToast(`BONUS ${event.speed.toLocaleString("en-US")}`);
  }

  private showToast(text: string): void {
    this.toastQueue.push(text);
    if (this.toastTime <= 0) this.showNextToast();
  }

  private showNextToast(): void {
    const text = this.toastQueue.shift();
    if (text === undefined) {
      this.toast.classList.remove("show");
      return;
    }
    this.toast.textContent = text;
    this.toast.classList.remove("show");
    void this.toast.offsetWidth;
    this.toast.classList.add("show");
    this.toastTime = this.toastQueue.length > 0 ? 0.8 : 1.3;
  }

  update(game: Game, dt: number): void {
    if (this.toastTime > 0) {
      this.toastTime -= dt;
      if (this.toastTime <= 0) this.showNextToast();
    }
    const diff = game.score - this.shownScore;
    this.shownScore = diff > 0 ? Math.min(game.score, this.shownScore + Math.max(1, Math.ceil(diff * Math.min(1, dt * 12)))) : game.score;
    const text = [
      this.shownScore,
      game.highScore,
      game.ballsLeft,
      game.multiplier,
      game.state,
      game.tilted,
    ].join("|");
    if (text === this.lastText) return;
    this.lastText = text;
    this.score.textContent = this.shownScore.toLocaleString("en-US");
    this.high.textContent = `HIGH ${game.highScore.toLocaleString("en-US")}`;
    this.balls.textContent = `BALL ${Math.min(3, 4 - game.ballsLeft)}/3`;
    this.multiplier.textContent = game.multiplier > 1 ? `×${game.multiplier}` : "";
    this.message.textContent = this.messageFor(game);
    this.root.dataset.state = game.tilted ? "tilt" : game.state;
  }

  private messageFor(game: Game): string {
    if (game.tilted) return "TILT";
    if (game.state === "over") return isTouch() ? "GAME OVER — タップでもう一度" : "GAME OVER — Space でもう一度";
    if (game.state === "ready") return isTouch() ? "下にスワイプして離すと発射" : "Space を長押しして離すと発射";
    return "";
  }
}

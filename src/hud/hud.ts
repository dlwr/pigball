import { type Game, type GameEvent, RAMPS_FOR_MULTIBALL } from "../game/game";
import { CHARMS } from "../run/charms";
import { type Run, STAGES } from "../run/run";

const isTouch = () => matchMedia("(pointer: coarse)").matches;

export class Hud {
  private readonly root: HTMLElement;
  private readonly score: HTMLElement;
  private readonly high: HTMLElement;
  private readonly balls: HTMLElement;
  private readonly multiplier: HTMLElement;
  private readonly message: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly result: HTMLElement;
  private readonly run: HTMLElement;
  private readonly goalBar: HTMLElement;
  private currentRun: Run | null = null;
  private readonly charms: HTMLElement;
  private readonly lastFired = new Map<string, number>();
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
        <div class="hud-run" hidden></div>
        <div class="hud-goal-bar" hidden><div></div></div>
        <div class="hud-charms"></div>
      </div>
      <div class="hud-message"></div>
      <div class="hud-result">
        <div class="hud-result-title">GAME OVER</div>
        <div class="hud-result-record">NEW HIGH SCORE</div>
        <div class="hud-result-score"></div>
        <dl class="hud-result-stats"></dl>
        <div class="hud-result-hint"></div>
      </div>
      <div class="hud-toast"></div>`;
    container.appendChild(this.root);
    this.score = this.root.querySelector(".hud-score")!;
    this.high = this.root.querySelector(".hud-high")!;
    this.balls = this.root.querySelector(".hud-balls")!;
    this.multiplier = this.root.querySelector(".hud-mult")!;
    this.message = this.root.querySelector(".hud-message")!;
    this.toast = this.root.querySelector(".hud-toast")!;
    this.result = this.root.querySelector(".hud-result")!;
    this.run = this.root.querySelector(".hud-run")!;
    this.goalBar = this.root.querySelector(".hud-goal-bar")!;
    this.charms = this.root.querySelector(".hud-charms")!;
  }

  setRun(run: Run | null): void {
    this.currentRun = run;
    this.lastText = "";
    this.shownScore = 0;
    this.run.hidden = !run;
    this.goalBar.hidden = !run;
    this.high.hidden = !!run;
    this.charms.replaceChildren();
    if (!run) return;
    const entries: [string, string, boolean][] = run.charms.map((id) => [id, CHARMS[id].name, false]);
    if (run.curse) entries.push([run.curse.id, run.curse.name, true]);
    for (const [id, name, curse] of entries) {
      const item = document.createElement("span");
      item.className = curse ? "hud-charm curse" : "hud-charm";
      item.dataset.id = id;
      item.textContent = name;
      const pop = document.createElement("b");
      item.appendChild(pop);
      this.charms.appendChild(item);
    }
  }

  private fireCharm(id: string, ratio: number): void {
    const now = performance.now();
    if (now - (this.lastFired.get(id) ?? 0) < 120) return;
    this.lastFired.set(id, now);
    const item = this.charms.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    if (!item) return;
    const pop = item.querySelector("b")!;
    pop.textContent = ratio === 1 ? "!" : ratio > 1 ? `×${+ratio.toFixed(1)}` : ratio === 0 ? "×0" : `×${+ratio.toFixed(2)}`;
    item.classList.remove("fire");
    void item.offsetWidth;
    item.classList.add("fire");
  }

  onEvent(event: GameEvent, game: Game): void {
    if (event.kind === "charm" && event.id) {
      this.fireCharm(event.id, event.speed);
      return;
    }
    if (event.kind === "ramp") this.showToast(this.rampText(event.speed, game));
    else if (event.kind === "lanes") this.showToast(`MULTIPLIER ×${game.multiplier}`);
    else if (event.kind === "bank") this.showToast("TARGET BANK");
    else if (event.kind === "skill") this.showToast("SKILL SHOT");
    else if (event.kind === "save") this.showToast("BALL SAVED");
    else if (event.kind === "extraBall") this.showToast("EXTRA BALL");
    else if (event.kind === "shootAgain") this.showToast("SHOOT AGAIN");
    else if (event.kind === "multiball") this.showToast("PIGLETS!");
    else if (event.kind === "jackpot") this.showToast("TRUFFLE!");
    else if (event.kind === "kickback") this.showToast("KICKBACK");
    else if (event.kind === "kickbackLit") this.showToast("KICKBACK LIT");
    else if (event.kind === "navelIn") this.showToast("NAVEL");
    else if (event.kind === "piggyBreak") this.showToast("PIGGY BANK!");
    else if (event.kind === "mud") this.showToast("MUDDY");
    else if (event.kind === "stageClear") this.showToast("STAGE CLEAR!");
    else if (event.kind === "fever") this.showToast("FEVER!");
    else if (event.kind === "bonus") this.showToast(`BONUS ${event.speed.toLocaleString("en-US")}`);
  }

  private rampText(combo: number, game: Game): string {
    const progress = game.rampsTowardMultiball > 0 ? ` ${game.rampsTowardMultiball}/${RAMPS_FOR_MULTIBALL}` : "";
    return combo > 1 ? `RAMP COMBO ×${combo}${progress}` : `RAMP${progress}`;
  }

  notice(text: string): void {
    this.showToast(text);
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
      this.currentRun?.truffles,
      Math.ceil(game.feverTime),
    ].join("|");
    if (text === this.lastText) return;
    this.lastText = text;
    this.score.textContent = this.shownScore.toLocaleString("en-US");
    this.high.textContent = `HIGH ${game.highScore.toLocaleString("en-US")}`;
    const total = game.rules.balls;
    this.balls.textContent = `BALL ${Math.max(1, Math.min(total, total + 1 - game.ballsLeft))}/${total}`;
    const run = this.currentRun;
    if (run) {
      const target = run.stageDef.target;
      this.run.innerHTML = `STAGE <strong>${run.stage + 1}/${STAGES.length}</strong>${run.stageDef.boss ? " BOSS" : ""} · 目標 <strong>${target.toLocaleString("en-US")}</strong> · トリュフ <strong>${run.truffles}</strong>`;
      (this.goalBar.firstElementChild as HTMLElement).style.width = `${Math.min(100, (this.shownScore / target) * 100)}%`;
    }
    this.multiplier.textContent = [game.multiplier > 1 ? `×${game.multiplier}` : "", game.inFever ? `FEVER ${Math.ceil(game.feverTime)}` : ""].filter(Boolean).join(" ");
    this.root.dataset.fever = String(game.inFever);
    this.message.textContent = this.messageFor(game);
    this.root.dataset.state = game.state === "over" ? "over" : game.tilted ? "tilt" : game.state;
    this.root.dataset.record = String(game.newHighScore);
    if (game.state === "over" && !run) this.fillResult(game);
    if (run) this.root.dataset.state = game.state === "over" ? "run-over" : this.root.dataset.state;
  }

  private fillResult(game: Game): void {
    const { ramps, banks, jackpots, skillShots } = game.stats;
    const rows: [string, number][] = [
      ["RAMPS", ramps],
      ["TARGET BANKS", banks],
      ["TRUFFLES", jackpots],
      ["SKILL SHOTS", skillShots],
    ];
    this.result.querySelector(".hud-result-score")!.textContent = game.score.toLocaleString("en-US");
    this.result.querySelector(".hud-result-stats")!.innerHTML = rows.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("");
    this.result.querySelector(".hud-result-hint")!.textContent = isTouch() ? "タップでもう一度" : "Space でもう一度";
  }

  private messageFor(game: Game): string {
    if (game.state === "over" || game.state === "cleared") return "";
    if (game.tilted) return "TILT";
    if (game.state === "ready") return isTouch() ? "下にスワイプして離すと発射" : "Space を長押しして離すと発射";
    return "";
  }
}

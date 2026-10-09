import { CHARMS } from "../run/charms";
import type { CurseDef } from "../run/curses";
import { LIVES, MAX_CHARMS, type Run, STAGES } from "../run/run";

const isTouch = () => matchMedia("(pointer: coarse)").matches;
const format = (n: number) => Math.round(n).toLocaleString("en-US");
const hearts = (lives: number) => `${"♥".repeat(lives)}${"♡".repeat(LIVES - lives)}`;
const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);

interface Action {
  label: string;
  run: () => void;
  primary?: boolean;
  disabled?: boolean;
}

export class Screens {
  private readonly root: HTMLElement;
  private primary: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "screen";
    this.root.hidden = true;
    container.appendChild(this.root);
    for (const type of ["pointerdown", "pointerup", "touchstart", "touchend"]) {
      this.root.addEventListener(type, (e) => e.stopPropagation());
    }
    window.addEventListener("keydown", (e) => {
      if (this.root.hidden || e.repeat || (e.code !== "Space" && e.code !== "Enter")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.primary?.();
    }, { capture: true });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  hide(): void {
    this.root.hidden = true;
    this.root.innerHTML = "";
    this.primary = null;
  }

  menu(options: { canContinue: boolean; onRun: () => void; onContinue: () => void; onFree: () => void }): void {
    const actions: Action[] = [];
    if (options.canContinue) actions.push({ label: "続きから", run: options.onContinue, primary: true });
    actions.push({ label: "ランをはじめる", run: options.onRun, primary: !options.canContinue });
    actions.push({ label: "フリープレイ", run: options.onFree });
    this.show(
      `<h1 class="screen-title">PIGBALL</h1>
       <p class="screen-lead">8つの台を、ボール2個ずつで乗り越える。<br />おまじないを集めて目標スコアを超えろ。命は3つ。</p>`,
      actions,
    );
  }

  stageIntro(run: Run, onStart: () => void): void {
    const stage = run.stageDef;
    this.show(
      `<div class="screen-kicker">STAGE ${run.stage + 1} / ${STAGES.length}${stage.boss ? " · BOSS" : ""}${run.retrying ? " · やり直し" : ""}</div>
       <div class="screen-goal"><span>目標</span>${format(stage.target)}</div>
       ${this.curseBlock(run.curse, !run.activeCurse)}
       <p class="screen-lead">命 ${hearts(run.lives)}</p>
       ${this.charmList(run)}`,
      [{ label: isTouch() ? "タップではじめる" : "Space ではじめる", run: onStart, primary: true }],
    );
  }

  stageClear(run: Run, onNext: () => void): void {
    this.show(
      `<div class="screen-kicker">STAGE ${run.stage + 1} CLEAR</div>
       <div class="screen-goal"><span>トリュフ</span>+${run.lastReward}</div>
       ${run.lastOverkill > 0 ? `<p class="screen-lead">うち目標を超えた分 +${run.lastOverkill}</p>` : ""}
       <p class="screen-lead">所持 ${run.truffles} トリュフ</p>`,
      [{ label: run.phase === "won" ? "結果へ" : "ショップへ", run: onNext, primary: true }],
    );
  }

  stageFailed(run: Run, onNext: () => void): void {
    this.show(
      `<div class="screen-kicker">STAGE ${run.stage + 1} 失敗</div>
       <div class="screen-goal"><span>命</span>${hearts(run.lives)}</div>
       <p class="screen-lead">命を1つ失った。ショップで立て直して、もう一度挑む。</p>`,
      [{ label: "ショップへ", run: onNext, primary: true }],
    );
  }

  shop(run: Run, onChange: () => void, onNext: () => void): void {
    const full = run.charms.length >= MAX_CHARMS;
    const nextStage = run.retrying ? run.stage : run.stage + 1;
    const offers = run.shop.offers
      .map((id, i) => {
        const charm = CHARMS[id];
        const disabled = full || run.truffles < charm.price;
        const kept = run.shop.kept === id;
        return `<li class="shop-row${charm.rare ? " rare" : ""}${kept ? " kept" : ""}">
          <div><strong>${charm.rare ? "レア · " : ""}${escape(charm.name)}</strong><span>${escape(charm.description)}</span></div>
          <button data-keep="${i}" aria-pressed="${kept}">${kept ? "キープ中" : "キープ"}</button>
          <button data-buy="${i}" ${disabled ? "disabled" : ""}>${charm.price} で買う</button>
        </li>`;
      })
      .join("");
    const owned = run.charms
      .map((id) => {
        const charm = CHARMS[id];
        return `<li class="shop-row owned">
          <div><strong>${escape(charm.name)}</strong><span>${escape(charm.description)}</span></div>
          <button data-sell="${id}">${Math.floor(charm.price / 2)} で売る</button>
        </li>`;
      })
      .join("");
    this.show(
      `<div class="screen-kicker">SHOP · 次は STAGE ${nextStage + 1}${STAGES[nextStage].boss ? " · BOSS" : ""}</div>
       <div class="screen-goal"><span>トリュフ</span>${run.truffles}</div>
       ${this.curseBlock(run.curse, !run.activeCurse)}
       <ul class="shop-list">${offers || `<li class="shop-empty">売り切れ</li>`}</ul>
       <div class="screen-sub">おまじない ${run.charms.length} / ${MAX_CHARMS}</div>
       <ul class="shop-list">${owned || `<li class="shop-empty">まだ持っていない</li>`}</ul>`,
      [
        { label: `並べ直す（${run.shop.rerollCost}）`, run: () => (run.reroll(), onChange()), disabled: run.truffles < run.shop.rerollCost },
        { label: "次のステージへ", run: onNext, primary: true },
      ],
    );
    this.root.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((button) =>
      button.addEventListener("click", () => {
        run.buy(Number(button.dataset.buy));
        onChange();
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>("[data-keep]").forEach((button) =>
      button.addEventListener("click", () => {
        run.keep(Number(button.dataset.keep));
        onChange();
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>("[data-sell]").forEach((button) =>
      button.addEventListener("click", () => {
        run.sell(button.dataset.sell!);
        onChange();
      }),
    );
  }

  runEnd(run: Run, score: number, onMenu: () => void): void {
    const won = run.phase === "won";
    this.show(
      `<div class="screen-kicker">${won ? "RUN CLEAR" : `STAGE ${run.stage + 1} で命が尽きた`}</div>
       <div class="screen-goal"><span>${won ? "おめでとう" : "最後のスコア"}</span>${won ? `${STAGES.length} / ${STAGES.length}` : format(score)}</div>
       ${won ? "" : `<p class="screen-lead">目標 ${format(run.stageDef.target)}</p>`}
       ${this.charmList(run)}`,
      [{ label: "メニューへ", run: onMenu, primary: true }],
    );
  }

  private curseBlock(curse: CurseDef | null, warded: boolean): string {
    if (!curse) return `<p class="screen-lead">呪いなし</p>`;
    return `<div class="screen-curse${warded ? " warded" : ""}"><strong>${escape(curse.name)}</strong>${escape(curse.description)}${warded ? "<em>豚の神様が打ち消している</em>" : ""}</div>`;
  }

  private charmList(run: Run): string {
    if (run.charms.length === 0) return "";
    return `<div class="screen-sub">おまじない</div><ul class="charm-chips">${run.charms
      .map((id) => `<li title="${escape(CHARMS[id].description)}">${escape(CHARMS[id].name)}</li>`)
      .join("")}</ul>`;
  }

  private show(body: string, actions: Action[]): void {
    this.root.hidden = false;
    this.root.innerHTML = `<div class="screen-panel">${body}<div class="screen-actions"></div></div>`;
    const bar = this.root.querySelector(".screen-actions")!;
    this.primary = null;
    for (const action of actions) {
      const button = document.createElement("button");
      button.textContent = action.label;
      button.disabled = !!action.disabled;
      if (action.primary) {
        button.className = "primary";
        this.primary = action.run;
      }
      button.addEventListener("click", action.run);
      bar.appendChild(button);
    }
  }
}

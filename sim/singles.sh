#!/bin/zsh
# おまじない・呪いを1個だけ付けたときのスコアの変わり方を出す（平均的な腕前、ボール2個、150ステージ）。
# 使い方: sim/singles.sh charm   または   sim/singles.sh curse   （8〜9並列で3〜8分）
setopt null_glob
cd "$(dirname "$0")/.."
kind=$1
out=tmp/sim-out; mkdir -p $out; rm -f $out/$kind-*.txt
if [ "$kind" = "charm" ]; then
  for p in $(seq 0 7); do
    PART=$p PARTS=8 pnpm sim sim/charm.sim.ts 2>&1 | grep -E 'RESULT|Error' > $out/charm-$p.txt &
  done
else
  for p in $(seq 0 8); do
    PART=$p pnpm sim sim/curse.sim.ts 2>&1 | grep -E 'RESULT|Error' > $out/curse-$p.txt &
  done
fi
wait
python3 - "$out/$kind-*.txt" <<'PY'
import glob, json, sys
rows = {r["id"]: r for r in (json.loads(l[7:]) for f in glob.glob(sys.argv[1]) for l in open(f) if l.startswith("RESULT"))}
base = rows.pop("none")
print("なし", {k: base[k] for k in ["p10", "p25", "p50", "p75", "mean"]})
if "share" in base and base["share"]: print("得点の内訳(%)", base["share"])
for r in sorted(rows.values(), key=lambda r: -r["p50"]):
    tag = f"値段 {r['price']:>2}{' レア' if r.get('rare') else ''}" if "price" in r else ("ボス" if r.get("boss") else "普通")
    print(f"{r['id']:<16} {tag:<10} p50 x{r['p50']/base['p50']:.2f}  p25 x{r['p25']/base['p25']:.2f}  p10 x{r['p10']/base['p10']:.2f}  mean x{r['mean']/base['mean']:.2f}")
PY

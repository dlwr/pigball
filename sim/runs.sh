#!/bin/zsh
# ラン通しの自動プレイ。腕前ごとのラン制覇率と、ステージ別のクリア率を出す。
# 使い方: sim/runs.sh <目標8個のカンマ区切り、空なら今の値> <1プロセスあたりの本数> <novice|average|good ...>
# 例: sim/runs.sh "" 20 novice average good   （8並列で5〜6分）
setopt null_glob
cd "$(dirname "$0")/.."
targets=$1; n=$2; shift 2
out=tmp/sim-out; mkdir -p $out; rm -f $out/run-*.txt
for skill in "$@"; do
  procs=2; [ "$skill" = "average" ] && procs=4
  for seed in $(seq 1 $procs); do
    SHADOW=1 TARGETS=$targets SKILL=$skill N=$n SEED=$seed pnpm sim sim/run.sim.ts 2>&1 | grep -E 'RESULT|Error' > $out/run-$skill-$seed.txt &
  done
done
wait
python3 sim/summarize-runs.py "$out/run-*.txt"

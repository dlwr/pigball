import json, sys, glob, collections
pat = sys.argv[1]
by = collections.defaultdict(list)
for f in sorted(glob.glob(pat)):
    for line in open(f):
        if line.startswith('RESULT'):
            d = json.loads(line[7:]); by[d['skill']].append(d)
for skill in ['novice', 'average', 'good']:
    ds = by.get(skill)
    if not ds: continue
    n = sum(d['n'] for d in ds); wins = sum(d['wins'] for d in ds)
    reached = sum((d['reached'] for d in ds), [])
    hist = collections.Counter(reached)
    print(f"== {skill}: runs {n} wins {wins} ({wins/n:.0%}) ended-at {dict(sorted(hist.items()))}")
    for i in range(len(ds[0]['rows'])):
        rows = [d['rows'][i] for d in ds]
        a = sum(r['attempts'] for r in rows); c = sum(r['clears'] for r in rows)
        if a == 0: continue
        avg = lambda k: sum(r[k] * r['attempts'] for r in rows) / a
        print(f"  S{i+1} target {rows[0]['target']:>8} attempts {a:>3} clear {c/a:>4.0%} ratio p10 {avg('r10'):.2f} p50 {avg('r50'):.2f} p90 {avg('r90'):.2f} truffles {avg('truffles'):.0f} charms {avg('charms'):.1f} sec {avg('sec'):.0f}")

    for i in range(len(ds[0]['rows'])):
        o = sorted(sum((d['rows'][i].get('open', []) for d in ds), []))
        if not o: continue
        q = lambda x: o[min(len(o)-1, int(x*len(o)))]
        print(f"  S{i+1} open n={len(o)} " + ' '.join(f"p{int(x*100)}={q(x)/1000:.0f}k" for x in [.05,.1,.15,.2,.25,.3,.4,.5,.7,.9]))

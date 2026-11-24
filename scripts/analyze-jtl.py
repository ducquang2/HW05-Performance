import csv,sys
# Dùng: python3 scripts/analyze-jtl.py results/*.jtl  -> số liệu tổng và theo endpoint (chỉ request HTTP, bỏ Transaction Controller)
def p(v,q): return v[min(len(v)-1,int(q*len(v)))]
for f in sys.argv[1:]:
    req=[];tx=[];lat=[];t0=t1=None;err=0;byl={}
    for r in csv.DictReader(open(f)):
        ts=int(r['timeStamp']);e=int(r['elapsed'])
        if r['label'][2:3]==' ':
            req.append(e);lat.append(int(r['Latency']));err+=r['success']!='true'
            byl.setdefault(r['label'],[]).append(e)
            t0=ts if t0 is None else min(t0,ts);t1=ts+e if t1 is None else max(t1,ts+e)
        else: tx.append(e)
    req.sort();tx.sort()
    dur=(t1-t0)/1000
    print(f"== {f.split('/')[-1]} req={len(req)} tx={len(tx)} dur={dur:.0f}s rps={len(req)/dur:.1f} (incl tx {(len(req)+len(tx))/dur:.1f}) avg={sum(req)/len(req):.2f} p50={p(req,.5)} p90={p(req,.9)} p95={p(req,.95)} p99={p(req,.99)} max={req[-1]} err={err} avgLat={sum(lat)/len(lat):.2f} | tx avg={sum(tx)/len(tx):.2f} p95={p(tx,.95)}")
    for k in sorted(byl): v=sorted(byl[k]); print(f"   {k:28s} n={len(v)} avg={sum(v)/len(v):.2f} p95={p(v,.95)} p99={p(v,.99)} max={v[-1]}")

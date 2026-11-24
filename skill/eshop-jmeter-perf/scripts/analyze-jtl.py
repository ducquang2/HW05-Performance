import csv,sys
# Dùng: python3 analyze-jtl.py [--skip N] results/*.jtl  -> số liệu tổng và theo endpoint (chỉ request HTTP, bỏ Transaction Controller)
# --skip N: bỏ N giây đầu (ramp-up) khi tính. Nhận diện request theo tên "01 GET ..." (ký tự thứ 3 là dấu cách), transaction "01_Login".
def p(v,q): return v[min(len(v)-1,int(q*len(v)))]
args=sys.argv[1:];skip=0
if args[:1]==['--skip']: skip=int(args[1]);args=args[2:]
for f in args:
    req=[];tx=[];lat=[];t0=t1=None;err=0;byl={}
    rows=list(csv.DictReader(open(f)));start=min(int(r['timeStamp']) for r in rows)+skip*1000
    for r in rows:
        ts=int(r['timeStamp']);e=int(r['elapsed'])
        if ts<start: continue
        if r['label'][2:3]==' ':
            req.append(e);lat.append(int(r['Latency']));err+=r['success']!='true'
            byl.setdefault(r['label'],[]).append((e,r['success']!='true'))
            t0=ts if t0 is None else min(t0,ts);t1=ts+e if t1 is None else max(t1,ts+e)
        else: tx.append(e)
    req.sort();tx.sort()
    dur=(t1-t0)/1000
    print(f"== {f.split('/')[-1]} skip={skip}s req={len(req)} tx={len(tx)} dur={dur:.0f}s rps={len(req)/dur:.1f} avg={sum(req)/len(req):.2f} p50={p(req,.5)} p90={p(req,.9)} p95={p(req,.95)} p99={p(req,.99)} max={req[-1]} err={err} ({100*err/len(req):.2f}%) avgLat={sum(lat)/len(lat):.2f}" + (f" | tx avg={sum(tx)/len(tx):.2f} p95={p(tx,.95)}" if tx else ""))
    for k in sorted(byl):
        v=sorted(e for e,_ in byl[k]);ne=sum(x for _,x in byl[k])
        print(f"   {k:28s} n={len(v)} rps={len(v)/dur:.1f} avg={sum(v)/len(v):.2f} p95={p(v,.95)} p99={p(v,.99)} max={v[-1]} err={100*ne/len(v):.2f}%")

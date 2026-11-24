import csv,sys
# Dùng: python3 jtl-windows.py [--skip N] file.jtl bucket_secs
#   Chia .jtl thành cửa sổ bucket_secs giây, mỗi cửa sổ in: số thread lớn nhất, req/s, p50/p95/p99/max (ms), err%.
#   Dùng để tìm điểm gãy Stress (xem từng bậc, cửa sổ 5–10 s) và hồi phục Spike; --skip N bỏ N giây đầu (ramp).
#   Chỉ tính request HTTP (tên "01 GET ...", ký tự thứ 3 là dấu cách), bỏ Transaction Controller "01_Login".
args=sys.argv[1:];skip=0
if args[:1]==['--skip']: skip=int(args[1]);args=args[2:]
rows=[r for r in csv.DictReader(open(args[0])) if r['label'][2:3]==' ']
b=int(args[1]); t0=min(int(r['timeStamp']) for r in rows)
g={}
for r in rows:
    s=(int(r['timeStamp'])-t0)//1000
    if s>=skip: g.setdefault(s//b,[]).append(r)
def p(v,q): v=sorted(v); return v[min(len(v)-1,int(q*len(v)))]
print("bucket  thr  rps    p50  p95  p99  max  err%")
for k in sorted(g):
    v=g[k]; e=[int(r['elapsed']) for r in v]; err=sum(r['success']!='true' for r in v)
    print(f"{k*b:5d}s {max(int(r['allThreads']) for r in v):4d} {len(v)/b:6.1f} {p(e,.5):4d} {p(e,.95):4d} {p(e,.99):4d} {max(e):4d} {100*err/len(v):5.2f}")

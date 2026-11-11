import re, json
txt=open('src/texto.txt').read().strip()
paras=[p.strip() for p in txt.split('\n\n')]
units=[]
for pi,p in enumerate(paras):
    # split after . ? ! or ... ( ellipsis ) or ':' followed by space
    parts=re.split(r'(?<=[\.\?\!…:”])\s+', p)
    for s in parts:
        if s.strip(): units.append((pi,s.strip()))
def weight(s):
    w=len(re.sub(r'[^\wáéíóúñü]','',s.lower()))
    w+= 12*sum(len(n) for n in re.findall(r'\d+',s))/4  # digits read long (years)
    return w
s=open('work/sil.txt').read().split('\n')
st=[float(x.split(': ')[1]) for x in s if x.startswith('silence_start')]
en=[float(x.split(': ')[1]) for x in s if x.startswith('silence_end')]
sil=list(zip(st,en))
speech_start=0.0
if sil[0][0]<0.05: speech_start=sil[0][1]; sil=sil[1:]
end_audio=449.567
if sil[-1][1]>end_audio-0.05: end_audio=sil[-1][0]; sil=sil[:-1]
N=len(units); M=len(sil)
W=[weight(u[1]) for u in units]
rate=(end_audio-speech_start - sum(e-s for s,e in sil)*0.6)/sum(W)
# DP: boundary k (between unit k and k+1) assigned to silence j strictly increasing; cost on unit durations
INF=1e18
import math
# pos(j)= start of silence j (end of unit) and end (start of next)
cost=[[INF]*(M+1) for _ in range(N)]
back=[[-1]*(M+1) for _ in range(N)]
# state: unit k ends at silence j (j in 0..M-1) ; last unit ends at M (=end_audio)
def ucost(dur,w,sd,para_break):
    exp=w*rate
    c=((dur-exp)/ (0.25*exp+0.6))**2
    # prefer longer silences for paragraph breaks
    c+= -sd*3.0 if para_break else -sd*1.5
    return c
starts=[speech_start]+[e for s,e in sil]
ends=[s for s,e in sil]+[end_audio]
sdur=[e-s for s,e in sil]+[1.0]
for j in range(M+1):
    dur=ends[j]-speech_start
    cost[0][j]=ucost(dur,W[0],sdur[j],units[0][0]!=units[1][0])
for k in range(1,N):
    pb = (k==N-1) or units[k][0]!=units[k+1][0]
    for j in range(k,M+1):
        best=INF;bi=-1
        for i in range(max(k-1,j-12),j):
            if cost[k-1][i]>=INF: continue
            dur=ends[j]-starts[i+1]
            # skipped silences inside unit penalty small
            c=cost[k-1][i]+ucost(dur,W[k],sdur[j],pb)+0.15*(j-i-1)
            if c<best: best=c;bi=i
        cost[k][j]=best;back[k][j]=bi
j=M;res=[]
for k in range(N-1,-1,-1):
    i=back[k][j] if k>0 else -1
    res.append((starts[i+1] if k>0 else speech_start, ends[j]))
    j=i
res=res[::-1]
out=[]
for (pi,u),(a,b) in zip(units,res):
    out.append({'p':pi,'t0':round(a,2),'t1':round(b,2),'text':u})
json.dump(out,open('src/timing.json','w'),ensure_ascii=False,indent=0)
for o in out: print(f"{o['p']:2d} {o['t0']:7.2f} {o['t1']:7.2f} {o['t1']-o['t0']:5.2f} {o['text'][:70]}")
print('rate',rate)

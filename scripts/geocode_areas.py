import json,math,time,urllib.parse,urllib.request,sys
UA="Meiyiyal-dev/0.1 (one-off seed geocoding; github techman-bala96)"
def hav(a,b,c,d):
  R=6371;p=math.radians;dl=p(c-a);dn=p(d-b);x=math.sin(dl/2)**2+math.cos(p(a))*math.cos(p(c))*math.sin(dn/2)**2;return 2*R*math.asin(math.sqrt(x))
def q(s):
  u="https://nominatim.openstreetmap.org/search?"+urllib.parse.urlencode({"q":s,"format":"jsonv2","countrycodes":"in","namedetails":1,"limit":5,"viewbox":"76.2,13.6,80.4,8.0","bounded":1})
  time.sleep(1.1)
  return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":UA}),timeout=30))
out=[]
for line in open('/tmp/areas.txt'):
  i,ds,name,dn,dlat,dlng=line.strip().split('|');dlat,dlng=float(dlat),float(dlng)
  best=None
  for s in (f"{name}, {dn}, Tamil Nadu", f"{name}, Tamil Nadu"):
    try: rs=q(s)
    except Exception as e: rs=[]; print("err",name,e,file=sys.stderr)
    rs=[r for r in rs if hav(dlat,dlng,float(r['lat']),float(r['lon']))<90]
    # prefer places over roads/POIs
    rs.sort(key=lambda r:(r.get('category')!='place' and r.get('category')!='boundary', -float(r.get('importance') or 0)))
    if rs: best=rs[0]; break
  rec={"id":int(i),"district":ds,"name":name}
  if best:
    nd=best.get('namedetails') or {}
    rec.update(lat=round(float(best['lat']),5),lng=round(float(best['lon']),5),ta=nd.get('name:ta'),km=round(hav(dlat,dlng,float(best['lat']),float(best['lon'])),1),type=best.get('type'))
  out.append(rec);print(json.dumps(rec,ensure_ascii=False),flush=True)
json.dump(out,open('/workspace/meyiyal/scripts/area_coords.json','w'),ensure_ascii=False,indent=1)

/* Ruedas y Senderos · Documentación de la ruta (PDF rellenable) */
(function(){
const R_=window.RYS; const {C,fmtNum,eur,pdfTxt:T,fmtFecha,dd}=R_;
const OVERPASS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
const gmaps=(lat,lon)=>`https://www.google.com/maps/search/?api=1&query=${(+lat).toFixed(6)},${(+lon).toFixed(6)}`;
const iso=d=>`${d.getFullYear()}-${dd(d.getMonth()+1)}-${dd(d.getDate())}`;

// ---- Geometría ----
function decPoly(str){ const out=[]; let i=0; while(i<str.length){ let b,sh=0,r=0; do{ b=str.charCodeAt(i++)-63; r|=(b&0x1f)<<sh; sh+=5; }while(b>=0x20); out.push(r&1?~(r>>1):(r>>1)); } return out; }
function puntosRuta(rr){
  let p=rr.p, e=rr.e;
  if(!p && rr.url){ const q=new URLSearchParams(rr.url.split('#')[1]||''); p=q.get('p'); e=q.get('e'); }
  if(!p) return [];
  const ll=decPoly(p), ee=decPoly(e||''); const pts=[]; let la=0,lo=0,el=0;
  for(let k=0;k+1<ll.length;k+=2){ la+=ll[k]; lo+=ll[k+1]; el+=(ee[k/2]||0); pts.push({lat:la/1e5,lon:lo/1e5,ele:el}); }
  return pts;
}
function geometria(pts, kmTotal){
  const lat0=pts[0].lat*Math.PI/180, kx=111320*Math.cos(lat0), ky=110540;
  const xy=pts.map(p=>[p.lon*kx,p.lat*ky]); const cum=[0];
  for(let i=1;i<xy.length;i++) cum.push(cum[i-1]+Math.hypot(xy[i][0]-xy[i-1][0],xy[i][1]-xy[i-1][1]));
  const f= kmTotal && cum[cum.length-1] ? kmTotal*1000/cum[cum.length-1] : 1;
  return { proyectar(lat,lon){ // distancia (m) a la ruta y km recorrido
      const px=lon*kx, py=lat*ky; let best=Infinity, km=0;
      for(let i=1;i<xy.length;i++){ const [ax,ay]=xy[i-1],[bx,by]=xy[i], dx=bx-ax, dy=by-ay, L=dx*dx+dy*dy||1;
        const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/L)); const d=Math.hypot(ax+t*dx-px, ay+t*dy-py);
        if(d<best){ best=d; km=(cum[i-1]+t*Math.sqrt(L))*f/1000; } }
      return {dist:best, km}; },
    cumKm: cum.map(c=>c*f/1000) };
}

// ---- OpenStreetMap: fuentes, pueblos, bares, patrimonio, naturaleza ----
async function overpass(q){
  let err;
  for(const u of OVERPASS){ try{ const r=await fetch(u,{method:'POST',body:'data='+encodeURIComponent(q),headers:{'Content-Type':'application/x-www-form-urlencoded'}}); if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }catch(e){ err=e; } }
  throw err;
}
const HIST_OK=/^(castle|church|monastery|ruins|archaeological_site|monument|city_gate|tower|aqueduct|bridge|fort|palace|manor|building|chapel|citywalls|fortification|mill|roman_road|watermill|windmill|cross)$/;
async function lugares(pts, geo, extras){
  const step=Math.max(1,Math.ceil(pts.length/120)); const sub=pts.filter((_,i)=>i%step===0||i===pts.length-1);
  const POLY=sub.map(p=>`${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(',');
  const q=[`[out:json][timeout:90];(`, `node["place"~"^(city|town|village|hamlet)$"](around:1500,${POLY});`];
  if(extras.agua) q.push(`node["amenity"="drinking_water"](around:300,${POLY});`,`node["man_made"="water_tap"](around:300,${POLY});`,`node["natural"="spring"](around:300,${POLY});`);
  if(extras.bares) q.push(`nwr["amenity"~"^(bar|restaurant|cafe|pub)$"]["name"](around:1500,${POLY});`);
  if(extras.patrimonio) q.push(`nwr["historic"]["name"](around:1500,${POLY});`,`nwr["heritage"]["name"](around:1500,${POLY});`);
  if(extras.fauna) q.push(`way["leisure"="nature_reserve"]["name"](around:300,${POLY});`,`relation["boundary"="protected_area"]["name"](around:300,${POLY});`,`relation["leisure"="nature_reserve"]["name"](around:300,${POLY});`);
  q.push(');out center tags qt;');
  const j=await overpass(q.join(''));
  const res={pueblos:[],agua:[],bares:[],patrimonio:[],naturaleza:[]}; const vistos=new Set();
  for(const el of j.elements||[]){
    const lat=el.lat??(el.center&&el.center.lat), lon=el.lon??(el.center&&el.center.lon); if(lat==null) continue;
    const t=el.tags||{}; const {dist,km}=geo.proyectar(lat,lon); const base={nombre:t.name||'',lat,lon,km,dist,url:gmaps(lat,lon)};
    if(t.place){ const lim=t.place==='hamlet'?600:t.place==='village'?1000:1500; if(dist<=lim && t.name) res.pueblos.push({...base,tipo:{city:'Ciudad',town:'Villa',village:'Pueblo',hamlet:'Aldea'}[t.place]}); continue; }
    if(t.amenity==='drinking_water'||t.man_made==='water_tap'||t.natural==='spring'){
      if(t.drinking_water==='no' || dist>300) continue;
      const k=Math.round(lat*2000)+':'+Math.round(lon*2000); if(vistos.has(k)) continue; vistos.add(k);
      const tipo=t.natural==='spring'?(t.drinking_water==='yes'?'Manantial potable':'Manantial (potabilidad sin confirmar)'):'Fuente de agua potable';
      res.agua.push({...base,tipo,nombre:t.name||tipo}); continue; }
    if(/^(bar|restaurant|cafe|pub)$/.test(t.amenity||'')){ res.bares.push({...base,tipo:{bar:'Bar',restaurant:'Restaurante',cafe:'Cafetería',pub:'Pub'}[t.amenity]}); continue; }
    if(t.historic||t.heritage){ if(t.historic && !HIST_OK.test(t.historic) && !t.heritage) continue;
      res.patrimonio.push({...base,tipo:{castle:'Castillo',church:'Iglesia',monastery:'Monasterio',ruins:'Ruinas',archaeological_site:'Yacimiento arqueológico',monument:'Monumento',city_gate:'Puerta',tower:'Torre',aqueduct:'Acueducto',bridge:'Puente histórico',fort:'Fortaleza',palace:'Palacio',manor:'Casa solariega',chapel:'Ermita',citywalls:'Muralla',fortification:'Fortificación',mill:'Molino',watermill:'Molino de agua',windmill:'Molino de viento',roman_road:'Calzada romana',cross:'Cruz'}[t.historic]||'Bien de interés cultural'}); continue; }
    if(t.leisure==='nature_reserve'||t.boundary==='protected_area'){ if(!res.naturaleza.some(n=>n.nombre===t.name)) res.naturaleza.push({...base,tipo:t.protection_title||'Espacio natural protegido'}); }
  }
  const porKm=(a,b)=>a.km-b.km;
  res.pueblos.sort(porKm); res.agua.sort(porKm); res.patrimonio.sort(porKm); res.naturaleza.sort(porKm);
  // Pueblos: sin repetir nombre
  res.pueblos=res.pueblos.filter((p,i,a)=>a.findIndex(q=>q.nombre===p.nombre)===i).slice(0,40);
  // Bares agrupados por el pueblo de la ruta más cercano (hasta 1,5 km del centro)
  const d2=(a,b)=>Math.hypot((a.lat-b.lat)*110540,(a.lon-b.lon)*111320*Math.cos(a.lat*Math.PI/180));
  const bares=[]; res.bares.forEach(b=>{ let pb=null,md=1500; res.pueblos.forEach(p=>{ const d=d2(b,p); if(d<md){ md=d; pb=p; } }); if(pb || b.dist<=400) bares.push({...b,pueblo:pb?pb.nombre:`Junto a la ruta (km ${fmtNum(b.km,0)})`,kmP:pb?pb.km:b.km}); });
  bares.sort((a,b)=>a.kmP-b.kmP||a.nombre.localeCompare(b.nombre));
  const cuenta={}; res.bares=bares.filter(b=>{ cuenta[b.pueblo]=(cuenta[b.pueblo]||0)+1; return cuenta[b.pueblo]<=5; }).slice(0,60);
  res.agua=res.agua.slice(0,30); res.patrimonio=res.patrimonio.filter((p,i,a)=>a.findIndex(q=>q.nombre===p.nombre)===i).slice(0,25); res.naturaleza=res.naturaleza.slice(0,10);
  return res;
}

// ---- Meteorología (Open-Meteo) ----
const WMO={0:'Despejado',1:'Poco nuboso',2:'Nubes y claros',3:'Cubierto',45:'Niebla',48:'Niebla',51:'Llovizna',53:'Llovizna',55:'Llovizna',61:'Lluvia débil',63:'Lluvia',65:'Lluvia fuerte',71:'Nieve débil',73:'Nieve',75:'Nieve fuerte',80:'Chubascos',81:'Chubascos',82:'Chubascos fuertes',95:'Tormenta',96:'Tormenta',99:'Tormenta'};
async function meteo(punto, salida, dias){
  if(!salida) return null;
  const hoy=new Date(); hoy.setHours(0,0,0,0); const ini=new Date(salida); ini.setHours(0,0,0,0);
  const fin=new Date(ini.getTime()+(Math.max(dias,1)-1)*864e5); const dif=(ini-hoy)/864e5;
  const L=`latitude=${punto.lat.toFixed(4)}&longitude=${punto.lon.toFixed(4)}&timezone=Europe%2FMadrid`;
  if(dif>=0 && dif<=14){
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?${L}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&start_date=${iso(ini)}&end_date=${iso(fin)}`); const j=await r.json();
    if(!j.daily) return null;
    return {tipo:'prevision', dias:j.daily.time.map((t,i)=>({fecha:t, max:j.daily.temperature_2m_max[i], min:j.daily.temperature_2m_min[i], lluvia:j.daily.precipitation_probability_max[i], viento:j.daily.wind_speed_10m_max[i], cielo:WMO[j.daily.weather_code[i]]||''}))};
  }
  // Estimación: media de los 5 años anteriores en las mismas fechas
  const n=Math.max(dias,1), acc=Array.from({length:n},()=>({max:0,min:0,pr:0,lluviosos:0,c:0}));
  const anioRef=Math.min(ini.getFullYear(), hoy.getFullYear());
  await Promise.all([1,2,3,4,5].map(async k=>{ const a=new Date(ini); a.setFullYear(anioRef-k); const b=new Date(a.getTime()+(n-1)*864e5);
    try{ const r=await fetch(`https://archive-api.open-meteo.com/v1/archive?${L}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&start_date=${iso(a)}&end_date=${iso(b)}`); const j=await r.json();
      (j.daily&&j.daily.time||[]).forEach((_,i)=>{ if(i>=n||j.daily.temperature_2m_max[i]==null) return; const x=acc[i]; x.max+=j.daily.temperature_2m_max[i]; x.min+=j.daily.temperature_2m_min[i]; x.pr+=j.daily.precipitation_sum[i]||0; if((j.daily.precipitation_sum[i]||0)>=1) x.lluviosos++; x.c++; }); }catch(e){} }));
  if(!acc.some(x=>x.c)) return null;
  return {tipo:'estimacion', dias:acc.map((x,i)=>({fecha:iso(new Date(ini.getTime()+i*864e5)), max:x.c?x.max/x.c:null, min:x.c?x.min/x.c:null, lluvia:x.c?Math.round(100*x.lluviosos/x.c):null, pr:x.c?x.pr/x.c:null}))};
}

// ---- Etapas ----
function etapas(pts, geo, rr, dias, pueblos){
  const n=Math.max(1,dias|0); const cum=geo.cumKm, tot=cum[cum.length-1]||rr.km||0;
  let sube=0; for(let i=1;i<pts.length;i++){ const d=pts[i].ele-pts[i-1].ele; if(d>0) sube+=d; }
  const fUp = sube ? (rr.dpos||sube)/sube : 1;
  const cortes=[0];
  for(let k=1;k<n;k++){ const obj=tot*k/n; let mejor=null, md=Infinity;
    pueblos.forEach(p=>{ const d=Math.abs(p.km-obj); if(d<md && d<=Math.max(8,tot/n*0.3) && p.km>cortes[cortes.length-1]+5){ md=d; mejor=p; } });
    cortes.push(mejor?mejor.km:obj); }
  cortes.push(tot);
  const lugarEn=km=>{ const p=pueblos.find(q=>Math.abs(q.km-km)<1.5); return p?p.nombre:null; };
  return cortes.slice(1).map((fin,k)=>{ const ini=cortes[k]; let up=0,down=0;
    for(let i=1;i<pts.length;i++){ if(cum[i]<=ini||cum[i-1]>=fin) continue; const d=pts[i].ele-pts[i-1].ele; if(d>0) up+=d; else down-=d; }
    return {dia:k+1, ini, fin, km:fin-ini, up:Math.round(up*fUp), down:Math.round(down*fUp), destino: k===n-1?null:lugarEn(fin)}; });
}

async function preparar(s, rr, aviso=()=>{}){
  const pts=puntosRuta(rr||{}); if(pts.length<2) throw new Error('Primero calcula la ruta real de este cliente');
  const geo=geometria(pts, rr.km);
  const ex=s.extrasProp.map(x=>x.toLowerCase()).join('|');
  const extras={agua:/agua/.test(ex), pueblos:/pueblo/.test(ex), bares:/bar|restaur/.test(ex), patrimonio:/patrimonio/.test(ex), fauna:/fauna|flora/.test(ex), checklist:/checklist/.test(ex)};
  aviso('Buscando pueblos, fuentes y puntos de interés junto a la ruta…');
  let osm={pueblos:[],agua:[],bares:[],patrimonio:[],naturaleza:[]}, errOsm=null;
  try{ osm=await lugares(pts, geo, extras); }catch(e){ errOsm=e.message||'sin conexión'; }
  let tiempo=null;
  if(/^si/i.test((s.meteo||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''))){ aviso('Consultando la meteorología…'); try{ tiempo=await meteo(pts[Math.floor(pts.length/2)], s.salida, s.dias); }catch(e){} }
  const et=etapas(pts, geo, rr, s.dias, osm.pueblos);
  let down=0; for(let i=1;i<pts.length;i++){ const d=pts[i].ele-pts[i-1].ele; if(d<0) down-=d; }
  let up=0; for(let i=1;i<pts.length;i++){ const d=pts[i].ele-pts[i-1].ele; if(d>0) up+=d; }
  const dneg = up ? Math.round(down*(rr.dpos||up)/up) : Math.round(down);
  return {pts, geo, osm, errOsm, tiempo, etapas:et, extras, dneg, eleMid:pts[Math.floor(pts.length/2)].ele};
}

// ---- PDF ----
const CHECKLIST=['Casco homologado','Gafas de sol o de ciclismo','Guantes','Ropa de muda (maillot, culotte y calcetines)','Chaqueta cortavientos o impermeable','Capa térmica o manguitos y perneras','Dos bidones o bolsa de hidratación (mínimo 1,5 l)','Comida energética para el día (barritas, geles, frutos secos)','Kit de reparación: cámara de repuesto, desmontables, parches o mechas tubeless','Bomba de aire o cartuchos de CO2','Multiherramienta con tronchacadenas y eslabón rápido','Luces delantera y trasera','Móvil con el track cargado, batería externa y cable','Botiquín básico, crema solar y protector labial','DNI, tarjeta sanitaria, seguro y dinero en efectivo'];
function pdf(s, rr, d, info){
  const {jsPDF}=window.jspdf; const doc=new jsPDF({unit:'mm',format:'a4',compress:true});
  const W=210,X=15,R=195,BOT=280; let y=0;
  const cab=()=>{ doc.setFillColor(...C.pino).rect(0,0,W,11,'F'); doc.setFont('helvetica','bold').setFontSize(9).setTextColor(255,255,255).text('Ruedas y Senderos',X,7.2);
    doc.setFont('helvetica','normal').setTextColor(200,214,196).text(T(`Documentación de la ruta · ${info.ref}`),R,7.2,{align:'right'}); y=20; };
  const nueva=()=>{ doc.addPage(); cab(); };
  const hueco=h=>{ if(y+h>BOT) nueva(); };
  const h1=t=>{ hueco(16); y+=4; doc.setFont('helvetica','bold').setFontSize(13).setTextColor(...C.pino).text(T(t),X,y); doc.setDrawColor(...C.musgo).setLineWidth(.6).line(X,y+2,R,y+2); y+=8; };
  const h2=t=>{ hueco(10); doc.setFont('helvetica','bold').setFontSize(10.5).setTextColor(...C.roca).text(T(t),X,y); y+=5.5; };
  const parr=(t,o={})=>{ doc.setFont('helvetica',o.it?'italic':'normal').setFontSize(o.fs||9.2).setTextColor(...(o.color||C.roca)); doc.splitTextToSize(T(t),R-X).forEach(l=>{ hueco(5); doc.text(l,X,y); y+=4.4; }); y+=1.5; };
  const kv=pares=>{ pares=pares.filter(p=>p&&p[1]!=null&&p[1]!==''); for(const [k,v] of pares){
      const lines=doc.setFont('helvetica','normal').setFontSize(9.5).splitTextToSize(T(v),R-X-62); const h=Math.max(1,lines.length)*4.4+2.4; hueco(h);
      doc.setFont('helvetica','normal').setFontSize(8.5).setTextColor(...C.gris).text(T(k),X,y);
      doc.setFont('helvetica','normal').setFontSize(9.5).setTextColor(...C.roca).text(lines,X+62,y,{lineHeightFactor:1.3});
      doc.setDrawColor(...C.linea).setLineWidth(.2).line(X,y+h-3,R,y+h-3); y+=h; } y+=2; };
  const tabla=(cols,filas)=>{ if(!filas.length) return; const hdr=()=>{ hueco(14); doc.setFillColor(...C.pino).rect(X,y-4.5,R-X,7,'F'); let x=X;
      doc.setFont('helvetica','bold').setFontSize(8.3).setTextColor(255,255,255); cols.forEach(c=>{ doc.text(T(c.t),c.al==='r'?x+c.w-2:x+2,y,{align:c.al==='r'?'right':'left'}); x+=c.w; }); y+=6; };
    hdr();
    filas.forEach((f,i)=>{ doc.setFont('helvetica','normal').setFontSize(8.5);
      const cel=f.map((v,j)=>{ const o=(v&&typeof v==='object')?v:{t:v}; return {...o, lines:doc.splitTextToSize(T(o.t??''),cols[j].w-4)}; });
      const h=Math.max(...cel.map(c=>c.lines.length))*3.9+2.6;
      if(y+h>BOT){ nueva(); hdr(); }
      if(i%2) doc.setFillColor(...C.suave).rect(X,y-3.8,R-X,h,'F');
      let x=X; cel.forEach((c,j)=>{ const al=cols[j].al==='r'; const tx=al?x+cols[j].w-2:x+2;
        if(c.url){ doc.setTextColor(...C.musgo).setFont('helvetica','bold'); doc.text(c.lines,tx,y,{align:al?'right':'left'}); doc.link(x,y-3.5,cols[j].w,h,{url:c.url}); }
        else { doc.setTextColor(...C.roca).setFont('helvetica',c.b?'bold':'normal'); doc.text(c.lines,tx,y,{align:al?'right':'left',lineHeightFactor:1.3}); }
        x+=cols[j].w; });
      y+=h; });
    y+=3; };

  // Portada
  doc.addImage(R_.BANNER,'JPEG',0,0,W,W*446/1400,'banner','FAST'); y=W*446/1400+12;
  doc.setFont('helvetica','bold').setFontSize(20).setTextColor(...C.pino).text('Documentación de la ruta',X,y);
  doc.setFont('helvetica','bold').setFontSize(8.5).setTextColor(...C.roca).text('Nº '+T(info.ref),R,y-5,{align:'right'});
  doc.setFont('helvetica','normal').setTextColor(...C.gris).text(T(`Preparada el ${fmtFecha(new Date())}`),R,y,{align:'right'});
  y+=7; doc.setFont('helvetica','normal').setFontSize(11).setTextColor(...C.roca).text(T(`${s.nombre} · ${s.inicio.split(',')[0]} - ${s.fin.split(',')[0]}`),X,y); y+=8;
  const st=[[fmtNum(rr.km,1)+' km','Distancia'],[fmtNum(rr.dpos)+' m','Desnivel +'],[fmtNum(d.dneg)+' m','Desnivel -'],[fmtNum(rr.amax)+' m','Altitud máx.'],[fmtNum(rr.amin)+' m','Altitud mín.'],[rr.pTierra!=null?rr.pTierra+' %':'-','Sin asfaltar']];
  const bw=(R-X-10)/6; st.forEach(([v,l],i)=>{ const x=X+i*(bw+2); doc.setFillColor(...C.suave).roundedRect(x,y,bw,15,1.5,1.5,'F');
    doc.setFont('helvetica','bold').setFontSize(11).setTextColor(...C.pino).text(T(v),x+bw/2,y+6.6,{align:'center'});
    doc.setFont('helvetica','normal').setFontSize(7).setTextColor(...C.gris).text(T(l),x+bw/2,y+11.6,{align:'center'}); });
  y+=21;
  // Perfil de altitud
  (()=>{ const px=X, pw=R-X, ph=38, py=y; const cum=d.geo.cumKm, tot=cum[cum.length-1]||1; const el=d.pts.map(p=>p.ele);
    const paso=[50,100,200,250,500].find(s2=>(rr.amax-rr.amin)/s2<=4)||500; const y0=Math.floor(Math.min(...el)/paso)*paso, y1=Math.max(Math.ceil(Math.max(...el)/paso)*paso,y0+paso);
    const PX=k=>px+10+(pw-10)*k/tot, PY=e=>py+ph-(ph-4)*(e-y0)/(y1-y0);
    doc.setDrawColor(...C.linea).setLineWidth(.15); doc.setFont('helvetica','normal').setFontSize(6.5).setTextColor(...C.gris);
    for(let v=y0; v<=y1; v+=paso){ doc.line(px+10,PY(v),R,PY(v)); doc.text(String(v),px+8.5,PY(v)+1,{align:'right'}); }
    const segs=[]; let lx=PX(0), ly=PY(el[0]); for(let i=1;i<el.length;i++){ const nx=PX(cum[i]), ny=PY(el[i]); segs.push([nx-lx,ny-ly]); lx=nx; ly=ny; }
    const poly=[...segs,[0,py+ph-ly],[PX(0)-lx,0]];
    doc.setFillColor(205,222,190); doc.lines(poly,PX(0),PY(el[0]),[1,1],'F',true);
    doc.setDrawColor(...C.pino).setLineWidth(.45); doc.lines(segs,PX(0),PY(el[0]),[1,1],'S',false);
    const kp=[1,2,5,10,20,25,50,100].find(s2=>tot/s2<=8)||200; for(let k=0;k<=tot+1e-6;k+=kp) doc.text(k+' km',PX(k),py+ph+4,{align:'center'});
    y=py+ph+9; })();
  if(rr.url){ doc.setFillColor(...C.pino).roundedRect(X,y,R-X,12,2,2,'F'); doc.setFont('helvetica','bold').setFontSize(11.5).setTextColor(255,255,255).text('Abrir track de la ruta (mapa, Wikiloc y Organic Maps)',W/2,y+7.8,{align:'center'}); doc.link(X,y,R-X,12,{url:info.track||rr.url}); y+=18; }

  // El grupo
  h1('El grupo');
  kv([['Nº de ciclistas',String(s.n)],['Edades aprox.',s.edades],['Menores de edad',s.menores||'No'],['Nivel de los ciclistas',s.nivel],['Tipo de bicicleta',s.tipoBici]]);
  // La ruta
  h1('La ruta');
  kv([['Tipo de ruta',s.tipoRuta],['Punto de inicio',s.inicio],['Punto de fin',s.fin],['Fecha de inicio',fmtFecha(s.salida)],['Km totales',`${fmtNum(rr.km,1)} km reales${s.km?` (solicitados: ${fmtNum(s.km)} km)`:''}`],['Km/día',`${fmtNum(rr.km/Math.max(s.dias,1),0)} km de media en ${s.dias} día${s.dias!==1?'s':''}${s.kmDia?` (solicitados: ${fmtNum(s.kmDia)} km/día)`:''}`],
      ['Terreno preferido',`${s.terreno}${rr.pTierra!=null?` · ${rr.pTierra} % sin asfaltar, ${rr.pCarr} % por carretera`:''}`],['Desnivel máximo',s.desnivel],
      ['Altimetrías',`Desnivel positivo ${fmtNum(rr.dpos)} m · negativo ${fmtNum(d.dneg)} m · altitud máxima ${fmtNum(rr.amax)} m · mínima ${fmtNum(rr.amin)} m`],['Observaciones',s.obs]]);
  if(d.etapas.length>1){ h2('Etapas'); tabla([{t:'Día',w:14},{t:'Tramo',w:60},{t:'Km',w:22,al:'r'},{t:'Desnivel +',w:28,al:'r'},{t:'Desnivel -',w:28,al:'r'},{t:'Final de etapa',w:28}],
      d.etapas.map(e=>[`Día ${e.dia}`,`km ${fmtNum(e.ini,0)} - ${fmtNum(e.fin,0)}`,fmtNum(e.km,1),fmtNum(e.up)+' m',fmtNum(e.down)+' m',e.destino||(e.dia===d.etapas.length?s.fin.split(',')[0]:'-')])); }

  // Alojamiento
  h1('Alojamiento');
  const app=/app/i.test(s.alojGestion);
  kv([['Gestión del alojamiento',app?'Lo gestiona Ruedas y Senderos':'Lo gestiona el propio grupo'],['Tipo preferido',s.alojTipo]]);
  if(app){ const al=(info.alojamientos||[]).filter(a=>a.nombre);
    if(al.length){ tabla([{t:'Noche',w:22},{t:'Alojamiento',w:52},{t:'Localidad',w:38},{t:'Precio/noche',w:28,al:'r'},{t:'Enlace',w:40}],
        al.map(a=>[a.fecha||'',{t:a.nombre,b:true},a.localidad||'',a.precio?eur(+a.precio):'-',a.enlace?{t:'Ver alojamiento',url:a.enlace}:(a.lat?{t:'Ver en mapa',url:gmaps(a.lat,a.lon)}:'-')]));
      const tot=al.reduce((t,a)=>t+(+a.precio||0),0); if(tot) parr(`Total alojamiento: ${eur(tot)} (${al.length} noche${al.length!==1?'s':''}).`,{color:C.pino}); }
    else parr('Los alojamientos se confirmarán en breve.',{it:true,color:C.gris}); }

  // Alimentación
  h1('Alimentación durante la ruta');
  if(s.alimEmpresa && s.productos.length){ const m=1+info.margen;
    tabla([{t:'Producto',w:80},{t:'Unidades',w:40,al:'r'},{t:'Precio total',w:60,al:'r'}],
      s.productos.map(p=>{ const c=info.DV_COSTS.alimentos[p]; if(!c) return [p,'-','-']; const u=c.unidadesDia*s.n*s.dias; return [{t:p,b:true},String(u),eur(u*c.unidad*m)]; }));
    parr('Precios sin IVA.',{it:true,color:C.gris,fs:8}); }
  else parr('La alimentación durante la ruta la lleva el propio grupo.');

  // Recogida
  h1('Recogida en destino y transporte');
  kv([['Recogida en destino',s.recogida?'Sí, recogida incluida':'No necesitan'],['Km del vehículo (ida+vuelta)',s.kmVeh?fmtNum(s.kmVeh)+' km':''],['Hora aprox. de recogida',s.recogida?(s.hora||'Por concretar'):''],
      ['Recogida parcial en ruta',s.parcial?`Sí: ${s.nParcial} ciclista${s.nParcial!==1?'s':''} en ${s.pobParcial||'población por concretar'}`:'No, todos llegan al final'],['Transporte de bicicletas',s.bici?`Sí, ${s.n} bicicleta${s.n!==1?'s':''} en furgoneta`:'No hace falta']]);

  // Puesta a punto
  h1('Puesta a punto de bicicletas');
  if(s.pap){ const m=1+info.margen, tot=s.costePap*m; kv([['Nº de bicicletas',String(s.nBicis)],['Precio por ciclista',`${eur(tot*(1+info.iva)/Math.max(s.n,1))} (IVA incluido)`],['Incluye','Revisión general, ajuste de frenos y cambios, presión y engrase. Los materiales sustituidos se cobran aparte.']]); }
  else parr('No solicitada.');

  // Meteorología
  if(d.tiempo){ h1(d.tiempo.tipo==='prevision'?'Previsión meteorológica':'Estimación meteorológica');
    if(d.tiempo.tipo==='prevision') tabla([{t:'Fecha',w:28},{t:'Cielo',w:46},{t:'Máx.',w:22,al:'r'},{t:'Mín.',w:22,al:'r'},{t:'Prob. lluvia',w:30,al:'r'},{t:'Viento máx.',w:32,al:'r'}],
        d.tiempo.dias.map(x=>[x.fecha.split('-').reverse().join('/'),x.cielo,fmtNum(x.max,0)+' °C',fmtNum(x.min,0)+' °C',(x.lluvia??'-')+' %',fmtNum(x.viento||0,0)+' km/h']));
    else { tabla([{t:'Fecha',w:40},{t:'Máx. media',w:35,al:'r'},{t:'Mín. media',w:35,al:'r'},{t:'Días de lluvia (5 años)',w:70,al:'r'}],
        d.tiempo.dias.map(x=>[x.fecha.split('-').reverse().join('/'),x.max!=null?fmtNum(x.max,0)+' °C':'-',x.min!=null?fmtNum(x.min,0)+' °C':'-',x.lluvia!=null?x.lluvia+' %':'-']));
      parr('Estimación basada en el tiempo real de esas mismas fechas en los últimos cinco años. Te enviaremos la previsión actualizada unos días antes de la salida.',{it:true,color:C.gris,fs:8.3}); }
    const caida=Math.round(((rr.amax||0)-(d.eleMid||0))*0.0065); if(caida>=3) parr(`En los puntos más altos de la ruta (${fmtNum(rr.amax)} m) la temperatura puede ser unos ${caida} °C más baja que en la tabla.`,{fs:8.6}); }

  // Extras
  const ex=d.extras; const algunExtra=ex.agua||ex.pueblos||ex.bares||ex.patrimonio||ex.fauna;
  if(algunExtra){ h1('Extras de la propuesta'); if(d.errOsm) parr('No se pudieron consultar los puntos de interés en este momento.',{it:true,color:C.aviso});
    if(ex.agua){ h2('Fuentes de agua'); if(d.osm.agua.length) tabla([{t:'Km',w:16,al:'r'},{t:'Fuente',w:120},{t:'Ubicación',w:44}], d.osm.agua.map(a=>[fmtNum(a.km,0),a.nombre===a.tipo?a.tipo:`${a.nombre} (${a.tipo.toLowerCase()})`,{t:'Ver en Google Maps',url:a.url}])); else parr('No hay fuentes registradas junto a la ruta: llevad agua suficiente y recargad en los pueblos.',{it:true}); }
    if(ex.pueblos){ h2('Pueblos en la ruta'); if(d.osm.pueblos.length) tabla([{t:'Km',w:16,al:'r'},{t:'Pueblo',w:90},{t:'Tipo',w:30},{t:'Ubicación',w:44}], d.osm.pueblos.map(p=>[fmtNum(p.km,0),{t:p.nombre,b:true},p.tipo,{t:'Ver en Google Maps',url:p.url}])); else parr('No hay núcleos de población junto a la ruta.',{it:true}); }
    if(ex.bares){ h2('Bares y restaurantes'); if(d.osm.bares.length) tabla([{t:'Pueblo',w:48},{t:'Establecimiento',w:66},{t:'Tipo',w:24},{t:'Ubicación',w:42}], d.osm.bares.map(b=>[{t:b.pueblo,b:true},b.nombre,b.tipo,{t:'Ver en Google Maps',url:b.url}])); else parr('No hay bares registrados en los pueblos de la ruta.',{it:true}); }
    if(ex.patrimonio){ h2('Patrimonio cultural'); if(d.osm.patrimonio.length) tabla([{t:'Km',w:16,al:'r'},{t:'Lugar',w:84},{t:'Tipo',w:36},{t:'Ubicación',w:44}], d.osm.patrimonio.map(p=>[fmtNum(p.km,0),{t:p.nombre,b:true},p.tipo,{t:'Ver en Google Maps',url:p.url}])); else parr('No hay elementos de patrimonio registrados junto a la ruta.',{it:true}); }
    if(ex.fauna){ h2('Fauna y flora: espacios naturales'); if(d.osm.naturaleza.length) tabla([{t:'Km',w:16,al:'r'},{t:'Espacio',w:90},{t:'Figura',w:30},{t:'Ubicación',w:44}], d.osm.naturaleza.map(p=>[fmtNum(p.km,0),{t:p.nombre,b:true},p.tipo,{t:'Ver en Google Maps',url:p.url}])); else parr('La ruta no atraviesa espacios naturales protegidos.',{it:true}); }
  }

  // Checklist personal (rellenable)
  if(ex.checklist){ hueco(70); h1('Checklist personal'); parr('Marca cada casilla cuando lo tengas preparado. Puedes rellenarlo directamente en este PDF.',{fs:8.6,color:C.gris});
    const items=[...CHECKLIST]; items.forEach((t,i)=>{ hueco(8); const cb=new doc.AcroFormCheckBox(); cb.fieldName='check_'+(i+1); cb.x=X; cb.y=y-3.8; cb.width=4.8; cb.height=4.8; cb.appearanceState='Off'; cb.value='Off';
      doc.setDrawColor(...C.pino).setLineWidth(.35).rect(X,y-3.8,4.8,4.8); doc.addField(cb);
      doc.setFont('helvetica','normal').setFontSize(9.5).setTextColor(...C.roca).text(T(t),X+8,y); y+=7.2; });
    for(let k=1;k<=2;k++){ hueco(9); const cb=new doc.AcroFormCheckBox(); cb.fieldName='check_otro_'+k; cb.x=X; cb.y=y-3.8; cb.width=4.8; cb.height=4.8; cb.appearanceState='Off'; cb.value='Off';
      doc.setDrawColor(...C.pino).rect(X,y-3.8,4.8,4.8); doc.addField(cb);
      const tf=new doc.AcroFormTextField(); tf.fieldName='otro_'+k; tf.x=X+8; tf.y=y-4.5; tf.width=R-X-8; tf.height=6.2; tf.fontSize=9; doc.addField(tf);
      doc.setDrawColor(...C.linea).line(X+8,y+1.6,R,y+1.6); doc.setFont('helvetica','italic').setFontSize(7).setTextColor(...C.gris).text('Otro:',X+8,y-4.8); y+=9; } }

  // Cierre
  h1('Contacto'); parr(`Para cualquier duda o cambio, responde a este correo o escríbenos a ${R_.EMAIL_GESTOR}. ¡Buena ruta!`);
  if(info.notas) { h2('Notas de Ruedas y Senderos'); parr(info.notas); }
  const np=doc.getNumberOfPages(); for(let i=1;i<=np;i++){ doc.setPage(i); doc.setFont('helvetica','normal').setFontSize(7.5).setTextColor(...C.gris).text(`${i} / ${np}`,R,291,{align:'right'}); doc.text('Datos de mapa © colaboradores de OpenStreetMap · Meteorología: Open-Meteo',X,291); }
  doc.setProperties({title:'Documentación de la ruta '+T(info.ref),author:'Ruedas y Senderos'});
  return doc;
}
window.RYSDoc={preparar, pdf, puntosRuta};
})();

import React, { useState, useEffect, useCallback, useRef, Component } from "react";
import { loadState, saveState, uploadPhoto, deletePhoto, subscribeSync, fetchCloudState, ensureCloudAuth, cloudSignOut } from "./storage.js";

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return <div style={{padding:20,background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,margin:20}}>
        <div style={{color:"#ef4444",fontWeight:700,fontSize:15,marginBottom:8}}>⚠️ Erreur d'affichage</div>
        <div style={{color:"#64748b",fontSize:12,marginBottom:12}}>{String(this.state.error?.message||"Erreur inconnue")}</div>
        <button onClick={()=>this.setState({hasError:false,error:null})} style={{background:"#3b9abf",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600,fontSize:13}}>Réessayer</button>
      </div>;
    }
    return this.props.children;
  }
}

// ─── STORAGE (Supabase si configuré, sinon localStorage — voir src/lib/storage.js) ───
const ld=loadState;
const sv=saveState;

// ─── REAL QR CODE GENERATOR (Version 1-L, 21x21) ───
const GF_EXP=new Array(512),GF_LOG=new Array(256);
let _x=1;for(let i=0;i<255;i++){GF_EXP[i]=_x;GF_LOG[_x]=i;_x<<=1;if(_x&256)_x^=285;}for(let i=255;i<512;i++)GF_EXP[i]=GF_EXP[i-255];
function gfMul(a,b){return a===0||b===0?0:GF_EXP[GF_LOG[a]+GF_LOG[b]];}
function rsGenPoly(n){let g=[1];for(let i=0;i<n;i++){const ng=new Array(g.length+1).fill(0);for(let j=0;j<g.length;j++){ng[j]^=g[j];ng[j+1]^=gfMul(g[j],GF_EXP[i]);}g=ng;}return g;}
function rsEncode(data,nsym){const gen=rsGenPoly(nsym),res=new Array(nsym).fill(0);for(let i=0;i<data.length;i++){const c=data[i]^res[0];res.shift();res.push(0);for(let j=0;j<gen.length-1;j++)res[j]^=gfMul(c,gen[j+1]);}return res;}
const ALNUM="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
function qrEncodeAlpha(str){const bits=[];bits.push(0,0,1,0);const l=str.length;for(let i=8;i>=0;i--)bits.push((l>>i)&1);for(let i=0;i<l;i+=2){const v1=ALNUM.indexOf(str[i]);if(i+1<l){const v2=ALNUM.indexOf(str[i+1]),v=v1*45+v2;for(let j=10;j>=0;j--)bits.push((v>>j)&1);}else{for(let j=5;j>=0;j--)bits.push((v1>>j)&1);}}for(let i=0;i<4&&bits.length<152;i++)bits.push(0);while(bits.length%8)bits.push(0);const bytes=[];for(let i=0;i<bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=(b<<1)|bits[i+j];bytes.push(b);}let pi=0;while(bytes.length<19)bytes.push([236,17][pi++%2]);return bytes;}
function qrFormatInfo(mask){const d=(1<<3)|mask;let b=d<<10,t=b;for(let i=4;i>=0;i--)if(t&(1<<(i+10)))t^=0x537<<i;b|=t;b^=0x5412;return b;}
function qrBuildMatrix(allBytes){const S=21,M=Array.from({length:S},()=>new Array(S).fill(-1)),R=Array.from({length:S},()=>new Array(S).fill(false));
function setFP(or,oc){for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++){const rr=or+r,cc=oc+c;if(rr<0||rr>=S||cc<0||cc>=S)continue;M[rr][cc]=(r===-1||r===7||c===-1||c===7)?0:((r===0||r===6)||(c===0||c===6)||(r>=2&&r<=4&&c>=2&&c<=4))?1:0;R[rr][cc]=true;}}
setFP(0,0);setFP(0,S-7);setFP(S-7,0);
for(let i=8;i<S-8;i++){M[6][i]=i%2===0?1:0;M[i][6]=i%2===0?1:0;R[6][i]=true;R[i][6]=true;}
M[S-8][8]=1;R[S-8][8]=true;
for(let i=0;i<9;i++){if(i<S){R[8][i]=true;R[i][8]=true;}}
for(let i=0;i<8;i++){R[8][S-8+i]=true;}for(let i=0;i<7;i++){R[S-7+i][8]=true;}
const bits=[];for(const byte of allBytes)for(let i=7;i>=0;i--)bits.push((byte>>i)&1);
let bi=0,up=true;
for(let right=S-1;right>=1;right-=2){if(right===6)right=5;const rows=up?Array.from({length:S},(_,i)=>S-1-i):Array.from({length:S},(_,i)=>i);for(const row of rows)for(const col of[right,right-1])if(!R[row][col])M[row][col]=bi<bits.length?bits[bi++]:0;up=!up;}
return{M,R};}
function qrApplyMask(M,R,m){const S=M.length,masks=[(r,c)=>(r+c)%2===0,r=>r%2===0,(_,c)=>c%3===0,(r,c)=>(r+c)%3===0,(r,c)=>(Math.floor(r/2)+Math.floor(c/3))%2===0,(r,c)=>((r*c)%2+(r*c)%3)===0,(r,c)=>((r*c)%2+(r*c)%3)%2===0,(r,c)=>((r+c)%2+(r*c)%3)%2===0];const fn=masks[m],res=M.map(r=>[...r]);for(let r=0;r<S;r++)for(let c=0;c<S;c++)if(!R[r][c]&&fn(r,c))res[r][c]^=1;return res;}
function qrPlaceFormat(M,mask){const S=M.length,fmt=qrFormatInfo(mask);const p1=[[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];const p2=[[S-1,8],[S-2,8],[S-3,8],[S-4,8],[S-5,8],[S-6,8],[S-7,8],[8,S-8],[8,S-7],[8,S-6],[8,S-5],[8,S-4],[8,S-3],[8,S-2],[8,S-1]];for(let i=0;i<15;i++){const b=(fmt>>(14-i))&1;M[p1[i][0]][p1[i][1]]=b;M[p2[i][0]][p2[i][1]]=b;}}
function generateQR(text){const t=text.toUpperCase();const data=qrEncodeAlpha(t);const ec=rsEncode(data,7);const all=[...data,...ec];const{M,R}=qrBuildMatrix(all);let bestMask=0,bestScore=Infinity;for(let m=0;m<8;m++){const masked=qrApplyMask(M,R,m);const tmp=masked.map(r=>[...r]);qrPlaceFormat(tmp,m);let score=0;for(let r=0;r<21;r++){let run=1;for(let c=1;c<21;c++){if(tmp[r][c]===tmp[r][c-1])run++;else{if(run>=5)score+=run-2;run=1;}}if(run>=5)score+=run-2;}if(score<bestScore){bestScore=score;bestMask=m;}}const final=qrApplyMask(M,R,bestMask);qrPlaceFormat(final,bestMask);return final;}

function QRCode({refId,size=90,label,data:refData}){
const url=`${typeof window!=="undefined"?window.location.origin:""}/stock/fiche/${refId}`;
const qrSrc=`https://api.qrserver.com/v1/create-qr-code/?size=${size*2}x${size*2}&data=${encodeURIComponent(url)}&margin=1`;
return <div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",gap:4}}>
<img src={qrSrc} width={size} height={size} alt={refId} style={{borderRadius:3,border:"1px solid #e2e8f0"}}/>
{label&&<div style={{fontSize:8,color:"#64748b",fontFamily:"monospace",letterSpacing:.5}}>{label}</div>}
</div>;}

const LOGO="data:image/png;base64,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";

// Logo courant : celui téléversé dans Réglages, sinon le logo intégré
let CURRENT_LOGO=LOGO;
const COLIS_FORMATS=[{id:"C1",label:"1 bouteille",btls:1},{id:"C2",label:"2 bouteilles",btls:2},{id:"C3",label:"3 bouteilles",btls:3},{id:"C6",label:"6 bouteilles",btls:6},{id:"C12",label:"12 bouteilles",btls:12},{id:"M1",label:"1 magnum",btls:1},{id:"PAL",label:"Palette Europe",btls:0},{id:"DPAL",label:"Demi-palette",btls:0}];
const G1={entree_forfait_palette:10,entree_par_palette_mono:1,entree_par_ref_multi:0.5,entree_colis_gratuits:5,entree_par_colis_payant:1,entree_par_ref_colis:0.5,stock_palette_demi:12.5,stock_palette_mois:25,stock_espace12:1.8,sortie_picking_lot6:1,sortie_min_prepa_colis:1,sortie_colis_ref_tpa_oui:0,sortie_colis_ref_tpa_non:1.5,sortie_picking_palette_mono:1,sortie_picking_palette_multi:0.5,sortie_prepa_palette:5,sortie_manut_palette:10};
const defaultState={
adherents:[],
entrees:[],
references:[],
sorties:[],
fournitures:[
{id:"F1",nom:"Colis 1 bouteille",prix:1.20,categorie:"Colis"},{id:"F2",nom:"Colis 2 bouteilles",prix:2.05,categorie:"Colis"},
{id:"F3",nom:"Colis 3 bouteilles",prix:2.39,categorie:"Colis"},{id:"F4",nom:"Colis 6 bouteilles",prix:3.37,categorie:"Colis"},
{id:"F5",nom:"Colis 12 bouteilles",prix:6.19,categorie:"Colis"},{id:"F6",nom:"Colis 1 magnum",prix:3.41,categorie:"Colis"},
{id:"F7",nom:"Palette Europe",prix:12,categorie:"Palette"},{id:"F8",nom:"Demi-palette",prix:6,categorie:"Palette"},
],
espaces:[],
factures:[],
nextEntreeId:1,nextSortieId:1,nextFactureId:1,journal:[]};

// ─── PRICING ───
function calcEntree(g,c,nP,nR,nC){if(c==="Palette"){let t=g.entree_forfait_palette;t+=nR===1?nP*g.entree_par_palette_mono:nR*g.entree_par_ref_multi;return t;}return nR*g.entree_par_ref_colis+Math.max(0,nC-g.entree_colis_gratuits)*g.entree_par_colis_payant;}
// Colis — l'un OU l'autre :
// - colisage standard (cartons = nécessaire) → base picking par multiple de 6
// - colisage éclaté (cartons > nécessaire) → prépa par carton, qui REMPLACE la base
function nbCartonsNecessaires(t){return calcColisage(t).reduce((s,p)=>s+p.n,0);}
function calcSortie(g,tpa,apa,cl,tB,nR,nC,nP){let t=0;if(cl==="Colis"){const base=nC>nbCartonsNecessaires(tB)?nC*g.sortie_min_prepa_colis:Math.ceil(tB/6)*g.sortie_picking_lot6;t+=base+nR*(tpa?g.sortie_colis_ref_tpa_oui:g.sortie_colis_ref_tpa_non);}else{if(tpa&&apa)return 0;t+=(nR===1?nP*g.sortie_picking_palette_mono:nR*g.sortie_picking_palette_multi)+nP*g.sortie_prepa_palette+g.sortie_manut_palette;}return t;}

// ─── DESIGN (Planet Aura white/blue) ───
// Palette — contrastes renforcés pour la lisibilité des petits textes
const P={bg:"#f0f5fa",sf:"#ffffff",sf2:"#f8fafc",bd:"#e2e8f0",ac:"#2e7fa0",acs:"#3b9abf12",acb:"#3b9abf40",gn:"#059669",gns:"#10b98112",rd:"#dc2626",rds:"#ef444412",am:"#c26a05",ams:"#f59e0b12",bl:"#2563eb",bls:"#3b82f612",tx:"#0f172a",tm:"#3f4c60",td:"#64748b"};
const FN=`'DM Sans',system-ui,sans-serif`;

// ─── ATOMS ───
function Badge({children,color="ac"}){return <span style={{background:P[color+"s"]||P.acs,color:P[color]||P.ac,padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600}}>{children}</span>;}
function Btn({children,onClick,v="primary",sm,dis,style:s2}){const b={fontFamily:FN,fontWeight:600,fontSize:sm?11:13,border:"none",borderRadius:8,cursor:dis?"not-allowed":"pointer",transition:"all .15s",opacity:dis?.45:1};const vs={primary:{...b,background:P.ac,color:"#fff",padding:sm?"6px 12px":"10px 20px"},secondary:{...b,background:P.sf2,color:P.tx,padding:sm?"6px 12px":"10px 20px",border:`1px solid ${P.bd}`},danger:{...b,background:P.rds,color:P.rd,padding:sm?"6px 12px":"10px 20px"},ghost:{...b,background:"transparent",color:P.tm,padding:sm?"4px 8px":"8px 16px"},success:{...b,background:P.gns,color:P.gn,padding:sm?"6px 12px":"10px 20px"}};return <button style={{...vs[v],...(s2||{})}} onClick={dis?undefined:onClick}>{children}</button>;}
function Inp({label,value,onChange,type="text",options,placeholder,sm,disabled,style:s2}){const is={fontFamily:FN,fontSize:sm?12:13,background:P.bg,color:P.tx,border:`1px solid ${P.bd}`,borderRadius:8,padding:sm?"7px 10px":"10px 14px",width:"100%",boxSizing:"border-box",outline:"none",...(s2||{})};const lbl=label&&<label style={{fontSize:10,color:P.tm,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>{label}</label>;if(options)return <div style={{display:"flex",flexDirection:"column",gap:4}}>{lbl}<select value={value} onChange={e=>onChange(e.target.value)} style={is} disabled={disabled}><option value="">{placeholder||"Sélectionner..."}</option>{options.map(o=><option key={typeof o==="string"?o:o.value} value={typeof o==="string"?o:o.value}>{typeof o==="string"?o:o.label}</option>)}</select></div>;return <div style={{display:"flex",flexDirection:"column",gap:4}}>{lbl}<input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={is} disabled={disabled}/></div>;}
function Card({children,style:s2,onClick}){return <div onClick={onClick} style={{background:P.sf,border:`1px solid ${P.bd}`,borderRadius:12,padding:20,boxShadow:"0 1px 3px #0001",...(onClick?{cursor:"pointer"}:{}),...(s2||{})}}>{children}</div>;}
function Stat({label,value,icon,color="ac"}){return <Card style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px"}}><div style={{width:42,height:42,borderRadius:10,background:P[color+"s"]||P.acs,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{icon}</div><div><div style={{fontSize:22,fontWeight:700,color:P.tx}}>{value}</div><div style={{fontSize:10,color:P.tm,fontWeight:500}}>{label}</div></div></Card>;}
function Table({columns,data,onRowClick}){if(!data.length)return <div style={{padding:30,textAlign:"center",color:P.td,fontSize:13}}>Aucune donnée</div>;return <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontFamily:FN,fontSize:12}}><thead><tr>{columns.map(c=><th key={c.key} style={{textAlign:"left",padding:"10px 12px",borderBottom:`2px solid ${P.bd}`,color:P.tm,fontSize:10,fontWeight:600,letterSpacing:.5,textTransform:"uppercase",whiteSpace:"nowrap"}}>{c.label}</th>)}</tr></thead><tbody>{data.map((row,i)=><tr key={i} onClick={()=>onRowClick?.(row)} style={{cursor:onRowClick?"pointer":"default"}} onMouseEnter={e=>e.currentTarget.style.background=P.sf2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{columns.map(c=><td key={c.key} style={{padding:"10px 12px",color:c.color?c.color(row):P.tx,whiteSpace:"nowrap",borderBottom:`1px solid ${P.bd}40`}}>{c.render?c.render(row):row[c.key]}</td>)}</tr>)}</tbody></table></div>;}
function Modal({title,children,onClose,wide}){return <div style={{position:"fixed",inset:0,background:"#0004",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={onClose}><div style={{background:P.sf,border:`1px solid ${P.bd}`,borderRadius:16,padding:24,maxWidth:wide?850:580,width:"100%",maxHeight:"88vh",overflowY:"auto",boxShadow:"0 20px 60px #0002"}} onClick={e=>e.stopPropagation()}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h3 style={{color:P.tx,margin:0,fontSize:17}}>{title}</h3><Btn v="ghost" onClick={onClose} sm>✕</Btn></div>{children}</div></div>;}

// ─── EXPORTS & IMPRESSIONS ───
function exportCSV(filename,headers,rows){
const sep=";";const esc=v=>{const s=String(v??"");return /[";\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
const content="﻿"+[headers.join(sep),...rows.map(r=>r.map(esc).join(sep))].join("\r\n");
const blob=new Blob([content],{type:"text/csv;charset=utf-8"});
const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);}
const dateTag=()=>new Date().toISOString().slice(0,10);

function printHTML(html){const iframe=document.createElement("iframe");iframe.style.cssText="position:fixed;top:-9999px;left:-9999px;width:800px;height:1100px;";document.body.appendChild(iframe);const dd=iframe.contentDocument;dd.open();dd.write(html);dd.close();
const waitImgs=async()=>{const t0=Date.now();while(Date.now()-t0<7000&&[...dd.images].some(i=>!i.complete))await new Promise(r=>setTimeout(r,200));};
setTimeout(()=>{waitImgs().then(()=>{iframe.contentWindow.focus();iframe.contentWindow.print();setTimeout(()=>document.body.removeChild(iframe),2500);});},300);}

function printLabels(refs,adherents){
const origin=typeof window!=="undefined"?window.location.origin:"";
const labels=refs.map(r=>{const a=adherents.find(x=>x.id===r.adherentId);const url=`${origin}/stock/fiche/${r.id}`;
return `<div class="lab"><img src="https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}&margin=1"/><div class="d">${String(r.designation||"").replace(/</g,"&lt;")}</div><div class="ref">${r.id}</div><div class="i">${String(a?.name||"").replace(/</g,"&lt;")}</div><div class="i">${r.volume||""} ${r.couleur||""} — ${r.droitsAccise==="Droit suspendu"?"Droit suspendu":"Droit acquitté"}${r.emplacement?" — "+r.emplacement:""}</div></div>`;}).join("");
printHTML(`<!DOCTYPE html><html><head><meta charset=utf-8><title>Étiquettes QR — Planet’Stock</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif}.lab{height:96vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:8mm;padding:10mm;page-break-after:always}.lab:last-child{page-break-after:auto}.lab img{width:110mm;height:110mm}.d{font-size:20pt;font-weight:700;line-height:1.25;max-width:170mm}.ref{font-size:16pt;font-family:monospace;letter-spacing:2px;color:#333}.i{font-size:12pt;color:#555}</style></head><body>${labels}</body></html>`);}

function printDRM(mois,drmData){
const rows=dr=>`<tr><td>📦 Stock début de période</td><td class="ar">${dr.stockDebut.toLocaleString("fr")}</td><td class="ar">${dr.stockDebutHL}</td></tr>
<tr><td>📥 Entrées (réceptions)</td><td class="ar">+${dr.entreesBtl.toLocaleString("fr")}</td><td class="ar">+${dr.entreesHL}</td></tr>
<tr><td>📤 Sorties (expéditions)</td><td class="ar">-${dr.sortiesBtl.toLocaleString("fr")}</td><td class="ar">-${dr.sortiesHL}</td></tr>
<tr><td>📉 Pertes & manquants</td><td class="ar">-${dr.pertesBtl.toLocaleString("fr")}</td><td class="ar">-${dr.pertesHL}</td></tr>
<tr class="tot"><td><b>Stock fin de période (théorique)</b></td><td class="ar"><b>${dr.stockFin.toLocaleString("fr")}</b></td><td class="ar"><b>${dr.stockFinHL}</b></td></tr>`;
const blocks=drmData.map(dr=>`<h3>${dr.regime} — ${dr.nbRefs} référence(s)</h3><table><thead><tr><th>Ligne DRM</th><th class="ar">Bouteilles</th><th class="ar">Hectolitres</th></tr></thead><tbody>${rows(dr)}</tbody></table>`).join("");
printHTML(`<!DOCTYPE html><html><head><meta charset=utf-8><title>DRM ${mois} — Planet’Stock</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;padding:14mm;color:#1a1a1a}h1{font-size:16pt;margin-bottom:2mm}h2{font-size:10pt;color:#555;font-weight:400;margin-bottom:8mm}h3{font-size:11pt;margin:6mm 0 2mm}table{width:100%;border-collapse:collapse;margin-bottom:4mm}th,td{border:1px solid #ccc;padding:2.5mm 3mm;font-size:9pt;text-align:left}th{background:#f0f5fa}.ar{text-align:right}.tot td{background:#f0f5fa}</style></head><body><h1>Déclaration Récapitulative Mensuelle (DRM)</h1><h2>PLANET AURA — Période : ${mois} — À transmettre via CIEL avant le 10 du mois suivant</h2>${blocks}<p style="font-size:8pt;color:#777;margin-top:6mm">Document préparatoire établi par Planet’Stock, l'application de gestion de stock de Planet Aura.</p></body></html>`);}

// ─── IMPORT DA (Document d'accompagnement PDF → demande de sortie) ───
async function extractPdfItems(file){
const pdfjsLib=await import("pdfjs-dist");
const workerUrl=(await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
pdfjsLib.GlobalWorkerOptions.workerSrc=workerUrl;
const doc=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
const items=[];
for(let p=1;p<=doc.numPages;p++){const page=await doc.getPage(p);const tc=await page.getTextContent();
tc.items.forEach(it=>{if(it.str&&it.str.trim())items.push({str:it.str,x:it.transform[4],y:it.transform[5]+(doc.numPages-p)*10000});});}
return items;}

function parseDA(items){
const rows=[];
[...items].sort((a,b)=>b.y-a.y||a.x-b.x).forEach(it=>{const row=rows.find(r=>Math.abs(r.y-it.y)<3);if(row)row.items.push(it);else rows.push({y:it.y,items:[it]});});
rows.forEach(r=>r.items.sort((a,b)=>a.x-b.x));
const findRow=pred=>rows.find(r=>r.items.some(i=>pred(i.str)));
const headerRow=findRow(s=>/^\s*Designation\s*$/i.test(s));
const totalRow=findRow(s=>/Total\s+Bottles/i.test(s));
// ORIGINATOR (adhérent) et DELIVERY TO (destinataire) : blocs côte à côte
const labRow=findRow(s=>/ORIGINATOR/i.test(s));
let originator="",delivery="";
if(labRow){
const delItem=labRow.items.find(i=>/DELIVERY/i.test(i.str));
const below=rows.filter(r=>r.y<labRow.y-2).sort((a,b)=>b.y-a.y)[0];
if(below){
originator=below.items.filter(i=>!delItem||i.x<delItem.x-10).map(i=>i.str).join(" ").trim();
if(delItem)delivery=below.items.filter(i=>i.x>=delItem.x-10).map(i=>i.str).join(" ").trim();
}}
// Total Bottles déclaré (contrôle de cohérence)
let totalDeclared=null;
if(totalRow){const joined=totalRow.items.map(i=>i.str).join(" ");const m=joined.match(/Total\s+Bottles\s*:?\s*(\d+)/i);
if(m)totalDeclared=+m[1];
else{const idx=totalRow.items.findIndex(i=>/Total\s+Bottles/i.test(i.str));const nxt=totalRow.items[idx+1];if(nxt&&/^\d{1,4}$/.test(nxt.str.trim()))totalDeclared=+nxt.str.trim();}}
// Lignes produits : entre l'entête du tableau et la ligne Total Bottles
const lines=[];
if(headerRow&&totalRow){
rows.filter(r=>r.y<headerRow.y-2&&r.y>totalRow.y+2).forEach(r=>{
const strs=r.items.map(i=>i.str.trim()).filter(Boolean);
if(!strs.length)return;
const joined=strs.join(" ");
if(!joined.includes("€"))return; // pas une ligne produit
const firstEuro=strs.findIndex(s=>s.includes("€"));
let qty=null;
for(let i=(firstEuro<0?strs.length:firstEuro)-1;i>=0;i--){if(/^\d{1,4}$/.test(strs[i])&&!/^\d{8}$/.test(strs[i])){qty=+strs[i];break;}}
let cut=strs.findIndex(s=>/WINE|CRD/i.test(s)||/^\d{8}$/.test(s));
if(cut<0)cut=Math.max(1,strs.length-6);
const designation=strs.slice(0,cut).join(" ").trim();
if(designation&&qty!=null&&qty>0)lines.push({designation,qty});
});}
return{originator,delivery,lines,totalDeclared};}

// Répartition automatique en colis standards (12, 6, 3, 2, 1 bouteilles)
function calcColisage(total){const parts=[];let rest=total;
for(const sz of[12,6,3,2,1]){const n=Math.floor(rest/sz);if(n>0){parts.push({sz,n});rest-=n*sz;}}
return parts;}
const colisageLabel=parts=>parts.map(p=>`${p.n}× ${p.sz===1?"1 bouteille":p.sz+" bouteilles"}`).join(", ");

// Correspondance désignation DA ↔ référence en stock (tolérante accents/casse/ordre)
const normTxt=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const STOP_DA=new Set(["de","la","le","les","des","du","et","en","sur","the"]);
function matchRef(designation,refs){
const t=normTxt(designation).split(" ").filter(w=>w.length>1&&!STOP_DA.has(w));
if(!t.length)return{ref:null,score:0};
let best=null,bestScore=0;
refs.forEach(r=>{const rt=new Set(normTxt(r.designation).split(" "));const hit=t.filter(w=>rt.has(w)).length;const score=hit/t.length;if(score>bestScore){bestScore=score;best=r;}});
return{ref:bestScore>=0.55?best:null,score:bestScore};}

// ─── RESPONSIVE ───
function useIsMobile(){const[m,setM]=useState(typeof window!=="undefined"&&window.innerWidth<768);useEffect(()=>{const f=()=>setM(window.innerWidth<768);window.addEventListener("resize",f);return()=>window.removeEventListener("resize",f);},[]);return m;}

// ─── PHOTOS & TRAÇABILITÉ ───
function PhotoManager({photos=[],onChange,user,dossier="divers"}){
const[busy,setBusy]=useState(false);const[view,setView]=useState(null);const fileRef=useRef(null);const camRef=useRef(null);
const add=async e=>{const files=[...(e.target.files||[])];if(!files.length)return;setBusy(true);
try{const news=[];for(const f of files){const p=await uploadPhoto(f,dossier);news.push({...p,date:new Date().toISOString(),user:user||"—"});}
onChange([...(photos||[]),...news],`${news.length} photo(s) ajoutée(s)`);}catch(err){alert("Échec de l'envoi : "+(err?.message||err));}
setBusy(false);if(fileRef.current)fileRef.current.value="";};
const del=async p=>{try{await deletePhoto(p.path);}catch{}onChange((photos||[]).filter(x=>x!==p),"Photo supprimée");setView(null);};
return <div>
<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
<div style={{fontSize:10,color:P.tm,fontWeight:600,textTransform:"uppercase",flex:1}}>📷 Photos ({(photos||[]).length})</div>
<input ref={camRef} type="file" accept="image/*" capture="environment" onChange={add} style={{display:"none"}}/>
<input ref={fileRef} type="file" accept="image/*" multiple onChange={add} style={{display:"none"}}/>
<Btn v="secondary" sm dis={busy} onClick={()=>camRef.current?.click()}>{busy?"⏳ Envoi...":"📷 Prendre une photo"}</Btn>
<Btn v="secondary" sm dis={busy} onClick={()=>fileRef.current?.click()}>🖼️ Galerie</Btn>
</div>
{(photos||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6}}>
{(photos||[]).map((p,i)=><img key={i} src={p.url} alt="" onClick={()=>setView(p)} style={{width:72,height:72,objectFit:"cover",borderRadius:8,border:`1px solid ${P.bd}`,cursor:"pointer"}}/>)}
</div>}
{view&&<div style={{position:"fixed",inset:0,background:"#000c",zIndex:2000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setView(null)}>
<img src={view.url} alt="" style={{maxWidth:"96vw",maxHeight:"76vh",borderRadius:10}} onClick={e=>e.stopPropagation()}/>
<div style={{color:"#fff",fontSize:11,margin:"10px 0"}}>Ajoutée par {view.user||"—"} le {view.date?new Date(view.date).toLocaleString("fr"):"—"}</div>
<div style={{display:"flex",gap:8}} onClick={e=>e.stopPropagation()}>
<Btn v="danger" sm onClick={()=>del(view)}>🗑️ Supprimer</Btn>
<Btn v="secondary" sm onClick={()=>setView(null)}>Fermer</Btn>
</div>
</div>}
</div>;}

function Historique({hist}){if(!(hist||[]).length)return null;
return <div style={{borderTop:`1px solid ${P.bd}`,paddingTop:10,marginTop:10}}>
<div style={{fontSize:10,fontWeight:600,color:P.tm,marginBottom:6}}>🕓 HISTORIQUE DES MODIFICATIONS</div>
<div style={{maxHeight:180,overflowY:"auto"}}>
{[...hist].reverse().map((h,i)=><div key={i} style={{fontSize:11,padding:"6px 0",borderBottom:`1px solid ${P.bd}30`}}>
<div style={{color:P.tm,fontSize:10}}>{new Date(h.date).toLocaleString("fr")} — <b style={{color:P.ac}}>{h.user}</b></div>
{(h.changes||[]).map((c,j)=><div key={j} style={{color:P.tx}}>• {c.champ} : <span style={{color:P.rd,textDecoration:"line-through"}}>{String(c.avant??"—")||"—"}</span> → <span style={{color:P.gn,fontWeight:600}}>{String(c.apres??"—")||"—"}</span></div>)}
{h.note&&<div style={{color:P.tx}}>• {h.note}</div>}
</div>)}
</div>
</div>;}

function diffChamps(av,ap,labels){const ch=[];Object.keys(labels).forEach(k=>{if(String(av[k]??"")!==String(ap[k]??""))ch.push({champ:labels[k],avant:av[k],apres:ap[k]});});return ch;}

// ─── INVOICE ───
function printInvoice(f,a){const html=`<!DOCTYPE html><html><head><meta charset=utf-8><title>Relevé ${f.numero}</title><style>@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'DM Sans',sans-serif;color:#1a1a1a;padding:40px;max-width:780px;margin:0 auto}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px}.box{border:1.5px solid #d0d5dd;border-radius:8px;padding:12px;font-size:11px;line-height:1.6}.box b{display:block;font-size:10px;color:#555;margin-bottom:2px;text-transform:uppercase}table{width:100%;border-collapse:collapse;margin:20px 0}th{background:#f0f5fa;padding:10px 14px;text-align:left;font-size:11px;font-weight:600;border:1.5px solid #d0d5dd}td{padding:9px 14px;border:1.5px solid #d0d5dd;font-size:12px}.ar{text-align:right}.tot td{font-weight:700;background:#f0f5fa}.gt td{font-weight:700;font-size:13px;background:#e2e8f0}.ft{margin-top:24px;border-top:2px solid #3b9abf;padding-top:12px;font-size:8px;color:#777;text-align:center}@media print{button{display:none!important}}</style></head><body><div style="display:flex;align-items:center;gap:14px;margin-bottom:20px"><img src="${CURRENT_LOGO}" width="60" height="60" style="border-radius:50%"/><div style="font-size:26px;font-weight:700">Relevé de prestations</div></div><div class="grid"><div class="box"><strong>PLANET AURA</strong><br>5 IMPASSE FRANÇOIS ARAGO<br>81100 CASTRES<br>TVA: FR548006244636<br>SIRET: 85062463600021<br>contact@planet-aura.com<div style="border-top:1px solid #e0e0e0;padding-top:6px;margin-top:6px"><b>Date</b>: ${f.date}<br><b>Relevé N°</b>: ${f.numero}<br><b>Réf</b>: ${f.refSource||"—"}</div></div><div><div class="box" style="margin-bottom:10px"><b>Adhérent</b>${a?.name||""}<br>${a?.adresse||""}</div><div class="box"><b>Détails</b>${f.type} — ${f.nbBouteilles} btls<br>${f.colisageDetail||""}${f.destinataire?`<br>→ ${f.destinataire}`:""}</div></div></div><table><thead><tr><th>Description</th><th class="ar">€ HT</th></tr></thead><tbody>${(f.lignes||[]).map(l=>`<tr><td>${l.desc}</td><td class="ar">${l.montant.toFixed(2)}</td></tr>`).join("")}<tr class="tot"><td>Total HT</td><td class="ar">${f.totalHT.toFixed(2)}</td></tr><tr class="tot"><td>TVA 20%</td><td class="ar">${f.tva.toFixed(2)}</td></tr><tr class="gt"><td><b>Total TTC</b></td><td class="ar"><b>${f.totalTTC.toFixed(2)} €</b></td></tr></tbody></table><div style="margin-top:16px;font-size:10px;color:#555;border:1.5px dashed #d0d5dd;border-radius:8px;padding:10px"><b>Document non valant facture.</b> Ce relevé de prestations est établi à titre informatif et sert de base à la facturation. La facture correspondante est émise séparément.</div><div class="ft">PLANET AURA, SARL — RCS Castres — SIRET: 85062463600021 — 8 Rue Neuve du Travet, 81100 CASTRES</div></body></html>`;const iframe=document.createElement("iframe");iframe.style.cssText="position:fixed;top:-9999px;left:-9999px;width:800px;height:1100px;";document.body.appendChild(iframe);const d=iframe.contentDocument;d.open();d.write(html);d.close();iframe.onload=()=>{setTimeout(()=>{iframe.contentWindow.focus();iframe.contentWindow.print();setTimeout(()=>document.body.removeChild(iframe),2000);},400);};}
function InvoiceView({facture:f,adherent:a,onClose}){const isValidee=(f.statut||"Validée")==="Validée";const isPending=f.statut==="En attente";const isRejetee=f.statut==="Rejetée";
return <Modal title={`Relevé ${f.numero}`} onClose={onClose} wide>
{isPending&&<div style={{background:P.ams,border:`1px solid ${P.am}40`,borderRadius:8,padding:12,marginBottom:12,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>⏳</span><div style={{fontSize:12,fontWeight:600,color:P.am}}>Relevé en attente de validation admin</div></div>}
{isRejetee&&<div style={{background:P.rds,border:`1px solid ${P.rd}40`,borderRadius:8,padding:12,marginBottom:12,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>❌</span><div style={{fontSize:12,fontWeight:600,color:P.rd}}>Relevé rejeté{f.validePar?` par ${f.validePar}`:""}</div></div>}
{isValidee&&f.validePar&&<div style={{background:P.gns,border:`1px solid ${P.gn}40`,borderRadius:8,padding:12,marginBottom:12,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>✅</span><div style={{fontSize:12,color:P.gn}}><b>Validé</b> par {f.validePar} le {f.valideDate?new Date(f.valideDate).toLocaleDateString("fr"):""}</div></div>}
<div style={{background:P.bg,borderRadius:10,padding:20,marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><div><div style={{fontSize:10,color:P.tm}}>Relevé N°</div><div style={{fontSize:18,fontWeight:700,color:P.ac}}>{f.numero}</div></div><div style={{textAlign:"right"}}><div style={{fontSize:10,color:P.tm}}>Date</div><div style={{fontSize:14,fontWeight:600}}>{f.date}</div></div></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,fontSize:12,marginBottom:14}}><div><span style={{color:P.tm,fontSize:10}}>Adhérent</span><br/>{a?.name}</div><div><span style={{color:P.tm,fontSize:10}}>Type</span><br/><Badge color={f.type==="Mensuelle"?"ac":f.type==="Entrée"?"bl":f.type==="Sortie"?"am":"gn"}>{f.type==="Mensuelle"?"💶 Mensuelle":f.type}</Badge></div><div><span style={{color:P.tm,fontSize:10}}>Btls</span><br/>{f.nbBouteilles}</div></div><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr><th style={{textAlign:"left",padding:"8px 10px",borderBottom:`2px solid ${P.bd}`,color:P.tm,fontSize:10}}>DESCRIPTION</th><th style={{textAlign:"right",padding:"8px 10px",borderBottom:`2px solid ${P.bd}`,color:P.tm,fontSize:10}}>€ HT</th></tr></thead><tbody>{(f.lignes||[]).map((l,i)=><tr key={i}><td style={{padding:"7px 10px",borderBottom:`1px solid ${P.bd}40`}}>{l.desc}</td><td style={{padding:"7px 10px",textAlign:"right",borderBottom:`1px solid ${P.bd}40`}}>{l.montant.toFixed(2)}</td></tr>)}<tr><td style={{padding:"10px",fontWeight:700,borderTop:`2px solid ${P.bd}`}}>Total HT</td><td style={{padding:"10px",textAlign:"right",fontWeight:700,borderTop:`2px solid ${P.bd}`}}>{f.totalHT.toFixed(2)} €</td></tr><tr><td style={{padding:"5px 10px",color:P.tm}}>TVA 20%</td><td style={{padding:"5px 10px",textAlign:"right",color:P.tm}}>{f.tva.toFixed(2)} €</td></tr><tr><td style={{padding:"10px",fontWeight:700,fontSize:15,color:P.ac}}>Total TTC</td><td style={{padding:"10px",textAlign:"right",fontWeight:700,fontSize:15,color:P.ac}}>{f.totalTTC.toFixed(2)} €</td></tr></tbody></table></div>
{isValidee?<Btn onClick={()=>printInvoice(f,a)} style={{width:"100%"}}>🖨️ Imprimer / Télécharger PDF</Btn>:<div style={{textAlign:"center",padding:12,color:P.tm,fontSize:12}}>{isPending?"⏳ Impression disponible après validation admin":"❌ Relevé rejeté — corrigez-le (✏️) puis faites-le valider"}</div>}
<Historique hist={f.historique}/>
</Modal>;}

// ─── SCAN VERIFICATION (qty capped) ───
function ScanModal({sortie,references,onValidate,onClose}){
const refsToScan=Object.entries(sortie.refsDetail||{}).filter(([,q])=>+q>0).map(([refId,q])=>({refId,need:+q}));
const [scanned,setScanned]=useState({});const [inp,setInp]=useState("");const [res,setRes]=useState(null);const [qty,setQty]=useState("");
const [mode,setMode]=useState("scan");// "scan" = scannette (+1 par scan) | "qty" = scan puis saisie quantité
const [cam,setCam]=useState(false);
const videoRef=useRef(null);const streamRef=useRef(null);const lastScanRef=useRef({code:"",t:0});
const allDone=refsToScan.every(r=>(scanned[r.refId]||0)>=r.need);

// Retour sonore + vibration (comme une vraie scannette)
const beep=ok=>{try{const ctx=new (window.AudioContext||window.webkitAudioContext)();const o=ctx.createOscillator();const g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=ok?880:200;g.gain.value=.15;o.start();setTimeout(()=>{try{o.stop();ctx.close();}catch{}},ok?90:280);}catch{}
try{navigator.vibrate&&navigator.vibrate(ok?60:[120,60,120]);}catch{}};

// Le QR des bouteilles contient l'URL complète → on en extrait la REF
const extractRef=txt=>{const t=(txt||"").trim();const m=t.match(/\/stock\/fiche\/([A-Za-z0-9_-]+)/i);return (m?decodeURIComponent(m[1]):t).toUpperCase();};

const handleCode=code=>{
const exp=refsToScan.find(r=>r.refId===code);
if(!exp){const ex=references.find(r=>r.id===code);setRes({ok:false,msg:ex?`❌ MAUVAISE BOUTEILLE — ${ex.designation} ne fait PAS partie de cette sortie !`:`❌ Code inconnu : ${code}`});beep(false);return;}
const already=scanned[code]||0;
if(already>=exp.need){setRes({ok:false,msg:`⚠️ ${code} déjà complet (${already}/${exp.need}) — reposez cette bouteille`});beep(false);return;}
if(mode==="scan"){const nv=already+1;setScanned(s=>({...s,[code]:nv}));setRes({ok:true,refId:code,auto:true,count:nv,need:exp.need});beep(true);}
else{setRes({ok:true,refId:code});setQty(String(exp.need-already));beep(true);}};

const doScan=()=>{const code=extractRef(inp);setInp("");if(!code)return;handleCode(code);};
const confirmQty=()=>{if(!res?.ok)return;const q=+qty;if(q<=0)return;const ref=refsToScan.find(r=>r.refId===res.refId);const already=scanned[res.refId]||0;const max=ref.need-already;const actual=Math.min(q,max);setScanned({...scanned,[res.refId]:already+actual});setRes(null);setQty("");};
const maxForCurrent=res?.ok&&!res.auto?refsToScan.find(r=>r.refId===res.refId)?.need-(scanned[res.refId]||0):0;

// ─── Caméra (scan QR en direct via jsQR) ───
const stopCam=()=>{try{streamRef.current?.getTracks().forEach(t=>t.stop());}catch{}streamRef.current=null;setCam(false);};
const startCam=async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});streamRef.current=stream;setCam(true);}catch(e){alert("Caméra inaccessible : "+(e?.message||e)+"\nUtilisez le champ de saisie ou une douchette USB/Bluetooth.");}};
useEffect(()=>{if(cam&&videoRef.current&&streamRef.current){videoRef.current.srcObject=streamRef.current;videoRef.current.play().catch(()=>{});}},[cam]);
useEffect(()=>{
if(!cam)return;
let stop=false;const canvas=document.createElement("canvas");const ctx=canvas.getContext("2d",{willReadFrequently:true});
let jsqr=null;import("jsqr").then(m=>{jsqr=m.default||m;});
const tick=()=>{if(stop)return;
const v=videoRef.current;
if(jsqr&&v&&v.readyState===4&&v.videoWidth>0){
canvas.width=v.videoWidth;canvas.height=v.videoHeight;ctx.drawImage(v,0,0);
try{const img=ctx.getImageData(0,0,canvas.width,canvas.height);const q=jsqr(img.data,img.width,img.height,{inversionAttempts:"dontInvert"});
if(q&&q.data){const code=extractRef(q.data);const now=Date.now();
if(!(lastScanRef.current.code===code&&now-lastScanRef.current.t<1600)){lastScanRef.current={code,t:now};handleCode(code);}}}catch{}}
setTimeout(tick,170);};
tick();return()=>{stop=true;};
},[cam,mode,scanned]);
useEffect(()=>()=>{try{streamRef.current?.getTracks().forEach(t=>t.stop());}catch{}},[]);

return <Modal title="🔍 Vérification Picking" onClose={()=>{stopCam();onClose();}} wide>
<div style={{fontSize:12,color:P.tm,marginBottom:10}}>Scannez le QR code de chaque bouteille de la sortie <b style={{color:P.tx}}>{sortie.id}</b> — le logiciel confirme si c'est la bonne.</div>

{/* Mode de comptage */}
<div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
<Btn v={mode==="scan"?"primary":"secondary"} sm onClick={()=>{setMode("scan");setRes(null);setQty("");}}>🔫 Scannette — chaque scan = +1 btl</Btn>
<Btn v={mode==="qty"?"primary":"secondary"} sm onClick={()=>{setMode("qty");setRes(null);}}>⌨️ Scan + saisie de la quantité</Btn>
<Btn v={cam?"danger":"success"} sm onClick={()=>cam?stopCam():startCam()}>{cam?"⏹ Arrêter la caméra":"📷 Scanner à la caméra"}</Btn>
</div>

{/* Vue caméra */}
{cam&&<div style={{position:"relative",marginBottom:10,borderRadius:12,overflow:"hidden",border:`2px solid ${P.ac}`}}>
<video ref={videoRef} playsInline muted style={{width:"100%",maxHeight:280,objectFit:"cover",display:"block",background:"#000"}}/>
<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}><div style={{width:"55%",aspectRatio:"1",border:"3px dashed #fff9",borderRadius:14}}/></div>
</div>}

{/* Saisie manuelle / douchette */}
<div style={{display:"flex",gap:8,marginBottom:12}}><input value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doScan()} placeholder="Douchette ou saisie REF..." style={{flex:1,fontFamily:"monospace",fontSize:16,background:P.bg,color:P.tx,border:`2px solid ${P.ac}`,borderRadius:8,padding:"12px 16px",outline:"none",minWidth:0}} autoFocus={!cam}/><Btn onClick={doScan}>Valider</Btn></div>

{res&&!res.ok&&<div style={{background:P.rds,border:`2px solid ${P.rd}`,borderRadius:10,padding:14,marginBottom:12,display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:30}}>🚫</span><div style={{fontWeight:700,color:P.rd,fontSize:14}}>{res.msg}</div></div>}
{res&&res.ok&&res.auto&&<div style={{background:P.gns,border:`2px solid ${P.gn}`,borderRadius:10,padding:14,marginBottom:12,display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:30}}>✅</span><div><div style={{fontWeight:700,color:P.gn,fontSize:14}}>BONNE BOUTEILLE — {references.find(r=>r.id===res.refId)?.designation}</div><div style={{fontSize:12,color:P.tm}}>Comptée : <b style={{color:P.gn}}>{res.count} / {res.need}</b>{res.count>=res.need?" — référence complète ✔":" — scannez la suivante"}</div></div></div>}
{res&&res.ok&&!res.auto&&<div style={{background:P.gns,border:`2px solid ${P.gn}`,borderRadius:10,padding:14,marginBottom:12}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><span style={{fontSize:30}}>✅</span><div><div style={{fontWeight:700,color:P.gn,fontSize:14}}>BONNE BOUTEILLE — {references.find(r=>r.id===res.refId)?.designation}</div><div style={{fontSize:11,color:P.tm}}>Restant à préparer : <b>{maxForCurrent}</b> btls</div></div></div><div style={{display:"flex",gap:8,alignItems:"center"}}><input type="number" min="1" max={maxForCurrent} value={qty} onChange={e=>{const v=Math.min(+e.target.value,maxForCurrent);setQty(v>0?String(v):"");}} onKeyDown={e=>e.key==="Enter"&&confirmQty()} style={{width:90,fontFamily:"monospace",fontSize:18,background:P.bg,color:P.tx,border:`2px solid ${P.gn}`,borderRadius:8,padding:"10px 14px",textAlign:"center",outline:"none"}}/><Btn v="success" onClick={confirmQty}>Valider {qty} btls</Btn></div></div>}

<div style={{background:P.bg,borderRadius:10,padding:12}}><div style={{fontSize:10,color:P.tm,fontWeight:600,marginBottom:6}}>RÉCAP PICKING — {refsToScan.reduce((s,r)=>s+Math.min(scanned[r.refId]||0,r.need),0)} / {refsToScan.reduce((s,r)=>s+r.need,0)} btls</div>
{refsToScan.map(r=>{const ref=references.find(x=>x.id===r.refId);const done=(scanned[r.refId]||0)>=r.need;const partial=(scanned[r.refId]||0)>0&&!done;return <div key={r.refId} style={{display:"flex",alignItems:"center",gap:8,padding:"8px",borderRadius:8,marginBottom:3,background:done?P.gns:partial?P.ams:P.sf}}><span style={{fontSize:18,width:24,textAlign:"center"}}>{done?"✅":partial?"🔄":"⬜"}</span><QRCode refId={r.refId} size={30}/><div style={{flex:1}}><div style={{fontWeight:600,fontSize:11}}>{ref?.designation||r.refId}</div><div style={{fontSize:9,color:P.tm}}>{r.refId}</div></div><div style={{fontWeight:700,fontSize:13,color:done?P.gn:P.tx}}>{scanned[r.refId]||0} / {r.need}</div></div>;})}
</div>
{allDone?<Btn v="success" onClick={()=>{stopCam();onValidate();}} style={{width:"100%",marginTop:12,padding:"14px",fontSize:15}}>✅ Picking validé — Confirmer</Btn>:<div style={{textAlign:"center",padding:8,color:P.tm,fontSize:11,marginTop:8}}>Scannez toutes les bouteilles pour pouvoir valider</div>}
</Modal>;}

// ═══ CSV IMPORT (Admin only) ═══
const CSV_TEMPLATES={
references:"adherentId;designation;nomenclature;couleur;volume;alcool;prixUnitaire;droitsAccise;condStock;emplacement;alertStock;nbBouteilles\nADH001;Cuvee Prestige 2020;AOP;Rouge;75cl;13.5;45;Droit acquitte;Espace 12 btls;Z1-R1-E1;12;24\nADH001;Rose Ete 2022;IGP;Rose;75cl;12;18;Droit suspendu;Palette;;50;300",
entrees:"adherentId;date;conditionnement;nbPalettes;nbColis;nbBouteilles;nbReferences\nADH001;2026-04-28;Colis;0;6;36;2\nADH001;2026-04-28;Palette;2;0;600;1",
sorties:"adherentId;date;destinataire;colisage;transportPA;assurancePA;refId;nbBouteilles\nADH001;2026-04-28;Jean Dupont;Colis;OUI;OUI;REF0001;12\nADH001;2026-04-28;Jean Dupont;Colis;OUI;OUI;REF0002;6"
};

function downloadTemplate(type){const content=CSV_TEMPLATES[type];const blob=new Blob(["\ufeff"+content],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`modele_${type}.csv`;a.click();URL.revokeObjectURL(url);}

function parseCSV(text){const lines=text.trim().split("\n").map(l=>l.trim()).filter(Boolean);if(lines.length<2)return[];const sep=lines[0].includes(";")?";":lines[0].includes("\t")?"\t":",";const headers=lines[0].split(sep).map(h=>h.trim());return lines.slice(1).map(line=>{const vals=line.split(sep).map(v=>v.trim());const obj={};headers.forEach((h,i)=>{obj[h]=vals[i]||"";});return obj;});}

function ImportCSV({data:d,setData:sD,currentUser:cu,onClose}){
const[importType,setImportType]=useState("references");const[csvText,setCsvText]=useState("");const[parsed,setParsed]=useState([]);const[result,setResult]=useState(null);const[importing,setImporting]=useState(false);
const fileRef=useRef(null);

const handleFile=e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{const txt=ev.target?.result||"";setCsvText(txt);const rows=parseCSV(txt);setParsed(rows);setResult(null);};reader.readAsText(file,"utf-8");};

const doImport=()=>{if(!parsed.length)return;setImporting(true);const nd={...d};let count=0;let skipped=0;
// Accepte l'identifiant (ADH001) OU le nom exact de l'adhérent, insensible à la casse
const resolveAdh=x=>{const n=(x||"").trim().toLowerCase();return (nd.adherents||[]).find(a=>a.id.toLowerCase()===n)||(nd.adherents||[]).find(a=>(a.name||"").trim().toLowerCase()===n);};

if(importType==="references"){
parsed.forEach(row=>{
  if(!row.adherentId||!row.designation){skipped++;return;}
  const adhR=resolveAdh(row.adherentId);
  if(!adhR){skipped++;return;}
  const id="REF"+String((nd.references?.length||0)+1).padStart(4,"0");
  nd.references=[...(nd.references||[]),{id,adherentId:adhR.id,designation:row.designation,nomenclature:row.nomenclature||"AOP",couleur:row.couleur||"Rouge",volume:row.volume||"75cl",alcool:row.alcool||"",prixUnitaire:+(row.prixUnitaire||0),droitsAccise:row.droitsAccise||"Droit suspendu",condStock:row.condStock||"Espace 12 btls",emplacement:row.emplacement||"",alertStock:+(row.alertStock||0),stockActuel:+(row.nbBouteilles||0),mouvements:[{date:new Date().toISOString(),type:"Import CSV",qty:+(row.nbBouteilles||0),user:cu?.nom||"Admin"}],creeLe:new Date().toISOString()}];
  count++;
});
}

if(importType==="entrees"){
parsed.forEach(row=>{
  if(!row.adherentId||!row.date){skipped++;return;}
  const adh=resolveAdh(row.adherentId);
  if(!adh){skipped++;return;}
  const id=`#E${nd.nextEntreeId||1}`;nd.nextEntreeId=(nd.nextEntreeId||1)+1;
  const cond=row.conditionnement||"Colis";const nbPal=+(row.nbPalettes||0);const nbCol=+(row.nbColis||0);const nbBtl=+(row.nbBouteilles||0);const nbRef=+(row.nbReferences||1);
  const mt=calcEntree(adh.grille,cond,nbPal,nbRef,nbCol);
  nd.entrees=[...(nd.entrees||[]),{id,adherentId:adh.id,cond,nbPal,nbCol,nbBtl,nbRef,date:row.date,montant:mt,factureNum:null,creePar:cu?.nom||"Admin",creeLe:new Date().toISOString()}];
  count++;
});
}

if(importType==="sorties"){
// Group by adherentId+date+destinataire to create one sortie per group
const groups={};
parsed.forEach(row=>{
  if(!row.adherentId||!row.refId){skipped++;return;}
  const adhS=resolveAdh(row.adherentId);
  if(!adhS){skipped++;return;}
  const key=`${adhS.id}|${row.date||""}|${row.destinataire||""}`;
  if(!groups[key])groups[key]={adherentId:adhS.id,date:row.date||new Date().toISOString().slice(0,10),destinataire:row.destinataire||"",colisage:row.colisage||"Colis",tpa:(row.transportPA||"").toUpperCase()==="OUI",apa:(row.assurancePA||"").toUpperCase()==="OUI",refs:{}};
  groups[key].refs[row.refId]=(groups[key].refs[row.refId]||0)+ Number(row.nbBouteilles||0);
});
Object.values(groups).forEach(g=>{
  const id=`#S${nd.nextSortieId||1}`;nd.nextSortieId=(nd.nextSortieId||1)+1;
  const totalBtls=Object.values(g.refs).reduce((s,v)=>s+v,0);
  const nbRefs=Object.keys(g.refs).length;
  const adh=nd.adherents.find(a=>a.id===g.adherentId);
  const mt=adh?calcSortie(adh.grille,g.tpa,g.apa,g.colisage,totalBtls,nbRefs,Math.ceil(totalBtls/6),0):0;
  // Destock
  Object.entries(g.refs).forEach(([refId,qty])=>{const ri=nd.references.findIndex(r=>r.id===refId);if(ri>=0){nd.references=[...nd.references];nd.references[ri]={...nd.references[ri],stockActuel:Math.max(0,nd.references[ri].stockActuel-qty),mouvements:[...(nd.references[ri].mouvements||[]),{date:new Date().toISOString(),type:`Sortie ${id} (import)`,qty:-qty,user:cu?.nom||"Admin"}]};}});
  nd.sorties=[...(nd.sorties||[]),{id,adherentId:g.adherentId,date:g.date,type:"Import CSV",colType:g.colisage,colisageDetail:`Import ${totalBtls} btls`,tpa:g.tpa,apa:g.apa,nbBouteilles:totalBtls,nbRefs,nbColis:Math.ceil(totalBtls/6),destinataire:g.destinataire,montant:mt,statut:"En préparation",creePar:cu?.nom||"Admin",refsDetail:g.refs,scanValide:false,stockDecremente:true}];
  count++;
});
}

nd.auditLog=[...(nd.auditLog||[]),{date:new Date().toISOString(),user:cu?.nom||"Admin",role:cu?.role||"admin",module:"Import CSV",action:`Import ${importType} — ${count} ligne(s) importée(s)`}];
sD(nd);setResult({ok:true,count,skipped});setImporting(false);setCsvText("");setParsed([]);};

const types=[{id:"references",label:"🍷 Références",desc:"Importer des fiches vins avec stock initial"},{id:"entrees",label:"📥 Entrées",desc:"Importer des réceptions de marchandise"},{id:"sorties",label:"📤 Sorties",desc:"Importer des sorties de stock"}];

return <Modal title="📥 Import CSV — Administration" onClose={onClose} wide>
<div style={{display:"grid",gap:14}}>

{/* Type selector */}
<div style={{display:"flex",gap:6}}>{types.map(t=><Btn key={t.id} v={importType===t.id?"primary":"secondary"} sm onClick={()=>{setImportType(t.id);setParsed([]);setResult(null);setCsvText("");}}>{t.label}</Btn>)}</div>

{/* Template download */}
<Card style={{background:P.bg}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
<div><div style={{fontSize:12,fontWeight:600,color:P.tx}}>Modèle CSV — {types.find(t=>t.id===importType)?.label}</div>
<div style={{fontSize:11,color:P.tm,marginTop:2}}>{types.find(t=>t.id===importType)?.desc}</div>
<div style={{fontSize:10,color:P.tm,marginTop:4}}>Séparateur : <b>point-virgule (;)</b> — Encodage : <b>UTF-8</b> — Colonne adherentId : <b>identifiant (ADH001) ou nom exact</b> de l'adhérent</div>
</div>
<Btn v="secondary" sm onClick={()=>downloadTemplate(importType)}>⬇️ Télécharger modèle</Btn>
</div>
<div style={{marginTop:10,background:P.sf,borderRadius:6,padding:10,fontSize:10,fontFamily:"monospace",color:P.tm,overflowX:"auto",whiteSpace:"pre",border:`1px solid ${P.bd}`}}>{CSV_TEMPLATES[importType]}</div>
</Card>

{/* File upload */}
<div>
<div style={{fontSize:10,color:P.tm,fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>Charger votre fichier CSV</div>
<div style={{display:"flex",gap:8}}>
<input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{flex:1,fontSize:12,fontFamily:FN,padding:"8px 12px",background:P.bg,border:`2px dashed ${P.bd}`,borderRadius:8,color:P.tx,cursor:"pointer"}}/>
{csvText&&<Btn v="danger" sm onClick={()=>{setCsvText("");setParsed([]);setResult(null);if(fileRef.current)fileRef.current.value="";}}>Effacer</Btn>}
</div>
</div>

{/* Preview */}
{parsed.length>0&&<div>
<div style={{fontSize:10,color:P.tm,fontWeight:600,marginBottom:6}}>APERÇU — {parsed.length} ligne(s) détectée(s)</div>
<div style={{maxHeight:200,overflowY:"auto",background:P.bg,borderRadius:8,border:`1px solid ${P.bd}`}}>
<table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
<thead><tr>{Object.keys(parsed[0]).map(k=><th key={k} style={{padding:"6px 8px",textAlign:"left",borderBottom:`1px solid ${P.bd}`,color:P.tm,fontSize:9,fontWeight:600,whiteSpace:"nowrap"}}>{k}</th>)}</tr></thead>
<tbody>{parsed.slice(0,10).map((row,i)=><tr key={i}>{Object.values(row).map((v,j)=><td key={j} style={{padding:"5px 8px",borderBottom:`1px solid ${P.bd}20`,whiteSpace:"nowrap"}}>{v}</td>)}</tr>)}{parsed.length>10&&<tr><td colSpan={Object.keys(parsed[0]).length} style={{padding:"6px 8px",color:P.tm,fontStyle:"italic"}}>... et {parsed.length-10} ligne(s) de plus</td></tr>}</tbody>
</table>
</div>
</div>}

{/* Validation warnings */}
{parsed.length>0&&importType==="references"&&<div style={{fontSize:11,color:P.tm}}>
{parsed.filter(r=>!r.adherentId).length>0&&<div style={{color:P.rd}}>⚠️ {parsed.filter(r=>!r.adherentId).length} ligne(s) sans adherentId</div>}
{parsed.filter(r=>!r.designation).length>0&&<div style={{color:P.rd}}>⚠️ {parsed.filter(r=>!r.designation).length} ligne(s) sans désignation</div>}
{parsed.filter(r=>r.adherentId&&!d.adherents.find(a=>a.id===r.adherentId)).length>0&&<div style={{color:P.rd}}>⚠️ {parsed.filter(r=>r.adherentId&&!d.adherents.find(a=>a.id===r.adherentId)).length} ligne(s) avec adherentId inconnu</div>}
</div>}

{/* Result */}
{result&&<Card style={{background:result.ok?P.gns:P.rds,border:`1px solid ${result.ok?P.gn:P.rd}40`}}>
<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>{result.ok?"✅":"❌"}</span><div style={{fontWeight:600,color:result.ok?P.gn:P.rd}}>Import terminé — {result.count} élément(s) importé(s){result.skipped>0&&<span style={{color:P.am}}> — ⚠️ {result.skipped} ligne(s) ignorée(s) (adhérent introuvable ou champs obligatoires manquants)</span>}</div></div>
</Card>}

{/* Import button */}
{parsed.length>0&&!result&&<Btn onClick={doImport} dis={importing} style={{width:"100%"}}>
{importing?"⏳ Import en cours...":` Importer ${parsed.length} ${importType}`}
</Btn>}
</div>
</Modal>;}

// ═══ TABS ═══
function Dashboard({data:d,setData:sD,currentUser:cu}){const[showImport,setShowImport]=useState(false);const aa=d.adherents.filter(a=>a.stockageActif);const tB=d.references.reduce((s,r)=>s+(r.stockActuel||0),0);const allE=[];d.espaces.forEach(z=>z.rangs.forEach(r=>r.emplacements.forEach(e=>allE.push(e))));const occ=allE.filter(e=>d.references.some(x=>x.emplacement===e.id&&(x.stockActuel||0)>0)).length;const ca=d.factures.reduce((s,f)=>s+f.totalTTC,0);const isAdmin=cu?.role==="admin";
return <div>
{isAdmin&&<div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}><Btn onClick={()=>setShowImport(true)}>📥 Import CSV</Btn></div>}
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:22}}><Stat label="Adhérents actifs" value={aa.length} icon="👥" color="ac"/><Stat label="Références" value={d.references.length} icon="🍷" color="bl"/><Stat label="Bouteilles" value={tB.toLocaleString("fr")} icon="📦" color="gn"/><Stat label="Empl." value={`${occ}/${allE.length}`} icon="🗄️" color="am"/><Stat label="Prestations TTC" value={`${ca.toFixed(0)} €`} icon="💰" color="gn"/></div>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14}}><Card><h4 style={{color:P.tx,margin:"0 0 12px",fontSize:13}}>Adhérents</h4><Table columns={[{key:"name",label:"Nom"},{key:"b",label:"Btls",render:r=>d.references.filter(x=>x.adherentId===r.id).reduce((s,x)=>s+(x.stockActuel||0),0)},{key:"s",label:"",render:r=><Badge color={r.stockageActif?"gn":"rd"}>{r.stockageActif?"Actif":"Off"}</Badge>}]} data={aa}/></Card><Card><h4 style={{color:P.tx,margin:"0 0 12px",fontSize:13}}>Derniers relevés</h4><Table columns={[{key:"numero",label:"N°"},{key:"type",label:"Type",render:r=><Badge color={r.type==="Entrée"?"bl":r.type==="Sortie"?"am":"gn"}>{r.type}</Badge>},{key:"totalTTC",label:"TTC",render:r=><span style={{fontWeight:700,color:P.gn}}>{r.totalTTC.toFixed(2)}</span>}]} data={[...d.factures].reverse().slice(0,6)}/></Card></div>
{showImport&&<ImportCSV data={d} setData={sD} currentUser={cu} onClose={()=>setShowImport(false)}/>}
</div>;}

function Adherents({data:d,setData:sD}){const[sh,sSh]=useState(false);const[ed,sEd]=useState(null);const[f,sF]=useState({name:"",contact:"",email:"",adresse:"",stockageActif:true});
const open=a=>{sEd(a);sF(a?{name:a.name,contact:a.contact,email:a.email,adresse:a.adresse||"",stockageActif:a.stockageActif}:{name:"",contact:"",email:"",adresse:"",stockageActif:true});sSh(true);};
const doSave=()=>{if(!f.name)return;const nd={...d};if(ed)nd.adherents=nd.adherents.map(a=>a.id===ed.id?{...a,...f}:a);else nd.adherents=[...nd.adherents,{id:"ADH"+String(nd.adherents.length+1).padStart(3,"0"),...f,grille:{...G1}}];sD(nd);sSh(false);};
return <div><div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{color:P.tx,margin:0}}>Adhérents</h3><Btn onClick={()=>open(null)}>+ Adhérent</Btn></div><Card><Table columns={[{key:"id",label:"ID"},{key:"name",label:"Nom"},{key:"contact",label:"Contact"},{key:"email",label:"Email"},{key:"s",label:"Stockage",render:r=><Badge color={r.stockageActif?"gn":"rd"}>{r.stockageActif?"Actif":"Off"}</Badge>},{key:"a",label:"",render:r=><Btn v="ghost" sm onClick={e=>{e.stopPropagation();open(r);}}>✏️</Btn>}]} data={d.adherents}/></Card>
{sh&&<Modal title={ed?"Modifier":"Nouvel Adhérent"} onClose={()=>sSh(false)}><div style={{display:"grid",gap:10}}><Inp label="Nom" value={f.name} onChange={v=>sF({...f,name:v})}/><Inp label="Contact" value={f.contact} onChange={v=>sF({...f,contact:v})}/><Inp label="Email" value={f.email} onChange={v=>sF({...f,email:v})}/><Inp label="Adresse" value={f.adresse} onChange={v=>sF({...f,adresse:v})}/><Inp label="Mot de passe" value={f.mdp||""} onChange={v=>sF({...f,mdp:v})}/><Inp label="Stockage" value={f.stockageActif?"Oui":"Non"} options={["Oui","Non"]} onChange={v=>sF({...f,stockageActif:v==="Oui"})}/><Btn onClick={doSave}>{ed?"Enregistrer":"Créer"}</Btn></div></Modal>}</div>;}

function Entrees({data:d,setData:sD,currentUser:cu}){const[sh,sSh]=useState(false);const[fA,sfA]=useState("");const[ed,sEd]=useState(null);const[ef,sEf]=useState({});
const[f,sF]=useState({adherentId:"",cond:"Colis",nbPal:0,nbCol:0,nbBtl:0,nbRef:1,date:new Date().toISOString().slice(0,10)});
const adh=d.adherents.find(a=>a.id===f.adherentId);const mt=adh?calcEntree(adh.grille,f.cond,+f.nbPal,+f.nbRef,+f.nbCol):0;
const filtered=fA?d.entrees.filter(e=>e.adherentId===fA):d.entrees;
const doSave=()=>{if(!f.adherentId)return;const id=`#E${d.nextEntreeId}`;const g=adh.grille;const lignes=[];if(f.cond==="Palette"){lignes.push({desc:"Forfait palette",montant:g.entree_forfait_palette});if(+f.nbRef===1)lignes.push({desc:`Mono-réf × ${+f.nbPal}`,montant:+f.nbPal*g.entree_par_palette_mono});else lignes.push({desc:`Multi-réf × ${+f.nbRef}`,montant:+f.nbRef*g.entree_par_ref_multi});}else{lignes.push({desc:`Réf × ${+f.nbRef}`,montant:+f.nbRef*g.entree_par_ref_colis});const pay=Math.max(0,+f.nbCol-g.entree_colis_gratuits);if(pay>0)lignes.push({desc:`Colis payants × ${pay}`,montant:pay*g.entree_par_colis_payant});}
const nd={...d,nextEntreeId:d.nextEntreeId+1};nd.entrees=[...nd.entrees,{id,...f,nbPal:+f.nbPal,nbCol:+f.nbCol,nbBtl:+f.nbBtl,nbRef:+f.nbRef,montant:mt,lignes,factureNum:null,creePar:"Admin",creeLe:new Date().toISOString()}];nd.auditLog=[...(nd.auditLog||[]),{date:new Date().toISOString(),user:"Admin",role:"admin",module:"Entrée",action:`Entrée ${id} — ${f.nbBtl} btls — ${mt.toFixed(2)} € HT (à inclure dans le relevé mensuel)`}];sD(nd);sSh(false);};
return <div>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><h3 style={{color:P.tx,margin:0}}>Entrées</h3><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><Btn v="secondary" sm onClick={()=>exportCSV(`entrees_${dateTag()}.csv`,["N°","Date","Adhérent","Conditionnement","Palettes","Colis","Btls","Réfs","Montant HT","Relevé","Créée par"],filtered.map(x=>[x.id,x.date,d.adherents.find(a=>a.id===x.adherentId)?.name||x.adherentId,x.cond,x.nbPal,x.nbCol,x.nbBtl,x.nbRef,(x.montant||0).toFixed(2),x.factureNum||"",x.creePar||""]))}>⬇️ Export</Btn><Btn onClick={()=>sSh(true)}>+ Entrée</Btn></div></div>
<div style={{marginBottom:12}}><Inp label="Filtrer par adhérent" value={fA} options={[{value:"",label:"— Tous —"},...d.adherents.map(a=>({value:a.id,label:a.name}))]} onChange={sfA} sm/></div>
<Card><Table columns={[
{key:"id",label:"Réf"},{key:"adherentId",label:"Adhérent",render:r=>d.adherents.find(a=>a.id===r.adherentId)?.name||""},
{key:"date",label:"Date"},{key:"cond",label:"Cond."},{key:"nbPal",label:"Pal."},{key:"nbCol",label:"Col."},{key:"nbBtl",label:"Btls"},{key:"nbRef",label:"Réfs"},
{key:"montant",label:"€ HT",render:r=>`${r.montant.toFixed(2)}`},{key:"creePar",label:"Par"},
{key:"ph",label:"📷",render:r=>(r.photos||[]).length||""},
{key:"edit",label:"",render:r=><Btn v="ghost" sm onClick={e=>{e.stopPropagation();sEd(r);sEf({date:r.date,cond:r.cond,nbPal:r.nbPal,nbCol:r.nbCol,nbBtl:r.nbBtl,nbRef:r.nbRef});}}>✏️</Btn>},
]} data={filtered}/></Card>
{sh&&<Modal title="Nouvelle Entrée" onClose={()=>sSh(false)}><div style={{display:"grid",gap:10}}>
<Inp label="Adhérent" value={f.adherentId} options={d.adherents.filter(a=>a.stockageActif).map(a=>({value:a.id,label:a.name}))} onChange={v=>sF({...f,adherentId:v})}/>
<Inp label="Date" type="date" value={f.date} onChange={v=>sF({...f,date:v})}/>
<Inp label="Conditionnement" value={f.cond} options={["Palette","Colis"]} onChange={v=>sF({...f,cond:v})}/>
{f.cond==="Palette"&&<Inp label="Nb palettes" type="number" value={f.nbPal} onChange={v=>sF({...f,nbPal:v})}/>}
{f.cond==="Colis"&&<Inp label="Nb colis" type="number" value={f.nbCol} onChange={v=>sF({...f,nbCol:v})}/>}
<Inp label="Nb bouteilles" type="number" value={f.nbBtl} onChange={v=>sF({...f,nbBtl:v})}/>
<Inp label="Nb références" type="number" value={f.nbRef} onChange={v=>sF({...f,nbRef:v})}/>
<Card style={{background:P.acs,border:`1px solid ${P.acb}`}}><div style={{fontSize:11,color:P.tm}}>Montant HT</div><div style={{fontSize:22,fontWeight:700,color:P.ac}}>{mt.toFixed(2)} €</div></Card>
<Btn onClick={doSave} dis={!f.adherentId}>Valider l'entrée</Btn>
</div></Modal>}

{ed&&(()=>{const cur=d.entrees.find(x=>x.id===ed.id)||ed;const adh2=d.adherents.find(a=>a.id===ed.adherentId);const user=cu?.nom||"Admin";
const nm=adh2?calcEntree(adh2.grille,ef.cond,+ef.nbPal||0,+ef.nbRef||0,+ef.nbCol||0):cur.montant;
const doEdit=()=>{const labels={date:"Date",cond:"Conditionnement",nbPal:"Nb palettes",nbCol:"Nb colis",nbBtl:"Nb bouteilles",nbRef:"Nb références"};
const ap={date:ef.date,cond:ef.cond,nbPal:+ef.nbPal||0,nbCol:+ef.nbCol||0,nbBtl:+ef.nbBtl||0,nbRef:+ef.nbRef||0};
const changes=diffChamps(cur,ap,labels);if(nm!==cur.montant)changes.push({champ:"Montant HT",avant:cur.montant.toFixed(2)+" €",apres:nm.toFixed(2)+" €"});
if(!changes.length){sEd(null);return;}
const nd={...d,entrees:d.entrees.map(x=>x.id===ed.id?{...x,...ap,montant:nm,historique:[...(x.historique||[]),{date:new Date().toISOString(),user,changes}]}:x)};
nd.auditLog=[...(nd.auditLog||[]),{date:new Date().toISOString(),user,role:cu?.role||"admin",module:"Entrée",action:`Entrée ${ed.id} modifiée — ${changes.map(c=>c.champ).join(", ")}`}];
sD(nd);sEd(null);};
return <Modal title={`✏️ Modifier ${ed.id}`} onClose={()=>sEd(null)} wide><div style={{display:"grid",gap:10}}>
<div style={{fontSize:11,color:P.tm}}>Adhérent : <b style={{color:P.tx}}>{adh2?.name||ed.adherentId}</b> — créée par {cur.creePar||"—"}</div>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
<Inp label="Date" type="date" value={ef.date} onChange={v=>sEf({...ef,date:v})} sm/>
<Inp label="Conditionnement" value={ef.cond} options={["Palette","Colis"]} onChange={v=>sEf({...ef,cond:v})} sm/>
<Inp label="Nb palettes" type="number" value={ef.nbPal} onChange={v=>sEf({...ef,nbPal:v})} sm/>
<Inp label="Nb colis" type="number" value={ef.nbCol} onChange={v=>sEf({...ef,nbCol:v})} sm/>
<Inp label="Nb bouteilles" type="number" value={ef.nbBtl} onChange={v=>sEf({...ef,nbBtl:v})} sm/>
<Inp label="Nb références" type="number" value={ef.nbRef} onChange={v=>sEf({...ef,nbRef:v})} sm/>
</div>
<div style={{fontSize:11,color:P.tm}}>Montant HT recalculé : <b style={{color:P.ac}}>{nm.toFixed(2)} €</b>{nm!==cur.montant?<span style={{color:P.am}}> (au lieu de {cur.montant.toFixed(2)} €) — le relevé déjà généré n'est pas modifié</span>:null}</div>
<Btn onClick={doEdit}>Enregistrer les modifications</Btn>
<div style={{borderTop:`1px solid ${P.bd}`,paddingTop:10}}>
<PhotoManager photos={cur.photos} dossier="entrees" user={user} onChange={(ph,note)=>{const nd={...d,entrees:d.entrees.map(x=>x.id===ed.id?{...x,photos:ph,historique:[...(x.historique||[]),{date:new Date().toISOString(),user,note}]}:x)};nd.auditLog=[...(nd.auditLog||[]),{date:new Date().toISOString(),user,role:cu?.role||"admin",module:"Entrée",action:`Entrée ${ed.id} — ${note}`}];sD(nd);}}/>
</div>
<Historique hist={cur.historique}/>
</div></Modal>;})()}
</div>;}

function References({data:d,setData:sD,currentUser:cu}){const[dt,sDt]=useState(null);const[sh,sSh]=useState(false);const[fA,sfA]=useState("");const[edR,sEdR]=useState(null);const[rf,sRf]=useState({});
const[q,sQ]=useState("");const[fCoul,sfCoul]=useState("");const[fNom,sfNom]=useState("");const[fAcc,sfAcc]=useState("");const[fCond,sfCond]=useState("");const[fVol,sfVol]=useState("");const[fStock,sfStock]=useState("");
const hasFilters=q||fA||fCoul||fNom||fAcc||fCond||fVol||fStock;
const resetFilters=()=>{sQ("");sfA("");sfCoul("");sfNom("");sfAcc("");sfCond("");sfVol("");sfStock("");};
const[f,sF]=useState({adherentId:"",designation:"",nomenclature:"AOP",couleur:"Rouge",volume:"75cl",alcool:"",prixUnitaire:"",droitsAccise:"Droit suspendu",condStock:"Espace 12 btls",emplacement:"",alertStock:"",nbBtl:0,entreeRef:""});
const noms=["AOP","AOC","IGP","Vin de France","Champagne","Crémant"];const cols=["Rouge","Blanc","Rosé","Effervescent","Liquoreux"];const vols=["37.5cl","50cl","75cl","1L","1.5L Magnum","3L Jéroboam"];
// Occupation dérivée des références : un espace de 12 peut accueillir
// plusieurs réfs, on compte les bouteilles réellement présentes.
const allE=[];d.espaces.forEach(z=>z.rangs.forEach(r=>r.emplacements.forEach(e=>{
const refsHere=d.references.filter(x=>x.emplacement===e.id&&(x.stockActuel||0)>0);
const btlsHere=refsHere.reduce((s,x)=>s+(x.stockActuel||0),0);
const cap=e.cond==="Espace 12 btls"?12:null;
const plein=cap?btlsHere>=cap:refsHere.length>0;
const status=refsHere.length===0?"✅ libre":cap?(btlsHere>=cap?`⛔ plein ${btlsHere}/${cap}`:`🔶 ${btlsHere}/${cap} — ${cap-btlsHere} places libres`):`⛔ occupé (${refsHere.length} réf)`;
allE.push({value:e.id,label:`${z.nom} › ${r.nom} › ${e.nom} (${e.cond}) ${status}`,occupe:plein});
})));
allE.sort((a,b)=>(a.occupe?1:0)-(b.occupe?1:0));
const doSave=()=>{if(!f.adherentId||!f.designation)return;const id="REF"+String(d.references.length+1).padStart(4,"0");const nd={...d};nd.references=[...nd.references,{id,...f,nbBtl:+f.nbBtl,alertStock:+f.alertStock||0,prixUnitaire:+f.prixUnitaire,stockActuel:+f.nbBtl,mouvements:[{date:new Date().toISOString(),type:"Entrée initiale",qty:+f.nbBtl,user:"Admin"}],creeLe:new Date().toISOString()}];sD(nd);sSh(false);sF({adherentId:"",designation:"",nomenclature:"AOP",couleur:"Rouge",volume:"75cl",alcool:"",prixUnitaire:"",droitsAccise:"Droit suspendu",condStock:"Espace 12 btls",emplacement:"",alertStock:"",nbBtl:0,entreeRef:""});};
const filteredRefs=d.references.filter(r=>{
if(fA&&r.adherentId!==fA)return false;
if(q&&!(`${r.id} ${r.designation} ${r.emplacement||""}`.toLowerCase().includes(q.toLowerCase())))return false;
if(fCoul&&r.couleur!==fCoul)return false;
if(fNom&&r.nomenclature!==fNom)return false;
if(fAcc&&r.droitsAccise!==fAcc)return false;
if(fCond&&r.condStock!==fCond)return false;
if(fVol&&r.volume!==fVol)return false;
if(fStock==="stock"&&!(r.stockActuel>0))return false;
if(fStock==="alerte"&&!(r.alertStock>0&&r.stockActuel<=r.alertStock))return false;
if(fStock==="vide"&&r.stockActuel!==0)return false;
return true;});
const totBtlsFiltered=filteredRefs.reduce((s,r)=>s+(r.stockActuel||0),0);
return <div><div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{color:P.tx,margin:0}}>Références</h3><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><Btn v="secondary" sm onClick={()=>{if(!filteredRefs.length)return;printLabels(filteredRefs,d.adherents);}}>🏷️ Étiquettes QR</Btn><Btn v="secondary" sm onClick={()=>exportCSV(`references_${dateTag()}.csv`,["Réf","Désignation","Adhérent","Nomenclature","Couleur","Volume","Alcool %","Prix HT","Accise","Conditionnement","Emplacement","Alerte","Stock"],filteredRefs.map(r=>[r.id,r.designation,d.adherents.find(a=>a.id===r.adherentId)?.name||r.adherentId,r.nomenclature,r.couleur,r.volume,r.alcool||"",r.prixUnitaire||"",r.droitsAccise,r.condStock,r.emplacement||"",r.alertStock||"",r.stockActuel]))}>⬇️ Export</Btn><Btn v="secondary" sm onClick={()=>exportCSV(`mouvements_${dateTag()}.csv`,["Réf","Désignation","Date","Type","Quantité","Utilisateur"],filteredRefs.flatMap(r=>(r.mouvements||[]).map(m=>[r.id,r.designation,(m.date||"").slice(0,10),m.type,m.qty,m.user||""])))}>⬇️ Mouvements</Btn><Btn onClick={()=>sSh(true)}>+ Référence</Btn></div></div>
<Card style={{marginBottom:12,padding:"12px 16px"}}>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8}}>
<Inp label="🔎 Recherche" value={q} onChange={sQ} placeholder="Réf, désignation, emplacement..." sm/>
<Inp label="Adhérent" value={fA} options={d.adherents.map(a=>({value:a.id,label:a.name}))} onChange={sfA} placeholder="— Tous —" sm/>
<Inp label="Couleur" value={fCoul} options={cols} onChange={sfCoul} placeholder="— Toutes —" sm/>
<Inp label="Nomenclature" value={fNom} options={noms} onChange={sfNom} placeholder="— Toutes —" sm/>
<Inp label="Volume" value={fVol} options={vols} onChange={sfVol} placeholder="— Tous —" sm/>
<Inp label="Accise" value={fAcc} options={["Droit suspendu","Droit acquitté"]} onChange={sfAcc} placeholder="— Toutes —" sm/>
<Inp label="Cond. stockage" value={fCond} options={["Palette","Espace 12 btls"]} onChange={sfCond} placeholder="— Tous —" sm/>
<Inp label="État du stock" value={fStock} options={[{value:"stock",label:"En stock (>0)"},{value:"alerte",label:"⚠️ Sous alerte"},{value:"vide",label:"Épuisé (=0)"}]} onChange={sfStock} placeholder="— Tous —" sm/>
</div>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8,flexWrap:"wrap",gap:6}}>
<div style={{fontSize:11,color:P.tm}}><b style={{color:P.ac}}>{filteredRefs.length}</b> référence(s) — <b style={{color:P.gn}}>{totBtlsFiltered.toLocaleString("fr")}</b> bouteilles</div>
{hasFilters&&<Btn v="ghost" sm onClick={resetFilters}>✕ Réinitialiser les filtres</Btn>}
</div>
</Card>
<Card><Table columns={[{key:"qr",label:"QR",render:r=><QRCode refId={r.id} size={34}/>},{key:"id",label:"Réf"},{key:"adherentId",label:"Adhérent",render:r=>d.adherents.find(a=>a.id===r.adherentId)?.name?.split(" ").slice(-1)[0]||""},{key:"designation",label:"Désignation"},{key:"couleur",label:"Coul."},{key:"stockActuel",label:"Stock",render:r=>{const al=r.alertStock>0&&r.stockActuel<=r.alertStock;return <span style={{color:al?P.rd:P.gn,fontWeight:700}}>{r.stockActuel}{al?" ⚠️":""}</span>;}},{key:"droitsAccise",label:"Accise",render:r=><Badge color={r.droitsAccise==="Droit suspendu"?"am":"gn"}>{r.droitsAccise==="Droit suspendu"?"Susp.":"Acq."}</Badge>},{key:"a",label:"",render:r=><div style={{display:"flex",gap:2}}><Btn v="ghost" sm onClick={e=>{e.stopPropagation();sDt(r);}}>📋</Btn><Btn v="ghost" sm onClick={e=>{e.stopPropagation();sEdR(r);sRf({adherentId:r.adherentId,designation:r.designation,nomenclature:r.nomenclature,couleur:r.couleur,volume:r.volume,alcool:r.alcool||"",prixUnitaire:r.prixUnitaire||"",droitsAccise:r.droitsAccise,condStock:r.condStock,emplacement:r.emplacement||"",alertStock:r.alertStock||""});}}>✏️</Btn></div>}]} data={filteredRefs}/></Card>
{dt&&<Modal title={dt.designation} onClose={()=>sDt(null)} wide><div style={{display:"flex",gap:20,marginBottom:16}}><QRCode refId={dt.id} size={120} label={dt.id}/><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,fontSize:12,flex:1}}><div><span style={{color:P.tm,fontSize:10}}>Adhérent</span><br/>{d.adherents.find(a=>a.id===dt.adherentId)?.name}</div><div><span style={{color:P.tm,fontSize:10}}>Prix</span><br/>{dt.prixUnitaire} €</div><div><span style={{color:P.tm,fontSize:10}}>Stock</span><br/><span style={{fontWeight:700,color:P.gn,fontSize:20}}>{dt.stockActuel}</span></div><div><span style={{color:P.tm,fontSize:10}}>Alerte</span><br/>{dt.alertStock||"—"}</div><div><span style={{color:P.tm,fontSize:10}}>Emplacement</span><br/>{dt.emplacement}</div><div><span style={{color:P.tm,fontSize:10}}>Cond.</span><br/>{dt.condStock}</div><div><span style={{color:P.tm,fontSize:10}}>Nomenclature</span><br/>{dt.nomenclature}</div><div><span style={{color:P.tm,fontSize:10}}>Accise</span><br/><Badge color={dt.droitsAccise==="Droit suspendu"?"am":"gn"}>{dt.droitsAccise}</Badge></div></div></div><div style={{background:P.bg,borderRadius:8,padding:10,marginBottom:10,fontSize:11,color:P.tm}}>📱 Scannez ce QR code avec votre téléphone pour ouvrir la fiche technique : <b style={{color:P.ac}}>{typeof window!=="undefined"?window.location.host:""}/stock/fiche/{dt.id}</b></div><div style={{borderTop:`1px solid ${P.bd}`,paddingTop:10}}><div style={{fontSize:10,fontWeight:600,color:P.tm,marginBottom:6}}>MOUVEMENTS</div>{(dt.mouvements||[]).map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${P.bd}30`,fontSize:11}}><span style={{color:P.tm}}>{new Date(m.date).toLocaleDateString("fr")}</span><span>{m.type}</span><span style={{fontWeight:600,color:m.qty>=0?P.gn:P.rd}}>{m.qty>=0?"+":""}{m.qty}</span></div>)}</div>
{(()=>{const live=d.references.find(x=>x.id===dt.id)||dt;const user=cu?.nom||"Admin";
return <div style={{borderTop:`1px solid ${P.bd}`,paddingTop:10,marginTop:10}}>
<PhotoManager photos={live.photos} dossier="refs" user={user} onChange={(ph,note)=>{const nd={...d,references:d.references.map(x=>x.id===dt.id?{...x,photos:ph,historique:[...(x.historique||[]),{date:new Date().toISOString(),user,note}]}:x)};nd.auditLog=[...(nd.auditLog||[]),{date:new Date().toISOString(),user,role:cu?.role||"admin",module:"Référence",action:`${dt.id} — ${note}`}];sD(nd);}}/>
<Historique hist={live.historique}/>
</div>;})()}
</Modal>}
{sh&&<Modal title="Nouvelle Référence" onClose={()=>sSh(false)}><div style={{display:"grid",gap:10}}><Inp label="Adhérent" value={f.adherentId} options={d.adherents.filter(a=>a.stockageActif).map(a=>({value:a.id,label:a.name}))} onChange={v=>sF({...f,adherentId:v})}/><Inp label="Désignation" value={f.designation} onChange={v=>sF({...f,designation:v})} placeholder="Cuvée Prestige 2020"/><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}><Inp label="Nomenclature" value={f.nomenclature} options={noms} onChange={v=>sF({...f,nomenclature:v})} sm/><Inp label="Couleur" value={f.couleur} options={cols} onChange={v=>sF({...f,couleur:v})} sm/><Inp label="Volume" value={f.volume} options={vols} onChange={v=>sF({...f,volume:v})} sm/><Inp label="Alcool %" type="number" value={f.alcool} onChange={v=>sF({...f,alcool:v})} sm/><Inp label="Prix unit. €" type="number" value={f.prixUnitaire} onChange={v=>sF({...f,prixUnitaire:v})} sm/><Inp label="Accise" value={f.droitsAccise} options={["Droit suspendu","Droit acquitté"]} onChange={v=>sF({...f,droitsAccise:v})} sm/></div><Inp label="Entrée associée" value={f.entreeRef} options={d.entrees.filter(e=>e.adherentId===f.adherentId).map(e=>({value:e.id,label:`${e.id} — ${e.date}`}))} onChange={v=>sF({...f,entreeRef:v})}/><Inp label="Nb bouteilles" type="number" value={f.nbBtl} onChange={v=>sF({...f,nbBtl:v})}/><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}><Inp label="Cond. stockage" value={f.condStock} options={["Palette","Espace 12 btls"]} onChange={v=>sF({...f,condStock:v})} sm/>{allE.length>0?<Inp label="Emplacement" value={f.emplacement} options={allE} onChange={v=>sF({...f,emplacement:v})} placeholder="— Choisir un emplacement —" sm/>:<Inp label="Emplacement (saisie libre)" value={f.emplacement} onChange={v=>sF({...f,emplacement:v})} placeholder="ex : Z1-R2-E3" sm/>}</div>{allE.length===0&&<div style={{fontSize:11,color:P.am,background:P.ams,borderRadius:8,padding:"8px 10px"}}>💡 Aucun emplacement paramétré pour l'instant — vous pouvez le saisir librement ci-dessus, ou créer vos zones, rangs et emplacements dans l'onglet <b>🗄️ Espaces</b> pour les sélectionner dans une liste.</div>}<Inp label="Alerte stock" type="number" value={f.alertStock} onChange={v=>sF({...f,alertStock:v})}/><Btn onClick={doSave} dis={!f.adherentId||!f.designation}>Ajouter au stock</Btn></div></Modal>}

{edR&&(()=>{const cur=d.references.find(x=>x.id===edR.id)||edR;const user=cu?.nom||"Admin";
const doEdit=()=>{const labels={adherentId:"Adhérent",designation:"Désignation",nomenclature:"Nomenclature",couleur:"Couleur",volume:"Volume",alcool:"Alcool %",prixUnitaire:"Prix unitaire",droitsAccise:"Droits d'accise",condStock:"Cond. stockage",emplacement:"Emplacement",alertStock:"Alerte stock"};
const ap={...rf,prixUnitaire:+rf.prixUnitaire||0,alertStock:+rf.alertStock||0};
const changes=diffChamps(cur,ap,labels);
if(!changes.length){sEdR(null);return;}
const nd={...d,references:d.references.map(x=>x.id===edR.id?{...x,...ap,historique:[...(x.historique||[]),{date:new Date().toISOString(),user,changes}]}:x)};
nd.auditLog=[...(nd.auditLog||[]),{date:new Date().toISOString(),user,role:cu?.role||"admin",module:"Référence",action:`${edR.id} (${cur.designation}) modifiée — ${changes.map(c=>c.champ).join(", ")}`}];
sD(nd);sEdR(null);};
return <Modal title={`✏️ Modifier ${edR.id}`} onClose={()=>sEdR(null)} wide><div style={{display:"grid",gap:10}}>
<div style={{fontSize:11,color:P.tm}}>Stock actuel : <b style={{color:P.gn}}>{cur.stockActuel} btls</b> — le stock ne se modifie pas ici (utilisez les sorties ou les pertes en Compta Matière, pour la traçabilité)</div>
<Inp label="Adhérent" value={rf.adherentId} options={d.adherents.map(a=>({value:a.id,label:`${a.id} — ${a.name}`}))} onChange={v=>sRf({...rf,adherentId:v})}/>
<Inp label="Désignation" value={rf.designation} onChange={v=>sRf({...rf,designation:v})}/>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
<Inp label="Nomenclature" value={rf.nomenclature} options={["AOP","AOC","IGP","Vin de France","Champagne","Crémant"]} onChange={v=>sRf({...rf,nomenclature:v})} sm/>
<Inp label="Couleur" value={rf.couleur} options={["Rouge","Blanc","Rosé","Effervescent","Liquoreux"]} onChange={v=>sRf({...rf,couleur:v})} sm/>
<Inp label="Volume" value={rf.volume} options={["37.5cl","50cl","75cl","1L","1.5L Magnum","3L Jéroboam"]} onChange={v=>sRf({...rf,volume:v})} sm/>
<Inp label="Alcool %" type="number" value={rf.alcool} onChange={v=>sRf({...rf,alcool:v})} sm/>
<Inp label="Prix unit. €" type="number" value={rf.prixUnitaire} onChange={v=>sRf({...rf,prixUnitaire:v})} sm/>
<Inp label="Accise" value={rf.droitsAccise} options={["Droit suspendu","Droit acquitté"]} onChange={v=>sRf({...rf,droitsAccise:v})} sm/>
<Inp label="Cond. stockage" value={rf.condStock} options={["Palette","Espace 12 btls"]} onChange={v=>sRf({...rf,condStock:v})} sm/>
{allE.length>0?<Inp label="Emplacement" value={rf.emplacement} options={rf.emplacement&&!allE.some(o=>o.value===rf.emplacement)?[{value:rf.emplacement,label:`(texte libre) ${rf.emplacement}`},...allE]:allE} onChange={v=>sRf({...rf,emplacement:v})} placeholder="— Choisir —" sm/>:<Inp label="Emplacement" value={rf.emplacement} onChange={v=>sRf({...rf,emplacement:v})} sm/>}
<Inp label="Alerte stock" type="number" value={rf.alertStock} onChange={v=>sRf({...rf,alertStock:v})} sm/>
</div>
<Btn onClick={doEdit}>Enregistrer les modifications</Btn>
<Historique hist={cur.historique}/>
</div></Modal>;})()}
</div>;}

function Sorties({data:d,setData:sD,currentUser:cu}){const[vF,sVF]=useState(null);const[scan,sScan]=useState(null);const[sh,sSh]=useState(false);const[fA,sfA]=useState("");const[edS,sEdS]=useState(null);const[esf,sEsf]=useState({});
const[qS,sqS]=useState("");const[fStat,sfStat]=useState("");const[fCol2,sfCol2]=useState("");const[fPick,sfPick]=useState("");const[dDu,sdDu]=useState("");const[dAu,sdAu]=useState("");
const[daOpen,setDaOpen]=useState(false);const[daDrafts,setDaDrafts]=useState([]);const[daBusy,setDaBusy]=useState(false);
const[confirmColis,setConfirmColis]=useState(null);// index du brouillon en confirmation de colisage
const[photoAsk,setPhotoAsk]=useState(null);// sortie dont on demande les photos de fin
const hasFiltersS=qS||fA||fStat||fCol2||fPick||dDu||dAu;
const resetFiltersS=()=>{sqS("");sfA("");sfStat("");sfCol2("");sfPick("");sdDu("");sdAu("");};
const filteredSorties=d.sorties.filter(s=>{
if(fA&&s.adherentId!==fA)return false;
if(qS&&!(`${s.id} ${s.destinataire||""} ${s.commentaire||""} ${s.colisageDetail||""}`.toLowerCase().includes(qS.toLowerCase())))return false;
if(fStat&&s.statut!==fStat)return false;
if(fCol2&&s.colType!==fCol2)return false;
if(fPick==="ok"&&!s.scanValide)return false;
if(fPick==="ko"&&s.scanValide)return false;
if(dDu&&s.date<dDu)return false;
if(dAu&&s.date>dAu)return false;
return true;});
const totBtlsSorties=filteredSorties.reduce((s,x)=>s+(x.nbBouteilles||0),0);
const[f,sF]=useState({adherentId:"",date:new Date().toISOString().slice(0,10),colType:"Colis",tpa:true,apa:true,commentaire:"",refsSelected:{},colis:[],destinataire:""});
const adhRefs=d.references.filter(r=>r.adherentId===f.adherentId&&r.stockActuel>0);
const totalBtls=Object.values(f.refsSelected).reduce((s,v)=>s+(+v||0),0);
const nbRefsSelected=Object.entries(f.refsSelected).filter(([,v])=>+v>0).length;
const addColis=fmt=>{sF({...f,colis:[...f.colis,{format:fmt,qty:1}]});};
const totalColis=f.colis.reduce((s,c)=>s+c.qty,0);
// Cohérence colisage : chaque bouteille doit avoir un emplacement dans les cartons
const capaciteColis=f.colis.reduce((s,c)=>{const fmt=COLIS_FORMATS.find(x=>x.id===c.format);return s+(fmt?.btls||0)*c.qty;},0);
const videsColis=Math.max(0,capaciteColis-totalBtls);
// Simulation de remplissage (gros cartons d'abord) pour afficher les vides par carton
const cartonsFill=(()=>{const list=[];f.colis.forEach(c=>{const fmt=COLIS_FORMATS.find(x=>x.id===c.format);if((fmt?.btls||0)>0)for(let i=0;i<c.qty;i++)list.push(fmt.btls);});list.sort((a,b)=>b-a);let rest=totalBtls;return list.map(cap=>{const take=Math.min(cap,rest);rest-=take;return{cap,take};});})();
const colisOk=f.colType!=="Colis"||(totalColis>0&&capaciteColis>=totalBtls);
const isPal=f.colType==="Palette";const nbPal=isPal?f.colis.filter(c=>c.format==="PAL"||c.format==="DPAL").reduce((s,c)=>s+c.qty,0):0;
const adh=d.adherents.find(a=>a.id===f.adherentId);
const mt=adh?calcSortie(adh.grille,f.tpa,f.apa,f.colType,totalBtls,nbRefsSelected,totalColis,nbPal):0;
const facFour=!(f.tpa&&f.apa);
const fourCost=f.colis.reduce((s,c)=>{const fmt=COLIS_FORMATS.find(x=>x.id===c.format);if(!fmt)return s;const m=d.fournitures.find(fo=>fo.nom.toLowerCase().includes(fmt.label.toLowerCase()));return s+(m?m.prix*c.qty:0);},0);
const colisageDetail=f.colis.map(c=>{const fmt=COLIS_FORMATS.find(x=>x.id===c.format);return `${c.qty}× ${fmt?.label||c.format}`;}).join(", ");
// Accise info for selected refs
const selectedAccise=Object.entries(f.refsSelected).filter(([,v])=>+v>0).map(([refId])=>{const ref=d.references.find(r=>r.id===refId);return ref?{id:refId,designation:ref.designation,accise:ref.droitsAccise}:null;}).filter(Boolean);

const doSave=()=>{
  if(!f.adherentId||totalBtls===0)return;
  // Anti-doublon : sortie identique (même adhérent, destinataire, vins et quantités) encore en cours
  const keyRefs=o=>Object.entries(o||{}).filter(([,q])=>+q>0).map(([k,q])=>`${k}:${+q}`).sort().join("|");
  const dup=d.sorties.find(s=>s.statut!=="Annulé"&&s.statut!=="Expédié"&&s.adherentId===f.adherentId&&(s.destinataire||"").trim().toLowerCase()===(f.destinataire||"").trim().toLowerCase()&&keyRefs(s.refsDetail)===keyRefs(f.refsSelected));
  if(dup){alert(`⛔ Sortie identique déjà en cours : ${dup.id} (${dup.statut}) — même adhérent, même destinataire, mêmes vins et quantités.\nModifiez la demande ou annulez d'abord ${dup.id}.`);return;}
  const id=`#S${d.nextSortieId}`;const nd={...d,nextSortieId:d.nextSortieId+1};
  // Le stock n'est PAS décompté ici : il le sera à la validation du picking (scan)
  const lignes=[];const g=adh.grille;if(f.colType==="Colis"){const nec=nbCartonsNecessaires(totalBtls);if(totalColis>nec)lignes.push({desc:`Prépa ${totalColis} colis (colisage éclaté — remplace le picking de base)`,montant:totalColis*g.sortie_min_prepa_colis});else lignes.push({desc:`Picking ${Math.ceil(totalBtls/6)} lots de 6`,montant:Math.ceil(totalBtls/6)*g.sortie_picking_lot6});const sr=nbRefsSelected*(f.tpa?g.sortie_colis_ref_tpa_oui:g.sortie_colis_ref_tpa_non);if(sr>0)lignes.push({desc:`Sortie ${nbRefsSelected} réf`,montant:sr});}else{if(!(f.tpa&&f.apa)){if(nbRefsSelected===1)lignes.push({desc:`Picking pal. mono × ${nbPal}`,montant:nbPal*g.sortie_picking_palette_mono});else lignes.push({desc:`Picking multi × ${nbRefsSelected}`,montant:nbRefsSelected*g.sortie_picking_palette_multi});lignes.push({desc:`Prépa pal. × ${nbPal}`,montant:nbPal*g.sortie_prepa_palette});lignes.push({desc:"Manutention",montant:g.sortie_manut_palette});}}
  if(facFour&&fourCost>0)lignes.push({desc:"Fournitures",montant:fourCost});
  const totalHT=lignes.reduce((s,l)=>s+l.montant,0);
  // Build accise summary
  const acciseStr=selectedAccise.map(a=>`${a.id}: ${a.accise==="Droit suspendu"?"Susp.":"Acq."}`).join(", ");
  nd.sorties=[...nd.sorties,{id,adherentId:f.adherentId,date:f.date,type:"Manuelle",colType:f.colType,colisageDetail,tpa:f.tpa,apa:f.apa,nbBouteilles:totalBtls,nbRefs:nbRefsSelected,nbColis:totalColis,commentaire:f.commentaire,destinataire:f.destinataire,montant:totalHT,lignes,statut:"En préparation",creePar:"Admin",refsDetail:{...f.refsSelected},factureNum:null,scanValide:false,stockDecremente:false,acciseInfo:acciseStr}];
  nd.auditLog=[...(nd.auditLog||[]),{date:new Date().toISOString(),user:"Admin",role:"admin",module:"Sortie",action:`Sortie ${id} — ${totalBtls} btls — ${totalHT.toFixed(2)} € HT — stock décompté à la validation du picking`}];
  sD(nd);sSh(false);sF({adherentId:"",date:new Date().toISOString().slice(0,10),colType:"Colis",tpa:true,apa:true,commentaire:"",refsSelected:{},colis:[],destinataire:""});
};

// Validation du picking → décompte du stock (une seule fois, tracé dans les mouvements)
const decompterStock=(nd,s,motif)=>{const updRefs=[...nd.references];Object.entries(s.refsDetail||{}).forEach(([refId,qty])=>{const q=+qty;if(q<=0)return;const idx=updRefs.findIndex(r=>r.id===refId);if(idx>=0){updRefs[idx]={...updRefs[idx],stockActuel:Math.max(0,updRefs[idx].stockActuel-q),mouvements:[...(updRefs[idx].mouvements||[]),{date:new Date().toISOString(),type:`Sortie ${s.id} (${motif})`,qty:-q,user:cu?.nom||"Admin"}]};}});nd.references=updRefs;};
const restituerStock=(nd,s)=>{const updRefs=[...nd.references];Object.entries(s.refsDetail||{}).forEach(([refId,qty])=>{const q=+qty;if(q<=0)return;const idx=updRefs.findIndex(r=>r.id===refId);if(idx>=0){updRefs[idx]={...updRefs[idx],stockActuel:updRefs[idx].stockActuel+q,mouvements:[...(updRefs[idx].mouvements||[]),{date:new Date().toISOString(),type:`Annulation sortie ${s.id}`,qty:q,user:cu?.nom||"Admin"}]};}});nd.references=updRefs;};
const handleScanOk=s=>{const nd={...d};
if(!s.stockDecremente)decompterStock(nd,s,"picking validé");
nd.sorties=nd.sorties.map(x=>x.id===s.id?{...x,scanValide:true,statut:"Prêt",stockDecremente:true}:x);
nd.auditLog=[...(nd.auditLog||[]),{date:new Date().toISOString(),user:cu?.nom||"Admin",role:cu?.role||"admin",module:"Sortie",action:`Picking ${s.id} validé — ${s.nbBouteilles} btls décomptées du stock`}];
sD(nd);sScan(null);setPhotoAsk(s.id);};
// Changement de statut manuel : Expédié sans scan → décompte quand même ; Annulé → restitue
const changeStatut=(r,v)=>{const nd={...d};
if(v==="Expédié"&&!r.stockDecremente){decompterStock(nd,r,"expédiée sans scan");nd.sorties=nd.sorties.map(x=>x.id===r.id?{...x,statut:v,stockDecremente:true}:x);nd.auditLog=[...(nd.auditLog||[]),{date:new Date().toISOString(),user:cu?.nom||"Admin",role:cu?.role||"admin",module:"Sortie",action:`Sortie ${r.id} expédiée sans scan — ${r.nbBouteilles} btls décomptées du stock`}];if(!(r.photos||[]).length)setTimeout(()=>setPhotoAsk(r.id),100);}
else if(v==="Expédié"&&!(r.photos||[]).length){nd.sorties=nd.sorties.map(x=>x.id===r.id?{...x,statut:v}:x);sD(nd);setPhotoAsk(r.id);return;}
else if(v==="Annulé"&&r.stockDecremente){restituerStock(nd,r);nd.sorties=nd.sorties.map(x=>x.id===r.id?{...x,statut:v,stockDecremente:false,scanValide:false}:x);nd.auditLog=[...(nd.auditLog||[]),{date:new Date().toISOString(),user:cu?.nom||"Admin",role:cu?.role||"admin",module:"Sortie",action:`Sortie ${r.id} annulée — ${r.nbBouteilles} btls restituées au stock`}];}
else{nd.sorties=nd.sorties.map(x=>x.id===r.id?{...x,statut:v}:x);}
sD(nd);};
// Get accise for existing sorties
const getAccise=sortie=>{const refs=Object.keys(sortie.refsDetail||{});const accises=refs.map(refId=>{const ref=d.references.find(r=>r.id===refId);return ref?.droitsAccise;}).filter(Boolean);const hasSusp=accises.some(a=>a==="Droit suspendu");const hasAcq=accises.some(a=>a==="Droit acquitté");if(hasSusp&&hasAcq)return "Mixte";if(hasSusp)return "Suspendu";return "Acquitté";};

return <div><div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{color:P.tx,margin:0}}>Sorties</h3><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><Btn v="secondary" sm onClick={()=>exportCSV(`sorties_${dateTag()}.csv`,["N°","Date","Adhérent","Btls","Réfs","Colis","Colisage","Destinataire","Transport PA","Assurance PA","Statut","Picking validé","Montant HT","Relevé"],filteredSorties.map(x=>[x.id,x.date,d.adherents.find(a=>a.id===x.adherentId)?.name||x.adherentId,x.nbBouteilles,x.nbRefs,x.nbColis,x.colisageDetail||"",x.destinataire||"",x.tpa?"OUI":"NON",x.apa?"OUI":"NON",x.statut,x.scanValide?"OUI":"NON",(x.montant||0).toFixed(2),x.factureNum||""]))}>⬇️ Export</Btn><Btn v="secondary" sm onClick={()=>{setDaOpen(true);setDaDrafts([]);}}>📄 Import DA</Btn><Btn onClick={()=>sSh(true)}>+ Sortie</Btn></div></div>
<Card style={{marginBottom:12,padding:"12px 16px"}}>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8}}>
<Inp label="🔎 Recherche" value={qS} onChange={sqS} placeholder="N°, destinataire, commentaire..." sm/>
<Inp label="Adhérent" value={fA} options={d.adherents.map(a=>({value:a.id,label:a.name}))} onChange={sfA} placeholder="— Tous —" sm/>
<Inp label="Statut" value={fStat} options={["En préparation","Prêt","Expédié","Annulé"]} onChange={sfStat} placeholder="— Tous —" sm/>
<Inp label="Colisage" value={fCol2} options={["Colis","Palette"]} onChange={sfCol2} placeholder="— Tous —" sm/>
<Inp label="Picking" value={fPick} options={[{value:"ok",label:"✅ Scan validé"},{value:"ko",label:"⏳ Scan en attente"}]} onChange={sfPick} placeholder="— Tous —" sm/>
<Inp label="Du" type="date" value={dDu} onChange={sdDu} sm/>
<Inp label="Au" type="date" value={dAu} onChange={sdAu} sm/>
</div>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8,flexWrap:"wrap",gap:6}}>
<div style={{fontSize:11,color:P.tm}}><b style={{color:P.ac}}>{filteredSorties.length}</b> sortie(s) — <b style={{color:P.gn}}>{totBtlsSorties.toLocaleString("fr")}</b> bouteilles</div>
{hasFiltersS&&<Btn v="ghost" sm onClick={resetFiltersS}>✕ Réinitialiser les filtres</Btn>}
</div>
</Card>
<Card><Table columns={[
{key:"id",label:"Réf"},{key:"date",label:"Date"},
{key:"adherentId",label:"Adhérent",render:r=>d.adherents.find(a=>a.id===r.adherentId)?.name?.split(" ").slice(-1)[0]||""},
{key:"nbBouteilles",label:"Btls"},{key:"colisageDetail",label:"Colisage"},
{key:"tpa",label:"T PA",render:r=>r.tpa?"✅":"❌"},
{key:"apa",label:"A PA",render:r=>r.apa?"✅":"❌"},
{key:"accise",label:"Accise",render:r=>{const a=getAccise(r);return <Badge color={a==="Suspendu"?"am":a==="Mixte"?"rd":"gn"}>{a}</Badge>;}},
{key:"montant",label:"€ HT",render:r=>`${r.montant.toFixed(2)}`},
{key:"scanValide",label:"Scan",render:r=>r.scanValide?<Badge color="gn">✅</Badge>:<Btn v="danger" sm onClick={e=>{e.stopPropagation();sScan(r);}}>🔍</Btn>},
{key:"statut",label:"Statut",render:r=><select value={r.statut} onChange={e=>{e.stopPropagation();changeStatut(r,e.target.value);}} onClick={e=>e.stopPropagation()} style={{background:P.bg,color:P.tx,border:`1px solid ${P.bd}`,borderRadius:6,padding:"3px 8px",fontSize:11}}><option>En préparation</option><option>Prêt</option><option>Expédié</option><option>Annulé</option></select>},
{key:"f",label:"",render:r=>{const fc=d.factures.find(x=>x.numero===r.factureNum);return fc?<Btn v="ghost" sm onClick={e=>{e.stopPropagation();sVF(fc);}}>🧾</Btn>:null;}},
{key:"ph",label:"📷",render:r=>(r.photos||[]).length||""},
{key:"edit",label:"",render:r=><Btn v="ghost" sm onClick={e=>{e.stopPropagation();sEdS(r);sEsf({date:r.date,destinataire:r.destinataire||"",commentaire:r.commentaire||""});}}>✏️</Btn>}
]} data={filteredSorties}/></Card>
{vF&&<InvoiceView facture={vF} adherent={d.adherents.find(a=>a.id===vF.adherentId)} onClose={()=>sVF(null)}/>}
{scan&&<ScanModal sortie={scan} references={d.references} onValidate={()=>handleScanOk(scan)} onClose={()=>sScan(null)}/>}

{photoAsk&&(()=>{const s2=d.sorties.find(x=>x.id===photoAsk);if(!s2)return null;const user=cu?.nom||"Admin";const nb=(s2.photos||[]).length;
return <Modal title={`📷 Photos de la sortie ${s2.id}`} onClose={()=>setPhotoAsk(null)}>
<div style={{display:"grid",gap:10}}>
<div style={{background:P.acs,border:`1px solid ${P.acb}`,borderRadius:10,padding:12,fontSize:12,color:P.tx,lineHeight:1.5}}>
<b>Sortie {s2.id} {s2.statut==="Expédié"?"expédiée":"préparée"}</b> — {s2.nbBouteilles} btls → {s2.destinataire||"—"}<br/>
📸 <b>Ajoutez plusieurs photos avant de terminer</b> : colis fermés, étiquettes de transport, palette filmée, bon de livraison… Elles constituent la preuve de l'état au départ en cas de litige transporteur.
</div>
<PhotoManager photos={s2.photos} dossier="sorties" user={user} onChange={(ph,note)=>{const nd={...d,sorties:d.sorties.map(x=>x.id===s2.id?{...x,photos:ph,historique:[...(x.historique||[]),{date:new Date().toISOString(),user,note}]}:x)};nd.auditLog=[...(nd.auditLog||[]),{date:new Date().toISOString(),user,role:cu?.role||"admin",module:"Sortie",action:`Sortie ${s2.id} — ${note}`}];sD(nd);}}/>
{nb===0&&<div style={{fontSize:11,color:P.am,fontWeight:600,textAlign:"center"}}>⚠️ Aucune photo pour l'instant</div>}
<Btn v={nb>0?"success":"secondary"} onClick={()=>setPhotoAsk(null)}>{nb>0?`✅ Terminer — ${nb} photo(s) enregistrée(s)`:"Passer pour l'instant (déconseillé)"}</Btn>
</div>
</Modal>;})()}

{daOpen&&(()=>{
const user=cu?.nom||"Admin";
const handleDAFiles=async e=>{
const files=[...(e.target.files||[])];if(!files.length)return;
setDaBusy(true);const drafts=[];
for(const file of files){
try{
const items=await extractPdfItems(file);
const parsed=parseDA(items);
// Adhérent : correspondance sur ORIGINATOR (nom, insensible casse)
const adh=d.adherents.find(a=>normTxt(a.name)===normTxt(parsed.originator))||d.adherents.find(a=>normTxt(parsed.originator).includes(normTxt(a.name)));
const adhRefs2=adh?d.references.filter(r=>r.adherentId===adh.id):[];
const lines=parsed.lines.map(l=>{const{ref,score}=matchRef(l.designation,adhRefs2);
return{designation:l.designation,qty:l.qty,refId:ref?.id||"",score,
warn:!ref?"❌ Aucune référence correspondante — choisissez manuellement":score<0.85?"⚠️ Correspondance à vérifier":(ref&&l.qty>ref.stockActuel?`⚠️ Stock insuffisant (${ref.stockActuel} disponible)`:"")};});
const warnings=[];
if(!adh)warnings.push(`❌ Adhérent « ${parsed.originator||"introuvable dans le PDF"} » non reconnu — sélectionnez-le`);
if(!parsed.delivery)warnings.push("⚠️ Destinataire non détecté dans le PDF");
if(!parsed.lines.length)warnings.push("❌ Aucune ligne produit détectée — vérifiez le format du document");
const sumQty=lines.reduce((s,l)=>s+l.qty,0);
if(parsed.totalDeclared!=null&&sumQty!==parsed.totalDeclared)warnings.push(`⚠️ Incohérence : ${sumQty} btls détectées vs « Total Bottles : ${parsed.totalDeclared} » sur le document`);
// Anti-doublon : ce DA a-t-il déjà été importé ?
const cleanName=file.name.replace(/(\.pdf)+$/i,"");
const mDA=cleanName.match(/DA[_\s-]*(\d+)/i);
const daLabel=mDA?`DA ${mDA[1]}`:"";
const dupDA=d.sorties.find(s=>s.statut!=="Annulé"&&(s.daFichier===file.name||(daLabel&&s.daNum===daLabel)));
let blocked=false;
if(dupDA){warnings.unshift(`⛔ Ce DA a déjà été importé : sortie ${dupDA.id} (${dupDA.statut}) — création bloquée. Annulez-la d'abord si vous devez recommencer.`);blocked=true;}
// Proposition de colisage (modifiable ensuite : la prépa est facturée PAR carton)
const colis={};calcColisage(sumQty).forEach(p=>{colis[p.sz]=p.n;});
drafts.push({fileName:file.name,adherentId:adh?.id||"",destinataire:parsed.delivery||"",date:new Date().toISOString().slice(0,10),lines,warnings,totalDeclared:parsed.totalDeclared,daLabel,blocked,colis,colisTouched:false});
}catch(err){drafts.push({fileName:file.name,error:"Lecture impossible : "+(err?.message||err),lines:[],warnings:[]});}
}
setDaDrafts(drafts);setDaBusy(false);e.target.value="";};

const updDraft=(i,patch)=>setDaDrafts(ds=>ds.map((x,j)=>j===i?{...x,...patch}:x));
const updLine=(i,li,patch)=>setDaDrafts(ds=>ds.map((x,j)=>{if(j!==i)return x;const lines=x.lines.map((l,k)=>k===li?{...l,...patch}:l);let colis=x.colis;if(!x.colisTouched&&Object.prototype.hasOwnProperty.call(patch,"qty")){const t=lines.reduce((s,l)=>s+(+l.qty||0),0);colis={};calcColisage(t).forEach(p=>{colis[p.sz]=p.n;});}return{...x,lines,colis};}));
const updColis=(i,sz,n)=>setDaDrafts(ds=>ds.map((x,j)=>j===i?{...x,colisTouched:true,colis:{...(x.colis||{}),[sz]:Math.max(0,+n||0)}}:x));

const sameRefsDetail=(a,b)=>{const key=o=>Object.entries(o||{}).filter(([,q])=>+q>0).map(([k,q])=>`${k}:${+q}`).sort().join("|");return key(a)===key(b);};

const createFromDraft=(draft,idx)=>{
const adh2=d.adherents.find(a=>a.id===draft.adherentId);if(!adh2)return;
const valid=draft.lines.filter(l=>l.refId&&+l.qty>0);if(!valid.length)return;
const refsDetail={};valid.forEach(l=>{refsDetail[l.refId]=(refsDetail[l.refId]||0)+ +l.qty;});
// Anti-doublon : même DA déjà importé, ou sortie identique encore en cours
const dupDA=d.sorties.find(s=>s.statut!=="Annulé"&&(s.daFichier===draft.fileName||(draft.daLabel&&s.daNum===draft.daLabel)));
if(dupDA){alert(`⛔ Ce DA a déjà été importé : sortie ${dupDA.id} (${dupDA.statut}). Annulez-la d'abord si vous devez recommencer.`);return;}
const dupSame=d.sorties.find(s=>s.statut!=="Annulé"&&s.statut!=="Expédié"&&s.adherentId===adh2.id&&normTxt(s.destinataire||"")===normTxt(draft.destinataire||"")&&sameRefsDetail(s.refsDetail,refsDetail));
if(dupSame){alert(`⛔ Sortie identique déjà en cours : ${dupSame.id} (${dupSame.statut}) — même adhérent, même destinataire, mêmes vins et quantités.`);return;}
const totalBtls=valid.reduce((s,l)=>s+ +l.qty,0);const nbRefs=Object.keys(refsDetail).length;
// Colisage réel saisi dans le brouillon (la prépa est facturée PAR carton)
const colisEntries=Object.entries(draft.colis||{}).filter(([,n])=>+n>0).map(([sz,n])=>({sz:+sz,n:+n})).sort((a,b)=>b.sz-a.sz);
const nbColis=colisEntries.reduce((s,p)=>s+p.n,0);
const capacite=colisEntries.reduce((s,p)=>s+p.sz*p.n,0);
if(!nbColis||capacite<totalBtls){alert("⛔ Colisage incomplet : la capacité des cartons ("+capacite+" btls) doit couvrir le total ("+totalBtls+" btls).");return;}
const colisDetail=colisageLabel(colisEntries);
const lots6=Math.ceil(totalBtls/6);
const g=adh2.grille;
const nec=nbCartonsNecessaires(totalBtls);
const lignes=nbColis>nec
?[{desc:`Prépa ${nbColis} colis (colisage éclaté — remplace le picking de base)`,montant:nbColis*g.sortie_min_prepa_colis}]
:[{desc:`Picking ${lots6} lots de 6`,montant:lots6*g.sortie_picking_lot6}];
const totalHT=lignes.reduce((s,l)=>s+l.montant,0);
const id=`#S${d.nextSortieId}`;
const nd={...d,nextSortieId:d.nextSortieId+1};
nd.sorties=[...nd.sorties,{id,adherentId:adh2.id,date:draft.date,type:"Import DA",colType:"Colis",colisageDetail:colisDetail,tpa:true,apa:true,nbBouteilles:totalBtls,nbRefs,nbColis,destinataire:draft.destinataire,commentaire:draft.daLabel||"",montant:totalHT,lignes,statut:"En préparation",creePar:user,refsDetail,factureNum:null,scanValide:false,stockDecremente:false,daFichier:draft.fileName,daNum:draft.daLabel||""}];
nd.auditLog=[...(nd.auditLog||[]),{date:new Date().toISOString(),user,role:cu?.role||"admin",module:"Sortie",action:`Sortie ${id} créée depuis le ${draft.daLabel||"DA"} (« ${draft.fileName} ») — ${totalBtls} btls (${colisDetail}) → ${draft.destinataire||"?"}`}];
sD(nd);
setDaDrafts(ds=>ds.filter((_,j)=>j!==idx));
};

return <Modal title="📄 Import DA — Création automatique de sorties" onClose={()=>setDaOpen(false)} wide>
<div style={{display:"grid",gap:12}}>
<div style={{fontSize:12,color:P.tm}}>Déposez un ou plusieurs <b>documents d'accompagnement (PDF)</b> : l'application lit l'adhérent (ORIGINATOR), le destinataire (DELIVERY TO) et les lignes de vins avec quantités, puis prépare la demande de sortie. Vérifiez les alertes avant de confirmer.</div>
<input type="file" accept=".pdf" multiple onChange={handleDAFiles} style={{fontSize:12,fontFamily:FN,padding:"10px 12px",background:P.bg,border:`2px dashed ${P.ac}`,borderRadius:8,color:P.tx,cursor:"pointer"}}/>
{daBusy&&<div style={{textAlign:"center",padding:14,color:P.tm,fontSize:13}}>⏳ Lecture des documents en cours...</div>}

{daDrafts.map((draft,i)=>{
if(draft.error)return <Card key={i} style={{border:`1px solid ${P.rd}40`,background:P.rds}}><div style={{fontWeight:700,color:P.rd,fontSize:12}}>❌ {draft.fileName}</div><div style={{fontSize:11,color:P.tm}}>{draft.error}</div></Card>;
const adh2=d.adherents.find(a=>a.id===draft.adherentId);
const adhRefs2=adh2?d.references.filter(r=>r.adherentId===adh2.id):[];
const totalBtls=draft.lines.reduce((s,l)=>s+(+l.qty||0),0);
const ready=adh2&&!draft.blocked&&draft.lines.length>0&&draft.lines.every(l=>l.refId&&+l.qty>0);
return <Card key={i} style={{border:`1px solid ${ready?P.gn:P.am}60`}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
<div style={{fontWeight:700,fontSize:13,color:P.tx}}>📄 {draft.fileName}</div>
<Badge color={ready?"gn":"am"}>{ready?"✅ Prêt à créer":"⚠️ À compléter"}</Badge>
</div>
{draft.warnings.length>0&&<div style={{background:P.ams,border:`1px solid ${P.am}40`,borderRadius:8,padding:10,marginBottom:10}}>
{draft.warnings.map((w,k)=><div key={k} style={{fontSize:11,color:w.startsWith("❌")?P.rd:P.am,fontWeight:600}}>{w}</div>)}
</div>}
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:8,marginBottom:10}}>
<Inp label="Adhérent" value={draft.adherentId} options={d.adherents.filter(a=>a.stockageActif).map(a=>({value:a.id,label:a.name}))} onChange={v=>{const na=d.adherents.find(a=>a.id===v);const nr=na?d.references.filter(r=>r.adherentId===na.id):[];updDraft(i,{adherentId:v,lines:draft.lines.map(l=>{const{ref,score}=matchRef(l.designation,nr);return{...l,refId:ref?.id||"",score,warn:!ref?"❌ Aucune référence correspondante — choisissez manuellement":score<0.85?"⚠️ Correspondance à vérifier":""};})});}} sm/>
<Inp label="Destinataire" value={draft.destinataire} onChange={v=>updDraft(i,{destinataire:v})} sm/>
<Inp label="Date" type="date" value={draft.date} onChange={v=>updDraft(i,{date:v})} sm/>
</div>
{draft.lines.map((l,li)=>{const ref=d.references.find(r=>r.id===l.refId);
return <div key={li} style={{background:P.bg,borderRadius:8,padding:"8px 10px",marginBottom:5}}>
<div style={{fontSize:11,color:P.tm,marginBottom:4}}>Sur le DA : <b style={{color:P.tx}}>{l.designation}</b></div>
<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
<select value={l.refId} onChange={e=>{const nr=d.references.find(r=>r.id===e.target.value);updLine(i,li,{refId:e.target.value,warn:nr&&+l.qty>nr.stockActuel?`⚠️ Stock insuffisant (${nr.stockActuel} disponible)`:""});}} style={{flex:1,minWidth:200,fontFamily:FN,fontSize:12,background:P.sf,color:P.tx,border:`1px solid ${l.refId?P.bd:P.rd}`,borderRadius:6,padding:"7px 10px"}}>
<option value="">— Choisir la référence —</option>
{adhRefs2.map(r=><option key={r.id} value={r.id}>{r.id} — {r.designation} (stock {r.stockActuel})</option>)}
</select>
<input type="number" min="1" value={l.qty} onChange={e=>{const q=+e.target.value;const nr=d.references.find(r=>r.id===l.refId);updLine(i,li,{qty:q,warn:nr&&q>nr.stockActuel?`⚠️ Stock insuffisant (${nr.stockActuel} disponible)`:""});}} style={{width:70,fontFamily:FN,fontSize:13,background:P.sf,color:P.tx,border:`1px solid ${P.bd}`,borderRadius:6,padding:"7px 8px",textAlign:"center"}}/>
<span style={{fontSize:11,color:P.tm}}>btls</span>
</div>
{l.warn&&<div style={{fontSize:11,fontWeight:600,color:l.warn.startsWith("❌")?P.rd:P.am,marginTop:4}}>{l.warn}{l.score!=null&&l.refId&&l.score<0.85?` (similitude ${(l.score*100).toFixed(0)} %)`:""}</div>}
</div>;})}
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8,flexWrap:"wrap",gap:6}}>
<div style={{fontSize:12,color:P.tm}}>Total : <b style={{color:P.ac}}>{totalBtls} btls</b>{draft.totalDeclared!=null?` — annoncé sur le DA : ${draft.totalDeclared} btls`:""}</div>
<Btn v={ready?"success":"secondary"} dis={!ready} onClick={()=>setConfirmColis(i)}>Continuer → 📦 Colisage</Btn>
</div>
</Card>;})}

{/* ─── Question colisage obligatoire avant validation ─── */}
{confirmColis!=null&&(()=>{const i=confirmColis;const draft=daDrafts[i];if(!draft)return null;
const adh2=d.adherents.find(a=>a.id===draft.adherentId);
const totalBtls=draft.lines.reduce((s,l)=>s+(+l.qty||0),0);
const nbCartons=Object.values(draft.colis||{}).reduce((s,n)=>s+(+n||0),0);
const capacite=Object.entries(draft.colis||{}).reduce((s,[sz,n])=>s+sz*(+n||0),0);
const lots6=Math.ceil(totalBtls/6);
const nec=nbCartonsNecessaires(totalBtls);
const gp=adh2?.grille;
const eclate=nbCartons>nec;
const prixHT=gp?(eclate?nbCartons*gp.sortie_min_prepa_colis:lots6*gp.sortie_picking_lot6):0;
const okC=nbCartons>0&&capacite>=totalBtls;
return <Modal title="📦 Colisage réel — dernière étape avant validation" onClose={()=>setConfirmColis(null)}>
<div style={{display:"grid",gap:12}}>
<div style={{background:P.acs,border:`1px solid ${P.acb}`,borderRadius:10,padding:12,fontSize:12,color:P.tx,lineHeight:1.5}}>
<b>{draft.daLabel||draft.fileName}</b> — {totalBtls} btls → {draft.destinataire||"—"}<br/>
Dans <b>combien de cartons</b> cette commande part-elle réellement ? La proposition est pré-remplie — ajustez si le client demande autrement (ex. 2× 3 bouteilles au lieu de 1× 6). <b>Colisage standard → picking par multiple de 6 ; colisage éclaté (plus de cartons que nécessaire) → prépa par carton, qui remplace la base.</b>
</div>
<div style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center"}}>
{[12,6,3,2,1].map(sz=><div key={sz} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
<span style={{fontSize:10,color:P.tm,fontWeight:700}}>{sz} btl{sz>1?"s":""}</span>
<input type="number" min="0" value={draft.colis?.[sz]||0} onChange={e=>updColis(i,sz,e.target.value)} style={{width:64,fontFamily:FN,fontSize:16,background:P.bg,color:P.tx,border:`2px solid ${(draft.colis?.[sz]||0)>0?P.ac:P.bd}`,borderRadius:8,padding:"10px 4px",textAlign:"center",fontWeight:700}}/>
</div>)}
</div>
<div style={{textAlign:"center",fontSize:12,color:P.tm}}>
{nbCartons} carton(s) — capacité {capacite} btls
{capacite<totalBtls?<div style={{color:P.rd,fontWeight:700,marginTop:4}}>❌ Capacité insuffisante pour {totalBtls} bouteilles — ajoutez des cartons</div>:capacite>totalBtls?<div style={{color:P.am,marginTop:4}}>⚠️ Place restante : {capacite-totalBtls} btls (cartons non pleins)</div>:<div style={{color:P.gn,fontWeight:700,marginTop:4}}>✔ Capacité exacte</div>}
</div>
{gp&&<div style={{background:P.bg,borderRadius:10,padding:12,fontSize:12,color:P.tx}}>
{eclate
?<><div style={{display:"flex",justifyContent:"space-between",padding:"3px 0"}}><span>Prépa {nbCartons} carton(s) × {gp.sortie_min_prepa_colis} € — <b>colisage éclaté</b> ({nec} carton(s) auraient suffi)</span><b>{prixHT.toFixed(2)} €</b></div>
<div style={{fontSize:10,color:P.tm}}>Le picking de base ({lots6} lot(s) de 6 × {gp.sortie_picking_lot6} €) ne s'applique pas : il est remplacé par la préparation.</div></>
:<><div style={{display:"flex",justifyContent:"space-between",padding:"3px 0"}}><span>Picking {lots6} lot(s) de 6 × {gp.sortie_picking_lot6} € — <b>colisage standard</b></span><b>{prixHT.toFixed(2)} €</b></div>
<div style={{fontSize:10,color:P.tm}}>Pas de frais de préparation : le colisage correspond au minimum nécessaire ({nec} carton(s)).</div></>}
<div style={{display:"flex",justifyContent:"space-between",padding:"6px 0 0",borderTop:`1px solid ${P.bd}`,fontWeight:700,color:P.ac,marginTop:6}}><span>Total HT</span><span>{prixHT.toFixed(2)} €</span></div>
</div>}
<Btn v={okC?"success":"secondary"} dis={!okC} onClick={()=>{createFromDraft(daDrafts[i],i);setConfirmColis(null);}} style={{padding:"14px",fontSize:14}}>✅ Confirmer le colisage et créer la sortie</Btn>
</div>
</Modal>;})()}
</div>
</Modal>;})()}

{sh&&<Modal title="Nouvelle Sortie" onClose={()=>sSh(false)} wide><div style={{display:"grid",gap:10}}>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}><Inp label="Adhérent" value={f.adherentId} options={d.adherents.filter(a=>a.stockageActif).map(a=>({value:a.id,label:a.name}))} onChange={v=>sF({...f,adherentId:v,refsSelected:{}})}/><Inp label="Date" type="date" value={f.date} onChange={v=>sF({...f,date:v})}/></div>
<Inp label="Destinataire" value={f.destinataire} onChange={v=>sF({...f,destinataire:v})} placeholder="Nom du destinataire"/>

{f.adherentId&&adhRefs.length>0&&<div><div style={{fontSize:10,color:P.tm,fontWeight:600,marginBottom:6}}>SÉLECTION RÉFÉRENCES</div>{adhRefs.map(r=><div key={r.id} style={{display:"flex",alignItems:"center",gap:8,background:P.bg,padding:"7px 8px",borderRadius:6,marginBottom:3}}>
<QRCode refId={r.id} size={24}/>
<div style={{flex:1,fontSize:12}}><b>{r.designation}</b><span style={{color:P.tm,marginLeft:6,fontSize:10}}>Stock: {r.stockActuel}</span><span style={{marginLeft:6}}><Badge color={r.droitsAccise==="Droit suspendu"?"am":"gn"}>{r.droitsAccise==="Droit suspendu"?"Susp.":"Acq."}</Badge></span></div>
<input type="number" min="0" max={r.stockActuel} value={f.refsSelected[r.id]||""} onChange={e=>{const v=Math.min(+e.target.value,r.stockActuel);sF({...f,refsSelected:{...f.refsSelected,[r.id]:v>0?String(v):""}});}} style={{width:60,background:P.sf,color:P.tx,border:`1px solid ${P.bd}`,borderRadius:4,padding:"3px 6px",fontSize:12,textAlign:"center"}} placeholder="0"/>
</div>)}</div>}

{selectedAccise.length>0&&<div style={{background:P.bg,borderRadius:8,padding:10}}><div style={{fontSize:10,color:P.tm,fontWeight:600,marginBottom:4}}>DROITS D'ACCISE</div>{selectedAccise.map(a=><div key={a.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0"}}><span>{a.designation}</span><Badge color={a.accise==="Droit suspendu"?"am":"gn"}>{a.accise}</Badge></div>)}</div>}

<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8}}><Inp label="Colisage" value={f.colType} options={["Colis","Palette"]} onChange={v=>sF({...f,colType:v,colis:[]})} sm/><Inp label="Transport PA" value={f.tpa?"OUI":"NON"} options={["OUI","NON"]} onChange={v=>sF({...f,tpa:v==="OUI"})} sm/><Inp label="Assurance PA" value={f.apa?"OUI":"NON"} options={["OUI","NON"]} onChange={v=>sF({...f,apa:v==="OUI"})} sm/></div>

<div style={{background:P.bg,borderRadius:8,padding:10}}><div style={{fontSize:10,color:P.tm,fontWeight:600,marginBottom:6}}>COLISAGE DÉTAILLÉ</div><div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>{COLIS_FORMATS.filter(cf=>isPal?(cf.id==="PAL"||cf.id==="DPAL"):(cf.id!=="PAL"&&cf.id!=="DPAL")).map(cf=><Btn key={cf.id} v="secondary" sm onClick={()=>addColis(cf.id)}>+ {cf.label}</Btn>)}</div>
{f.colis.map((c,i)=>{const fmt=COLIS_FORMATS.find(x=>x.id===c.format);return <div key={i} style={{display:"flex",alignItems:"center",gap:6,background:P.sf,padding:"4px 8px",borderRadius:4,marginBottom:3}}><span style={{flex:1,fontSize:11,fontWeight:600}}>{fmt?.label}</span><input type="number" min="0" value={c.qty} onChange={e=>{const nc=[...f.colis];nc[i]={...nc[i],qty:Math.max(0,+e.target.value)};sF({...f,colis:nc});}} style={{width:45,background:P.bg,color:P.tx,border:`1px solid ${P.bd}`,borderRadius:4,padding:"2px 4px",fontSize:12,textAlign:"center"}}/><Btn v="danger" sm onClick={()=>sF({...f,colis:f.colis.filter((_,j)=>j!==i)})}>✕</Btn></div>;})}
{f.colis.length>0&&<div style={{fontSize:10,color:P.tm,marginTop:4}}>Total: <b style={{color:P.tx}}>{totalColis} colis</b>{facFour&&<span> — Fournitures: <b style={{color:P.am}}>{fourCost.toFixed(2)} €</b></span>}</div>}
{f.colType==="Colis"&&totalBtls>0&&<div style={{marginTop:6,padding:"8px 10px",borderRadius:8,background:capaciteColis<totalBtls?P.rds:videsColis>0?P.ams:P.gns,border:`1px solid ${capaciteColis<totalBtls?P.rd:videsColis>0?P.am:P.gn}40`}}>
<div style={{fontSize:11,fontWeight:600,color:capaciteColis<totalBtls?P.rd:videsColis>0?P.am:P.gn}}>
{capaciteColis<totalBtls?`❌ Capacité insuffisante : ${capaciteColis} emplacement(s) pour ${totalBtls} bouteilles — il manque ${totalBtls-capaciteColis} place(s), ajoutez des cartons`
:videsColis>0?`⚠️ ${capaciteColis} emplacements pour ${totalBtls} btls — ${videsColis} emplacement(s) vide(s) dans les cartons`
:`✔ ${totalBtls} bouteilles / ${capaciteColis} emplacements — cartons exactement remplis`}
</div>
{cartonsFill.length>0&&capaciteColis>=totalBtls&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:5}}>
{cartonsFill.map((c,k)=><span key={k} style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:10,background:c.take===c.cap?P.gns:P.ams,color:c.take===c.cap?P.gn:P.am}}>{c.take}/{c.cap}{c.take<c.cap?` (${c.cap-c.take} vide${c.cap-c.take>1?"s":""})`:""}</span>)}
</div>}
</div>}
</div>

<Inp label="Commentaire" value={f.commentaire} onChange={v=>sF({...f,commentaire:v})}/>
<Card style={{background:P.acs,border:`1px solid ${P.acb}`}}><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,textAlign:"center"}}><div><div style={{fontSize:9,color:P.tm}}>Btls</div><div style={{fontSize:16,fontWeight:700}}>{totalBtls}</div></div><div><div style={{fontSize:9,color:P.tm}}>Réfs</div><div style={{fontSize:16,fontWeight:700}}>{nbRefsSelected}</div></div><div><div style={{fontSize:9,color:P.tm}}>Colis</div><div style={{fontSize:16,fontWeight:700}}>{totalColis}</div></div><div><div style={{fontSize:9,color:P.tm}}>Montant HT</div><div style={{fontSize:16,fontWeight:700,color:P.ac}}>{(mt+(facFour?fourCost:0)).toFixed(2)} €</div></div></div></Card>
<Btn onClick={doSave} dis={!f.adherentId||totalBtls===0||!colisOk}>{!colisOk&&totalBtls>0?"⛔ Colisage incomplet":"Confirmer la sortie"}</Btn>
</div></Modal>}

{edS&&(()=>{const cur=d.sorties.find(x=>x.id===edS.id)||edS;const user=cu?.nom||"Admin";
const doEdit=()=>{const labels={date:"Date",destinataire:"Destinataire",commentaire:"Commentaire"};
const ap={date:esf.date,destinataire:esf.destinataire,commentaire:esf.commentaire};
const changes=diffChamps(cur,ap,labels);
if(!changes.length){sEdS(null);return;}
const nd={...d,sorties:d.sorties.map(x=>x.id===edS.id?{...x,...ap,historique:[...(x.historique||[]),{date:new Date().toISOString(),user,changes}]}:x)};
nd.auditLog=[...(nd.auditLog||[]),{date:new Date().toISOString(),user,role:cu?.role||"admin",module:"Sortie",action:`Sortie ${edS.id} modifiée — ${changes.map(c=>c.champ).join(", ")}`}];
sD(nd);sEdS(null);};
return <Modal title={`✏️ Modifier ${edS.id}`} onClose={()=>sEdS(null)} wide><div style={{display:"grid",gap:10}}>
<div style={{fontSize:11,color:P.tm}}>{cur.nbBouteilles} btls — {cur.colisageDetail||cur.colType} — {cur.stockDecremente?"stock déjà décompté (picking validé ou expédition)":"le stock sera décompté à la validation du picking"} ; les quantités ne sont pas modifiables (en cas d'erreur : statut « Annulé » pour restituer, puis recréez la sortie)</div>
{(cur.lignes||[]).length>0&&<div style={{background:P.bg,borderRadius:8,padding:10}}><div style={{fontSize:10,color:P.tm,fontWeight:600,marginBottom:4}}>💶 DÉTAIL DU MONTANT — {(cur.montant||0).toFixed(2)} € HT (selon la grille tarifaire de l'adhérent)</div>{(cur.lignes||[]).map((l,k)=><div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",borderBottom:`1px solid ${P.bd}30`}}><span>{l.desc}</span><b>{l.montant.toFixed(2)} €</b></div>)}</div>}
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
<Inp label="Date" type="date" value={esf.date} onChange={v=>sEsf({...esf,date:v})} sm/>
<Inp label="Destinataire" value={esf.destinataire} onChange={v=>sEsf({...esf,destinataire:v})} sm/>
</div>
<Inp label="Commentaire" value={esf.commentaire} onChange={v=>sEsf({...esf,commentaire:v})}/>
<Btn onClick={doEdit}>Enregistrer les modifications</Btn>
<div style={{borderTop:`1px solid ${P.bd}`,paddingTop:10}}>
<PhotoManager photos={cur.photos} dossier="sorties" user={user} onChange={(ph,note)=>{const nd={...d,sorties:d.sorties.map(x=>x.id===edS.id?{...x,photos:ph,historique:[...(x.historique||[]),{date:new Date().toISOString(),user,note}]}:x)};nd.auditLog=[...(nd.auditLog||[]),{date:new Date().toISOString(),user,role:cu?.role||"admin",module:"Sortie",action:`Sortie ${edS.id} — ${note}`}];sD(nd);}}/>
</div>
<Historique hist={cur.historique}/>
</div></Modal>;})()}
</div>;}

function Facturation({data:d,setData:sD,currentUser:cu}){const[vF,sVF]=useState(null);const[fl,sFl]=useState("Tous");const[fA,sfA]=useState("");const[fS,sfS]=useState("Tous");
const[genOpen,setGenOpen]=useState(false);const[genAdh,setGenAdh]=useState("");const[genMois,setGenMois]=useState(new Date().toISOString().slice(0,7));const[genStock,setGenStock]=useState(true);
const[edF,sEdF]=useState(null);const[lf,sLf]=useState([]);
const filteredByAdh=fA?d.factures.filter(f=>f.adherentId===fA):d.factures;
const filteredByType=fl==="Tous"?filteredByAdh:filteredByAdh.filter(f=>f.type===fl);
const filtered=fS==="Tous"?filteredByType:filteredByType.filter(f=>(f.statut||"Validée")===fS);
const ca=filteredByAdh.reduce((s,f)=>s+f.totalTTC,0);
const pendingCount=d.factures.filter(f=>f.statut==="En attente").length;
const isAdmin=cu?.role==="admin";
const user=cu?.nom||"Admin";

const validateFacture=(numero,action)=>{if(!sD)return;
const nd={...d,factures:d.factures.map(f=>f.numero===numero?{...f,statut:action==="valider"?"Validée":"Rejetée",validePar:cu?.nom||"Admin",valideDate:new Date().toISOString(),historique:[...(f.historique||[]),{date:new Date().toISOString(),user,note:action==="valider"?"✅ Relevé validé":"❌ Relevé rejeté"}]}:f),
auditLog:[...(d.auditLog||[]),{date:new Date().toISOString(),user,role:cu?.role||"admin",module:"Relevés",action:`Relevé ${numero} ${action==="valider"?"✅ validé":"❌ rejeté"}`}]};
sD(nd);};

// ─── Facture mensuelle globale (entrées + sorties + stockage du mois) ───
const dejaFacture=(rec)=>rec.factureNum||d.factures.some(f=>f.refSource===rec.id);
const calcStockageMensuel=(adh)=>{const g=adh.grille;const out=[];let nbPal=0,nbLots=0;
d.references.filter(r=>r.adherentId===adh.id&&(r.stockActuel||0)>0).forEach(r=>{if(r.condStock==="Palette")nbPal++;else nbLots+=Math.ceil((r.stockActuel||0)/12);});
if(nbPal>0)out.push({desc:`🗄️ Stockage mensuel — ${nbPal} palette(s) × ${g.stock_palette_mois.toFixed(2)} €`,montant:nbPal*g.stock_palette_mois});
if(nbLots>0)out.push({desc:`🗄️ Stockage mensuel — ${nbLots} espace(s) 12 btls × ${g.stock_espace12.toFixed(2)} €`,montant:nbLots*g.stock_espace12});
return out;};
const buildMensuelle=()=>{const adh=d.adherents.find(a=>a.id===genAdh);if(!adh)return null;
const inMonth=dt=>(dt||"").slice(0,7)===genMois;
const ents=d.entrees.filter(e=>e.adherentId===genAdh&&inMonth(e.date)&&!dejaFacture(e));
const sorts=d.sorties.filter(s=>s.adherentId===genAdh&&inMonth(s.date)&&!dejaFacture(s)&&s.statut!=="Annulé");
const lignes=[];
const detailStr=rec=>(rec.lignes||[]).length?` [${rec.lignes.map(l=>`${l.desc} : ${l.montant.toFixed(2)} €`).join(" + ")}]`:"";
ents.forEach(e=>lignes.push({desc:`📥 Entrée ${e.id} du ${e.date} — ${e.nbBtl} btls (${e.cond})${detailStr(e)}`,montant:e.montant||0}));
sorts.forEach(s=>lignes.push({desc:`📤 Sortie ${s.id} du ${s.date} — ${s.nbBouteilles} btls${s.destinataire?` → ${s.destinataire}`:""}${detailStr(s)}`,montant:s.montant||0}));
if(genStock)calcStockageMensuel(adh).forEach(l=>lignes.push(l));
const nbBtl=ents.reduce((s,e)=>s+(e.nbBtl||0),0)+sorts.reduce((s,x)=>s+(x.nbBouteilles||0),0);
return{adh,ents,sorts,lignes,nbBtl};};
const preview=genOpen&&genAdh?buildMensuelle():null;
const doGenerate=()=>{if(!preview||!preview.lignes.length)return;
const totalHT=preview.lignes.reduce((s,l)=>s+l.montant,0);const tva=totalHT*.2;const totalTTC=totalHT+tva;
const numero=`${genMois}-${String(d.nextFactureId).padStart(3,"0")}`;
const nd={...d,nextFactureId:d.nextFactureId+1};
nd.entrees=nd.entrees.map(e=>preview.ents.some(x=>x.id===e.id)?{...e,factureNum:numero}:e);
nd.sorties=nd.sorties.map(s=>preview.sorts.some(x=>x.id===s.id)?{...s,factureNum:numero}:s);
nd.factures=[...nd.factures,{numero,date:new Date().toISOString().slice(0,10),periode:genMois,adherentId:genAdh,type:"Mensuelle",refSource:`Période ${genMois}`,nbBouteilles:preview.nbBtl,colisageDetail:`Relevé mensuel — période ${genMois}`,lignes:preview.lignes,totalHT,tva,totalTTC,statut:"En attente",creePar:user,historique:[{date:new Date().toISOString(),user,note:`Relevé mensuel généré (${preview.ents.length} entrée(s), ${preview.sorts.length} sortie(s)${genStock?", stockage":""})`}]}];
nd.auditLog=[...(nd.auditLog||[]),{date:new Date().toISOString(),user,role:cu?.role||"admin",module:"Relevés",action:`Relevé mensuel ${numero} généré pour ${preview.adh.name} — ${totalTTC.toFixed(2)} € TTC`}];
sD(nd);setGenOpen(false);setGenAdh("");};

// ─── Modification d'une facture rejetée / en attente ───
const openEdit=f=>{sEdF(f);sLf((f.lignes||[]).map(l=>({desc:l.desc,montant:String(l.montant)})));};
const saveEdit=()=>{if(!edF)return;
const lignes=lf.filter(l=>l.desc.trim()).map(l=>({desc:l.desc,montant:+l.montant||0}));
if(!lignes.length)return;
const totalHT=lignes.reduce((s,l)=>s+l.montant,0);const tva=totalHT*.2;const totalTTC=totalHT+tva;
const nd={...d,factures:d.factures.map(x=>x.numero===edF.numero?{...x,lignes,totalHT,tva,totalTTC,statut:"En attente",validePar:null,valideDate:null,historique:[...(x.historique||[]),{date:new Date().toISOString(),user,note:`✏️ Relevé corrigé (${x.totalTTC.toFixed(2)} € TTC → ${totalTTC.toFixed(2)} € TTC) — repassée en attente de validation`}]}:x),
auditLog:[...(d.auditLog||[]),{date:new Date().toISOString(),user,role:cu?.role||"admin",module:"Relevés",action:`Relevé ${edF.numero} corrigé — nouveau total ${totalTTC.toFixed(2)} € TTC — en attente de validation`}]};
sD(nd);sEdF(null);};
const delFacture=f=>{if(!window.confirm(`Supprimer le relevé rejeté ${f.numero} ? Les entrées/sorties liées pourront être reprises dans un prochain relevé.`))return;
const nd={...d,factures:d.factures.filter(x=>x.numero!==f.numero),
entrees:d.entrees.map(e=>e.factureNum===f.numero?{...e,factureNum:null}:e),
sorties:d.sorties.map(s=>s.factureNum===f.numero?{...s,factureNum:null}:s),
auditLog:[...(d.auditLog||[]),{date:new Date().toISOString(),user,role:cu?.role||"admin",module:"Relevés",action:`Relevé rejeté ${f.numero} supprimé — actions libérées pour un prochain relevé`}]};
sD(nd);};

return <div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}><h3 style={{color:P.tx,margin:0}}>Relevés de prestations</h3><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><Btn v="secondary" sm onClick={()=>exportCSV(`releves_${dateTag()}.csv`,["N°","Date","Période","Type","Adhérent","Total HT","TVA","Total TTC","Statut","Validé par"],filtered.map(x=>[x.numero,x.date,x.periode||"",x.type,d.adherents.find(a=>a.id===x.adherentId)?.name||x.adherentId,x.totalHT.toFixed(2),x.tva.toFixed(2),x.totalTTC.toFixed(2),x.statut||"Validée",x.validePar||""]))}>⬇️ Export</Btn>{isAdmin&&<Btn onClick={()=>setGenOpen(true)}>💶 Générer le relevé mensuel</Btn>}</div></div>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,marginBottom:14}}>
<Stat label="Relevés" value={filtered.length} icon="🧾" color="bl"/>
<Stat label="Prestations TTC" value={`${ca.toFixed(0)} €`} icon="💰" color="gn"/>
{pendingCount>0&&<Stat label="En attente validation" value={pendingCount} icon="⏳" color="am"/>}
</div>

{/* Pending banner for admin */}
{isAdmin&&pendingCount>0&&<Card style={{marginBottom:14,background:"#fef9ee",border:`1px solid ${P.am}40`}}>
<div style={{display:"flex",alignItems:"center",gap:10}}>
<span style={{fontSize:22}}>⏳</span>
<div style={{flex:1}}><div style={{fontWeight:700,fontSize:13,color:P.am}}>{pendingCount} relevé(s) en attente de votre validation</div>
<div style={{fontSize:11,color:P.tm}}>Les relevés doivent être validés par l'administrateur avant d'être visibles et imprimables</div></div>
<Btn sm onClick={()=>{sfS("En attente");sFl("Tous");}}>Voir les relevés en attente</Btn>
</div>
</Card>}

<div style={{display:"flex",gap:10,marginBottom:10,alignItems:"flex-end",flexWrap:"wrap"}}>
<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{["Tous","Mensuelle","Entrée","Sortie","Stockage"].map(t=><Btn key={t} v={fl===t?"primary":"secondary"} sm onClick={()=>sFl(t)}>{t==="Mensuelle"?"💶 "+t:t}</Btn>)}</div>
<div style={{display:"flex",gap:6}}>{["Tous","En attente","Validée","Rejetée"].map(s=><Btn key={s} v={fS===s?"primary":"secondary"} sm onClick={()=>sfS(s)} style={s==="En attente"&&pendingCount>0?{background:P.ams,color:P.am,border:`1px solid ${P.am}40`}:{}}>{s==="En attente"?`⏳ En attente${pendingCount>0?` (${pendingCount})`:""}`:(s==="Validée"?"✅ Validé":s==="Rejetée"?"❌ Rejeté":s)}</Btn>)}</div>
<Inp label="Adhérent" value={fA} options={[{value:"",label:"— Tous —"},...d.adherents.map(a=>({value:a.id,label:a.name}))]} onChange={sfA} sm/>
</div>

<Card><Table columns={[
{key:"numero",label:"N°"},{key:"date",label:"Date"},
{key:"type",label:"Type",render:r=><Badge color={r.type==="Mensuelle"?"ac":r.type==="Entrée"?"bl":r.type==="Sortie"?"am":"gn"}>{r.type==="Mensuelle"?"💶 Mensuelle":r.type}</Badge>},
{key:"adherentId",label:"Adhérent",render:r=>d.adherents.find(a=>a.id===r.adherentId)?.name?.split(" ").slice(-1)[0]||""},
{key:"totalHT",label:"HT",render:r=>`${r.totalHT.toFixed(2)}`},
{key:"totalTTC",label:"TTC",render:r=><span style={{fontWeight:700,color:P.gn}}>{r.totalTTC.toFixed(2)} €</span>},
{key:"statut",label:"Statut",render:r=>{const s=r.statut||"Validée";return <Badge color={s==="Validée"?"gn":s==="En attente"?"am":"rd"}>{s==="Validée"?"✅ Validé":s==="En attente"?"⏳ En attente":"❌ Rejeté"}</Badge>;}},
{key:"validePar",label:"Validé par",render:r=>r.validePar?<span style={{fontSize:11,color:P.tm}}>{r.validePar}<br/><span style={{fontSize:9}}>{r.valideDate?new Date(r.valideDate).toLocaleDateString("fr"):""}</span></span>:"—"},
{key:"actions",label:"",render:r=>{const s=r.statut||"Validée";return <div style={{display:"flex",gap:4}}>
{isAdmin&&s==="En attente"&&<><Btn v="success" sm onClick={e=>{e.stopPropagation();validateFacture(r.numero,"valider");}}>✅</Btn><Btn v="danger" sm onClick={e=>{e.stopPropagation();validateFacture(r.numero,"rejeter");}}>❌</Btn></>}
{isAdmin&&(s==="Rejetée"||s==="En attente")&&<Btn v="ghost" sm onClick={e=>{e.stopPropagation();openEdit(r);}}>✏️</Btn>}
{isAdmin&&s==="Rejetée"&&<Btn v="danger" sm onClick={e=>{e.stopPropagation();delFacture(r);}}>🗑️</Btn>}
{s==="Validée"&&<Btn v="ghost" sm onClick={e=>{e.stopPropagation();sVF(r);}}>🖨️</Btn>}
{(s==="En attente"||s==="Rejetée")&&<Btn v="ghost" sm onClick={e=>{e.stopPropagation();sVF(r);}}>👁️</Btn>}
</div>;}},
]} data={[...filtered].reverse()}/></Card>
{vF&&<InvoiceView facture={vF} adherent={d.adherents.find(a=>a.id===vF.adherentId)} onClose={()=>sVF(null)}/>}

{/* ─── Génération de la facture mensuelle ─── */}
{genOpen&&<Modal title="💶 Relevé mensuel de prestations" onClose={()=>setGenOpen(false)} wide>
<div style={{display:"grid",gap:10}}>
<div style={{fontSize:12,color:P.tm}}>Un seul relevé regroupant toutes les prestations du mois pour un adhérent : entrées, sorties (fournitures incluses) et stockage mensuel. Ce document, visible par l'adhérent, sert de base à la facture émise dans votre logiciel comptable. Les actions déjà incluses dans un relevé sont automatiquement exclues.</div>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:8}}>
<Inp label="Adhérent" value={genAdh} options={d.adherents.filter(a=>a.stockageActif).map(a=>({value:a.id,label:a.name}))} onChange={setGenAdh}/>
<Inp label="Période (mois)" type="month" value={genMois} onChange={setGenMois}/>
</div>
<label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,cursor:"pointer",padding:"8px 10px",background:genStock?P.acs:P.bg,borderRadius:8,border:`1px solid ${genStock?P.ac:P.bd}`}}>
<input type="checkbox" checked={genStock} onChange={e=>setGenStock(e.target.checked)}/>Inclure le stockage mensuel (palettes et espaces 12 btls au tarif de la grille)
</label>
{preview&&<div style={{background:P.bg,borderRadius:10,padding:12}}>
<div style={{fontSize:10,color:P.tm,fontWeight:600,marginBottom:6}}>APERÇU — {preview.ents.length} entrée(s), {preview.sorts.length} sortie(s)</div>
{preview.lignes.length===0?<div style={{fontSize:12,color:P.td,padding:8}}>Rien à inclure sur cette période (tout est déjà dans un relevé ou aucune activité)</div>:
<>{preview.lignes.map((l,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",gap:10,fontSize:12,padding:"5px 0",borderBottom:`1px solid ${P.bd}30`}}><span>{l.desc}</span><b>{l.montant.toFixed(2)} €</b></div>)}
<div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:700,color:P.ac,paddingTop:8}}><span>Total HT</span><span>{preview.lignes.reduce((s,l)=>s+l.montant,0).toFixed(2)} €</span></div>
<div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:P.tm}}><span>TVA 20 % — TTC</span><span>{(preview.lignes.reduce((s,l)=>s+l.montant,0)*1.2).toFixed(2)} €</span></div></>}
</div>}
<Btn onClick={doGenerate} dis={!preview||!preview.lignes.length}>Générer le relevé mensuel</Btn>
</div>
</Modal>}

{/* ─── Correction d'une facture rejetée / en attente ─── */}
{edF&&<Modal title={`✏️ Corriger le relevé ${edF.numero}`} onClose={()=>sEdF(null)} wide>
<div style={{display:"grid",gap:10}}>
<div style={{fontSize:12,color:P.tm}}>Modifiez les lignes puis enregistrez : le relevé repassera <b>en attente de validation</b>. Chaque correction est tracée dans l'historique.</div>
<div style={{background:P.bg,borderRadius:10,padding:12}}>
{lf.map((l,i)=><div key={i} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
<input value={l.desc} onChange={e=>{const n=[...lf];n[i]={...n[i],desc:e.target.value};sLf(n);}} placeholder="Description" style={{flex:1,fontFamily:FN,fontSize:12,background:P.sf,color:P.tx,border:`1px solid ${P.bd}`,borderRadius:6,padding:"8px 10px",outline:"none",minWidth:0}}/>
<input type="number" step="0.01" value={l.montant} onChange={e=>{const n=[...lf];n[i]={...n[i],montant:e.target.value};sLf(n);}} style={{width:90,fontFamily:FN,fontSize:12,background:P.sf,color:P.tx,border:`1px solid ${P.bd}`,borderRadius:6,padding:"8px 10px",textAlign:"right",outline:"none"}}/>
<Btn v="danger" sm onClick={()=>sLf(lf.filter((_,j)=>j!==i))}>✕</Btn>
</div>)}
<Btn v="secondary" sm onClick={()=>sLf([...lf,{desc:"",montant:"0"}])}>+ Ajouter une ligne</Btn>
<div style={{display:"flex",justifyContent:"space-between",fontSize:13,fontWeight:700,color:P.ac,marginTop:10,paddingTop:8,borderTop:`2px solid ${P.bd}`}}><span>Total HT</span><span>{lf.reduce((s,l)=>s+(+l.montant||0),0).toFixed(2)} €</span></div>
<div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:P.tm}}><span>TTC (TVA 20 %)</span><span>{(lf.reduce((s,l)=>s+(+l.montant||0),0)*1.2).toFixed(2)} €</span></div>
</div>
<Btn onClick={saveEdit} dis={!lf.filter(l=>l.desc.trim()).length}>Enregistrer — repasser en validation</Btn>
<Historique hist={(d.factures.find(x=>x.numero===edF.numero)||edF).historique}/>
</div>
</Modal>}
</div>;}

// ─── VUE 3D ISOMÉTRIQUE DE L'ENTREPÔT ───
// ─── CASIER DÉTAILLÉ : les 12 places d'un espace, vue de dessus ───
const COULEUR_VIN={Rouge:"#7f1d1d",Blanc:"#e6d690","Rosé":"#f2a7b6",Effervescent:"#2f5d3a",Liquoreux:"#d19a2f"};
function CasierGrid({refsHere}){
const colorOf=c=>COULEUR_VIN[c]||"#7f1d1d";
const slots=[];refsHere.forEach(r=>{for(let i=0;i<(r.stockActuel||0)&&slots.length<12;i++)slots.push(r);});
while(slots.length<12)slots.push(null);
const libres=slots.filter(s=>!s).length;
return <div style={{marginTop:10}}>
<div style={{fontSize:10,fontWeight:600,color:P.tm,marginBottom:6}}>🗃️ CASIER — LES 12 PLACES (vue de dessus)</div>
<div style={{display:"grid",gridTemplateColumns:"repeat(4,54px)",gap:8,background:"linear-gradient(145deg,#a9793f22,#8b5a2b33)",border:"2px solid #8b5a2b66",borderRadius:14,padding:12,width:"fit-content",maxWidth:"100%"}}>
{slots.map((r,i)=><div key={i} title={r?`Place ${i+1} : ${r.id} — ${r.designation} (${r.couleur})`:`Place ${i+1} : libre`} style={{width:54,height:54,borderRadius:"50%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",...(r?{background:`radial-gradient(circle at 33% 30%, #ffffff55 4%, ${colorOf(r.couleur)} 42%, #00000055 100%)`,border:"3px solid #00000026",boxShadow:"inset 0 0 10px #0007, 0 2px 5px #0004"}:{border:`2px dashed ${P.bd}`,background:P.sf})}}>
{r?<><span style={{fontSize:10,fontWeight:800,color:"#fff",textShadow:"0 1px 2px #000c"}}>{i+1}</span><span style={{fontSize:7,fontWeight:600,color:"#ffffffdd",textShadow:"0 1px 2px #000c"}}>{r.id.replace("REF","R·")}</span></>:<span style={{fontSize:9,color:P.td}}>{i+1}</span>}
</div>)}
</div>
<div style={{display:"grid",gap:4,marginTop:8}}>
{refsHere.map(r=><div key={r.id} style={{display:"flex",alignItems:"center",gap:8,fontSize:11}}>
<span style={{width:14,height:14,borderRadius:"50%",background:colorOf(r.couleur),border:"2px solid #00000022",flexShrink:0}}/>
<span style={{flex:1}}><b>{r.id}</b> — {r.designation}</span>
<b style={{color:P.gn}}>{Math.min(r.stockActuel,12)} btl{r.stockActuel>1?"s":""}</b>
</div>)}
{libres>0&&<div style={{display:"flex",alignItems:"center",gap:8,fontSize:11,color:P.tm}}><span style={{width:14,height:14,borderRadius:"50%",border:`2px dashed ${P.bd}`,flexShrink:0}}/>{libres} place{libres>1?"s":""} libre{libres>1?"s":""}</div>}
</div>
<div style={{fontSize:9,color:P.td,marginTop:6}}>Répartition indicative : les bouteilles sont placées dans l'ordre des références.</div>
</div>;}

// ─── VUE 3D RÉALISTE DE L'ENTREPÔT (three.js / WebGL) ───
function Espaces3D({espaces,references,onSelect,selected}){
const mountRef=useRef(null);
useEffect(()=>{
let disposed=false,renderer,scene,camera,controls,raf;
(async()=>{
const THREE=await import("three");
const{OrbitControls}=await import("three/examples/jsm/controls/OrbitControls.js");
if(disposed||!mountRef.current)return;
const mount=mountRef.current;mount.innerHTML="";
const W=mount.clientWidth||800,H=470;
renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(W,H);renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
mount.appendChild(renderer.domElement);
scene=new THREE.Scene();scene.background=new THREE.Color(0xeef3f8);
scene.fog=new THREE.Fog(0xeef3f8,600,1600);
camera=new THREE.PerspectiveCamera(42,W/H,0.5,3000);
scene.add(new THREE.AmbientLight(0xffffff,0.75));
const sun=new THREE.DirectionalLight(0xffffff,1.1);sun.position.set(160,260,140);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-400;sun.shadow.camera.right=400;sun.shadow.camera.top=400;sun.shadow.camera.bottom=-400;
scene.add(sun);
// Matériaux partagés
const M={
wood:new THREE.MeshStandardMaterial({color:0xc89b6a,roughness:.8}),
woodDark:new THREE.MeshStandardMaterial({color:0x9a7146,roughness:.85}),
metal:new THREE.MeshStandardMaterial({color:0x7b8794,roughness:.4,metalness:.6}),
carton:new THREE.MeshStandardMaterial({color:0xb98f5a,roughness:.9}),
pallet:new THREE.MeshStandardMaterial({color:0x8b5a2b,roughness:.9}),
floor:new THREE.MeshStandardMaterial({color:0xe3e9f0,roughness:1}),
foil:new THREE.MeshStandardMaterial({color:0x30363d,roughness:.35,metalness:.5}),
sel:new THREE.MeshStandardMaterial({color:0x3b9abf,transparent:true,opacity:.35}),
};
const bottleColor=c=>({Rouge:0x7f1d1d,Blanc:0xe6d690,"Rosé":0xf2a7b6,Effervescent:0x2f5d3a,Liquoreux:0xd19a2f}[c]||0x7f1d1d);
const bottleMats={};const getBottleMat=c=>bottleMats[c]||(bottleMats[c]=new THREE.MeshStandardMaterial({color:bottleColor(c),roughness:.25}));
const bodyGeo=new THREE.CylinderGeometry(1.9,1.9,9,14);
const neckGeo=new THREE.CylinderGeometry(0.7,1.1,3.2,10);
const capGeo=new THREE.CylinderGeometry(0.75,0.75,1,10);
const makeBottle=(mat)=>{const g=new THREE.Group();
const b=new THREE.Mesh(bodyGeo,mat);b.position.y=4.5;b.castShadow=true;g.add(b);
const n=new THREE.Mesh(neckGeo,mat);n.position.y=10.6;g.add(n);
const f=new THREE.Mesh(capGeo,M.foil);f.position.y=12.6;g.add(f);
return g;};
const makeLabel=(txt,px,color)=>{const c=document.createElement("canvas");const fs=48;const cx=c.getContext("2d");cx.font=`bold ${fs}px sans-serif`;const w=Math.ceil(cx.measureText(txt).width)+20;c.width=w;c.height=fs+18;const cx2=c.getContext("2d");cx2.font=`bold ${fs}px sans-serif`;cx2.fillStyle=color||"#1e293b";cx2.fillText(txt,10,fs);const tex=new THREE.CanvasTexture(c);tex.anisotropy=4;const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true}));sp.scale.set(px*w/(fs+18),px,1);return sp;};
// Sol + grille
const floor=new THREE.Mesh(new THREE.PlaneGeometry(3000,3000),M.floor);floor.rotation.x=-Math.PI/2;floor.position.y=-0.01;floor.receiveShadow=true;scene.add(floor);
const grid=new THREE.GridHelper(3000,100,0xc9d4e0,0xdde5ee);grid.position.y=0;scene.add(grid);
// Construction des racks
const SLOT_W=34,SLOT_D=30,SHELF_H=26,BOARD_T=1.6;
const clickables=[];const root=new THREE.Group();scene.add(root);
let zoneX=0;
espaces.forEach(zone=>{
const nSlots=Math.max(1,...zone.rangs.map(r=>r.emplacements.length),1);
const rackW=nSlots*SLOT_W,rackH=Math.max(1,zone.rangs.length)*SHELF_H;
const zg=new THREE.Group();zg.position.x=zoneX;root.add(zg);
// Montants métalliques
[[0,0],[rackW,0],[0,SLOT_D],[rackW,SLOT_D]].forEach(([px,pz])=>{const up=new THREE.Mesh(new THREE.BoxGeometry(2,rackH+8,2),M.metal);up.position.set(px,(rackH+8)/2,pz-SLOT_D/2);up.castShadow=true;zg.add(up);});
// Étiquette de zone
const zl=makeLabel(zone.nom,14,"#2b7a9e");zl.position.set(rackW/2,rackH+20,0);zg.add(zl);
zone.rangs.forEach((rang,ri)=>{
const y=ri*SHELF_H;
// Planche
const board=new THREE.Mesh(new THREE.BoxGeometry(rackW+6,BOARD_T,SLOT_D+6),ri===0?M.woodDark:M.wood);
board.position.set(rackW/2,y,0);board.receiveShadow=true;board.castShadow=true;zg.add(board);
// Étiquette de rang
const rl=makeLabel(rang.nom,8,"#64748b");rl.position.set(-12,y+8,0);zg.add(rl);
rang.emplacements.forEach((e,ei)=>{
const sx=ei*SLOT_W+SLOT_W/2;
const refsHere=references.filter(x=>x.emplacement===e.id&&(x.stockActuel||0)>0);
const btls=refsHere.reduce((s,x)=>s+(x.stockActuel||0),0);
const slot=new THREE.Group();slot.position.set(sx,y+BOARD_T/2,0);zg.add(slot);
// Zone cliquable invisible
const hit=new THREE.Mesh(new THREE.BoxGeometry(SLOT_W-2,SHELF_H-4,SLOT_D),new THREE.MeshBasicMaterial({visible:false}));
hit.position.y=(SHELF_H-4)/2;hit.userData.empId=e.id;slot.add(hit);clickables.push(hit);
// Surbrillance de sélection
if(selected===e.id){const hl=new THREE.Mesh(new THREE.BoxGeometry(SLOT_W-3,SHELF_H-5,SLOT_D-1),M.sel);hl.position.y=(SHELF_H-5)/2;slot.add(hl);}
if(e.cond==="Espace 12 btls"){
// Bouteilles individuelles debout (grille 4×3), couleur selon le vin
let placed=0;
const positions=[];for(let row=0;row<3;row++)for(let col=0;col<4;col++)positions.push([col*7-10.5,row*8-8]);
refsHere.forEach(r=>{const mat=getBottleMat(r.couleur);for(let i=0;i<(r.stockActuel||0)&&placed<12;i++){const[bx,bz]=positions[placed];const bt=makeBottle(mat);bt.position.set(bx,0,bz);bt.rotation.y=Math.random()*0.5;slot.add(bt);placed++;}});
if(btls>0){const cl=makeLabel(`${Math.min(btls,12)}/12`,6,btls>=12?"#b91c1c":"#b45309");cl.position.set(0,SHELF_H-8,SLOT_D/2-2);slot.add(cl);}
}else{
// Palette bois + cartons empilés
const pal=new THREE.Group();slot.add(pal);
if(refsHere.length>0){
const pw=SLOT_W-8,pd=SLOT_D-6;
for(let s2=0;s2<3;s2++){const slat=new THREE.Mesh(new THREE.BoxGeometry(pw,1.4,4),M.pallet);slat.position.set(0,0.7,(s2-1)*(pd/2-2));slat.castShadow=true;pal.add(slat);}
const deck=new THREE.Mesh(new THREE.BoxGeometry(pw,1,pd),M.pallet);deck.position.y=1.9;pal.add(deck);
const nCases=Math.max(1,Math.min(12,Math.ceil(btls/12)));
for(let ci=0;ci<nCases;ci++){const layer=Math.floor(ci/4),pos=ci%4;
const cs=new THREE.Mesh(new THREE.BoxGeometry(10.5,7,10.5),M.carton);
cs.position.set((pos%2)*11-5.5,2.4+3.5+layer*7.3,Math.floor(pos/2)*11-5.5);
cs.rotation.y=(Math.random()-0.5)*0.06;cs.castShadow=true;pal.add(cs);}
const cl=makeLabel(`${btls} btls`,6,"#2b7a9e");cl.position.set(0,SHELF_H-8,SLOT_D/2-2);slot.add(cl);
}}
// Nom de l'emplacement
const el=makeLabel(e.nom,5.5,"#475569");el.position.set(sx,y-4,SLOT_D/2+3);zg.add(el);
});
});
zoneX+=rackW+70;
});
// Cadrage caméra
const bbox=new THREE.Box3().setFromObject(root);const c0=bbox.getCenter(new THREE.Vector3());const sz=bbox.getSize(new THREE.Vector3());
const dist=Math.max(sz.x,sz.y*1.6,sz.z)*0.85+50;
camera.position.set(c0.x+dist*0.75,c0.y+dist*0.62,c0.z+dist*0.9);
controls=new OrbitControls(camera,renderer.domElement);
controls.target.copy(c0);controls.enableDamping=true;controls.dampingFactor=0.08;controls.maxPolarAngle=Math.PI/2.05;controls.minDistance=40;controls.maxDistance=dist*2.5;
// Clic (sans drag) → sélection
const ray=new THREE.Raycaster();const pt=new THREE.Vector2();let downPos=null;
const dom=renderer.domElement;
dom.addEventListener("pointerdown",ev=>{downPos=[ev.clientX,ev.clientY];});
dom.addEventListener("pointerup",ev=>{
if(!downPos||Math.hypot(ev.clientX-downPos[0],ev.clientY-downPos[1])>7){downPos=null;return;}
const r=dom.getBoundingClientRect();
pt.x=((ev.clientX-r.left)/r.width)*2-1;pt.y=-((ev.clientY-r.top)/r.height)*2+1;
ray.setFromCamera(pt,camera);
const hits=ray.intersectObjects(clickables,false);
if(hits.length)onSelect(hits[0].object.userData.empId);
downPos=null;});
const animate=()=>{if(disposed)return;raf=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);};
animate();
})();
return()=>{disposed=true;if(raf)cancelAnimationFrame(raf);try{controls?.dispose();}catch{}try{renderer?.dispose();renderer?.domElement?.remove();}catch{}};
},[espaces,references,selected]);
return <div>
<div ref={mountRef} style={{width:"100%",height:470,borderRadius:12,overflow:"hidden",touchAction:"none",background:"#eef3f8"}}/>
<div style={{display:"flex",gap:14,justifyContent:"center",flexWrap:"wrap",fontSize:11,color:P.tm,marginTop:8}}>
<span>🍷 Bouteilles individuelles (couleur = type de vin)</span>
<span>📦 Palettes avec cartons empilés</span>
<span>🖱️ Glisser pour tourner — molette/pincer pour zoomer — cliquer un emplacement pour le détail</span>
</div>
</div>;}

function Espaces({data:d,setData:sD,currentUser:cu}){const[nz,snz]=useState("");const[nr,snr]=useState({z:"",n:""});const[ne,sne]=useState({z:"",r:"",n:"",c:"Palette"});const[vue,setVue]=useState("liste");const[selEmp,setSelEmp]=useState(null);
const allE=[];d.espaces.forEach(z=>z.rangs.forEach(r=>r.emplacements.forEach(e=>allE.push({...e,zone:z.nom,rang:r.nom}))));
const refsAt=id=>d.references.filter(x=>x.emplacement===id&&(x.stockActuel||0)>0);
const occ=allE.filter(e=>refsAt(e.id).length>0).length;
const rFor=ne.z?d.espaces.find(z=>z.id===ne.z)?.rangs||[]:[];
const user=cu?.nom||"Admin";
// Réfs en stock sans emplacement valide (texte libre ou vide) → affectation rapide
const empIds=new Set(allE.map(e=>e.id));
const orphelines=d.references.filter(r=>(r.stockActuel||0)>0&&(!r.emplacement||!empIds.has(r.emplacement)));
const eOpts=allE.map(e=>{const rh=refsAt(e.id);const btls=rh.reduce((s,x)=>s+(x.stockActuel||0),0);const cap=e.cond==="Espace 12 btls"?12:null;
return{value:e.id,label:`${e.zone} › ${e.rang} › ${e.nom} (${e.cond}) ${rh.length===0?"✅ libre":cap?`${btls}/${cap}`:"⛔ occupé"}`};});
const affecter=(refId,empId)=>{if(!empId)return;const r=d.references.find(x=>x.id===refId);const lbl=eOpts.find(o=>o.value===empId)?.label||empId;
const nd={...d,references:d.references.map(x=>x.id===refId?{...x,emplacement:empId,historique:[...(x.historique||[]),{date:new Date().toISOString(),user,changes:[{champ:"Emplacement",avant:r?.emplacement||"—",apres:lbl}]}]}:x),
auditLog:[...(d.auditLog||[]),{date:new Date().toISOString(),user,role:cu?.role||"admin",module:"Espaces",action:`${refId} affectée à l'emplacement ${lbl}`}]};sD(nd);};
const selInfo=selEmp?allE.find(e=>e.id===selEmp):null;
return <div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}><h3 style={{color:P.tx,margin:0}}>Espaces de Stockage</h3><div style={{display:"flex",gap:6}}><Btn v={vue==="liste"?"primary":"secondary"} sm onClick={()=>setVue("liste")}>📋 Liste</Btn><Btn v={vue==="3d"?"primary":"secondary"} sm onClick={()=>setVue("3d")}>🧊 Vue 3D</Btn></div></div>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:14}}><Stat label="Total" value={allE.length} icon="🗄️" color="bl"/><Stat label="Occupés" value={occ} icon="📦" color="am"/><Stat label="Libres" value={allE.length-occ} icon="✅" color="gn"/><Stat label="Taux" value={`${allE.length?Math.round(occ/allE.length*100):0}%`} icon="📊" color="ac"/></div>

{orphelines.length>0&&<Card style={{marginBottom:14,border:`1px solid ${P.am}50`,background:"#fef9ee"}}>
<div style={{fontSize:12,fontWeight:700,color:P.am,marginBottom:8}}>📍 {orphelines.length} référence(s) en stock sans emplacement affecté</div>
<div style={{fontSize:11,color:P.tm,marginBottom:8}}>Affectez chaque référence à un emplacement créé ci-dessous (le stockage doit correspondre aux espaces réels, pas à du texte libre).</div>
{orphelines.map(r=><div key={r.id} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${P.bd}30`,flexWrap:"wrap"}}>
<div style={{flex:1,minWidth:180,fontSize:12}}><b>{r.designation}</b> <span style={{color:P.tm,fontSize:10}}>({r.id} — {r.stockActuel} btls{r.emplacement?` — texte libre : « ${r.emplacement} »`:""})</span></div>
<select defaultValue="" onChange={e=>affecter(r.id,e.target.value)} style={{fontFamily:FN,fontSize:11,background:P.sf,color:P.tx,border:`1px solid ${P.bd}`,borderRadius:6,padding:"6px 8px",maxWidth:280}}>
<option value="">— Affecter à... —</option>
{eOpts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
</select>
</div>)}
</Card>}

{vue==="3d"&&allE.length>0&&<Card style={{marginBottom:14,overflow:"hidden"}}><Espaces3D espaces={d.espaces} references={d.references} onSelect={id=>setSelEmp(id===selEmp?null:id)} selected={selEmp}/></Card>}
{selInfo&&(()=>{const rh=refsAt(selInfo.id);const btls=rh.reduce((s,x)=>s+(x.stockActuel||0),0);const cap=selInfo.cond==="Espace 12 btls"?12:null;
return <Card style={{marginBottom:14,borderLeft:`4px solid ${P.ac}`}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,gap:8}}>
<div style={{fontSize:13,fontWeight:700,color:P.tx}}>📦 {selInfo.zone} › {selInfo.rang} › {selInfo.nom} <Badge color={rh.length?"am":"gn"}>{selInfo.cond}</Badge></div>
<Btn v="ghost" sm onClick={()=>setSelEmp(null)}>✕</Btn>
</div>
<div style={{fontSize:12,color:P.tm,marginBottom:8}}>{cap?`${btls}/${cap} bouteilles — ${Math.max(0,cap-btls)} place(s) libre(s)`:`${btls} bouteilles`} — {rh.length} référence(s)</div>
{cap?<CasierGrid refsHere={rh}/>:<>
{rh.map(r=><div key={r.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",borderBottom:`1px solid ${P.bd}30`}}><span>🍷 {r.designation} <span style={{color:P.tm,fontSize:10}}>({d.adherents.find(a=>a.id===r.adherentId)?.name||""})</span></span><b style={{color:P.gn}}>{r.stockActuel} btls</b></div>)}
{rh.length===0&&<div style={{fontSize:12,color:P.gn}}>✅ Emplacement libre</div>}
</>}
</Card>;})()}
<Card style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:P.ac,marginBottom:10}}>PARAMÉTRAGE</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10}}><div style={{background:P.bg,borderRadius:8,padding:10}}><div style={{fontSize:9,color:P.tm,fontWeight:600,marginBottom:4}}>ZONE</div><Inp placeholder="Nom" value={nz} onChange={snz} sm/><Btn v="secondary" sm onClick={()=>{if(!nz)return;sD({...d,espaces:[...d.espaces,{id:"Z"+Date.now(),nom:nz,rangs:[]}]});snz("");}} style={{marginTop:4,width:"100%"}}>+</Btn></div><div style={{background:P.bg,borderRadius:8,padding:10}}><div style={{fontSize:9,color:P.tm,fontWeight:600,marginBottom:4}}>RANG</div><Inp value={nr.z} options={d.espaces.map(z=>({value:z.id,label:z.nom}))} onChange={v=>snr({...nr,z:v})} sm/><Inp placeholder="Nom" value={nr.n} onChange={v=>snr({...nr,n:v})} sm style={{marginTop:3}}/><Btn v="secondary" sm onClick={()=>{if(!nr.z||!nr.n)return;sD({...d,espaces:d.espaces.map(z=>z.id===nr.z?{...z,rangs:[...z.rangs,{id:nr.z+"-R"+Date.now(),nom:nr.n,emplacements:[]}]}:z)});snr({z:"",n:""});}} style={{marginTop:4,width:"100%"}}>+</Btn></div><div style={{background:P.bg,borderRadius:8,padding:10}}><div style={{fontSize:9,color:P.tm,fontWeight:600,marginBottom:4}}>EMPLACEMENT</div><Inp value={ne.z} options={d.espaces.map(z=>({value:z.id,label:z.nom}))} onChange={v=>sne({...ne,z:v,r:""})} sm/><Inp value={ne.r} options={rFor.map(r=>({value:r.id,label:r.nom}))} onChange={v=>sne({...ne,r:v})} sm style={{marginTop:3}}/><Inp placeholder="Nom" value={ne.n} onChange={v=>sne({...ne,n:v})} sm style={{marginTop:3}}/><Inp value={ne.c} options={["Palette","Espace 12 btls"]} onChange={v=>sne({...ne,c:v})} sm style={{marginTop:3}}/><Btn v="secondary" sm onClick={()=>{if(!ne.z||!ne.r||!ne.n)return;sD({...d,espaces:d.espaces.map(z=>z.id===ne.z?{...z,rangs:z.rangs.map(r=>r.id===ne.r?{...r,emplacements:[...r.emplacements,{id:ne.r+"-E"+Date.now(),nom:ne.n,cond:ne.c,occupe:false,refId:null}]}:r)}:z)});sne({z:"",r:"",n:"",c:"Palette"});}} style={{marginTop:4,width:"100%"}}>+</Btn></div></div></Card>
{vue==="liste"&&d.espaces.map(z=><Card key={z.id} style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><h4 style={{color:P.ac,margin:0,fontSize:13}}>{z.nom}</h4><Btn v="danger" sm onClick={()=>sD({...d,espaces:d.espaces.filter(x=>x.id!==z.id)})}>Suppr.</Btn></div>{z.rangs.map(r=><div key={r.id} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:11,fontWeight:600,color:P.tm}}>{r.nom}</span><Btn v="ghost" sm onClick={()=>sD({...d,espaces:d.espaces.map(zz=>zz.id===z.id?{...zz,rangs:zz.rangs.filter(rr=>rr.id!==r.id)}:zz)})}>✕</Btn></div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{r.emplacements.map(e=>{const rh=refsAt(e.id);const btls=rh.reduce((s,x)=>s+(x.stockActuel||0),0);const cap=e.cond==="Espace 12 btls"?12:null;const plein=cap&&btls>=cap;
return <div key={e.id} onClick={()=>setSelEmp(e.id===selEmp?null:e.id)} style={{padding:"7px 10px",borderRadius:8,border:selEmp===e.id?`2px solid ${P.ac}`:`1px solid ${rh.length?(plein?P.rd:P.am)+"60":P.bd}`,background:rh.length?(plein?"#fdeeee":"#fef9ee"):P.sf,minWidth:130,cursor:"pointer"}}>
<div style={{display:"flex",justifyContent:"space-between",gap:6}}><span style={{fontSize:10,fontWeight:600}}>{e.nom}</span>{cap&&<span style={{fontSize:9,fontWeight:700,color:plein?P.rd:rh.length?P.am:P.gn}}>{btls}/{cap}</span>}</div>
<div style={{fontSize:9,color:P.tm}}>{e.cond}{!cap&&rh.length?` — ${btls} btls`:""}</div>
{rh.length?<>{rh.slice(0,3).map(rr=><div key={rr.id} style={{fontSize:8.5,marginTop:2,color:P.am,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:150}}>🍷 {rr.designation} ({rr.stockActuel})</div>)}
{rh.length>3&&<div style={{fontSize:8,color:P.tm}}>… +{rh.length-3} autre(s)</div>}
{cap&&!plein&&<div style={{fontSize:8.5,marginTop:2,color:P.gn}}>{cap-btls} place(s) libre(s)</div>}</>
:<div style={{fontSize:9,marginTop:2,color:P.gn}}>Libre</div>}
</div>;})}</div></div>)}</Card>)}</div>;}

function GrilleTarifaire({data:d,setData:sD}){const[sel,sSel]=useState("");const adh=d.adherents.find(a=>a.id===sel);const upd=(k,v)=>{sD({...d,adherents:d.adherents.map(a=>a.id===sel?{...a,grille:{...a.grille,[k]:+v}}:a)});};
const sections=[{s:"ENTRÉE",f:[{k:"entree_forfait_palette",l:"Forfait palette",u:"€ HT"},{k:"entree_par_palette_mono",l:"Par palette mono-réf",u:"€ HT / pal."},{k:"entree_par_ref_multi",l:"Par référence multi-réf",u:"€ HT / réf"},{k:"entree_colis_gratuits",l:"Seuil colis gratuits",u:"colis"},{k:"entree_par_colis_payant",l:"Par colis payant",u:"€ HT / colis"},{k:"entree_par_ref_colis",l:"Par référence (colis)",u:"€ HT / réf"}]},{s:"STOCKAGE MENSUEL",f:[{k:"stock_palette_demi",l:"Palette demi-mois (≤15j)",u:"€ HT / pal."},{k:"stock_palette_mois",l:"Palette mois complet",u:"€ HT / pal."},{k:"stock_espace12",l:"Espace 12 bouteilles",u:"€ HT / espace"}]},{s:"SORTIE",f:[{k:"sortie_picking_lot6",l:"Picking par lot de 6",u:"€ HT / lot"},{k:"sortie_min_prepa_colis",l:"Prépa par colis (remplace le picking si cartons > nécessaire)",u:"€ HT / colis"},{k:"sortie_colis_ref_tpa_oui",l:"Sortie réf (T PA=OUI)",u:"€ HT / réf"},{k:"sortie_colis_ref_tpa_non",l:"Sortie réf (T PA=NON)",u:"€ HT / réf"},{k:"sortie_picking_palette_mono",l:"Picking pal. mono-réf",u:"€ HT / pal."},{k:"sortie_picking_palette_multi",l:"Picking pal. multi-réf",u:"€ HT / réf"},{k:"sortie_prepa_palette",l:"Prépa palette (film…)",u:"€ HT / pal."},{k:"sortie_manut_palette",l:"Manutention",u:"€ HT / sortie"}]}];
return <div><h3 style={{color:P.tx,margin:"0 0 14px"}}>Grille Tarifaire</h3><Inp label="Adhérent" value={sel} options={d.adherents.filter(a=>a.stockageActif).map(a=>({value:a.id,label:a.name}))} onChange={sSel}/>{adh&&<div style={{display:"grid",gap:12,marginTop:14}}>{sections.map(sc=><Card key={sc.s}><div style={{fontSize:11,fontWeight:700,color:P.ac,marginBottom:10}}>{sc.s}</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:8}}>{sc.f.map(fi=><div key={fi.k} style={{display:"flex",flexDirection:"column",gap:3}}><label style={{fontSize:10,color:P.tm,fontWeight:600}}>{fi.l}</label><div style={{display:"flex",gap:4,alignItems:"center"}}><input type="number" value={adh.grille[fi.k]} onChange={e=>upd(fi.k,e.target.value)} style={{flex:1,fontFamily:FN,fontSize:13,background:P.bg,color:P.tx,border:`1px solid ${P.bd}`,borderRadius:6,padding:"7px 10px",outline:"none"}}/><span style={{fontSize:9,color:P.tm,whiteSpace:"nowrap",minWidth:60}}>{fi.u}</span></div></div>)}</div></Card>)}</div>}</div>;}

// ─── ESPACE ADHÉRENT ───
function EspaceAdherent({data:d,forcedId}){const[sel,sSel]=useState(forcedId||"");const[vF,sVF]=useState(null);const[subTab,setSub]=useState("stock");
// Auto-set if forcedId provided
const effectiveId=forcedId||sel;
const adh=d.adherents.find(a=>a.id===effectiveId);
const refs=adh?d.references.filter(r=>r.adherentId===effectiveId):[];
const ents=adh?d.entrees.filter(e=>e.adherentId===effectiveId):[];
const sorts=adh?d.sorties.filter(s=>s.adherentId===effectiveId):[];
const facts=adh?d.factures.filter(f=>f.adherentId===effectiveId):[];
const factsStock=facts.filter(f=>f.type==="Stockage");
const factsEntree=facts.filter(f=>f.type==="Entrée");
const factsSortie=facts.filter(f=>f.type==="Sortie");
const tBtls=refs.reduce((s,r)=>s+(r.stockActuel||0),0);
const tCA=facts.reduce((s,f)=>s+f.totalTTC,0);
const caStock=factsStock.reduce((s,f)=>s+f.totalTTC,0);
const tRefs=refs.length;
const totalSortiesBtls=sorts.reduce((s,x)=>s+(x.nbBouteilles||0),0);
const totalEntreesBtls=ents.reduce((s,x)=>s+(x.nbBtl||0),0);

const subTabs=[{id:"stock",label:"Mon Stock",icon:"🍷"},{id:"entrees",label:"Entrées",icon:"📥"},{id:"sorties",label:"Sorties",icon:"📤"},{id:"stockage",label:"Stockage",icon:"🗄️"},{id:"stats",label:"Statistiques",icon:"📊"},{id:"factures",label:"Relevés",icon:"🧾"}];

return <div>
{/* Header */}
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
<div>
<h3 style={{color:P.tx,margin:0}}>{forcedId?"Mon Espace":"Espace Adhérent"}</h3>
{adh&&<div style={{fontSize:12,color:P.tm,marginTop:2}}>{adh.name} — {adh.email}</div>}
</div>
</div>

{/* Selector only for admins (no forcedId) */}
{!forcedId&&<Inp label="Sélectionner un adhérent" value={sel} options={d.adherents.filter(a=>a.stockageActif).map(a=>({value:a.id,label:a.name}))} onChange={sSel} style={{marginBottom:16}}/>}

{adh&&<div>
{/* KPIs */}
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:10,marginBottom:16}}>
<Stat label="En stock" value={`${tBtls} btls`} icon="🍷" color="ac"/>
<Stat label="Références" value={tRefs} icon="📋" color="bl"/>
<Stat label="Entrées totales" value={`${totalEntreesBtls} btls`} icon="📥" color="gn"/>
<Stat label="Sorties totales" value={`${totalSortiesBtls} btls`} icon="📤" color="am"/>
<Stat label="Relevés" value={facts.length} icon="🧾" color="bl"/>
<Stat label="Total prestations TTC" value={`${tCA.toFixed(0)} €`} icon="💰" color="gn"/>
</div>

{/* Sub-tabs */}
<div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>{subTabs.map(st=><Btn key={st.id} v={subTab===st.id?"primary":"secondary"} sm onClick={()=>setSub(st.id)}>{st.icon} {st.label}</Btn>)}</div>

{/* ─── MON STOCK ─── */}
{subTab==="stock"&&<Card>
<h4 style={{color:P.ac,margin:"0 0 10px",fontSize:13}}>🍷 Références en stock</h4>
<Table columns={[
{key:"qr",label:"QR",render:r=><QRCode refId={r.id} size={28}/>},
{key:"id",label:"Réf"},{key:"designation",label:"Désignation"},{key:"couleur",label:"Couleur"},{key:"volume",label:"Vol."},
{key:"stockActuel",label:"Stock",render:r=>{const al=r.alertStock>0&&r.stockActuel<=r.alertStock;return <span style={{color:al?P.rd:P.gn,fontWeight:700}}>{r.stockActuel}{al?" ⚠️":""}</span>;}},
{key:"condStock",label:"Cond."},{key:"emplacement",label:"Empl."},
{key:"droitsAccise",label:"Accise",render:r=><Badge color={r.droitsAccise==="Droit suspendu"?"am":"gn"}>{r.droitsAccise==="Droit suspendu"?"Susp.":"Acq."}</Badge>},
]} data={refs}/>
{refs.length===0&&<div style={{padding:20,textAlign:"center",color:P.td}}>Aucune référence en stock</div>}
</Card>}

{/* ─── ENTRÉES ─── */}
{subTab==="entrees"&&<Card>
<h4 style={{color:P.ac,margin:"0 0 10px",fontSize:13}}>📥 Historique des entrées</h4>
<Table columns={[
{key:"id",label:"Réf"},{key:"date",label:"Date"},{key:"cond",label:"Cond."},
{key:"nbPal",label:"Palettes"},{key:"nbCol",label:"Colis"},{key:"nbBtl",label:"Btls"},{key:"nbRef",label:"Réfs"},
{key:"montant",label:"€ HT",render:r=>`${r.montant.toFixed(2)}`},{key:"creePar",label:"Par"},
]} data={ents}/>
</Card>}

{/* ─── SORTIES ─── */}
{subTab==="sorties"&&<Card>
<h4 style={{color:P.ac,margin:"0 0 10px",fontSize:13}}>📤 Historique des sorties</h4>
<Table columns={[
{key:"id",label:"Réf"},{key:"date",label:"Date"},{key:"nbBouteilles",label:"Btls"},{key:"colisageDetail",label:"Colisage"},
{key:"destinataire",label:"Destinataire"},
{key:"tpa",label:"T PA",render:r=>r.tpa?"✅":"❌"},{key:"apa",label:"A PA",render:r=>r.apa?"✅":"❌"},
{key:"montant",label:"€ HT",render:r=>`${r.montant.toFixed(2)}`},
{key:"statut",label:"Statut",render:r=><Badge color={r.statut==="Expédié"?"gn":r.statut==="Prêt"?"bl":"am"}>{r.statut}</Badge>},
{key:"scanValide",label:"Picking",render:r=>r.scanValide?<Badge color="gn">✅</Badge>:<Badge color="am">⏳</Badge>},
]} data={sorts}/>
</Card>}

{/* ─── STOCKAGE ─── */}
{subTab==="stockage"&&<div>
<Card style={{marginBottom:12}}>
<h4 style={{color:P.ac,margin:"0 0 10px",fontSize:13}}>🗄️ Stockage en cours</h4>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginBottom:14}}>
<div style={{background:P.bg,borderRadius:8,padding:12,textAlign:"center"}}><div style={{fontSize:10,color:P.tm}}>Btls en palette</div><div style={{fontSize:20,fontWeight:700,color:P.ac}}>{refs.filter(r=>r.condStock==="Palette").reduce((s,r)=>s+(r.stockActuel||0),0)}</div></div>
<div style={{background:P.bg,borderRadius:8,padding:12,textAlign:"center"}}><div style={{fontSize:10,color:P.tm}}>Btls en espace 12</div><div style={{fontSize:20,fontWeight:700,color:P.bl}}>{refs.filter(r=>r.condStock==="Espace 12 btls").reduce((s,r)=>s+(r.stockActuel||0),0)}</div></div>
<div style={{background:P.bg,borderRadius:8,padding:12,textAlign:"center"}}><div style={{fontSize:10,color:P.tm}}>Coût stockage mensuel</div><div style={{fontSize:20,fontWeight:700,color:P.am}}>{factsStock.length>0?(factsStock[factsStock.length-1].totalTTC).toFixed(2):"—"} €</div></div>
</div>
<Table columns={[
{key:"designation",label:"Référence"},{key:"condStock",label:"Conditionnement"},
{key:"stockActuel",label:"Btls",render:r=><span style={{fontWeight:700}}>{r.stockActuel}</span>},
{key:"emplacement",label:"Emplacement"},
{key:"estim",label:"Coût mensuel estimé",render:r=>{
  const g=adh.grille;if(r.condStock==="Palette")return `${g.stock_palette_mois.toFixed(2)} € / pal.`;
  const lots=Math.ceil((r.stockActuel||0)/12);return `${(lots*g.stock_espace12).toFixed(2)} € (${lots}×${g.stock_espace12})`;
}},
]} data={refs}/>
</Card>
{factsStock.length>0&&<Card>
<h4 style={{color:P.ac,margin:"0 0 10px",fontSize:13}}>📋 Relevés de stockage</h4>
<Table columns={[
{key:"numero",label:"N° Relevé"},{key:"date",label:"Période"},{key:"colisageDetail",label:"Détail"},
{key:"totalHT",label:"HT",render:r=>`${r.totalHT.toFixed(2)} €`},
{key:"totalTTC",label:"TTC",render:r=><span style={{fontWeight:700,color:P.gn}}>{r.totalTTC.toFixed(2)} €</span>},
{key:"a",label:"",render:r=><Btn v="ghost" sm onClick={()=>sVF(r)}>🖨️</Btn>},
]} data={factsStock}/>
</Card>}
</div>}

{/* ─── STATISTIQUES ─── */}
{subTab==="stats"&&<div>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12}}>
<Card>
<h4 style={{color:P.ac,margin:"0 0 12px",fontSize:13}}>📊 Répartition par couleur</h4>
{["Rouge","Blanc","Rosé","Effervescent","Liquoreux"].map(c=>{const btls=refs.filter(r=>r.couleur===c).reduce((s,r)=>s+(r.stockActuel||0),0);if(!btls)return null;const pct=tBtls?Math.round(btls/tBtls*100):0;
return <div key={c} style={{marginBottom:8}}>
<div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}><span>{c}</span><span style={{fontWeight:600}}>{btls} btls ({pct}%)</span></div>
<div style={{background:P.bg,borderRadius:4,height:8,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:c==="Rouge"?P.rd:c==="Blanc"?"#fbbf24":c==="Rosé"?"#f472b6":c==="Effervescent"?P.ac:P.am,borderRadius:4}}/></div>
</div>;})}
</Card>
<Card>
<h4 style={{color:P.ac,margin:"0 0 12px",fontSize:13}}>📊 Répartition par accise</h4>
{["Droit acquitté","Droit suspendu"].map(a=>{const btls=refs.filter(r=>r.droitsAccise===a).reduce((s,r)=>s+(r.stockActuel||0),0);if(!btls)return null;const pct=tBtls?Math.round(btls/tBtls*100):0;
return <div key={a} style={{marginBottom:8}}>
<div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}><span>{a}</span><span style={{fontWeight:600}}>{btls} btls ({pct}%)</span></div>
<div style={{background:P.bg,borderRadius:4,height:8,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:a==="Droit acquitté"?P.gn:P.am,borderRadius:4}}/></div>
</div>;})}
</Card>
<Card>
<h4 style={{color:P.ac,margin:"0 0 12px",fontSize:13}}>💰 Répartition des prestations</h4>
<div style={{display:"grid",gap:8}}>
<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 0",borderBottom:`1px solid ${P.bd}30`}}><span style={{color:P.tm}}>Entrées</span><span style={{fontWeight:600}}>{factsEntree.reduce((s,f)=>s+f.totalTTC,0).toFixed(2)} €</span></div>
<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 0",borderBottom:`1px solid ${P.bd}30`}}><span style={{color:P.tm}}>Sorties (prépa, picking)</span><span style={{fontWeight:600}}>{factsSortie.reduce((s,f)=>s+f.totalTTC,0).toFixed(2)} €</span></div>
<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 0",borderBottom:`1px solid ${P.bd}30`}}><span style={{color:P.tm}}>Stockage mensuel</span><span style={{fontWeight:600}}>{caStock.toFixed(2)} €</span></div>
<div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"8px 0",fontWeight:700,color:P.ac}}><span>Total TTC</span><span>{tCA.toFixed(2)} €</span></div>
</div>
</Card>
<Card>
<h4 style={{color:P.ac,margin:"0 0 12px",fontSize:13}}>📈 Activité</h4>
<div style={{display:"grid",gap:8}}>
<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 0",borderBottom:`1px solid ${P.bd}30`}}><span style={{color:P.tm}}>Total btls entrées</span><span style={{fontWeight:600}}>{totalEntreesBtls}</span></div>
<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 0",borderBottom:`1px solid ${P.bd}30`}}><span style={{color:P.tm}}>Total btls sorties</span><span style={{fontWeight:600}}>{totalSortiesBtls}</span></div>
<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 0",borderBottom:`1px solid ${P.bd}30`}}><span style={{color:P.tm}}>En stock actuellement</span><span style={{fontWeight:700,color:P.gn}}>{tBtls}</span></div>
<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 0"}}><span style={{color:P.tm}}>Taux de rotation</span><span style={{fontWeight:600}}>{totalEntreesBtls?Math.round(totalSortiesBtls/totalEntreesBtls*100):0}%</span></div>
</div>
</Card>
</div>
</div>}

{/* ─── FACTURES ─── */}
{subTab==="factures"&&<Card>
<h4 style={{color:P.ac,margin:"0 0 10px",fontSize:13}}>🧾 Mes relevés de prestations</h4>
<Table columns={[
{key:"numero",label:"N° Relevé"},{key:"date",label:"Date"},
{key:"type",label:"Type",render:r=><Badge color={r.type==="Entrée"?"bl":r.type==="Sortie"?"am":"gn"}>{r.type}</Badge>},
{key:"colisageDetail",label:"Détail"},{key:"nbBouteilles",label:"Btls"},
{key:"totalHT",label:"HT",render:r=>`${r.totalHT.toFixed(2)} €`},
{key:"tva",label:"TVA",render:r=>`${r.tva.toFixed(2)} €`},
{key:"totalTTC",label:"TTC",render:r=><span style={{fontWeight:700,color:P.gn}}>{r.totalTTC.toFixed(2)} €</span>},
{key:"a",label:"",render:r=><Btn v="ghost" sm onClick={()=>sVF(r)}>🖨️</Btn>},
]} data={[...facts].reverse()}/>
</Card>}

</div>}
{vF&&<InvoiceView facture={vF} adherent={adh} onClose={()=>sVF(null)}/>}
</div>;}

// ═══ COMPTABILITÉ MATIÈRE (Entrepositaire Agréé) ═══
function ComptaMatiere({data:d,setData:sD}){
const[subTab,setSub]=useState("compte");const[mois,setMois]=useState("2026-03");const[showPerte,setShowPerte]=useState(false);const[showDAE,setShowDAE]=useState(false);
const[pf,sPf]=useState({date:new Date().toISOString().slice(0,10),refId:"",type:"Casse",qte:"",motif:""});
const[df,sDf]=useState({numero:"",type:"DAE",date:new Date().toISOString().slice(0,10),expediteur:"",destinataire:"",regime:"Suspension",refs:[],statut:"En cours"});

// ─── PERTES & MANQUANTS ───
const pertes=d.comptaMatiere?.pertes||[];
const docs=d.comptaMatiere?.documents||[];
const savePerte=()=>{if(!pf.refId||!pf.qte)return;const nd={...d,comptaMatiere:{...d.comptaMatiere,pertes:[...(d.comptaMatiere?.pertes||[]),{id:"P"+Date.now(),date:pf.date,refId:pf.refId,type:pf.type,qte:+pf.qte,motif:pf.motif}]}};
const ri=nd.references.findIndex(r=>r.id===pf.refId);if(ri>=0){nd.references=[...nd.references];nd.references[ri]={...nd.references[ri],stockActuel:nd.references[ri].stockActuel-Math.abs(+pf.qte),mouvements:[...(nd.references[ri].mouvements||[]),{date:pf.date,type:`Perte (${pf.type})`,qty:-Math.abs(+pf.qte),user:"Admin"}]};}
sD(nd);setShowPerte(false);sPf({date:new Date().toISOString().slice(0,10),refId:"",type:"Casse",qte:"",motif:""});};
const saveDAE=()=>{if(!df.numero)return;sD({...d,comptaMatiere:{...d.comptaMatiere,documents:[...(d.comptaMatiere?.documents||[]),{id:"D"+Date.now(),...df}]}});setShowDAE(false);sDf({numero:"",type:"DAE",date:new Date().toISOString().slice(0,10),expediteur:"",destinataire:"",regime:"Suspension",refs:[],statut:"En cours"});};

// ─── COMPUTE DRM DATA ───
const computeDRM=(moisStr)=>{
const [y,m]=moisStr.split("-").map(Number);const debut=new Date(y,m-1,1);const fin=new Date(y,m,0);const debutISO=debut.toISOString().slice(0,10);const finISO=fin.toISOString().slice(0,10);
const prevMoisStr=m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,"0")}`;

// Group by regime
const regimes=["Droit suspendu","Droit acquitté"];
const result=regimes.map(regime=>{
const refsRegime=d.references.filter(r=>r.droitsAccise===regime);

// Compute movements in period
let entreesBtl=0,sortiesBtl=0,pertesBtl=0;
refsRegime.forEach(ref=>{
  (ref.mouvements||[]).forEach(mv=>{
    const mvDate=mv.date?.slice(0,10)||"";
    if(mvDate>=debutISO&&mvDate<=finISO){
      if(mv.qty>0)entreesBtl+=mv.qty;
      else if(mv.type?.includes("Perte"))pertesBtl+=Math.abs(mv.qty);
      else if(mv.qty<0)sortiesBtl+=Math.abs(mv.qty);
    }
  });
});

// Pertes from comptaMatiere
(d.comptaMatiere?.pertes||[]).forEach(p=>{
  const pDate=p.date?.slice(0,10)||"";
  if(pDate>=debutISO&&pDate<=finISO){
    const ref=d.references.find(r=>r.id===p.refId);
    if(ref?.droitsAccise===regime)pertesBtl+=Math.abs(p.qte);
  }
});

const stockActuel=refsRegime.reduce((s,r)=>s+(r.stockActuel||0),0);
const stockFin=stockActuel;
const stockDebut=stockFin-entreesBtl+sortiesBtl+pertesBtl;
const nbRefs=refsRegime.length;

// Convert to HL (75cl per btl)
const btlToHL=btl=>+(btl*0.0075).toFixed(4);

return {regime,nbRefs,stockDebut,entreesBtl,sortiesBtl,pertesBtl,stockFin,
stockDebutHL:btlToHL(stockDebut),entreesHL:btlToHL(entreesBtl),sortiesHL:btlToHL(sortiesBtl),pertesHL:btlToHL(pertesBtl),stockFinHL:btlToHL(stockFin)};
});
return result;};

const drmData=computeDRM(mois);
const totalBtlsSusp=d.references.filter(r=>r.droitsAccise==="Droit suspendu").reduce((s,r)=>s+(r.stockActuel||0),0);
const totalBtlsAcq=d.references.filter(r=>r.droitsAccise==="Droit acquitté").reduce((s,r)=>s+(r.stockActuel||0),0);
const totalPertes=pertes.reduce((s,p)=>s+Math.abs(p.qte),0);
const docsNonApures=docs.filter(dc=>dc.statut!=="Apuré").length;

const renderCompte=()=><div>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,marginBottom:16}}>
<Stat label="Stock Susp. (btls)" value={totalBtlsSusp.toLocaleString("fr")} icon="🔒" color="am"/>
<Stat label="Stock Acq. (btls)" value={totalBtlsAcq.toLocaleString("fr")} icon="✅" color="gn"/>
<Stat label="Pertes enregistrées" value={totalPertes} icon="📉" color="rd"/>
<Stat label="Docs non apurés" value={docsNonApures} icon="📄" color="bl"/>
</div>

{/* Balance par régime */}
{["Droit suspendu","Droit acquitté"].map(regime=>{
const refs=d.references.filter(r=>r.droitsAccise===regime);
const isSusp=regime==="Droit suspendu";
return <Card key={regime} style={{marginBottom:12,borderLeft:`4px solid ${isSusp?P.am:P.gn}`}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
<h4 style={{margin:0,fontSize:13,color:P.tx}}><Badge color={isSusp?"am":"gn"}>{regime}</Badge> — {refs.length} référence(s), {refs.reduce((s,r)=>s+(r.stockActuel||0),0).toLocaleString("fr")} btls ({(refs.reduce((s,r)=>s+(r.stockActuel||0),0)*0.0075).toFixed(2)} HL)</h4>
</div>
<Table columns={[
{key:"id",label:"Réf"},{key:"designation",label:"Désignation"},{key:"nomenclature",label:"Appellation"},
{key:"couleur",label:"Couleur"},{key:"volume",label:"Vol."},{key:"alcool",label:"Alcool"},
{key:"stockActuel",label:"Btls",render:r=><span style={{fontWeight:700}}>{r.stockActuel}</span>},
{key:"hl",label:"HL",render:r=>(r.stockActuel*0.0075).toFixed(3)},
]} data={refs}/>
</Card>;})}

{/* Pertes & Manquants */}
<Card style={{marginBottom:12}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
<h4 style={{margin:0,fontSize:13,color:P.tx}}>📉 Pertes, Casses & Manquants</h4>
<Btn sm onClick={()=>setShowPerte(true)}>+ Déclarer</Btn>
</div>
{pertes.length>0?<Table columns={[
{key:"date",label:"Date"},{key:"refId",label:"Réf"},
{key:"ref",label:"Désignation",render:r=>d.references.find(x=>x.id===r.refId)?.designation||"—"},
{key:"type",label:"Type",render:r=><Badge color={r.type==="Casse"?"rd":r.type==="Manquant"?"am":"bl"}>{r.type}</Badge>},
{key:"qte",label:"Btls",render:r=><span style={{color:P.rd,fontWeight:700}}>-{Math.abs(r.qte)}</span>},
{key:"hl",label:"HL",render:r=>(Math.abs(r.qte)*0.0075).toFixed(3)},
{key:"motif",label:"Motif"},
]} data={pertes}/>:<div style={{fontSize:12,color:P.td,padding:10}}>Aucune perte déclarée</div>}
</Card>
</div>;

const renderDRM=()=><div>
<div style={{display:"flex",gap:10,alignItems:"flex-end",marginBottom:16}}>
<Inp label="Période (mois)" type="month" value={mois} onChange={setMois} style={{maxWidth:200}}/>
<div style={{fontSize:11,color:P.tm,paddingBottom:10}}>DRM à transmettre via <b>CIEL</b> avant le 10 du mois suivant</div><Btn v="secondary" sm onClick={()=>printDRM(mois,drmData)}>🖨️ Imprimer / PDF</Btn><Btn v="secondary" sm onClick={()=>exportCSV(`drm_${mois}.csv`,["Régime","Ligne","Bouteilles","Hectolitres"],drmData.flatMap(dr=>[[dr.regime,"Stock début",dr.stockDebut,dr.stockDebutHL],[dr.regime,"Entrées",dr.entreesBtl,dr.entreesHL],[dr.regime,"Sorties",-dr.sortiesBtl,-dr.sortiesHL],[dr.regime,"Pertes",-dr.pertesBtl,-dr.pertesHL],[dr.regime,"Stock fin",dr.stockFin,dr.stockFinHL]]))}>⬇️ Export</Btn>
</div>

{drmData.map(dr=><Card key={dr.regime} style={{marginBottom:14,borderLeft:`4px solid ${dr.regime==="Droit suspendu"?P.am:P.gn}`}}>
<h4 style={{margin:"0 0 12px",fontSize:13}}><Badge color={dr.regime==="Droit suspendu"?"am":"gn"}>{dr.regime}</Badge> — {dr.nbRefs} réf(s)</h4>
<div style={{overflowX:"auto"}}>
<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
<thead><tr style={{background:P.bg}}><th style={{padding:"10px 12px",textAlign:"left",borderBottom:`2px solid ${P.bd}`,fontSize:10,color:P.tm}}>Ligne DRM</th><th style={{padding:"10px 12px",textAlign:"right",borderBottom:`2px solid ${P.bd}`,fontSize:10,color:P.tm}}>Bouteilles</th><th style={{padding:"10px 12px",textAlign:"right",borderBottom:`2px solid ${P.bd}`,fontSize:10,color:P.tm}}>Hectolitres</th></tr></thead>
<tbody>
<tr style={{background:P.sf2}}><td style={{padding:"10px 12px",fontWeight:600}}>📦 Stock début de période</td><td style={{padding:"10px 12px",textAlign:"right",fontWeight:600}}>{dr.stockDebut.toLocaleString("fr")}</td><td style={{padding:"10px 12px",textAlign:"right"}}>{dr.stockDebutHL}</td></tr>
<tr><td style={{padding:"10px 12px",color:P.gn}}>📥 Entrées (réceptions)</td><td style={{padding:"10px 12px",textAlign:"right",color:P.gn,fontWeight:600}}>+{dr.entreesBtl.toLocaleString("fr")}</td><td style={{padding:"10px 12px",textAlign:"right",color:P.gn}}>+{dr.entreesHL}</td></tr>
<tr><td style={{padding:"10px 12px",color:P.rd}}>📤 Sorties (expéditions)</td><td style={{padding:"10px 12px",textAlign:"right",color:P.rd,fontWeight:600}}>-{dr.sortiesBtl.toLocaleString("fr")}</td><td style={{padding:"10px 12px",textAlign:"right",color:P.rd}}>-{dr.sortiesHL}</td></tr>
<tr><td style={{padding:"10px 12px",color:P.am}}>📉 Pertes & manquants</td><td style={{padding:"10px 12px",textAlign:"right",color:P.am,fontWeight:600}}>-{dr.pertesBtl.toLocaleString("fr")}</td><td style={{padding:"10px 12px",textAlign:"right",color:P.am}}>-{dr.pertesHL}</td></tr>
<tr style={{background:P.acs,borderTop:`2px solid ${P.ac}`}}><td style={{padding:"12px",fontWeight:700,fontSize:13}}>📦 Stock fin de période (théorique)</td><td style={{padding:"12px",textAlign:"right",fontWeight:700,fontSize:14,color:P.ac}}>{dr.stockFin.toLocaleString("fr")}</td><td style={{padding:"12px",textAlign:"right",fontWeight:700,color:P.ac}}>{dr.stockFinHL}</td></tr>
</tbody>
</table>
</div>
</Card>)}

<Card style={{background:P.bg,border:`1px dashed ${P.bd}`}}>
<div style={{fontSize:11,color:P.tm,lineHeight:1.6}}>
<b style={{color:P.tx}}>📋 Mentions obligatoires DRM (art. 50-00 G)</b><br/>
• Stock début = stock fin du mois précédent<br/>
• Entrées : réceptions sous DAE/DSA, achats, retours<br/>
• Sorties : expéditions (DAE/DSA), mises à la consommation, exportations<br/>
• Pertes : casses, manquants, destructions (avec tolérance légale)<br/>
• À transmettre via <b>CIEL</b> (Contributions Indirectes En Ligne) avant le 10 du mois suivant<br/>
• DRM "néant" obligatoire même sans mouvement
</div>
</Card>
</div>;

const renderDocs=()=><div>
<div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
<h4 style={{color:P.tx,margin:0}}>Documents d'accompagnement & Apurement</h4>
<Btn sm onClick={()=>setShowDAE(true)}>+ Document</Btn>
</div>

<Card style={{marginBottom:12}}>
<Table columns={[
{key:"numero",label:"N° Document"},
{key:"type",label:"Type",render:r=><Badge color={r.type==="DAE"?"ac":r.type==="DSA"?"bl":"am"}>{r.type}</Badge>},
{key:"date",label:"Date"},{key:"expediteur",label:"Expéditeur"},{key:"destinataire",label:"Destinataire"},
{key:"regime",label:"Régime",render:r=><Badge color={r.regime==="Suspension"?"am":"gn"}>{r.regime}</Badge>},
{key:"statut",label:"Apurement",render:r=>{
const colors={Apuré:"gn","En cours":"am","Non apuré":"rd"};
return <select value={r.statut} onChange={e=>{const nd={...d,comptaMatiere:{...d.comptaMatiere,documents:(d.comptaMatiere?.documents||[]).map(dc=>dc.id===r.id?{...dc,statut:e.target.value}:dc)}};sD(nd);}} onClick={e=>e.stopPropagation()} style={{background:P.bg,color:P.tx,border:`1px solid ${P.bd}`,borderRadius:6,padding:"3px 8px",fontSize:11}}><option>En cours</option><option>Apuré</option><option>Non apuré</option></select>;
}},
]} data={docs}/>
</Card>

<Card style={{background:P.bg,border:`1px dashed ${P.bd}`}}>
<div style={{fontSize:11,color:P.tm,lineHeight:1.6}}>
<b style={{color:P.tx}}>📄 Types de documents</b><br/>
• <b>DAE</b> — Document Administratif Électronique (GAMMA) : circulation en suspension de droits intra-UE<br/>
• <b>DSA</b> — Document Simplifié d'Accompagnement : circulation droits acquittés intra-UE<br/>
• <b>DAA</b> — Document d'Accompagnement (format papier, cas particuliers)<br/>
<br/>
<b style={{color:P.tx}}>⚠️ Non-apurement</b><br/>
• Relevé mensuel des documents non apurés à joindre à la DRM<br/>
• Copies des documents non apurés à annexer
</div>
</Card>
</div>;

const renderDAI=()=>{
const refs=d.references;const groupByRegime={};
refs.forEach(r=>{const k=r.droitsAccise||"Non défini";if(!groupByRegime[k])groupByRegime[k]=[];groupByRegime[k].push(r);});
return <div>
<Card style={{marginBottom:14}}>
<h4 style={{margin:"0 0 12px",fontSize:13,color:P.tx}}>📋 Déclaration Annuelle d'Inventaire (DAI)</h4>
<div style={{fontSize:11,color:P.tm,marginBottom:12}}>À déposer le <b>10 septembre</b> (produits vitivinicoles) — Comparaison stock théorique vs stock physique</div>

{Object.entries(groupByRegime).map(([regime,refsR])=>{
const totalTheorique=refsR.reduce((s,r)=>s+(r.stockActuel||0),0);
return <div key={regime} style={{marginBottom:16}}>
<div style={{fontSize:12,fontWeight:700,color:P.ac,marginBottom:8}}><Badge color={regime==="Droit suspendu"?"am":"gn"}>{regime}</Badge></div>
<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
<thead><tr style={{background:P.bg}}>
<th style={{padding:"8px 10px",textAlign:"left",borderBottom:`2px solid ${P.bd}`,fontSize:10,color:P.tm}}>Réf</th>
<th style={{padding:"8px 10px",textAlign:"left",borderBottom:`2px solid ${P.bd}`,fontSize:10,color:P.tm}}>Désignation</th>
<th style={{padding:"8px 10px",textAlign:"left",borderBottom:`2px solid ${P.bd}`,fontSize:10,color:P.tm}}>Appell.</th>
<th style={{padding:"8px 10px",textAlign:"right",borderBottom:`2px solid ${P.bd}`,fontSize:10,color:P.tm}}>Stock théorique (btls)</th>
<th style={{padding:"8px 10px",textAlign:"right",borderBottom:`2px solid ${P.bd}`,fontSize:10,color:P.tm}}>Stock théorique (HL)</th>
<th style={{padding:"8px 10px",textAlign:"right",borderBottom:`2px solid ${P.bd}`,fontSize:10,color:P.tm}}>Stock physique (btls)</th>
<th style={{padding:"8px 10px",textAlign:"right",borderBottom:`2px solid ${P.bd}`,fontSize:10,color:P.tm}}>Écart</th>
</tr></thead>
<tbody>
{refsR.map(r=><tr key={r.id}><td style={{padding:"8px 10px"}}>{r.id}</td><td style={{padding:"8px 10px"}}>{r.designation}</td><td style={{padding:"8px 10px"}}>{r.nomenclature}</td><td style={{padding:"8px 10px",textAlign:"right",fontWeight:600}}>{r.stockActuel}</td><td style={{padding:"8px 10px",textAlign:"right"}}>{(r.stockActuel*0.0075).toFixed(3)}</td><td style={{padding:"8px 10px",textAlign:"right"}}><span style={{color:P.td,fontStyle:"italic"}}>À saisir</span></td><td style={{padding:"8px 10px",textAlign:"right"}}>—</td></tr>)}
<tr style={{background:P.acs,borderTop:`2px solid ${P.ac}`}}><td colSpan={3} style={{padding:"10px",fontWeight:700}}>TOTAL {regime}</td><td style={{padding:"10px",textAlign:"right",fontWeight:700}}>{totalTheorique}</td><td style={{padding:"10px",textAlign:"right",fontWeight:700}}>{(totalTheorique*0.0075).toFixed(3)}</td><td style={{padding:"10px",textAlign:"right",fontWeight:700}}>—</td><td style={{padding:"10px",textAlign:"right",fontWeight:700}}>—</td></tr>
</tbody></table>
</div>;})}
</Card>

<Card style={{background:P.bg,border:`1px dashed ${P.bd}`}}>
<div style={{fontSize:11,color:P.tm,lineHeight:1.6}}>
<b style={{color:P.tx}}>📋 Obligations DAI</b><br/>
• Comparaison stock théorique (comptabilité matière) vs stock physique (inventaire réel)<br/>
• Écarts = pertes et manquants à déclarer<br/>
• Tolérance légale applicable selon les produits<br/>
• Droits d'accise exigibles sur les manquants hors tolérance<br/>
• <b>Échéance : 10 septembre</b> (vitivinicoles) / 10 du 2e mois post-clôture (autres)
</div>
</Card>
</div>;};

const subTabs=[{id:"compte",label:"Compte Principal",icon:"📊"},{id:"drm",label:"DRM Mensuelle",icon:"📋"},{id:"docs",label:"Documents",icon:"📄"},{id:"dai",label:"DAI",icon:"📦"}];

return <div>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
<h3 style={{color:P.tx,margin:0}}>⚖️ Comptabilité Matière — Entrepositaire Agréé</h3>
</div>
<div style={{display:"flex",gap:6,marginBottom:16}}>{subTabs.map(st=><Btn key={st.id} v={subTab===st.id?"primary":"secondary"} sm onClick={()=>setSub(st.id)}>{st.icon} {st.label}</Btn>)}</div>

{subTab==="compte"&&renderCompte()}
{subTab==="drm"&&renderDRM()}
{subTab==="docs"&&renderDocs()}
{subTab==="dai"&&renderDAI()}

{showPerte&&<Modal title="📉 Déclarer une perte / casse / manquant" onClose={()=>setShowPerte(false)}>
<div style={{display:"grid",gap:10}}>
<Inp label="Date" type="date" value={pf.date} onChange={v=>sPf({...pf,date:v})}/>
<Inp label="Référence" value={pf.refId} options={d.references.map(r=>({value:r.id,label:`${r.id} — ${r.designation} (${r.droitsAccise==="Droit suspendu"?"Susp.":"Acq."}) — Stock: ${r.stockActuel}`}))} onChange={v=>sPf({...pf,refId:v})}/>
<Inp label="Type" value={pf.type} options={["Casse","Manquant","Destruction","Coulage","Freinte","Autre"]} onChange={v=>sPf({...pf,type:v})}/>
<Inp label="Quantité (bouteilles)" type="number" value={pf.qte} onChange={v=>sPf({...pf,qte:v})}/>
{pf.refId&&pf.qte&&<div style={{fontSize:11,color:P.tm}}>= <b>{(Math.abs(+pf.qte)*0.0075).toFixed(4)} HL</b></div>}
<Inp label="Motif / Commentaire" value={pf.motif} onChange={v=>sPf({...pf,motif:v})}/>
<Btn onClick={savePerte} dis={!pf.refId||!pf.qte}>Enregistrer la perte</Btn>
</div>
</Modal>}

{showDAE&&<Modal title="📄 Nouveau Document d'Accompagnement" onClose={()=>setShowDAE(false)}>
<div style={{display:"grid",gap:10}}>
<Inp label="N° Document (CRA / DSA)" value={df.numero} onChange={v=>sDf({...df,numero:v})} placeholder="FR00001234567"/>
<Inp label="Type" value={df.type} options={["DAE","DSA","DAA"]} onChange={v=>sDf({...df,type:v})}/>
<Inp label="Date" type="date" value={df.date} onChange={v=>sDf({...df,date:v})}/>
<Inp label="Expéditeur" value={df.expediteur} onChange={v=>sDf({...df,expediteur:v})} placeholder="Nom ou N° accises"/>
<Inp label="Destinataire" value={df.destinataire} onChange={v=>sDf({...df,destinataire:v})} placeholder="Nom ou N° accises"/>
<Inp label="Régime" value={df.regime} options={["Suspension","Acquitté"]} onChange={v=>sDf({...df,regime:v})}/>
<Inp label="Statut apurement" value={df.statut} options={["En cours","Apuré","Non apuré"]} onChange={v=>sDf({...df,statut:v})}/>
<Btn onClick={saveDAE} dis={!df.numero}>Enregistrer</Btn>
</div>
</Modal>}
</div>;}

// ═══ JOURNAL / TRAÇABILITÉ ═══
function Journal({data:d}){
const[filtre,setFiltre]=useState("");const[userF,setUserF]=useState("");
const logs=(d.auditLog||[]).slice().reverse();
const filtered=logs.filter(l=>{
  if(filtre&&!l.action.toLowerCase().includes(filtre.toLowerCase())&&!l.module?.toLowerCase().includes(filtre.toLowerCase()))return false;
  if(userF&&l.user!==userF)return false;
  return true;
});
const allUsers=[...new Set(logs.map(l=>l.user).filter(Boolean))];
return <div>
<h3 style={{color:P.tx,margin:"0 0 14px"}}>📝 Journal d'activité — Traçabilité</h3>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginBottom:14}}>
<Inp label="Rechercher" value={filtre} onChange={setFiltre} placeholder="Action, module..." sm/>
<Inp label="Filtrer par utilisateur" value={userF} options={allUsers} onChange={setUserF} sm/>
</div>
<Card>
{filtered.length===0?<div style={{padding:20,textAlign:"center",color:P.td,fontSize:13}}>Aucune activité</div>:
<div style={{maxHeight:500,overflowY:"auto"}}>
{filtered.map((l,i)=><div key={i} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:`1px solid ${P.bd}30`,fontSize:12}}>
<div style={{minWidth:130,color:P.tm,fontSize:10}}>{new Date(l.date).toLocaleString("fr")}</div>
<div style={{minWidth:90}}><span style={{background:l.role==="admin"?"#3b9abf18":l.role==="logisticien"?"#f59e0b18":"#10b98118",color:l.role==="admin"?P.ac:l.role==="logisticien"?P.am:P.gn,padding:"2px 8px",borderRadius:12,fontSize:10,fontWeight:600}}>{l.user}</span></div>
<div style={{minWidth:80}}><Badge color={l.module==="Entrée"?"bl":l.module==="Sortie"?"am":l.module==="Référence"?"gn":l.module==="Adhérent"?"ac":"bl"}>{l.module||"—"}</Badge></div>
<div style={{flex:1,color:P.tx}}>{l.action}</div>
<div style={{minWidth:60,color:P.tm,fontSize:10}}>{l.ip||"local"}</div>
</div>)}
</div>}
</Card>
</div>;}

// ═══ GESTION UTILISATEURS (Admin) ═══
function GestionUsers({data:d,setData:sD,currentUser:cu}){
const[sh,sSh]=useState(false);const[ed,sEd]=useState(null);
const[f,sF]=useState({nom:"",email:"",mdp:"",role:"logisticien",adherentId:"",permissions:{entrees:true,sorties:true,references:true,espaces:true,facturation:false,compta:false,grille:false}});
const users=d.users||[];
const open=u=>{sEd(u);sF(u?{nom:u.nom,email:u.email,mdp:u.mdp,role:u.role,adherentId:u.adherentId||"",permissions:u.permissions||{entrees:true,sorties:true,references:true,espaces:true,facturation:false,compta:false,grille:false}}:{nom:"",email:"",mdp:"",role:"logisticien",adherentId:"",permissions:{entrees:true,sorties:true,references:true,espaces:true,facturation:false,compta:false,grille:false}});sSh(true);};
const doSave=()=>{if(!f.nom||!f.email||!f.mdp)return;const nd={...d};if(ed){nd.users=(nd.users||[]).map(u=>u.id===ed.id?{...u,...f}:u);}else{nd.users=[...(nd.users||[]),{id:"U"+Date.now(),...f,creePar:cu.nom,creeLe:new Date().toISOString()}];}nd.auditLog=[...(nd.auditLog||[]),{date:new Date().toISOString(),user:cu.nom,role:cu.role,module:"Utilisateurs",action:`${ed?"Modifié":"Créé"} utilisateur ${f.nom} (${f.role})`}];sD(nd);sSh(false);};
const delUser=u=>{const nd={...d,users:(d.users||[]).filter(x=>x.id!==u.id),auditLog:[...(d.auditLog||[]),{date:new Date().toISOString(),user:cu.nom,role:cu.role,module:"Utilisateurs",action:`Supprimé utilisateur ${u.nom}`}]};sD(nd);};
const permLabels={entrees:"Entrées",sorties:"Sorties",references:"Références",espaces:"Espaces",facturation:"Relevés",compta:"Compta Matière",grille:"Tarifs"};
return <div>
<div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{color:P.tx,margin:0}}>👥 Gestion Utilisateurs & Accès</h3><Btn onClick={()=>open(null)}>+ Utilisateur</Btn></div>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,marginBottom:14}}>
<Stat label="Administrateurs" value={users.filter(u=>u.role==="admin").length} icon="🔐" color="ac"/>
<Stat label="Logisticiens" value={users.filter(u=>u.role==="logisticien").length} icon="🏭" color="am"/>
<Stat label="Adhérents" value={d.adherents.filter(a=>a.stockageActif&&a.email).length} icon="🍷" color="gn"/>
</div>

{/* Admin & Logisticien accounts */}
<Card style={{marginBottom:14}}>
<h4 style={{margin:"0 0 10px",fontSize:13,color:P.ac}}>Comptes Internes (Admin / Logisticien)</h4>
<Table columns={[
{key:"nom",label:"Nom"},{key:"email",label:"Email"},{key:"role",label:"Rôle",render:r=><Badge color={r.role==="admin"?"ac":"am"}>{r.role==="admin"?"Admin":"Logisticien"}</Badge>},
{key:"perms",label:"Permissions",render:r=>r.role==="admin"?"Accès complet":Object.entries(r.permissions||{}).filter(([,v])=>v).map(([k])=>permLabels[k]).join(", ")||"Aucune"},
{key:"a",label:"",render:r=><div style={{display:"flex",gap:4}}><Btn v="ghost" sm onClick={e=>{e.stopPropagation();open(r);}}>✏️</Btn>{r.id!==cu.id&&<Btn v="danger" sm onClick={e=>{e.stopPropagation();delUser(r);}}>🗑️</Btn>}</div>},
]} data={users}/>
</Card>

{/* Adherent accounts */}
<Card>
<h4 style={{margin:"0 0 10px",fontSize:13,color:P.gn}}>Comptes Adhérents (accès espace personnel)</h4>
<Table columns={[
{key:"name",label:"Adhérent"},{key:"contact",label:"Contact"},{key:"email",label:"Email"},
{key:"mdp",label:"Mot de passe",render:r=><span style={{fontFamily:"monospace",fontSize:11,background:P.bg,padding:"2px 8px",borderRadius:4}}>{r.mdp||"—"}</span>},
{key:"s",label:"Statut",render:r=><Badge color={r.stockageActif?"gn":"rd"}>{r.stockageActif?"Actif":"Off"}</Badge>},
]} data={d.adherents.filter(a=>a.email)}/>
<div style={{marginTop:10,fontSize:11,color:P.tm}}>💡 Les adhérents se connectent avec leur email + mot de passe défini dans leur fiche adhérent</div>
</Card>

{sh&&<Modal title={ed?"Modifier Utilisateur":"Nouvel Utilisateur"} onClose={()=>sSh(false)}>
<div style={{display:"grid",gap:10}}>
<Inp label="Nom" value={f.nom} onChange={v=>sF({...f,nom:v})}/>
<Inp label="Email" value={f.email} onChange={v=>sF({...f,email:v})}/>
<Inp label="Mot de passe" value={f.mdp} onChange={v=>sF({...f,mdp:v})}/>
<Inp label="Rôle" value={f.role} options={[{value:"admin",label:"Administrateur"},{value:"logisticien",label:"Logisticien"}]} onChange={v=>sF({...f,role:v})}/>
{f.role==="logisticien"&&<div>
<div style={{fontSize:10,color:P.tm,fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>Permissions</div>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:6}}>
{Object.entries(permLabels).map(([k,label])=><label key={k} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",padding:"6px 8px",background:f.permissions[k]?P.acs:P.bg,borderRadius:6,border:`1px solid ${f.permissions[k]?P.ac:P.bd}`}}>
<input type="checkbox" checked={f.permissions[k]||false} onChange={e=>sF({...f,permissions:{...f.permissions,[k]:e.target.checked}})}/>
{label}
</label>)}
</div>
</div>}
<Btn onClick={doSave} dis={!f.nom||!f.email||!f.mdp}>{ed?"Enregistrer":"Créer"}</Btn>
</div>
</Modal>}
</div>;}

// ═══ RÉGLAGES (Admin) ═══
function Reglages({data:d,setData:sD,currentUser:cu}){
const fileRef=useRef(null);const[busy,setBusy]=useState(false);
const user=cu?.nom||"Admin";
const onFile=async e=>{const f=e.target.files?.[0];if(!f)return;setBusy(true);
try{
const bmp=await createImageBitmap(f);
const max=512;const sc=Math.min(1,max/Math.max(bmp.width,bmp.height));
const c=document.createElement("canvas");c.width=Math.max(1,Math.round(bmp.width*sc));c.height=Math.max(1,Math.round(bmp.height*sc));
c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);
let url=c.toDataURL("image/png");
if(url.length>400000)url=c.toDataURL("image/jpeg",0.85);
const nd={...d,logo:url,auditLog:[...(d.auditLog||[]),{date:new Date().toISOString(),user,role:cu?.role||"admin",module:"Réglages",action:"Logo de l'application mis à jour"}]};
sD(nd);
}catch(err){alert("Image illisible : "+(err?.message||err));}
setBusy(false);e.target.value="";};
const resetLogo=()=>{const nd={...d,logo:null,auditLog:[...(d.auditLog||[]),{date:new Date().toISOString(),user,role:cu?.role||"admin",module:"Réglages",action:"Logo remis au logo d'origine"}]};sD(nd);};
const cur=d.logo||LOGO;
return <div><h3 style={{color:P.tx,margin:"0 0 14px"}}>⚙️ Réglages</h3>
<Card style={{maxWidth:640}}>
<h4 style={{color:P.ac,margin:"0 0 6px",fontSize:14}}>🎨 Logo de l'application</h4>
<div style={{fontSize:12,color:P.tm,marginBottom:14,lineHeight:1.5}}>Le logo apparaît sur l'écran de connexion, le menu, les fiches QR et les relevés imprimés. Il est enregistré dans la base et <b>synchronisé sur tous les appareils</b>. Formats acceptés : PNG (transparence conservée), JPG — idéalement carré, il sera redimensionné à 512 px maximum.</div>
<div style={{display:"flex",gap:20,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
<div style={{textAlign:"center"}}><img src={cur} width={110} height={110} style={{borderRadius:"50%",objectFit:"cover",border:`3px solid ${P.bd}`,boxShadow:"0 4px 12px #0002"}}/><div style={{fontSize:9,color:P.tm,marginTop:4}}>Grand format</div></div>
<div style={{textAlign:"center"}}><img src={cur} width={40} height={40} style={{borderRadius:"50%",objectFit:"cover",border:`2px solid ${P.bd}`}}/><div style={{fontSize:9,color:P.tm,marginTop:4}}>Menu</div></div>
<div style={{textAlign:"center"}}><img src={cur} width={24} height={24} style={{borderRadius:"50%",objectFit:"cover",border:`1px solid ${P.bd}`}}/><div style={{fontSize:9,color:P.tm,marginTop:4}}>Petit</div></div>
{d.logo&&<Badge color="gn">Logo personnalisé actif</Badge>}
</div>
<input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{display:"none"}}/>
<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
<Btn dis={busy} onClick={()=>fileRef.current?.click()}>{busy?"⏳ Traitement...":"⬆️ Changer le logo"}</Btn>
{d.logo&&<Btn v="danger" onClick={resetLogo}>↩️ Revenir au logo d'origine</Btn>}
</div>
</Card>
</div>;}

// ═══ LOGIN SCREEN ═══
function LoginScreen({data:d,onLogin,onRefresh,skipAuth}){
const[email,setEmail]=useState("");const[mdp,setMdp]=useState("");const[err,setErr]=useState("");const[busy,setBusy]=useState(false);
const doLogin=async()=>{
  if(busy)return;
  setErr("");setBusy(true);
  const e=email.trim().toLowerCase();
  // Mode intégré : la session Supabase de l'application interne est déjà
  // ouverte, on ne la remplace pas.
  if(!skipAuth)await ensureCloudAuth(e,mdp);
  // Recharger l'état depuis le cloud (nécessaire quand la base est verrouillée aux utilisateurs authentifiés)
  let dd=d;
  try{const fresh=await onRefresh?.();if(fresh)dd=fresh;}catch{}
  // Check admin/logisticien users
  const user=(dd.users||[]).find(u=>u.email.toLowerCase()===e&&u.mdp===mdp);
  if(user){setBusy(false);return onLogin({...user,type:"internal"});}
  // Check adherent
  const adh=dd.adherents.find(a=>a.email?.toLowerCase()===e&&a.mdp===mdp&&a.stockageActif);
  if(adh){setBusy(false);return onLogin({id:adh.id,nom:adh.name,email:adh.email,role:"adherent",adherentId:adh.id,type:"adherent"});}
  setBusy(false);setErr("Email ou mot de passe incorrect");
};
return <div style={{fontFamily:FN,background:P.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<div style={{background:P.sf,borderRadius:20,padding:40,maxWidth:400,width:"100%",boxShadow:"0 20px 60px #0002",textAlign:"center",border:`1px solid ${P.bd}`}}>
<img src={(d&&d.logo)||LOGO} width={80} height={80} style={{borderRadius:"50%",marginBottom:16,objectFit:"cover"}}/>
<h2 style={{color:P.ac,margin:"0 0 4px",fontSize:22}}>Planet’Stock</h2>
<div style={{color:P.tm,fontSize:12,marginBottom:24}}>Gestion de Stock — Connexion</div>
<div style={{display:"grid",gap:12,textAlign:"left"}}>
<Inp label="Email" value={email} onChange={setEmail} placeholder="votre@email.com"/>
<Inp label="Mot de passe" type="password" value={mdp} onChange={setMdp} placeholder="••••••••"/>
{err&&<div style={{color:P.rd,fontSize:12,fontWeight:600,textAlign:"center"}}>{err}</div>}
<Btn onClick={doLogin} dis={busy} style={{width:"100%",marginTop:4}}>{busy?"⏳ Connexion...":"Se connecter"}</Btn>
</div>
</div>
</div>;}

// ═══ FICHE TECHNIQUE (ouverte via QR code : /stock/fiche/REFxxxx) ═══
function FicheRef({data:d,refId,currentUser,onClose}){
const ref=d.references.find(r=>r.id===refId);
const isAdh=currentUser?.role==="adherent";
const allowed=ref&&(!isAdh||ref.adherentId===currentUser.adherentId);
const adh=ref?d.adherents.find(a=>a.id===ref.adherentId):null;
const al=ref&&ref.alertStock>0&&ref.stockActuel<=ref.alertStock;
return <div style={{fontFamily:FN,background:P.bg,minHeight:"100vh",padding:14}}>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<div style={{maxWidth:540,margin:"0 auto"}}>
<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
<img src={(d&&d.logo)||LOGO} width={36} height={36} style={{borderRadius:"50%",objectFit:"cover"}}/>
<div style={{flex:1,fontWeight:700,color:P.ac,fontSize:15}}>Planet’Stock — Fiche technique</div>
<Btn v="secondary" sm onClick={onClose}>✕ Fermer</Btn>
</div>
{!ref&&<Card><div style={{textAlign:"center",padding:20}}><div style={{fontSize:34,marginBottom:8}}>🔍</div><div style={{fontWeight:700,marginBottom:4,color:P.tx}}>Référence introuvable</div><div style={{fontSize:12,color:P.tm}}>{refId} n'existe pas (ou plus) dans le stock.</div></div></Card>}
{ref&&!allowed&&<Card><div style={{textAlign:"center",padding:20}}><div style={{fontSize:34,marginBottom:8}}>🔒</div><div style={{fontWeight:700,color:P.tx}}>Accès non autorisé</div><div style={{fontSize:12,color:P.tm}}>Cette référence appartient à un autre adhérent.</div></div></Card>}
{ref&&allowed&&<Card>
<div style={{display:"flex",gap:14,alignItems:"center",marginBottom:14}}>
<QRCode refId={ref.id} size={74} label={ref.id}/>
<div style={{flex:1}}>
<div style={{fontWeight:700,fontSize:17,marginBottom:4,color:P.tx}}>{ref.designation}</div>
<div style={{display:"flex",gap:5,flexWrap:"wrap"}}><Badge>{ref.nomenclature}</Badge><Badge color="bl">{ref.couleur}</Badge><Badge color="gn">{ref.volume}</Badge><Badge color={ref.droitsAccise==="Droit suspendu"?"am":"gn"}>{ref.droitsAccise}</Badge></div>
</div>
</div>
<div style={{background:al?P.rds:P.gns,borderRadius:10,padding:14,textAlign:"center",marginBottom:14}}>
<div style={{fontSize:10,color:P.tm,fontWeight:600}}>STOCK ACTUEL</div>
<div style={{fontSize:34,fontWeight:700,color:al?P.rd:P.gn}}>{ref.stockActuel}{al?" ⚠️":""}</div>
<div style={{fontSize:10,color:P.tm}}>bouteilles{ref.alertStock>0?` — seuil d'alerte : ${ref.alertStock}`:""}</div>
</div>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,fontSize:12,marginBottom:14,color:P.tx}}>
<div><span style={{color:P.tm,fontSize:10}}>Adhérent</span><br/>{adh?.name||"—"}</div>
<div><span style={{color:P.tm,fontSize:10}}>Prix unitaire</span><br/>{ref.prixUnitaire?ref.prixUnitaire+" €":"—"}</div>
<div><span style={{color:P.tm,fontSize:10}}>Alcool</span><br/>{ref.alcool?ref.alcool+" %":"—"}</div>
<div><span style={{color:P.tm,fontSize:10}}>Conditionnement</span><br/>{ref.condStock||"—"}</div>
<div><span style={{color:P.tm,fontSize:10}}>Emplacement</span><br/>{ref.emplacement||"—"}</div>
</div>
{(ref.photos||[]).length>0&&<div style={{marginBottom:14}}><div style={{fontSize:10,fontWeight:600,color:P.tm,marginBottom:6}}>📷 PHOTOS</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{ref.photos.map((p,i)=><a key={i} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="" style={{width:72,height:72,objectFit:"cover",borderRadius:8,border:`1px solid ${P.bd}`}}/></a>)}</div></div>}
<div style={{borderTop:`1px solid ${P.bd}`,paddingTop:10}}>
<div style={{fontSize:10,fontWeight:600,color:P.tm,marginBottom:6}}>DERNIERS MOUVEMENTS</div>
{(ref.mouvements||[]).slice(-8).reverse().map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",gap:8,padding:"5px 0",borderBottom:`1px solid ${P.bd}30`,fontSize:11,color:P.tx}}><span style={{color:P.tm}}>{new Date(m.date).toLocaleDateString("fr")}</span><span style={{flex:1}}>{m.type}</span><span style={{fontWeight:600,color:m.qty>=0?P.gn:P.rd}}>{m.qty>=0?"+":""}{m.qty}</span></div>)}
{!(ref.mouvements||[]).length&&<div style={{fontSize:11,color:P.td}}>Aucun mouvement</div>}
</div>
</Card>}
</div>
</div>;}

// ═══ MAIN ═══
const adminTabs=[{id:"dashboard",label:"Dashboard",icon:"📊"},{id:"adherents",label:"Adhérents",icon:"👥"},{id:"entrees",label:"Entrées",icon:"📥"},{id:"references",label:"Références",icon:"🍷"},{id:"sorties",label:"Sorties",icon:"📤"},{id:"espaces",label:"Espaces",icon:"🗄️"},{id:"facturation",label:"Relevés",icon:"🧾"},{id:"compta",label:"Compta Matière",icon:"⚖️"},{id:"grille",label:"Tarifs",icon:"📋"},{id:"journal",label:"Journal",icon:"📝"},{id:"users",label:"Utilisateurs",icon:"🔐"},{id:"reglages",label:"Réglages",icon:"⚙️"},{id:"adherent",label:"Espace Adh.",icon:"👤"}];

const adherentTabs=[{id:"adherent",label:"Mon Espace",icon:"👤"}];

export default function App({session,forcedTab}){const[d,sR]=useState(null);const[tab,sTab]=useState("dashboard");const[ld2,sLd]=useState(true);const[sb,sSb]=useState(true);
// Session persistée : sur téléphone, on reste connecté entre deux scans de QR code
const[currentUser,setCurrentUser]=useState(()=>{try{const s=localStorage.getItem("pa-session");return s?JSON.parse(s):null;}catch{return null;}});
// Route /stock/fiche/REFxxxx (arrivée via scan de QR code)
const[ficheId,sFiche]=useState(()=>{try{const m=window.location.pathname.match(/\/stock\/fiche\/([A-Za-z0-9_-]+)/i);return m?decodeURIComponent(m[1]).toUpperCase():null;}catch{return null;}});
const isMobile=useIsMobile();const[drawer,setDrawer]=useState(false);
useEffect(()=>{ld().then(x=>{
const raw=x||defaultState;
const safe={...defaultState,...raw,
adherents:raw.adherents||defaultState.adherents,
entrees:raw.entrees||defaultState.entrees,
references:raw.references||defaultState.references,
sorties:(raw.sorties||defaultState.sorties).map(s=>({...s,stockDecremente:s.stockDecremente??true})),
factures:raw.factures||defaultState.factures,
fournitures:raw.fournitures||defaultState.fournitures,
espaces:raw.espaces||defaultState.espaces,
comptaMatiere:raw.comptaMatiere||{pertes:[],documents:[]},
users:raw.users||[
{id:"U001",nom:"Emma",email:"emma@planet-aura.com",mdp:"emma2026",role:"admin",permissions:{entrees:true,sorties:true,references:true,espaces:true,facturation:true,compta:true,grille:true},creeLe:"2026-01-01"},
{id:"U002",nom:"Adam",email:"adam@planet-aura.com",mdp:"adam2026",role:"logisticien",permissions:{entrees:true,sorties:true,references:true,espaces:true,facturation:false,compta:false,grille:false},creeLe:"2026-01-15"},
{id:"U003",nom:"Lucas",email:"lucas@planet-aura.com",mdp:"lucas2026",role:"logisticien",permissions:{entrees:true,sorties:true,references:false,espaces:true,facturation:false,compta:false,grille:false},creeLe:"2026-02-01"},
],
auditLog:raw.auditLog||[],
};
sR(safe);sLd(false);});},[]);

const sD=useCallback(nd=>{sR(nd);sv(nd);},[]);

// Mode intégré : l'onglet actif est piloté par le menu de Planet'Desk.
useEffect(()=>{if(forcedTab)sTab(forcedTab);},[forcedTab]);

// Synchro temps réel : adopte les modifications faites sur les autres
// appareils (ordinateur / téléphone / autres sessions) dès qu'elles arrivent.
useEffect(()=>{if(ld2)return;const unsub=subscribeSync(nv=>{sR(nv);});return unsub;},[ld2]);

// Logo courant (documents imprimés + favicon de l'onglet)
CURRENT_LOGO=(d&&d.logo)||LOGO;
useEffect(()=>{try{const l=document.querySelector("link[rel='icon']");if(l)l.href=(d&&d.logo)||"/favicon.png";}catch{}},[d&&d.logo]);

// Helper to add audit log
const logAction=(module,action)=>{if(!currentUser||!d)return;const nd={...d,auditLog:[...(d.auditLog||[]),{date:new Date().toISOString(),user:currentUser.nom,role:currentUser.role,module,action}]};sD(nd);};

const handleLogin=(user)=>{setCurrentUser(user);try{localStorage.setItem("pa-session",JSON.stringify(user));}catch{}
const nd={...d,auditLog:[...(d.auditLog||[]),{date:new Date().toISOString(),user:user.nom,role:user.role,module:"Connexion",action:`Connexion ${user.role} — ${user.nom} (${user.email})`}]};sD(nd);
if(user.role==="adherent")sTab("adherent");else sTab("dashboard");};

const handleLogout=()=>{if(currentUser&&d){const nd={...d,auditLog:[...(d.auditLog||[]),{date:new Date().toISOString(),user:currentUser.nom,role:currentUser.role,module:"Déconnexion",action:`Déconnexion ${currentUser.nom}`}]};sD(nd);}try{localStorage.removeItem("pa-session");}catch{}if(!session)cloudSignOut();setCurrentUser(null);sTab("dashboard");};


// ─── MODE INTÉGRÉ (application interne Planet Aura) ───
// Connexion automatique avec le compte de la session : correspondance par
// email avec un utilisateur interne ou un adhérent ; les administrateurs
// de l'application interne sont administrateurs du stock.
useEffect(()=>{
  if(ld2||!d||currentUser||!session)return;
  const e=(session.email||"").toLowerCase();
  const acc=session.stockAccess;
  const fullPerms={entrees:true,sorties:true,references:true,espaces:true,facturation:true,compta:true,grille:true};
  // 1. Droits définis par l'administrateur dans Planet'Desk (prioritaires)
  if(acc?.role==="admin"){handleLogin({id:"DESK-"+e,nom:session.fullName||e,email:session.email,role:"admin",permissions:fullPerms,type:"internal"});return;}
  if(acc?.role==="logisticien"){const pp=acc.permissions||{};handleLogin({id:"DESK-"+e,nom:session.fullName||e,email:session.email,role:"logisticien",permissions:{...pp,references:!!pp.entrees},type:"internal"});return;}
  if(acc?.role==="adherent"){
    const adh=(d.adherents||[]).find(x=>(acc.adherent_id&&x.id===acc.adherent_id)||x.email?.toLowerCase()===e);
    if(adh){handleLogin({id:adh.id,nom:adh.name,email:adh.email||session.email,role:"adherent",adherentId:adh.id,type:"adherent"});return;}
  }
  // 2. Repli : correspondance par email avec les comptes historiques du stock
  const user=(d.users||[]).find(u=>u.email.toLowerCase()===e);
  if(user){handleLogin({...user,type:"internal"});return;}
  const adh=(d.adherents||[]).find(x=>x.email?.toLowerCase()===e&&x.stockageActif);
  if(adh){handleLogin({id:adh.id,nom:adh.name,email:adh.email,role:"adherent",adherentId:adh.id,type:"adherent"});return;}
  // 3. Les administrateurs du Desk sont administrateurs du stock
  if(session.isAdmin){handleLogin({id:"DESK-"+e,nom:session.fullName||"Admin",email:session.email,role:"admin",permissions:fullPerms,type:"internal"});}
// eslint-disable-next-line react-hooks/exhaustive-deps
},[ld2,d,currentUser,session]);

if(ld2||!d)return <div style={{fontFamily:FN,background:P.bg,color:P.tx,height:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center"}}><img src={LOGO} width={60} height={60} style={{borderRadius:"50%",marginBottom:10}}/><div style={{fontSize:13,color:P.tm}}>Chargement...</div></div></div>;

// Not logged in → show login
if(!currentUser&&session)return <div style={{fontFamily:FN,background:P.bg,minHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><div style={{background:P.sf,borderRadius:16,padding:32,maxWidth:420,textAlign:"center",border:`1px solid ${P.bd}`}}><div style={{fontSize:32,marginBottom:8}}>🔒</div><div style={{fontWeight:700,color:P.tx,marginBottom:6}}>Accès Planet'Stock non configuré</div><div style={{fontSize:13,color:P.tm,lineHeight:1.5}}>Votre compte Planet'Desk ({session.email}) n'est relié à aucun profil du stock. Demandez à votre administrateur de définir vos droits : Administration → votre compte → « Accès Planet'Stock ».</div></div></div>;
if(!currentUser)return <LoginScreen data={d} onLogin={handleLogin} skipAuth={!!session} onRefresh={async()=>{const v=await fetchCloudState();if(v){sR(v);return v;}return null;}}/>;

// Arrivée par QR code → fiche technique plein écran
if(ficheId)return <FicheRef data={d} refId={ficheId} currentUser={currentUser} onClose={()=>{try{window.history.replaceState(null,"","/stock");}catch{}sFiche(null);}}/>;

// Determine visible tabs based on role
const isAdmin=currentUser.role==="admin";
const isLogist=currentUser.role==="logisticien";
const isAdh=currentUser.role==="adherent";
const perms=currentUser.permissions||{};

let visibleTabs;
if(isAdh){visibleTabs=adherentTabs;}
else if(isAdmin){visibleTabs=adminTabs;}
else{// logisticien with custom permissions
visibleTabs=[{id:"dashboard",label:"Dashboard",icon:"📊"}];
if(perms.entrees)visibleTabs.push({id:"entrees",label:"Entrées",icon:"📥"});
if(perms.entrees)visibleTabs.push({id:"references",label:"Références",icon:"🍷"});
if(perms.sorties)visibleTabs.push({id:"sorties",label:"Sorties",icon:"📤"});
if(perms.espaces)visibleTabs.push({id:"espaces",label:"Espaces",icon:"🗄️"});
if(perms.facturation)visibleTabs.push({id:"facturation",label:"Relevés",icon:"🧾"});
if(perms.compta)visibleTabs.push({id:"compta",label:"Compta Matière",icon:"⚖️"});
if(perms.grille)visibleTabs.push({id:"grille",label:"Tarifs",icon:"📋"});
visibleTabs.push({id:"journal",label:"Journal",icon:"📝"});
}

// For adherent, filter data to their own
const filteredData=isAdh?{...d,references:d.references.filter(r=>r.adherentId===currentUser.adherentId),entrees:d.entrees.filter(e=>e.adherentId===currentUser.adherentId),sorties:d.sorties.filter(s=>s.adherentId===currentUser.adherentId),factures:d.factures.filter(f=>f.adherentId===currentUser.adherentId)}:d;

const R=()=>{try{switch(tab){
case "dashboard":return isAdh?<EspaceAdherent data={d} forcedId={currentUser.adherentId}/>:<Dashboard data={filteredData} setData={sD} currentUser={currentUser}/>;
case "adherents":return isAdmin?<Adherents data={d} setData={sD}/>:null;
case "entrees":return <Entrees data={d} setData={sD} currentUser={currentUser}/>;
case "references":return <References data={isAdh?filteredData:d} setData={sD} currentUser={currentUser}/>;
case "sorties":return <Sorties data={isAdh?filteredData:d} setData={sD} currentUser={currentUser}/>;
case "espaces":return <Espaces data={d} setData={sD} currentUser={currentUser}/>;
case "facturation":return <Facturation data={isAdh?filteredData:d} setData={sD} currentUser={currentUser}/>;
case "compta":return <ComptaMatiere data={d} setData={sD}/>;
case "grille":return <GrilleTarifaire data={d} setData={sD}/>;
case "journal":return <Journal data={d}/>;
case "users":return isAdmin?<GestionUsers data={d} setData={sD} currentUser={currentUser}/>:null;
case "reglages":return isAdmin?<Reglages data={d} setData={sD} currentUser={currentUser}/>:null;
case "adherent":return <EspaceAdherent data={d} forcedId={isAdh?currentUser.adherentId:null}/>;
default:return null;}}catch(err){return <Card><div style={{color:P.rd,fontSize:13}}>⚠️ Erreur : {String(err?.message||err)}</div><Btn sm v="secondary" onClick={()=>sTab("dashboard")} style={{marginTop:10}}>Retour</Btn></Card>;}};

const roleColors={admin:P.ac,logisticien:P.am,adherent:P.gn};
const roleLabels={admin:"Administrateur",logisticien:"Logisticien",adherent:"Adhérent"};

const exp=isMobile?true:sb; // menu toujours déplié dans le tiroir mobile
const navContent=<>
<div style={{padding:exp?"16px 14px":"16px 10px",borderBottom:`1px solid ${P.bd}`,display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>isMobile?setDrawer(false):sSb(!sb)}><img src={(d&&d.logo)||LOGO} width={exp?40:32} height={exp?40:32} style={{borderRadius:"50%",flexShrink:0,objectFit:"cover"}}/>{exp&&<div style={{fontWeight:700,fontSize:13,color:P.ac,whiteSpace:"nowrap"}}>Planet’Stock<br/><span style={{fontWeight:400,fontSize:9,color:P.tm}}>by Planet Aura</span></div>}</div>

{/* User info */}
{exp&&<div style={{padding:"10px 14px",borderBottom:`1px solid ${P.bd}`,background:P.sf2}}>
<div style={{display:"flex",alignItems:"center",gap:8}}>
<div style={{width:28,height:28,borderRadius:"50%",background:roleColors[currentUser.role]+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>{isAdmin?"🔐":isLogist?"🏭":"🍷"}</div>
<div style={{flex:1}}>
<div style={{fontSize:11,fontWeight:600,color:P.tx}}>{currentUser.nom}</div>
<div style={{fontSize:9,color:roleColors[currentUser.role],fontWeight:600}}>{roleLabels[currentUser.role]}</div>
</div>
</div>
<button onClick={handleLogout} style={{marginTop:8,width:"100%",background:P.rds,color:P.rd,border:`1px solid ${P.rd}30`,borderRadius:6,padding:"5px 10px",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:FN}}>Déconnexion</button>
</div>}

<div style={{padding:"6px 0",flex:1,overflowY:"auto"}}>{visibleTabs.map(t=><div key={t.id} onClick={()=>{sTab(t.id);if(isMobile)setDrawer(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:exp?"11px 14px":"9px 12px",cursor:"pointer",background:tab===t.id?P.acs:"transparent",borderLeft:tab===t.id?`3px solid ${P.ac}`:"3px solid transparent",transition:"all .12s"}} onMouseEnter={e=>{if(tab!==t.id)e.currentTarget.style.background=P.sf2;}} onMouseLeave={e=>{if(tab!==t.id)e.currentTarget.style.background="transparent";}}><span style={{fontSize:15,flexShrink:0}}>{t.icon}</span>{exp&&<span style={{fontSize:12,fontWeight:tab===t.id?600:400,color:tab===t.id?P.ac:P.tm,whiteSpace:"nowrap"}}>{t.label}</span>}</div>)}</div>
{exp&&<div style={{padding:12,borderTop:`1px solid ${P.bd}`,fontSize:8,color:P.td}}>Planet’Stock — © Planet Aura 2026</div>}
</>;

if(session)return <div style={{fontFamily:FN,background:P.bg,color:P.tx,minHeight:"100vh"}}>
<div style={{flex:1,overflow:"auto",padding:isMobile?12:24}}><div style={{maxWidth:1120}}><ErrorBoundary key={tab}>{R()}</ErrorBoundary></div></div>
</div>;

return <div style={{fontFamily:FN,background:P.bg,color:P.tx,minHeight:"100vh",display:"flex",flexDirection:isMobile?"column":"row"}}>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
{isMobile?<>
{/* Barre supérieure mobile */}
<div style={{position:"sticky",top:0,zIndex:100,display:"flex",alignItems:"center",gap:10,background:P.sf,borderBottom:`1px solid ${P.bd}`,padding:"10px 12px",boxShadow:"0 2px 8px #0001"}}>
<button onClick={()=>setDrawer(true)} style={{background:"transparent",border:"none",fontSize:22,cursor:"pointer",color:P.tx,padding:"2px 6px"}}>☰</button>
<img src={(d&&d.logo)||LOGO} width={30} height={30} style={{borderRadius:"50%",objectFit:"cover"}}/>
<div style={{fontWeight:700,fontSize:14,color:P.ac,flex:1}}>Planet’Stock</div>
<div style={{fontSize:11,color:roleColors[currentUser.role],fontWeight:600}}>{currentUser.nom}</div>
</div>
{/* Tiroir de navigation */}
{drawer&&<div style={{position:"fixed",inset:0,zIndex:300}}>
<div style={{position:"absolute",inset:0,background:"#0006"}} onClick={()=>setDrawer(false)}/>
<div style={{position:"absolute",top:0,left:0,bottom:0,width:250,maxWidth:"82vw",background:P.sf,display:"flex",flexDirection:"column",boxShadow:"4px 0 20px #0004"}}>{navContent}</div>
</div>}
</>:
<div style={{width:sb?220:56,background:P.sf,borderRight:`1px solid ${P.bd}`,transition:"width .2s",flexShrink:0,display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"2px 0 8px #0001"}}>{navContent}</div>}
<div style={{flex:1,overflow:"auto",padding:isMobile?12:24}}><div style={{maxWidth:1120}}><ErrorBoundary key={tab}>{R()}</ErrorBoundary></div></div>
</div>;}


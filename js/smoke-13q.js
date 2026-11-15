// vm smoke test of 13q with fake globals
const fs=require('fs'),vm=require('vm');
const log=[];const ls={};
const mk=()=>({position:{x:0,y:0,z:0,set(){}, copy(){}},rotation:{x:0,y:0,z:0,set(){}},scale:{y:1},visible:true});
const rig=()=>({root:mk(),body:mk(),head:mk(),armL:mk(),armR:mk(),legL:mk(),legR:mk(),bat:mk(),batTilt:mk()});
const P={rig:rig()},C={rig:rig()},bat={rig:rig(),side:1,name:'B'};
const timers=[];
var ctx={console,performance:{now:()=>Date.now()},localStorage:{getItem:k=>ls[k]||null,setItem:(k,v)=>ls[k]=v},document:{hidden:false,getElementById:()=>null,createElement:()=>({style:{},classList:{add(){},remove(){}},addEventListener(){},querySelector:()=>({classList:{add(){},remove(){}},style:{},addEventListener(){}}),appendChild(){},remove(){}}),head:{appendChild(){}},body:{appendChild(){},classList:{add(){},remove(){}}},addEventListener(){},removeEventListener(){}},
 window:{},requestAnimationFrame:()=>0,setTimeout,
 G:{mode:'play',over:false,outs:0,on:[],freeze:false},E:{F:{P,C},bat,ump:null},ballMesh:{position:{x:0,y:1,z:-10},visible:true},setBall(){},
 PT:{kmh:150,id:'ff'},PITCHES:{ff:{jp:'直球'}},vsOn:()=>false,after:(s,f)=>timers.push([s,f]),curBatter:()=>cur,curPitcher:()=>({name:'P'}),
 CAMC:{pos:{clone(){return{}},copy(){}},look:{clone(){return{}},copy(){}},tpos:{clone(){return{}},copy(){},set(){}},tlook:{clone(){return{}},copy(){},set(){}},mode:'bat'},VP:{fk:1},say(){},noiseBurst(){},spawnBurst(){},scene:{add(){},remove(){}},THREE:{}};
ctx.window=ctx; var cur={st:{k:0},name:'B'};
vm.createContext(ctx);
ctx.finishAB=function(){}; ctx.pitchResult=function(k){cur.st.k++;};
vm.runInContext(fs.readFileSync('13q-strikeout-fx.js','utf8')+';this.KFX=KFX;',ctx);
ctx.pitchResult('swing'); 
console.log('K count', ctx.KFX.kOf({kx:1}), 'timers queued', timers.length, 'nice swing', ctx.KFX.nice('swing'), 'nice look(150kmh)', ctx.KFX.nice('look'));
ctx.finishAB('K');
console.log('react ->', ctx.KFX.react(ctx.E.bat), 'anim', ctx.E.bat.rig.anim.name);
try{ timers.forEach(([s,f])=>f()); console.log('replay start bailed safely, active=',ctx.KFX.active);}catch(e){console.log('ERR',e.message)}

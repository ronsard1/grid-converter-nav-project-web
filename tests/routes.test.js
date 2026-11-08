const R = require(__dirname + '/../js/routes.js');
const r0 = R.rng(7);
const pts = [{x:0,y:0}]; for (let i=0;i<10;i++){ const a=r0()*6.283, d=2000+r0()*5000; pts.push({x:Math.cos(a)*d,y:Math.sin(a)*d}); }
const D = pts.map(p=>pts.map(q=>Math.hypot(p.x-q.x,p.y-q.y)));
const t=Date.now();
const res = R.plan({dist:D,count:20,perRoute:6,targetM:30000,tolM:1000,seed:42});
console.log('time',Date.now()-t,'ms; candidates',res.candidates,'range',(res.range.min/1000).toFixed(1),(res.range.max/1000).toFixed(1));
res.routes.forEach((r,i)=>console.log('Sy'+(i+1), r.stops.join(','), (r.length/1000).toFixed(2), r.ok?'ok':'OFF'));
const firsts={}; res.routes.forEach(r=>firsts[r.stops[0]]=(firsts[r.stops[0]]||0)+1); console.log('first CP use',JSON.stringify(firsts));
console.log('unique', new Set(res.routes.map(r=>r.stops.join('-'))).size, 'meetings', R.meetings(res.routes,D).length, res.warnings);
// impossible case
console.log(R.plan({dist:D,count:5,perRoute:6,targetM:90000,tolM:1000,seed:1}).warnings);
// naive random baseline meetings
const rnd=R.rng(3); const naive=[]; while(naive.length<20){const a=[1,2,3,4,5,6,7,8,9,10].sort(()=>rnd()-.5).slice(0,6); naive.push({stops:a});}
console.log('naive meetings', R.meetings(naive,D).length);
console.log(R.codes(42,2,6));

/* Dependency-free, interactive canvas charts for KenadHR dashboards. */
window.KenadCharts = (() => {
  const palette = ['#3977ee','#59b78a','#f5a44b','#8b7cf6','#ef6b73','#38a7c9'];
  const tip = document.createElement('div');
  tip.style.cssText = 'position:fixed;z-index:9999;padding:7px 9px;border-radius:7px;background:#17233d;color:#fff;font:12px system-ui;pointer-events:none;opacity:0;transition:opacity .12s;box-shadow:0 4px 16px #0003';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(tip));
  function tooltip(event, text) { tip.textContent = text; tip.style.left = `${event.clientX + 12}px`; tip.style.top = `${event.clientY + 12}px`; tip.style.opacity = '1'; }
  function hideTip() { tip.style.opacity = '0'; }
  function mount(target, render) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) return;
    host.innerHTML = '<canvas aria-label="Interactive data chart" role="img" tabindex="0"></canvas>';
    const canvas = host.querySelector('canvas'); let redraw = () => {};
    const paint = () => { const rect = host.getBoundingClientRect(), ratio = window.devicePixelRatio || 1, h = rect.height || 240;
      canvas.width = Math.max(1, rect.width * ratio); canvas.height = Math.max(1, h * ratio); canvas.style.width = `${rect.width}px`; canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d'); ctx.setTransform(ratio,0,0,ratio,0,0); redraw = render(ctx, rect.width, h, canvas); };
    new ResizeObserver(paint).observe(host); paint(); return { canvas, repaint: () => { redraw(); paint(); } };
  }
  function line(target, labels, values, color = palette[0]) {
    let points=[]; const chart = mount(target, (ctx,w,h,canvas) => {
      const pad={l:34,r:12,t:18,b:30}, max=Math.max(1,...values), iw=w-pad.l-pad.r, ih=h-pad.t-pad.b;
      ctx.font='11px system-ui';ctx.fillStyle='#77839a';ctx.strokeStyle='#e8edf5';ctx.lineWidth=1;
      for(let i=0;i<4;i++){const y=pad.t+ih*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText(String(Math.round(max*(1-i/3))),2,y+4)}
      if(!values.length){ctx.fillText('No data yet',pad.l,pad.t+ih/2);return}
      points=values.map((v,i)=>({x:pad.l+(values.length===1?iw/2:iw*i/(values.length-1)),y:pad.t+ih-(v/max)*ih,i}));
      ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.lineTo(points.at(-1).x,pad.t+ih);ctx.lineTo(points[0].x,pad.t+ih);ctx.closePath();ctx.fillStyle=color+'22';ctx.fill();
      ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.stroke();ctx.fillStyle=color;points.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill()});
      ctx.fillStyle='#77839a';ctx.textAlign='center';labels.forEach((l,i)=>ctx.fillText(l,points[i].x,h-8));ctx.textAlign='left';
      canvas.onmousemove=e=>{const r=canvas.getBoundingClientRect(), x=e.clientX-r.left, p=points.reduce((best,row)=>Math.abs(row.x-x)<Math.abs(best.x-x)?row:best,points[0]);canvas.style.cursor='crosshair';tooltip(e,`${labels[p.i]}: ${values[p.i]}`)};canvas.onmouseleave=()=>{canvas.style.cursor='default';hideTip()};
    }); return chart;
  }
  function doughnut(target, labels, values) {
    const enabled=values.map(()=>true); let slices=[]; const chart=mount(target,(ctx,w,h,canvas)=>{
      const display=values.map((v,i)=>enabled[i]?v:0), total=display.reduce((a,b)=>a+b,0), x=w/2,y=h/2,r=Math.min(w,h)*.28, width=Math.max(18,r*.42);ctx.font='12px system-ui';slices=[];
      if(!total){ctx.fillStyle='#77839a';ctx.fillText('No data yet',w/2-30,h/2);return}let start=-Math.PI/2;
      display.forEach((value,i)=>{const end=start+(value/total)*Math.PI*2;slices.push({i,start,end});ctx.beginPath();ctx.arc(x,y,r,start,end);ctx.strokeStyle=palette[i%palette.length];ctx.globalAlpha=enabled[i]?1:.22;ctx.lineWidth=width;ctx.stroke();ctx.globalAlpha=1;start=end});
      ctx.textAlign='center';ctx.fillStyle='#24304a';ctx.font='700 22px system-ui';ctx.fillText(total,x,y+7);ctx.font='11px system-ui';ctx.fillStyle='#77839a';ctx.fillText('total',x,y+23);ctx.textAlign='left';
      labels.forEach((label,i)=>{const ly=h-20*(labels.length-i);ctx.globalAlpha=enabled[i]?1:.35;ctx.fillStyle=palette[i%palette.length];ctx.fillRect(12,ly-8,9,9);ctx.fillStyle='#536078';ctx.fillText(`${label} (${values[i]})`,27,ly);ctx.globalAlpha=1});
      canvas.onmousemove=e=>{const b=canvas.getBoundingClientRect(), mx=e.clientX-b.left, my=e.clientY-b.top, dist=Math.hypot(mx-x,my-y); let angle=Math.atan2(my-y,mx-x); if(angle< -Math.PI/2) angle+=Math.PI*2; const slice=slices.find(row=>angle>=row.start&&angle<=row.end); const legend=labels.findIndex((_,i)=>my>=h-20*(labels.length-i)-14&&my<=h-20*(labels.length-i)+6&&mx<Math.min(220,w)); const index=dist>=r-width/2-10&&dist<=r+width/2+10&&slice?slice.i:legend; if(index<0||index===undefined){canvas.style.cursor='default';hideTip();return} canvas.style.cursor='pointer';tooltip(e,`${labels[index]}: ${values[index]} — click its legend to ${enabled[index]?'hide':'show'}`)};
      canvas.onclick=e=>{const b=canvas.getBoundingClientRect(),mx=e.clientX-b.left,my=e.clientY-b.top,dist=Math.hypot(mx-x,my-y);let angle=Math.atan2(my-y,mx-x);if(angle< -Math.PI/2)angle+=Math.PI*2;const slice=slices.find(row=>angle>=row.start&&angle<=row.end),legend=labels.findIndex((_,i)=>my>=h-20*(labels.length-i)-14&&my<=h-20*(labels.length-i)+6&&mx<Math.min(220,w)),index=dist>=r-width/2-10&&dist<=r+width/2+10&&slice?slice.i:legend;if(index>=0){enabled[index]=!enabled[index];chart.repaint();}};canvas.onmouseleave=()=>{canvas.style.cursor='default';hideTip()};
    }); return chart;
  }
  return { line, doughnut };
})();

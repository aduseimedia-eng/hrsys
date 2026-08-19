/* Dependency-free, interactive canvas charts for KenadHR dashboards. */
window.KenadCharts = (() => {
  const palette = ['#1e3a8a','#2563eb','#4f86e8','#8fb3f4','#5572a8','#9eb4d8'];
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
  function bar(target, labels, values) {
    let bars=[]; const chart=mount(target,(ctx,w,h,canvas)=>{
      const pad={l:34,r:12,t:18,b:34}, max=Math.max(1,...values), iw=w-pad.l-pad.r, ih=h-pad.t-pad.b, gap=Math.max(10,iw/(values.length*4)), barW=Math.max(16,(iw-gap*(values.length-1))/Math.max(values.length,1));
      ctx.font='11px system-ui';ctx.fillStyle='#77839a';ctx.strokeStyle='#e8edf5';ctx.lineWidth=1;
      for(let i=0;i<4;i++){const y=pad.t+ih*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText(String(Math.round(max*(1-i/3))),3,y+4)}
      bars=values.map((value,index)=>{const height=Math.max(value?6:0,(value/max)*ih),x=pad.l+index*(barW+gap),y=pad.t+ih-height;ctx.fillStyle=palette[index%palette.length];ctx.fillRect(x,y,barW,height);ctx.textAlign='center';ctx.fillStyle='#77839a';ctx.fillText(labels[index],x+barW/2,h-9);ctx.textAlign='left';return {x,y,w:barW,h:height,index};});
      canvas.onmousemove=e=>{const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,bar=bars.find(row=>x>=row.x&&x<=row.x+row.w&&y>=row.y&&y<=row.y+row.h);if(!bar){canvas.style.cursor='default';hideTip();return}canvas.style.cursor='pointer';tooltip(e,`${labels[bar.index]}: ${values[bar.index]}`)};canvas.onmouseleave=()=>{canvas.style.cursor='default';hideTip()};
    });return chart;
  }
  return { line, doughnut, pie: doughnut, bar };
})();

// Dashboard charts use Chart.js when it is available. It provides smooth data
// transitions, responsive sizing, native legends and production-grade tooltips.
if (window.Chart) {
  window.KenadCharts = (() => {
    const colors = ['#1e3a8a', '#2563eb', '#4f86e8', '#8fb3f4', '#5572a8', '#9eb4d8'];
    const hostFor = (target) => typeof target === 'string' ? document.querySelector(target) : target;
    const canvasFor = (host) => {
      let canvas = host.querySelector(':scope > canvas');
      if (!canvas) { host.replaceChildren(); canvas = document.createElement('canvas'); canvas.setAttribute('role', 'img'); host.append(canvas); }
      return canvas;
    };
    const common = () => ({ responsive:true, maintainAspectRatio:false, animation:{ duration:700, easing:'easeOutQuart' }, interaction:{ intersect:false, mode:'index' }, plugins:{ tooltip:{ backgroundColor:'#10275a', padding:10, cornerRadius:8, displayColors:true } } });
    function update(host, type, labels, datasets, options) {
      const canvas = canvasFor(host);
      const chart = host._kenadLiveChart;
      if (chart && chart.config.type === type) {
        chart.data.labels = labels; chart.data.datasets = datasets; chart.options = options; chart.update(); return chart;
      }
      if (chart) chart.destroy();
      host._kenadLiveChart = new Chart(canvas, { type, data:{ labels, datasets }, options });
      return host._kenadLiveChart;
    }
    function doughnut(target, labels, values) {
      const host = hostFor(target); if (!host) return;
      const options = common();
      options.cutout = '54%';
      options.animation = { animateRotate:true, animateScale:true, duration:750, easing:'easeOutQuart' };
      options.plugins.legend = { position:'bottom', labels:{ boxWidth:10, boxHeight:10, padding:14, color:'#465675', font:{ size:11, weight:'600' } } };
      options.plugins.tooltip.callbacks = { label: (item) => `${item.label}: ${item.raw} employee${item.raw === 1 ? '' : 's'}` };
      return update(host, 'doughnut', labels, [{ data:values, backgroundColor:colors, borderColor:'#fff', borderWidth:4, hoverOffset:11 }], options);
    }
    function pie(target, labels, values) {
      const host = hostFor(target); if (!host) return;
      const options = common();
      options.animation = { animateRotate:true, animateScale:true, duration:750, easing:'easeOutQuart' };
      options.plugins.legend = { position:'bottom', labels:{ boxWidth:10, boxHeight:10, padding:14, color:'#465675', font:{ size:11, weight:'600' } } };
      options.plugins.tooltip.callbacks = { label: (item) => `${item.label}: ${item.raw} employee${item.raw === 1 ? '' : 's'}` };
      return update(host, 'pie', labels, [{ data:values, backgroundColor:colors, borderColor:'#fff', borderWidth:4, hoverOffset:11 }], options);
    }
    function bar(target, labels, values) {
      const host = hostFor(target); if (!host) return;
      const options = common();
      options.scales = { x:{ grid:{ display:false }, ticks:{ color:'#677690', font:{ size:11, weight:'600' }, maxRotation:0, autoSkip:true } }, y:{ beginAtZero:true, ticks:{ precision:0, color:'#8190a8', font:{ size:10 } }, grid:{ color:'#e9eef6' }, border:{ display:false } } };
      options.plugins.legend = { display:false };
      options.plugins.tooltip.callbacks = { label: (item) => `${item.raw} employee${item.raw === 1 ? '' : 's'}` };
      return update(host, 'bar', labels, [{ data:values, backgroundColor:colors.map((color) => `${color}ee`), borderColor:colors, borderWidth:2, borderRadius:8, borderSkipped:false, maxBarThickness:52 }], options);
    }
    function line(target, labels, series) {
      const host = hostFor(target); if (!host) return;
      const options = common();
      options.scales = { x:{ grid:{ display:false }, ticks:{ color:'#677690', font:{ size:11, weight:'600' } } }, y:{ beginAtZero:true, ticks:{ precision:0, color:'#8190a8', font:{ size:10 } }, grid:{ color:'#e9eef6' }, border:{ display:false } } };
      options.plugins.legend = { position:'bottom', labels:{ usePointStyle:true, boxWidth:9, boxHeight:9, padding:14, color:'#465675', font:{ size:11, weight:'600' } } };
      options.plugins.tooltip.callbacks = { label: (item) => `${item.dataset.label}: ${item.raw} employee${item.raw === 1 ? '' : 's'}` };
      const datasets = series.map((row, index) => ({
        label:row.label, data:row.data, borderColor:row.color || colors[index], backgroundColor:row.fill || `${row.color || colors[index]}18`, fill:index === 0 ? true : false,
        borderWidth:3.5, tension:.36, pointStyle:row.pointStyle || 'circle', pointRadius:6, pointHoverRadius:9, pointBorderWidth:2.5, pointBorderColor:'#fff', pointBackgroundColor:row.color || colors[index], pointHitRadius:14
      }));
      return update(host, 'line', labels, datasets, options);
    }
    return { doughnut, pie, bar, line };
  })();
}

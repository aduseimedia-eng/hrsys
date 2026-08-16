/* Lightweight, dependency-free canvas charts for KenadHR dashboards. */
window.KenadCharts = (() => {
  const palette = ['#3977ee','#59b78a','#f5a44b','#8b7cf6','#ef6b73','#38a7c9'];
  function mount(target, draw) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) return;
    host.innerHTML = '<canvas aria-label="Data chart" role="img"></canvas>';
    const canvas = host.querySelector('canvas'), paint = () => {
      const rect = host.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, rect.width * ratio); canvas.height = Math.max(1, (rect.height || 240) * ratio);
      canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height || 240}px`;
      const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio); draw(ctx, rect.width, rect.height || 240);
    };
    new ResizeObserver(paint).observe(host); paint();
  }
  function line(target, labels, values, color = palette[0]) { mount(target, (ctx,w,h) => {
    const pad={l:34,r:12,t:18,b:30}, max=Math.max(1,...values), innerW=w-pad.l-pad.r, innerH=h-pad.t-pad.b;
    ctx.font='11px system-ui';ctx.fillStyle='#77839a';ctx.strokeStyle='#e8edf5';ctx.lineWidth=1;
    for(let i=0;i<4;i++){const y=pad.t+innerH*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText(String(Math.round(max*(1-i/3))),2,y+4)}
    if(!values.length){ctx.fillStyle='#77839a';ctx.fillText('No data yet',pad.l,pad.t+innerH/2);return}
    const point=i=>[pad.l+(values.length===1?innerW/2:innerW*i/(values.length-1)),pad.t+innerH-(values[i]/max)*innerH];
    ctx.beginPath();values.forEach((v,i)=>{const [x,y]=point(i);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.lineTo(point(values.length-1)[0],pad.t+innerH);ctx.lineTo(point(0)[0],pad.t+innerH);ctx.closePath();ctx.fillStyle=color+'22';ctx.fill();
    ctx.beginPath();values.forEach((v,i)=>{const [x,y]=point(i);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.stroke();ctx.fillStyle=color;values.forEach((v,i)=>{const [x,y]=point(i);ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill()});
    ctx.fillStyle='#77839a';ctx.textAlign='center';labels.forEach((l,i)=>ctx.fillText(l,point(i)[0],h-8));ctx.textAlign='left';
  }); }
  function doughnut(target, labels, values) { mount(target, (ctx,w,h) => {
    const total=values.reduce((a,b)=>a+b,0), x=w/2,y=h/2,r=Math.min(w,h)*.28;ctx.font='12px system-ui';
    if(!total){ctx.fillStyle='#77839a';ctx.fillText('No data yet',w/2-30,h/2);return}let start=-Math.PI/2;
    values.forEach((value,i)=>{const end=start+(value/total)*Math.PI*2;ctx.beginPath();ctx.arc(x,y,r,start,end);ctx.strokeStyle=palette[i%palette.length];ctx.lineWidth=Math.max(18,r*.42);ctx.stroke();start=end});
    ctx.textAlign='center';ctx.fillStyle='#24304a';ctx.font='700 22px system-ui';ctx.fillText(total,x,y+7);ctx.font='11px system-ui';ctx.fillStyle='#77839a';ctx.fillText('total',x,y+23);ctx.textAlign='left';
    labels.forEach((label,i)=>{const ly=h-20*(labels.length-i);ctx.fillStyle=palette[i%palette.length];ctx.fillRect(12,ly-8,9,9);ctx.fillStyle='#536078';ctx.fillText(`${label} (${values[i]})`,27,ly)});
  }); }
  return { line, doughnut };
})();

/* The hiring view can refresh its vacancy list independently of its chart data. */
window.addEventListener('load', () => {
  if (!location.pathname.endsWith('/hiring.html') || typeof window.closeVacancy !== 'function') return;
  window.closeVacancy = async id => {
    const vacancies = await api.get('/recruitment/jobs');
    const vacancy = vacancies.find(row => row.id === id);
    if (!vacancy) return toast('Vacancy not found', 'error');
    await api.put(`/recruitment/jobs/${id}`, { ...vacancy, status: 'closed' });
    load();
  };
});

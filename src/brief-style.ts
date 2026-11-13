// Approved mobile brief styling.
export const BRIEF_CSS = `
:root{color-scheme:dark;--bg:#16181c;--panel:#1e2228;--text:#e4e4e2;--muted:#a3abb6;--line:#333b46;--accent:#a4b8d2;--up:#98bba8;--down:#d6a1a3}*{box-sizing:border-box}html{scroll-padding-top:85px}body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.6;font-size:15px;-webkit-text-size-adjust:100%}main{max-width:760px;margin:auto;padding:28px 22px 64px}header{padding:8px 0 24px}header .brand{color:var(--accent);font-size:14px;font-weight:600}h1{font-size:32px;letter-spacing:-1px;line-height:1.25;margin:13px 0 12px}h2{font-size:21px;line-height:1.4;margin:0}h3{font-size:15px;margin:20px 0 10px}p{margin:8px 0}.muted,.meta{color:var(--muted);font-size:13px}.preview{display:inline-block;font-size:12px;color:#cfbc93;background:#302c25;border:1px solid #534a38;border-radius:5px;padding:2px 8px;margin-left:8px;vertical-align:middle}.intro{color:#bfc6cf;font-size:15px;max-width:48em;margin-top:16px}.notice{padding:12px 14px;border-left:3px solid #837761;background:#242321;border-radius:0 6px 6px 0;font-size:13px;color:#c4bdaf;margin-top:18px}nav{position:sticky;top:0;z-index:2;background:var(--bg);border-top:1px solid var(--line);border-bottom:1px solid var(--line);display:flex;gap:6px;overflow-x:auto;padding:9px 0;scrollbar-width:none}nav::-webkit-scrollbar{display:none}nav a{flex:none;text-decoration:none;color:var(--muted);font-size:13px;padding:7px 11px;border-radius:6px;min-height:36px}nav a:hover,nav a:focus-visible{color:var(--text);background:var(--panel)}a{color:var(--accent)}a:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}section{padding:30px 0;border-bottom:1px solid var(--line);scroll-margin-top:10px}.section-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:7px}.command{font-size:12px;color:var(--muted);background:var(--panel);border-radius:4px;padding:2px 7px;font-family:ui-monospace,monospace;white-space:nowrap}.section-note{color:var(--muted);font-size:13px;margin:0 0 18px}.market-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.metric{background:var(--panel);border:1px solid #2c333d;padding:15px;border-radius:9px}.metric:first-child{grid-column:1/-1}.metric-label{font-size:13px;color:#b7c0cd}.metric-value{font-size:25px;font-weight:600;letter-spacing:-.6px;font-variant-numeric:tabular-nums;margin:5px 0 1px}.metric:first-child .metric-value{font-size:34px}.change{font-size:13px;font-weight:500;white-space:nowrap}.up{color:var(--up)}.down{color:var(--down)}.time{color:var(--muted);font-size:11px;margin-top:7px}.table-wrap{width:100%;overflow-x:auto}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th{text-align:right;font-size:12px;font-weight:400;color:var(--muted);padding:8px 0 10px;border-bottom:1px solid var(--line)}td{padding:12px 0;border-bottom:1px solid #292f38;text-align:right;font-size:14px}td:first-child,th:first-child{text-align:left}tbody tr:last-child td{border-bottom:0}.symbol{font-weight:600;letter-spacing:.1px}.asset-name{display:block;color:var(--muted);font-size:11px;margin-top:1px}.footnote{font-size:12px;color:var(--muted);margin-top:14px;line-height:1.7}.currency-row{display:grid;grid-template-columns:1fr 1fr;gap:0 22px}.rate{display:flex;justify-content:space-between;gap:8px;padding:12px 0;border-bottom:1px solid #292f38;font-variant-numeric:tabular-nums}.rate span{color:#bfc7d2;font-size:13px}.rate strong{font-weight:500;font-size:16px}.fuel{background:var(--panel);padding:14px 16px;border-radius:8px;margin-top:15px}.fuel-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:6px 0}.fuel-row strong{font-size:18px;font-variant-numeric:tabular-nums;font-weight:500}.fuel-row small{font-size:12px;color:var(--muted)}.event{display:grid;grid-template-columns:66px 1fr;gap:14px;padding:17px 0;border-bottom:1px solid #292f38}.event:last-child{border-bottom:0}.event-date{color:var(--accent);font-size:14px;font-variant-numeric:tabular-nums}.event-date span{display:block;color:var(--muted);font-size:12px}.event-title{font-size:15px;font-weight:600}.event-meta{font-size:12px;color:var(--muted);margin-top:4px}.event-tag{display:inline-block;margin-top:7px;font-size:11px;padding:1px 6px;border:1px solid #474137;border-radius:4px;color:#c4b491}details{margin-top:15px}summary{cursor:pointer;min-height:38px;color:var(--accent);font-size:13px;padding:8px 0}details table{margin-top:7px}footer{padding-top:25px;color:var(--muted);font-size:12px}footer p{margin:8px 0}.back{display:inline-block;margin-top:8px;padding:8px 0;font-size:13px;text-decoration:none}@media(min-width:640px){main{padding:40px 32px 70px}h1{font-size:40px}.market-grid{grid-template-columns:repeat(3,1fr)}.metric:first-child{grid-column:auto;grid-row:span 2;display:flex;flex-direction:column;justify-content:center}.metric:first-child .metric-value{font-size:32px}.currency-row{grid-template-columns:repeat(3,1fr)}}@media(max-width:360px){main{padding-left:16px;padding-right:16px}.metric{padding:12px}.metric-value{font-size:23px}td{font-size:13px}.currency-row{gap:0 14px}}@media(prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}

/* Direction remains explicit through both color and +/- signs. */
:root{--up:#a6d4b8;--down:#e6afb1}
.change.up,.change.down{display:inline-block;padding:3px 8px;border-radius:5px;font-weight:600;font-variant-numeric:tabular-nums}
.change.up{background:#263b30;border:1px solid #3d5a49}
.change.down{background:#402d32;border:1px solid #634249}
td.up,td.down{font-weight:600}
td.up{color:var(--up)}td.down{color:var(--down)}
td .movement{display:inline-block;min-width:76px;text-align:center;padding:3px 7px;border-radius:5px;white-space:nowrap}
td.up .movement{background:#263b30;border:1px solid #3d5a49}
td.down .movement{background:#402d32;border:1px solid #634249}
.direction-key{display:flex;gap:16px;font-size:12px;margin:12px 0 0;color:var(--muted)}
.direction-key span{display:inline-flex;align-items:center;gap:6px}.direction-key i{width:7px;height:7px;border-radius:50%;display:inline-block;background:currentColor}


/* Thumb-friendly section navigation. */
html{scroll-padding-top:155px}
nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;overflow:visible;padding:10px 0;background:var(--bg)}
nav a{display:flex;align-items:center;justify-content:center;min-width:0;min-height:48px;padding:10px 5px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:#c4ccd6;font-size:14px;font-weight:500;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
nav a:hover,nav a:focus-visible{background:#2b3440;color:var(--text)}
nav a:active{background:#374558}
nav a[aria-current="location"]{background:#2d3b4c;color:#d9e5f3;border-color:#7289a4;box-shadow:inset 0 0 0 1px #7289a4}
@media(min-width:640px){html{scroll-padding-top:95px}nav{grid-template-columns:repeat(6,minmax(0,1fr))}}


header > .meta{display:block;width:fit-content;max-width:100%;font-size:18px;font-weight:600;color:#d1dfed;background:#263241;border:1px solid #53677e;border-radius:8px;padding:11px 14px;margin:16px 0;line-height:1.55;font-variant-numeric:tabular-nums}

.stock-logo{width:24px;height:24px;object-fit:contain;vertical-align:middle;margin-right:7px;padding:2px;background:#e4e4e2;border-radius:5px}

`;

export const BRIEF_NAV_SCRIPT = `
(() => {
 const nav=document.querySelector('nav');
 const links=[...nav.querySelectorAll('a')];
 const sections=[...document.querySelectorAll('main section')];
 let scheduled=false;
 function highlight(){
  scheduled=false;
  const bottom=nav.getBoundingClientRect().bottom+48;
  let active=sections[0];
  for(const section of sections){if(section.getBoundingClientRect().top<=bottom)active=section;}
  if(innerHeight+scrollY>=document.documentElement.scrollHeight-4)active=sections[sections.length-1];
  for(const link of links){
   if(link.hash==='#'+active.id)link.setAttribute('aria-current','location');
   else link.removeAttribute('aria-current');
  }
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(highlight);}}
 addEventListener('scroll',schedule,{passive:true});
 addEventListener('resize',schedule);
 highlight();
})();
`;

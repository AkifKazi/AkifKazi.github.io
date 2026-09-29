(function(){
var d=document,r=d.documentElement,w=window;
var reduce=w.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
// theme
var tbs=[].slice.call(d.querySelectorAll('.theme')),bg=d.querySelector('.bg');
function applyTheme(t){
var m=d.querySelector('meta[name=theme-color]');if(m)m.content=THEME_COLORS[t];
tbs.forEach(function(b){b.setAttribute('aria-label',t==='dark'?'Switch to light theme':'Switch to dark theme')});
}
applyTheme(r.dataset.theme||'light');
// soft room backdrop: fetched after the page has loaded, faded in; skipped on data-saver
function loadRoom(){
var c=navigator.connection;if(!bg||(c&&c.saveData))return;
var u=getComputedStyle(r).getPropertyValue('--room').trim().replace(/^url\(["']?|["']?\)$/g,'');if(!u)return;
var im=new Image();im.onload=function(){bg.classList.add('on')};im.src=u;
}
function later(){(w.requestIdleCallback||function(f){setTimeout(f,300)})(loadRoom,{timeout:2500})}
if(d.readyState==='complete')later();else w.addEventListener('load',later);
tbs.forEach(function(tb){tb.addEventListener('click',function(){
var n=r.dataset.theme==='dark'?'light':'dark';
r.classList.add('theming');r.dataset.theme=n;applyTheme(n);
if(bg){bg.classList.remove('on');loadRoom()}
setTimeout(function(){r.classList.remove('theming')},400);
try{localStorage.setItem('theme',n)}catch(e){}
})});
// looping videos: autoplay while visible, unless reduced motion
var vids=[].slice.call(d.querySelectorAll('figure video'));
if(vids.length&&!reduce&&'IntersectionObserver' in w){
var play=function(v){var p=v.play();if(p&&p.catch)p.catch(function(){if(!d.hidden)v.controls=true})};
var io=new IntersectionObserver(function(es){es.forEach(function(e){var v=e.target;v.inView=e.isIntersecting;
if(e.isIntersecting)play(v);else v.pause()})},{rootMargin:'200px 0px'});
vids.forEach(function(v){v.controls=false;io.observe(v)});
d.addEventListener('visibilitychange',function(){if(!d.hidden)vids.forEach(function(v){if(v.inView&&v.paused)play(v)})});
}
// click-to-load embeds
d.addEventListener('click',function(e){
if(e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
var t=e.target.closest?e.target:null;if(!t)return;
var a=t.closest('a[data-yt]');
if(a){e.preventDefault();
var f=d.createElement('iframe');
f.src='https://www.youtube-nocookie.com/embed/'+a.dataset.yt+'?autoplay=1&rel=0'+(a.dataset.t?'&start='+a.dataset.t:'');
f.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';f.allowFullscreen=true;f.title='YouTube video';
a.replaceWith(f);return}
a=t.closest('a[data-figma]');
if(a&&w.innerWidth>=900){e.preventDefault();
var box=a.closest('.proto'),fr=d.createElement('iframe');
fr.src='https://www.figma.com/embed?embed_host=share&url='+encodeURIComponent(a.href);
fr.title='Figma prototype';fr.allowFullscreen=true;fr.loading='eager';
var wrap=d.createElement('div');wrap.className='proto-frame';wrap.appendChild(fr);
box.insertBefore(wrap,box.firstChild);box.classList.add('live');
a.removeAttribute('data-figma');a.target='_blank';a.rel='noopener';
a.querySelector('span').textContent='Open in Figma';
}
});
// copy code
function legacyCopy(s){
var ta=d.createElement('textarea'),ok=false;ta.value=s;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;opacity:0';d.body.appendChild(ta);ta.select();
try{ok=d.execCommand('copy')}catch(x){}d.body.removeChild(ta);return ok?Promise.resolve():Promise.reject();
}
function copyText(s){
if(navigator.clipboard&&w.isSecureContext)return navigator.clipboard.writeText(s).catch(function(){return legacyCopy(s)});
return legacyCopy(s);
}
var copyKey=/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent)?'Press ⌘C':'Press Ctrl+C';
[].forEach.call(d.querySelectorAll('.code .copy'),function(b){
var label=b.querySelector('.copy-t'),timer;
b.addEventListener('click',function(){
var code=b.closest('.code').querySelector('code');
copyText(code.textContent).then(function(){b.classList.add('done');label.textContent='Copied'},function(){label.textContent=copyKey;
var s=w.getSelection(),rg=d.createRange();rg.selectNodeContents(code);s.removeAllRanges();s.addRange(rg)});
clearTimeout(timer);timer=setTimeout(function(){b.classList.remove('done');label.textContent='Copy'},2000);
});
});
// open a closed toggle when a link (or the URL) points inside it
function reveal(id){
var el=id&&d.getElementById(id);if(!el)return;
for(var p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
}
function fromHash(){try{reveal(decodeURIComponent(location.hash.slice(1)))}catch(e){}}
w.addEventListener('hashchange',fromHash);fromHash();
d.addEventListener('toggle',function(e){var t=e.target;if(t.classList&&t.classList.contains('code-toggle')){var f=t.querySelector('.flow');if(t.open)f.removeAttribute('aria-hidden');else f.setAttribute('aria-hidden','true')}},true);
w.addEventListener('beforeprint',function(){[].forEach.call(d.querySelectorAll('details'),function(x){x.open=true})});
// table of contents
var toc=d.querySelector('.toc'),art=d.querySelector('.article'),pick=null;
if(toc&&'IntersectionObserver' in w){
var links={};[].forEach.call(toc.querySelectorAll('a[href^="#"]'),function(a){links[decodeURIComponent(a.hash.slice(1))]=a});
var cur=null,hs=[].slice.call(d.querySelectorAll('.prose h2[id]'));
var set=function(id){if(cur)cur.removeAttribute('aria-current');cur=links[id]||null;if(cur)cur.setAttribute('aria-current','true')};
pick=function(){var last=null;hs.forEach(function(h){if(h.getClientRects().length&&h.getBoundingClientRect().top<innerHeight*0.3)last=h.id});set(last)};
var tio=new IntersectionObserver(pick,{rootMargin:'0px 0px -70% 0px'});
hs.forEach(function(h){tio.observe(h)});
d.addEventListener('toggle',pick,true);
toc.addEventListener('click',function(e){var a=e.target.closest('a[href^="#"]');if(a)reveal(decodeURIComponent(a.hash.slice(1)))});
}
// reading progress + background parallax, one rAF per frame
var bars=[].slice.call(d.querySelectorAll('[data-progress]')),pcts=[].slice.call(d.querySelectorAll('.pct'));
var l1=d.querySelector('.bg-l1'),l2=d.querySelector('.bg-l2'),tick=0;
var upd=function(){tick=0;if(pick)pick();
if(art&&bars.length){var b=art.getBoundingClientRect(),h=b.height-innerHeight*0.6,p=h>0?Math.min(1,Math.max(0,-b.top/h)):1;
bars.forEach(function(x){x.style.setProperty('--p',p.toFixed(4))});pcts.forEach(function(x){x.textContent=Math.round(p*100)+'%'})}
if(l1&&!reduce){var max=Math.max(1,r.scrollHeight-innerHeight),q=Math.min(1,Math.max(0,scrollY/max));
l1.style.transform='translate3d(0,'+(-q*innerHeight*0.05).toFixed(1)+'px,0)';
l2.style.transform='translate3d(0,'+(-q*innerHeight*0.12).toFixed(1)+'px,0)'}
};
w.addEventListener('scroll',function(){if(!tick){tick=1;requestAnimationFrame(upd)}},{passive:true});
w.addEventListener('resize',upd);upd();
})();

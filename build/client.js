(function(){
var d=document,r=d.documentElement;
function meta(t){var c=t==='dark'?'#0C141D':'#EDF2F7';d.querySelectorAll('meta[name=theme-color]').forEach(function(m){m.removeAttribute('media');m.content=c})}
if(r.dataset.theme)meta(r.dataset.theme);
var b=d.getElementById('theme');
if(b)b.addEventListener('click',function(){
var cur=r.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
var n=cur==='dark'?'light':'dark';
r.dataset.theme=n;meta(n);
try{localStorage.setItem('theme',n)}catch(e){}
});
var v=[].slice.call(d.querySelectorAll('video[data-src]'));
if(v.length){
var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
var play=function(x){if(!rm&&x.dataset.v==='1')x.play().catch(function(){})};
var load=function(x){if(!x.getAttribute('src'))x.src=x.dataset.src};
v.forEach(function(x){x.addEventListener('loadeddata',function(){play(x)})});
if(rm)v.forEach(function(x){x.controls=true});
if('IntersectionObserver' in window){
var io=new IntersectionObserver(function(es){es.forEach(function(e){var x=e.target;
x.dataset.v=e.isIntersecting?'1':'0';
if(e.isIntersecting){load(x);play(x)}else x.pause()})},{rootMargin:'150px'});
v.forEach(function(x){io.observe(x)});
}else v.forEach(function(x){x.dataset.v='1';load(x);x.controls=true});
}
d.addEventListener('click',function(e){
var a=e.target.closest&&e.target.closest('a[data-yt]');
if(!a)return;
e.preventDefault();
var f=d.createElement('iframe');
f.src='https://www.youtube-nocookie.com/embed/'+a.dataset.yt+'?autoplay=1&rel=0'+(a.dataset.t?'&start='+a.dataset.t:'');
f.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
f.allowFullscreen=true;f.title='YouTube video';
a.replaceWith(f);
});
})();

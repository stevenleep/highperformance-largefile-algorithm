(function(){const o=document.createElement("link").relList;if(o&&o.supports&&o.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))s(e);new MutationObserver(e=>{for(const t of e)if(t.type==="childList")for(const r of t.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&s(r)}).observe(document,{childList:!0,subtree:!0});function n(e){const t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?t.credentials="include":e.crossOrigin==="anonymous"?t.credentials="omit":t.credentials="same-origin",t}function s(e){if(e.ep)return;e.ep=!0;const t=n(e);fetch(e.href,t)}})();const d={chunkSize:1024*1024*10};document.addEventListener("DOMContentLoaded",()=>{g(o=>{const n=k(o),s=indexedDB.open("file-upload",1);let e;s.onupgradeneeded=()=>{e=s.result,e.createObjectStore("chunks")},s.onsuccess=()=>{e=s.result;let t=0;function r(){if(t<=n.chunkRanges.length-1){const a=n.chunkRanges[t];let i=o.slice(a.start,a.end);y(i,e,a,()=>{t++,r()},()=>{i=null})}else e.close()}r()}}),document.querySelector("#download").addEventListener("click",async()=>{const o=indexedDB.open("file-upload",1);let n;o.onupgradeneeded=()=>{n=o.result,n.createObjectStore("chunks")},o.onsuccess=async()=>{n=o.result;const t=(n==null?void 0:n.transaction("chunks","readonly")).objectStore("chunks").openCursor();t.onsuccess=async()=>{const r=t.result;if(r){const a=r.value;console.log(r,a),r.continue()}else n.close()}}})});function y(c,o,n,s,e){let t=new FileReader;t.onload=async()=>{URL.revokeObjectURL(t.result);let r=t.result;await w(o,"chunks",n.id,r),r=null,t=null,e&&e(),requestAnimationFrame(()=>{s()})},t.readAsArrayBuffer(c)}function g(c){const o=document.querySelector(".fake-upload-btn"),n=document.querySelector("#file");o.addEventListener("click",()=>{n.click()}),n.addEventListener("change",()=>{const s=n.files[0];c(s),n.value=""})}function k(c){const{name:o,size:n,type:s,webkitRelativePath:e,lastModified:t}=c,r=Math.ceil(n/d.chunkSize),a=Array.from({length:r},(i,u)=>{const l=u*d.chunkSize,f=Math.min(l+d.chunkSize,n),p=f-l,h=u===r-1,m=`${e}${o}-${Date.now()}-${u}`;return{start:l,end:f,chunkSize:p,index:u,isLastChunk:h,id:m,timestamp:Date.now()}});return{name:o,size:n,type:s,totalChunks:r,chunkRanges:a,webkitRelativePath:e,lastModified:t,timestamp:Date.now()}}function w(c,o,n,s){return new Promise((e,t)=>{const i=c.transaction(o,"readwrite").objectStore(o).put(s,n);i.onsuccess=()=>{e(i.result)},i.onerror=()=>{t(i.error)}})}
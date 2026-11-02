/* Durable per-driver models. IndexedDB avoids localStorage's small quota. */
(()=>{'use strict';
globalThis.openLearningStorage=()=>new Promise(resolve=>{
 let request;try{request=indexedDB.open('apex-driver-memory',1);}catch{resolve(null);return;}
 request.onupgradeneeded=()=>request.result.createObjectStore('models');
 request.onerror=()=>resolve(null);request.onblocked=()=>resolve(null);
 request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve({
  read(keys){return new Promise((done,fail)=>{const result=new Map(),tx=db.transaction('models','readonly'),store=tx.objectStore('models');for(const key of keys){const r=store.get(key);r.onsuccess=()=>{if(r.result!==undefined)result.set(key,r.result);};}tx.oncomplete=()=>done(result);tx.onerror=tx.onabort=()=>fail(tx.error||new Error('Memory read failed'));});},
  write(key,value){return new Promise((done,fail)=>{let tx;try{tx=db.transaction('models','readwrite');tx.objectStore('models').put(value,key);}catch(error){fail(error);return;}tx.oncomplete=()=>done();tx.onerror=tx.onabort=()=>fail(tx.error||new Error('Memory write failed'));});}
 });};
});
})();

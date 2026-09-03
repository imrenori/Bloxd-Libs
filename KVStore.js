/*
╔══════════════════════════════════════════════════════════════╗
║                          KVSTORE                              ║
║                                                                ║
║                     Copyright © 2026                          ║
║                         _Xenon_                                ║
║                                                                ║
║         Crash-Safe Persistent Key/Value Store                 ║
╚══════════════════════════════════════════════════════════════╝
*/

const CFG={chunks:[{x:397504,y:-320,z:397504},{x:397536,y:-320,z:397504},{x:397568,y:-320,z:397504}],bucketCount:512,maxChainBlocks:4,placeholderBlock:"Bedrock",maxBlockBytes:1800,s2MaxCount:4,s1RingCap:500,s2CandCap:40,s3CandCap:40,sweepSlicePerCall:200}

const SLOTS_PER_CHUNK=32768

function addrToPos(addr){let chunkIdx=Math.floor(addr/SLOTS_PER_CHUNK),local=addr%SLOTS_PER_CHUNK,base=CFG.chunks[chunkIdx],x=local%32,y=Math.floor(local/32)%32,z=Math.floor(local/1024);return[base.x+x,base.y+y,base.z+z]}

function hashKey(key){let h=2166136261;for(let i=0;i<key.length;i++){h^=key.charCodeAt(i);h=(h*16777619)>>>0}return h}

function bucketAddr(key){return hashKey(key)%CFG.bucketCount}

function readBucket(bIdx){let[x,y,z]=addrToPos(bIdx),d=api.getBlockData(x,y,z),entries=(d&&d.entries)?Object.assign({},d.entries):{},chain=(d&&d.overflow)?d.overflow:[];for(let i=0;i<chain.length;i++){let[ox,oy,oz]=addrToPos(chain[i]),od=api.getBlockData(ox,oy,oz);if(od&&od.entries)Object.assign(entries,od.entries)}return entries}

function splitEntries(entries,firstChunkExtra){let keys=Object.keys(entries),chunks=[],cur={};for(let i=0;i<keys.length;i++){let k=keys[i],trial=Object.assign({},cur,{[k]:entries[k]}),extra=chunks.length===0?firstChunkExtra:{},trialBytes=JSON.stringify(Object.assign({entries:trial},extra)).length;if(trialBytes>CFG.maxBlockBytes&&Object.keys(cur).length>0){chunks.push(cur);cur={}}cur[k]=entries[k]}chunks.push(cur);return chunks}

function writeBucket(bIdx,entries){let[px,py,pz]=addrToPos(bIdx),oldPrimary=api.getBlockData(px,py,pz),oldOverflow=(oldPrimary&&oldPrimary.overflow)?oldPrimary.overflow:[],extra=bIdx===0?{provisioned:true,nextFree:alloc.nextFree}:{},chunks=splitEntries(entries,extra);if(chunks.length>CFG.maxChainBlocks)return false;let overflowAddrs=[];for(let i=1;i<chunks.length;i++){let addr=allocS1();overflowAddrs.push(addr);let[x,y,z]=addrToPos(addr);api.setBlockData(x,y,z,{entries:chunks[i]})}let primary=Object.assign({entries:chunks[0]||{}},extra);if(overflowAddrs.length>0)primary.overflow=overflowAddrs;api.setBlockData(px,py,pz,primary);for(let i=0;i<oldOverflow.length;i++)if(overflowAddrs.indexOf(oldOverflow[i])===-1)freeS1(oldOverflow[i]);return true}

const alloc={nextFree:CFG.bucketCount,s1Ring:[],s2Open:null,s2OpenData:{},s3Open:null,s3OpenData:{},s2Cand:[],s3Cand:[],sweepCursor:0,lastKeepAlive:0,initialized:false}

function ensureLoaded(){let now=api.now();if(now-alloc.lastKeepAlive>30000){keepChunksLoaded();alloc.lastKeepAlive=now}}

function ensureInit(){ensureLoaded();if(alloc.initialized)return true;let[sx,sy,sz]=addrToPos(0);if(!api.isBlockInLoadedChunk(sx,sy,sz))return false;let marker=api.getBlockData(sx,sy,sz);if(marker&&marker.provisioned){alloc.nextFree=marker.nextFree||CFG.bucketCount;alloc.initialized=true;return true}for(let i=0;i<CFG.bucketCount;i++){let[x,y,z]=addrToPos(i);api.setBlock(x,y,z,CFG.placeholderBlock)}api.setBlockData(sx,sy,sz,{entries:{},provisioned:true,nextFree:CFG.bucketCount});alloc.nextFree=CFG.bucketCount;alloc.initialized=true;return true}

function persistNextFree(){let[x,y,z]=addrToPos(0),cur=api.getBlockData(x,y,z)||{};cur.entries=cur.entries||{};cur.provisioned=true;cur.nextFree=alloc.nextFree;api.setBlockData(x,y,z,cur)}

function claimFreshAddr(){let a=alloc.nextFree;alloc.nextFree=a+1;let[x,y,z]=addrToPos(a);api.setBlock(x,y,z,CFG.placeholderBlock);persistNextFree();return a}

function candidatePurge(addr){for(let i=alloc.s2Cand.length-1;i>=0;i--)if(alloc.s2Cand[i].addr===addr)alloc.s2Cand.splice(i,1);for(let i=alloc.s3Cand.length-1;i>=0;i--)if(alloc.s3Cand[i].addr===addr)alloc.s3Cand.splice(i,1)}

function freeS1(addr){candidatePurge(addr);if(alloc.s1Ring.length>=CFG.s1RingCap)alloc.s1Ring.shift();alloc.s1Ring.push(addr)}

function allocS1(){if(alloc.s1Ring.length>0)return alloc.s1Ring.pop();return claimFreshAddr()}

function tier0Write(bIdx,entries,key,valueStr){let existing=entries[key];if(existing&&existing.t===0){let[x,y,z]=addrToPos(existing.a);api.setBlockData(x,y,z,{v:valueStr});return}let addr=allocS1();let[x,y,z]=addrToPos(addr);api.setBlockData(x,y,z,{v:valueStr});entries[key]={t:0,a:addr};writeBucket(bIdx,entries)}

function tier0Read(entry){let[x,y,z]=addrToPos(entry.a),d=api.getBlockData(x,y,z);return d?d.v:undefined}

function candidateUpsert(candList,cap,addr,free,count){for(let i=0;i<candList.length;i++){if(candList[i].addr===addr){candList[i].free=free;candList[i].count=count;return}}if(candList.length<cap)candList.push({addr,free,count})}

function packedFindCandidate(candList,neededBytes,maxCount){for(let i=0;i<candList.length;i++){if(candList[i].free>=neededBytes&&candList[i].count<maxCount){let c=candList[i];candList.splice(i,1);return c.addr}}return null}

function packedWrite(tier,bIdx,entries,key,valueStr){let isS2=tier==="S2",openField=isS2?"s2Open":"s3Open",dataField=isS2?"s2OpenData":"s3OpenData",candField=isS2?"s2Cand":"s3Cand",candCap=isS2?CFG.s2CandCap:CFG.s3CandCap,maxCount=isS2?CFG.s2MaxCount:Infinity;let existing=entries[key];if(existing&&existing.t===2){let[x,y,z]=addrToPos(existing.a),obj=api.getBlockData(x,y,z)||{};obj[key]=valueStr;api.setBlockData(x,y,z,obj);if(alloc[openField]===existing.a)alloc[dataField]=obj;return}let addr=alloc[openField],obj=alloc[dataField];if(addr===null){addr=claimFreshAddr();obj={};alloc[openField]=addr;alloc[dataField]=obj}let trial=Object.assign({},obj,{[key]:valueStr}),bytes=JSON.stringify(trial).length,countOk=Object.keys(trial).length<=maxCount;if(bytes<=CFG.maxBlockBytes&&countOk){obj[key]=valueStr;let[x,y,z]=addrToPos(addr);api.setBlockData(x,y,z,obj);entries[key]={t:2,a:addr,st:tier};writeBucket(bIdx,entries);return}let usedBytes=JSON.stringify(obj).length,free=CFG.maxBlockBytes-usedBytes;if(free>32)candidateUpsert(alloc[candField],candCap,addr,free,Object.keys(obj).length);let needed=JSON.stringify({[key]:valueStr}).length,newAddr=packedFindCandidate(alloc[candField],needed,maxCount),newObj;if(newAddr!==null){let[x,y,z]=addrToPos(newAddr);newObj=api.getBlockData(x,y,z)||{}}else{newAddr=claimFreshAddr();newObj={}}newObj[key]=valueStr;let[x,y,z]=addrToPos(newAddr);api.setBlockData(x,y,z,newObj);alloc[openField]=newAddr;alloc[dataField]=newObj;entries[key]={t:2,a:newAddr,st:tier};writeBucket(bIdx,entries)}

function packedRead(entry,key){let[x,y,z]=addrToPos(entry.a),d=api.getBlockData(x,y,z);return d?d[key]:undefined}

function packedDelete(entry,key){let isS2=entry.st==="S2",openField=isS2?"s2Open":"s3Open",dataField=isS2?"s2OpenData":"s3OpenData",candField=isS2?"s2Cand":"s3Cand",candCap=isS2?CFG.s2CandCap:CFG.s3CandCap;let[x,y,z]=addrToPos(entry.a),obj=api.getBlockData(x,y,z)||{};delete obj[key];if(Object.keys(obj).length===0){if(alloc[openField]===entry.a){alloc[openField]=null;alloc[dataField]={}}freeS1(entry.a);return}api.setBlockData(x,y,z,obj);if(alloc[openField]===entry.a){alloc[dataField]=obj;return}let free=CFG.maxBlockBytes-JSON.stringify(obj).length;if(free>32)candidateUpsert(alloc[candField],candCap,entry.a,free,Object.keys(obj).length)}

function tier1Write(bIdx,entries,key,valueStr){let parts=[];for(let i=0;i<valueStr.length;i+=CFG.maxBlockBytes)parts.push(valueStr.slice(i,i+CFG.maxBlockBytes));let entry=entries[key],gen,addrs;if(entry&&entry.t===1&&entry.a.length>=parts.length&&entry.b.length>=parts.length){gen=entry.g==="A"?"B":"A";addrs=gen==="A"?entry.a:entry.b}else{let a=[],b=[];for(let i=0;i<parts.length;i++)a.push(claimFreshAddr());for(let i=0;i<parts.length;i++)b.push(claimFreshAddr());entry={t:1,a,b,g:"B",n:0};gen="A";addrs=a}for(let i=0;i<parts.length;i++){let[x,y,z]=addrToPos(addrs[i]);api.setBlockData(x,y,z,{p:parts[i]})}entry.g=gen;entry.n=parts.length;entries[key]=entry;writeBucket(bIdx,entries)}

function tier1Read(entry){let addrs=entry.g==="A"?entry.a:entry.b,out="";for(let i=0;i<entry.n;i++){let[x,y,z]=addrToPos(addrs[i]),d=api.getBlockData(x,y,z);out+=d?d.p:""}return out}

function keepChunksLoaded(){for(let i=0;i<CFG.chunks.length;i++){let c=CFG.chunks[i];api.getBlock(c.x,c.y,c.z)}}

function kvSet(key,value,tier){if(!ensureInit())return;tier=tier||"S1";let valueStr=JSON.stringify(value);if(valueStr.length>CFG.maxBlockBytes-32){let bIdx=bucketAddr(key),entries=readBucket(bIdx);tier1Write(bIdx,entries,key,valueStr);return}let bIdx=bucketAddr(key),entries=readBucket(bIdx),existing=entries[key];if(existing&&existing.t!==1&&((tier==="S1")!==(existing.t===0)))kvDelete(key);if(tier==="S2"||tier==="S3")packedWrite(tier,bIdx,entries,key,valueStr);else tier0Write(bIdx,entries,key,valueStr)}

function kvGet(key){if(!ensureInit())return undefined;let bIdx=bucketAddr(key),entries=readBucket(bIdx),entry=entries[key];if(!entry)return undefined;let raw;if(entry.t===0)raw=tier0Read(entry);else if(entry.t===1)raw=tier1Read(entry);else if(entry.t===2)raw=packedRead(entry,key);return raw===undefined?undefined:JSON.parse(raw)}

function kvDelete(key){if(!ensureInit())return;let bIdx=bucketAddr(key),entries=readBucket(bIdx),entry=entries[key];if(!entry)return;delete entries[key];writeBucket(bIdx,entries);if(entry.t===0)freeS1(entry.a);else if(entry.t===2)packedDelete(entry,key)}

function collectReferenced(refSet){refSet.add(0);for(let b=0;b<CFG.bucketCount;b++){let[x,y,z]=addrToPos(b),d=api.getBlockData(x,y,z),entries=(d&&d.entries)?Object.assign({},d.entries):{},chain=(d&&d.overflow)?d.overflow:[];for(let i=0;i<chain.length;i++){refSet.add(chain[i]);let[ox,oy,oz]=addrToPos(chain[i]),od=api.getBlockData(ox,oy,oz);if(od&&od.entries)Object.assign(entries,od.entries)}for(let k in entries){let e=entries[k];if(e.t===0||e.t===2)refSet.add(e.a);else if(e.t===1){e.a.forEach(x=>refSet.add(x));e.b.forEach(x=>refSet.add(x))}}}}

function runSweep(){if(!ensureInit())return;let refSet=new Set();collectReferenced(refSet);let start=alloc.sweepCursor,end=Math.min(alloc.nextFree,start+CFG.sweepSlicePerCall);for(let a=start;a<end;a++){if(a<CFG.bucketCount)continue;if(!refSet.has(a))freeS1(a)}alloc.sweepCursor=end>=alloc.nextFree?CFG.bucketCount:end}

function kvTick(){ensureInit()}

export let KVStore={set:kvSet,get:kvGet,delete:kvDelete,sweep:runSweep,tick:kvTick}

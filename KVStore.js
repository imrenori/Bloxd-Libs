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

const REGIONS=[{x:397700,y:-320,z:397700}]

export function _createKVStore(userCfg?:any){
const CFG:any=Object.assign({regions:REGIONS,placeholderBlock:"Bedrock",clearOnReuse:true,maxBlockBytes:1800,hardCapBytes:2000,maxKeyLen:64,maxValueChars:65536,initialDepth:6,maxDepth:10,dirSlotsPerBlock:200,dirCacheCap:2,s1RingCap:500,sweepSlice:50,cascadeLimit:3},userCfg||{})
const SCHEMA_VERSION=2
const SLOTS_PER_CHUNK=32768
if(!Array.isArray(CFG.regions)||CFG.regions.length===0)throw new Error("KVStore: regions must be a non-empty array of {x,y,z} positions, found "+JSON.stringify(CFG.regions)+". Give one position inside each chunk you want to use.")
for(let i=0;i<CFG.regions.length;i++){let p=CFG.regions[i];if(!p||typeof p.x!=="number"||typeof p.y!=="number"||typeof p.z!=="number")throw new Error("KVStore: regions["+i+"] must look like {x,y,z} with numbers, found "+JSON.stringify(p)+". Give one position inside the chunk to use.")}
let regionsReady=false
function resolveRegions():void{let seen:any={},out:any[]=[];for(let i=0;i<CFG.regions.length;i++){let p=CFG.regions[i],id=api.blockCoordToChunkId([p.x,p.y,p.z]);if(seen[id]!==undefined)throw new Error("KVStore: regions["+seen[id]+"] and regions["+i+"] are in the same chunk ("+id+"). Give each region a position in a different chunk.");seen[id]=i;let c=api.chunkIdToBotLeftCoord(id);out.push({x:c[0],y:c[1],z:c[2]})}CFG.regions=out;regionsReady=true}

function addrToPos(addr:number):number[]{let regionIdx=Math.floor(addr/SLOTS_PER_CHUNK),local=addr%SLOTS_PER_CHUNK,base=CFG.regions[regionIdx];if(!base)throw new Error("KVStore: out of space, address "+addr+" is past the last region ("+CFG.regions.length+" x "+SLOTS_PER_CHUNK+" blocks). Add another region at the end of the regions list.");let x=local%32,y=Math.floor(local/32)%32,z=Math.floor(local/1024);return[base.x+x,base.y+y,base.z+z]}

function hashKey(key:string):number{let h=2166136261;for(let i=0;i<key.length;i++){h^=key.charCodeAt(i);h=(h*16777619)>>>0}return h}

function bitAt(hash:number,pos:number):number{return(hash>>>(31-pos))&1}
function dirSlotForDepth(hash:number,d:number):number{return d===0?0:(hash>>>(32-d))>>>0}

function utf8(s:string):number{if(!/[^\x00-\x7f]/.test(s))return s.length;let n=0;for(let i=0;i<s.length;i++){let c=s.charCodeAt(i);if(c<128)n++;else if(c<2048)n+=2;else if(c>=55296&&c<=56319&&i+1<s.length&&(s.charCodeAt(i+1)&64512)===56320){n+=4;i++}else n+=3}return n}
function sz(o:any):number{return utf8(JSON.stringify(o))}

function takeEsc(s:string,i:number,budget:number):number{let n=s.length,used=0,j=i;while(j<n){let c=s.charCodeAt(j),w=1,adv=1;if(c===34||c===92)w=2;else if(c<32)w=(c===8||c===9||c===10||c===12||c===13)?2:6;else if(c<128)w=1;else if(c<2048)w=2;else if(c>=55296&&c<=56319){let d=j+1<n?s.charCodeAt(j+1):0;if(d>=56320&&d<=57343){w=4;adv=2}else w=6}else if(c>=56320&&c<=57343)w=6;else w=3;if(used+w>budget)break;used+=w;j+=adv}return j>i?j:i+1}
function splitParts(valueStr:string):string[]{let parts:string[]=[],budget=CFG.maxBlockBytes-16;for(let i=0;i<valueStr.length;){let j=takeEsc(valueStr,i,budget);parts.push(valueStr.slice(i,j));i=j}if(40+parts.length*12>CFG.maxBlockBytes-400)throw new Error("KVStore: value needs "+parts.length+" blocks, too many for one directory entry");return parts}

function rd(a:number):any{let[x,y,z]=addrToPos(a);return api.getBlockData(x,y,z)}
function wr(a:number,data:any):void{let n=sz(data);if(n>CFG.hardCapBytes)throw new Error("KVStore: block "+a+" payload is "+n+"B, over the "+CFG.hardCapBytes+"B argument cap");let[x,y,z]=addrToPos(a);api.setBlockData(x,y,z,data)}

const alloc:any={nextFree:0,nextFreeDirty:false,globalDepth:CFG.initialDepth,dirBlocks:[],sweepHighWater:0,s1Ring:[],s1Set:new Set(),pendingFree:[],dirCache:[],openPacked:null,sweep:null,initialized:false,lastKeepAlive:0}
let stale:any=null

function persistRoot():void{wr(0,{provisioned:true,version:SCHEMA_VERSION,nextFree:alloc.nextFree,globalDepth:alloc.globalDepth,dirBlocks:alloc.dirBlocks,sweepHighWater:alloc.sweepHighWater});alloc.nextFreeDirty=false}
function persistRootIfDirty():void{if(alloc.nextFreeDirty)persistRoot()}

function claimFreshAddr():number{let a=alloc.nextFree;alloc.nextFree=a+1;alloc.nextFreeDirty=true;let[x,y,z]=addrToPos(a);api.setBlock(x,y,z,CFG.placeholderBlock);return a}

function freeS1(addr:number):void{if(alloc.s1Set.has(addr))return;if(alloc.s1Ring.length>=CFG.s1RingCap)alloc.s1Set.delete(alloc.s1Ring.shift());alloc.s1Ring.push(addr);alloc.s1Set.add(addr)}
function noteRef(addr:number):void{if(alloc.sweep)markBit(alloc.sweep.bitmap,addr)}
function allocBlock():number{let a:number;if(alloc.s1Ring.length>0){a=alloc.s1Ring.pop();alloc.s1Set.delete(a);if(CFG.clearOnReuse){let[x,y,z]=addrToPos(a);api.setBlock(x,y,z,"Air");api.setBlock(x,y,z,CFG.placeholderBlock)}}else a=claimFreshAddr();alloc.dirCache=alloc.dirCache.filter((e:any)=>e.addr!==a);noteRef(a);return a}
function deferFree(addr:number):void{alloc.pendingFree.push(addr)}
function flushFree():void{let p=alloc.pendingFree;alloc.pendingFree=[];for(let x of p){if(typeof x==="number")freeS1(x);else freeValueBlocks(x.e,x.k)}}
function resetMemory():void{alloc.initialized=false;alloc.nextFreeDirty=false;alloc.s1Ring=[];alloc.s1Set=new Set();alloc.pendingFree=[];alloc.dirCache=[];alloc.openPacked=null;alloc.sweep=null}
function guarded<T>(fn:()=>T):T{alloc.pendingFree=[];try{return fn()}catch(e){resetMemory();throw e}}

function keepChunksLoaded():void{for(let r of CFG.regions)api.getBlock(r.x,r.y,r.z)}
function ensureLoaded():void{let now=api.now();if(now-alloc.lastKeepAlive>30000){keepChunksLoaded();alloc.lastKeepAlive=now}}

function ensureInit():boolean{if(!regionsReady)resolveRegions();ensureLoaded();if(alloc.initialized)return true;let[rx,ry,rz]=addrToPos(0);if(!api.isBlockInLoadedChunk(rx,ry,rz))return false;let root=api.getBlockData(rx,ry,rz);if(root&&root.provisioned){if(root.version!==SCHEMA_VERSION)throw new Error("KVStore: found a v"+root.version+" root at this location but this build needs v"+SCHEMA_VERSION+". Clear the old data manually or point this instance at a fresh region (set regions in the config).");if(!Array.isArray(root.dirBlocks))throw new Error("KVStore: found data at this location that is not a valid v"+SCHEMA_VERSION+" root. Clear it manually or point this instance at a fresh region (set regions in the config).");alloc.nextFree=root.nextFree;alloc.nextFreeDirty=false;alloc.globalDepth=root.globalDepth;alloc.dirBlocks=root.dirBlocks.slice();alloc.sweepHighWater=root.sweepHighWater||0;alloc.initialized=true;return true}let dirSlots=1<<CFG.initialDepth,dirBlockCount=Math.ceil(dirSlots/CFG.dirSlotsPerBlock),nextAddr=1,dirBlockAddrs:number[]=[];for(let i=0;i<dirBlockCount;i++){dirBlockAddrs.push(nextAddr);nextAddr++}let bucketAddrs:number[]=[];for(let i=0;i<dirSlots;i++){bucketAddrs.push(nextAddr);nextAddr++}for(let i=0;i<dirSlots;i++){let a=bucketAddrs[i],[x,y,z]=addrToPos(a);api.setBlock(x,y,z,CFG.placeholderBlock);wr(a,{d:CFG.initialDepth,entries:{}})}for(let i=0;i<dirBlockCount;i++){let ptrs=bucketAddrs.slice(i*CFG.dirSlotsPerBlock,(i+1)*CFG.dirSlotsPerBlock),a=dirBlockAddrs[i],[x,y,z]=addrToPos(a);api.setBlock(x,y,z,CFG.placeholderBlock);wr(a,{ptrs})}api.setBlock(rx,ry,rz,CFG.placeholderBlock);wr(0,{provisioned:true,version:SCHEMA_VERSION,nextFree:nextAddr,globalDepth:CFG.initialDepth,dirBlocks:dirBlockAddrs,sweepHighWater:0});alloc.nextFree=nextAddr;alloc.nextFreeDirty=false;alloc.globalDepth=CFG.initialDepth;alloc.dirBlocks=dirBlockAddrs;alloc.sweepHighWater=0;alloc.initialized=true;return true}

function dirCacheGet(addr:number):any{for(let e of alloc.dirCache)if(e.addr===addr)return e.ptrs;return null}
function dirCachePromote(addr:number,ptrs:number[]):void{for(let i=0;i<alloc.dirCache.length;i++)if(alloc.dirCache[i].addr===addr){alloc.dirCache.splice(i,1);break}alloc.dirCache.push({addr,ptrs});if(alloc.dirCache.length>CFG.dirCacheCap)alloc.dirCache.shift()}
function getDirBlockPtrs(addr:number):number[]{let cached=dirCacheGet(addr);if(cached)return cached;let d=rd(addr);return d?d.ptrs:[]}
function maybePromoteDir(dirAddr:number):void{dirCachePromote(dirAddr,getDirBlockPtrs(dirAddr))}

function resolveBucket(hash:number):any{let D=alloc.globalDepth,slot=dirSlotForDepth(hash,D),dirBlockIdx=Math.floor(slot/CFG.dirSlotsPerBlock),slotInBlock=slot%CFG.dirSlotsPerBlock,dirAddr=alloc.dirBlocks[dirBlockIdx],ptrs=getDirBlockPtrs(dirAddr);return{slot,dirBlockIdx,slotInBlock,dirAddr,bucketAddr:ptrs[slotInBlock]}}

function ensureHeadroomForDepth(depth:number):void{while(alloc.globalDepth<depth&&alloc.globalDepth<CFG.maxDepth)doubleDirectory()}

function doubleDirectory():void{let oldDirBlocks=alloc.dirBlocks,oldPtrsFlat:number[]=[];for(let addr of oldDirBlocks)oldPtrsFlat=oldPtrsFlat.concat(getDirBlockPtrs(addr));let newPtrsFlat:number[]=[];for(let p of oldPtrsFlat){newPtrsFlat.push(p);newPtrsFlat.push(p)}let newDirBlockAddrs:number[]=[],newDirBlockCount=Math.ceil(newPtrsFlat.length/CFG.dirSlotsPerBlock);for(let i=0;i<newDirBlockCount;i++){let addr=allocBlock();newDirBlockAddrs.push(addr);wr(addr,{ptrs:newPtrsFlat.slice(i*CFG.dirSlotsPerBlock,(i+1)*CFG.dirSlotsPerBlock)})}alloc.globalDepth=alloc.globalDepth+1;alloc.dirBlocks=newDirBlockAddrs;for(let a of oldDirBlocks)deferFree(a)}

function updateDirectorySlots(leafInfos:any[]):void{let changedBlocks:any={};for(let leaf of leafInfos){for(let slot=leaf.rangeStart;slot<leaf.rangeStart+leaf.rangeSize;slot++){let idx=Math.floor(slot/CFG.dirSlotsPerBlock),inBlock=slot%CFG.dirSlotsPerBlock;if(!changedBlocks[idx])changedBlocks[idx]=getDirBlockPtrs(alloc.dirBlocks[idx]).slice();changedBlocks[idx][inBlock]=leaf.addr}}let oldAddrsToFree:number[]=[],newDirBlocks=alloc.dirBlocks.slice();for(let idxStr in changedBlocks){let idx=Number(idxStr),oldAddr=alloc.dirBlocks[idx],newAddr=allocBlock();wr(newAddr,{ptrs:changedBlocks[idx]});newDirBlocks[idx]=newAddr;oldAddrsToFree.push(oldAddr)}alloc.dirBlocks=newDirBlocks;for(let a of oldAddrsToFree)deferFree(a)}

function readBucketMerged(addr:number):any{let d=rd(addr);if(!d)return{d:CFG.initialDepth,entries:{}};let entries=Object.assign({},d.entries||{});if(d.chained&&d.overflow){for(let ov of d.overflow){let od=rd(ov);if(od&&od.entries)Object.assign(entries,od.entries)}}return{d:d.d,entries,chained:d.chained,overflow:d.overflow}}

function splitEntriesGeneric(entries:any):any[]{let base=sz({d:CFG.maxDepth,entries:{},chained:true,overflow:new Array(24).fill(99999)}),chunks:any[]=[],cur:any={},n=0,used=base;for(let k of Object.keys(entries)){let c=utf8(JSON.stringify(k))+utf8(JSON.stringify(entries[k]))+2;if(used+c>CFG.maxBlockBytes&&n>0){chunks.push(cur);cur={};n=0;used=base}cur[k]=entries[k];n++;used+=c}chunks.push(cur);if(chunks.length-1>24)throw new Error("KVStore: bucket needs more than 24 overflow blocks");return chunks}

function rewriteChainedInPlace(addr:number,d:number,entries:any,oldOverflow?:number[]):void{oldOverflow=oldOverflow||[];let chunks=splitEntriesGeneric(entries),overflow:number[]=[];for(let i=1;i<chunks.length;i++){let ovAddr=allocBlock();overflow.push(ovAddr);wr(ovAddr,{entries:chunks[i]})}let data:any={d,entries:chunks[0]||{}};if(overflow.length>0){data.chained=true;data.overflow=overflow}else{data.chained=false;data.overflow=[]}persistRootIfDirty();wr(addr,data);for(let ov of oldOverflow)deferFree(ov)}

function partitionEntries(entries:any,depth:number):any[]{let a:any={},b:any={};for(let k in entries)(bitAt(hashKey(k),depth)===0?a:b)[k]=entries[k];return[a,b]}

function performSplit(oldAddr:number,oldData:any):void{let d=oldData.d;ensureHeadroomForDepth(d+1);let worklist:any[]=[{depth:d,localPrefix:0,entries:oldData.entries}],finalLeaves:any[]=[],rounds=0;while(worklist.length>0){let item=worklist.shift(),bytes=sz({d:item.depth,entries:item.entries});if(bytes<=CFG.maxBlockBytes||rounds>=CFG.cascadeLimit||item.depth>=CFG.maxDepth){finalLeaves.push(item);continue}ensureHeadroomForDepth(item.depth+1);let[a,b]=partitionEntries(item.entries,item.depth);worklist.push({depth:item.depth+1,localPrefix:(item.localPrefix<<1),entries:a});worklist.push({depth:item.depth+1,localPrefix:(item.localPrefix<<1)|1,entries:b});rounds++}let Dfinal=alloc.globalDepth,repKey=Object.keys(oldData.entries)[0],prefix=repKey===undefined?0:dirSlotForDepth(hashKey(repKey),d),baseRangeStart=prefix<<(Dfinal-d),leafInfos:any[]=[];for(let leaf of finalLeaves){let bytes=sz({d:leaf.depth,entries:leaf.entries}),addr=allocBlock();if(bytes<=CFG.maxBlockBytes){wr(addr,{d:leaf.depth,entries:leaf.entries})}else{rewriteChainedInPlace(addr,leaf.depth,leaf.entries,[])}let subRangeStart=baseRangeStart+(leaf.localPrefix<<(Dfinal-leaf.depth)),subRangeSize=1<<(Dfinal-leaf.depth);leafInfos.push({addr,rangeStart:subRangeStart,rangeSize:subRangeSize})}updateDirectorySlots(leafInfos);persistRoot();deferFree(oldAddr)}

function finalizeBucketWrite(addr:number,d:number,entries:any,wasChained?:boolean,oldOverflow?:number[]):void{let bytes=sz({d,entries});if(bytes<=CFG.maxBlockBytes){persistRootIfDirty();wr(addr,wasChained?{d,entries,chained:false,overflow:[]}:{d,entries});if(wasChained)for(let ov of(oldOverflow||[]))deferFree(ov);return}if(wasChained){persistRootIfDirty();rewriteChainedInPlace(addr,d,entries,oldOverflow||[]);return}performSplit(addr,{d,entries})}

function tryUnchainBucket(addr:number,data:any):void{if(!data.chained)return;let merged=Object.assign({},data.entries);for(let ov of(data.overflow||[])){let od=rd(ov);if(od&&od.entries)Object.assign(merged,od.entries)}let bytes=sz({d:data.d,entries:merged});if(bytes<=CFG.maxBlockBytes){wr(addr,{d:data.d,entries:merged,chained:false,overflow:[]});for(let ov of(data.overflow||[]))deferFree(ov);return}performSplit(addr,{d:data.d,entries:merged});for(let ov of(data.overflow||[]))deferFree(ov)}

function tier0Read(entry:any):any{let d=rd(entry.a);return d?d.v:undefined}
function tier0Write(entries:any,key:string,valueStr:string):boolean{let existing=entries[key];if(existing&&existing.t===0){wr(existing.a,{v:valueStr});return true}let addr=allocBlock();wr(addr,{v:valueStr});entries[key]={t:0,a:addr};return false}

function packedRead(entry:any,key:string):any{let d=rd(entry.a);return d?d[key]:undefined}
function packedDeleteInPlace(entry:any,key:string):void{let obj=Object.assign({},rd(entry.a)||{});delete obj[key];if(Object.keys(obj).length===0){if(alloc.openPacked===entry.a)alloc.openPacked=null;freeS1(entry.a);return}wr(entry.a,obj)}
function packedWrite(entries:any,key:string,valueStr:string):boolean{let existing=entries[key];if(existing&&existing.t===2){let t=Object.assign({},rd(existing.a)||{},{[key]:valueStr});if(sz(t)<=CFG.maxBlockBytes){wr(existing.a,t);return true}alloc.pendingFree.push({e:existing,k:key})}let addr=alloc.openPacked;if(addr!==null){let t=Object.assign({},rd(addr)||{},{[key]:valueStr});if(sz(t)<=CFG.maxBlockBytes){noteRef(addr);wr(addr,t);entries[key]={t:2,a:addr};return false}}let newAddr=allocBlock();wr(newAddr,{[key]:valueStr});alloc.openPacked=newAddr;entries[key]={t:2,a:newAddr};return false}

function tier1Read(entry:any,key:string):string{let addrs=entry.g==="A"?entry.a:entry.b,out="";for(let i=0;i<entry.n;i++){let d=rd(addrs[i]);if(!d||typeof d.p!=="string")throw new Error("KVStore: value for key "+JSON.stringify(key)+" is corrupt (block "+addrs[i]+" is missing or empty). Delete the key and write it again.");out+=d.p}return out}
function tier1DeleteAll(entry:any):void{for(let a of entry.a)freeS1(a);for(let a of entry.b)freeS1(a)}
function tier1Write(entries:any,key:string,parts:string[]):boolean{let entry=entries[key],gen:string,addrs:number[];if(entry&&entry.t===1&&entry.a.length>=parts.length&&entry.b.length>=parts.length){entry={t:1,a:entry.a.slice(),b:entry.b.slice(),g:entry.g,n:entry.n};gen=entry.g==="A"?"B":"A";addrs=gen==="A"?entry.a:entry.b;if(addrs.length>parts.length){for(let i=parts.length;i<addrs.length;i++)deferFree(addrs[i]);addrs.length=parts.length}}else{if(entry&&entry.t===1)alloc.pendingFree.push({e:entry,k:key});let a:number[]=[],b:number[]=[];for(let i=0;i<parts.length;i++)a.push(allocBlock());for(let i=0;i<parts.length;i++)b.push(allocBlock());entry={t:1,a,b,g:"B",n:0};gen="A";addrs=a}for(let i=0;i<parts.length;i++)wr(addrs[i],{p:parts[i]});entry.g=gen;entry.n=parts.length;entries[key]=entry;return false}

function freeValueBlocks(entry:any,key:string):void{if(entry.t===0)freeS1(entry.a);else if(entry.t===1)tier1DeleteAll(entry);else if(entry.t===2)packedDeleteInPlace(entry,key)}

function kvSet(key:string,value:any,tier?:string):boolean{if(typeof key!=="string"||key.length===0||key.length>CFG.maxKeyLen)throw new Error("KVStore: key must be a string of 1-"+CFG.maxKeyLen+" chars");let valueStr=JSON.stringify(value);if(valueStr===undefined)throw new Error("KVStore: value is not JSON-serializable");if(valueStr.length>CFG.maxValueChars)throw new Error("KVStore: value is "+valueStr.length+" chars, max is "+CFG.maxValueChars);let forceSharded=sz({[key]:valueStr})>CFG.maxBlockBytes,wantT=forceSharded?1:(tier==="dedicated"?0:2),parts=wantT===1?splitParts(valueStr):null;if(!ensureInit())return false;return guarded(()=>{let h=hashKey(key),ctx=resolveBucket(h),bucketRaw=readBucketMerged(ctx.bucketAddr),entries=bucketRaw.entries,existing=entries[key];if(existing&&existing.t!==wantT){alloc.pendingFree.push({e:existing,k:key});delete entries[key]}if(wantT===0)maybePromoteDir(ctx.dirAddr);let handled:boolean;if(wantT===1)handled=tier1Write(entries,key,parts as string[]);else if(wantT===2)handled=packedWrite(entries,key,valueStr);else handled=tier0Write(entries,key,valueStr);if(handled){persistRootIfDirty();return true}finalizeBucketWrite(ctx.bucketAddr,bucketRaw.d,entries,bucketRaw.chained,bucketRaw.overflow);flushFree();return true})}

function kvGet(key:string):any{if(!ensureInit())return undefined;let h=hashKey(key),ctx=resolveBucket(h),bucket=readBucketMerged(ctx.bucketAddr),entry=bucket.entries[key];if(!entry)return undefined;if(entry.t===0)maybePromoteDir(ctx.dirAddr);let raw:any;if(entry.t===0)raw=tier0Read(entry);else if(entry.t===1)raw=tier1Read(entry,key);else raw=packedRead(entry,key);return raw===undefined?undefined:JSON.parse(raw)}

function kvDelete(key:string):void{if(!ensureInit())return;guarded(()=>{let h=hashKey(key),ctx=resolveBucket(h),bucketRaw=readBucketMerged(ctx.bucketAddr),entries=bucketRaw.entries,entry=entries[key];if(!entry)return;delete entries[key];alloc.pendingFree.push({e:entry,k:key});finalizeBucketWrite(ctx.bucketAddr,bucketRaw.d,entries,bucketRaw.chained,bucketRaw.overflow);flushFree()})}

//function globMatch(p:string,s:string):boolean{let pi=0,si=0,star=-1,mark=0;while(si<s.length){if(pi<p.length&&p[pi]==="*"){star=pi++;mark=si}else if(pi<p.length&&(p[pi]==="?"||p[pi]===s[si])){pi++;si++}else if(star>=0){pi=star+1;si=++mark}else return false}while(pi<p.length&&p[pi]==="*")pi++;return pi===p.length}

function kvSearch(pattern?:any):string[]{let re:RegExp;if(pattern===undefined)re=/./;else if(pattern instanceof RegExp)re=pattern;else if(typeof pattern==="string"){try{re=new RegExp(pattern)}catch(e:any){throw new Error("KVStore: search pattern "+JSON.stringify(pattern)+" is not valid regex ("+(e&&e.message)+"). Use regex such as \"^DevKey\", \"TestValue\" or \".\" for all keys, not * wildcards.")}}else throw new Error("KVStore: search pattern must be a regex string or RegExp, found "+typeof pattern+". Use something like \"^DevKey\", \"TestValue\" or /^DevKey\\d+$/.");if(!ensureInit())return[];let out:string[]=[],seen=new Set<number>();for(let dirAddr of alloc.dirBlocks){let ptrs=getDirBlockPtrs(dirAddr);for(let i=0;i<ptrs.length;i++){let b=ptrs[i];if(seen.has(b))continue;seen.add(b);let entries=readBucketMerged(b).entries;for(let k in entries){re.lastIndex=0;if(re.test(k))out.push(k)}}}return out.sort()}

function markBit(bitmap:Uint8Array,addr:number):void{let byteIdx=addr>>3,bit=addr&7;if(byteIdx<bitmap.length)bitmap[byteIdx]|=(1<<bit)}
function isBitMarked(bitmap:Uint8Array,addr:number):boolean{let byteIdx=addr>>3,bit=addr&7;if(byteIdx>=bitmap.length)return true;return(bitmap[byteIdx]&(1<<bit))!==0}

function initSweepCycle():void{let hi=alloc.nextFree;alloc.sweep={phase:"mark",dirSlotCursor:0,visitedBuckets:new Set(),bitmap:new Uint8Array(Math.ceil(hi/8)),reapCursor:1,targetHigh:hi};markBit(alloc.sweep.bitmap,0);for(let d of alloc.dirBlocks)markBit(alloc.sweep.bitmap,d);if(alloc.openPacked!==null)markBit(alloc.sweep.bitmap,alloc.openPacked)}

function sweepMarkSlice():void{let s=alloc.sweep,D=alloc.globalDepth,totalSlots=1<<D,end=Math.min(totalSlots,s.dirSlotCursor+CFG.sweepSlice);for(let slot=s.dirSlotCursor;slot<end;slot++){let dirBlockIdx=Math.floor(slot/CFG.dirSlotsPerBlock),slotInBlock=slot%CFG.dirSlotsPerBlock,dirAddr=alloc.dirBlocks[dirBlockIdx];markBit(s.bitmap,dirAddr);let ptrs=getDirBlockPtrs(dirAddr),bucketAddr=ptrs[slotInBlock];if(s.visitedBuckets.has(bucketAddr))continue;s.visitedBuckets.add(bucketAddr);markBit(s.bitmap,bucketAddr);let bucket=readBucketMerged(bucketAddr),rawBucket=rd(bucketAddr);if(rawBucket&&rawBucket.chained){for(let ov of rawBucket.overflow)markBit(s.bitmap,ov);tryUnchainBucket(bucketAddr,rawBucket)}for(let k in bucket.entries){let e=bucket.entries[k];if(e.t===0||e.t===2)markBit(s.bitmap,e.a);else if(e.t===1){for(let a of e.a)markBit(s.bitmap,a);for(let a of e.b)markBit(s.bitmap,a)}}}s.dirSlotCursor=end;if(s.dirSlotCursor>=totalSlots)s.phase="reap"}

function sweepReapSlice():void{let s=alloc.sweep,end=Math.min(s.targetHigh,s.reapCursor+CFG.sweepSlice*8);for(let addr=s.reapCursor;addr<end;addr++)if(!isBitMarked(s.bitmap,addr))freeS1(addr);s.reapCursor=end;if(s.reapCursor>=s.targetHigh){alloc.sweepHighWater=s.targetHigh;persistRoot();alloc.sweep=null}}

function runSweep():void{if(!ensureInit())return;guarded(()=>{if(!alloc.sweep)initSweepCycle();if(alloc.sweep.phase==="mark")sweepMarkSlice();else sweepReapSlice();flushFree()})}

function kvTick():void{ensureInit();runSweep()}

return{set:kvSet,get:kvGet,delete:kvDelete,search:kvSearch,sweep:runSweep,tick:kvTick}
}

export let KVStore=_createKVStore()

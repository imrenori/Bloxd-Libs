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
export function _createKVStore(userCfg){const CFG=Object.assign({regions:REGIONS,placeholderBlock:"Bedrock",clearOnReuse:!0,maxBlockBytes:1800,hardCapBytes:2e3,maxKeyLen:64,maxValueChars:65536,initialDepth:6,maxDepth:10,dirSlotsPerBlock:200,dirCacheCap:2,s1RingCap:500,sweepSlice:50,cascadeLimit:3},userCfg||{})
if(!Array.isArray(CFG.regions)||0===CFG.regions.length)throw new Error("KVStore: regions must be a non-empty array of {x,y,z} positions, found "+JSON.stringify(CFG.regions)+". Give one position inside each chunk you want to use.")
for(let i=0;i<CFG.regions.length;i++){let p=CFG.regions[i]
if(!p||"number"!=typeof p.x||"number"!=typeof p.y||"number"!=typeof p.z)throw new Error("KVStore: regions["+i+"] must look like {x,y,z} with numbers, found "+JSON.stringify(p)+". Give one position inside the chunk to use.")}let regionsReady=!1
function addrToPos(addr){let regionIdx=Math.floor(addr/32768),local=addr%32768,base=CFG.regions[regionIdx]
if(!base)throw new Error("KVStore: out of space, address "+addr+" is past the last region ("+CFG.regions.length+" x 32768 blocks). Add another region at the end of the regions list.")
let x=local%32,y=Math.floor(local/32)%32,z=Math.floor(local/1024)
return[base.x+x,base.y+y,base.z+z]}function hashKey(key){let h=2166136261
for(let i=0;i<key.length;i++)h^=key.charCodeAt(i),h=16777619*h>>>0
return h}function bitAt(hash,pos){return hash>>>31-pos&1}function dirSlotForDepth(hash,d){return 0===d?0:hash>>>32-d>>>0}function utf8(s){if(!/[^\x00-\x7f]/.test(s))return s.length
let n=0
for(let i=0;i<s.length;i++){let c=s.charCodeAt(i)
c<128?n++:c<2048?n+=2:c>=55296&&c<=56319&&i+1<s.length&&56320==(64512&s.charCodeAt(i+1))?(n+=4,i++):n+=3}return n}function sz(o){return utf8(JSON.stringify(o))}function takeEsc(s,i,budget){let n=s.length,used=0,j=i
for(;j<n;){let c=s.charCodeAt(j),w=1,adv=1
if(34===c||92===c)w=2
else if(c<32)w=8===c||9===c||10===c||12===c||13===c?2:6
else if(c<128)w=1
else if(c<2048)w=2
else if(c>=55296&&c<=56319){let d=j+1<n?s.charCodeAt(j+1):0
d>=56320&&d<=57343?(w=4,adv=2):w=6}else w=c>=56320&&c<=57343?6:3
if(used+w>budget)break
used+=w,j+=adv}return j>i?j:i+1}function rd(a){let[x,y,z]=addrToPos(a)
return api.getBlockData(x,y,z)}function wr(a,data){let n=sz(data)
if(n>CFG.hardCapBytes)throw new Error("KVStore: block "+a+" payload is "+n+"B, over the "+CFG.hardCapBytes+"B argument cap")
let[x,y,z]=addrToPos(a)
api.setBlockData(x,y,z,data)}const alloc={nextFree:0,nextFreeDirty:!1,globalDepth:CFG.initialDepth,dirBlocks:[],sweepHighWater:0,s1Ring:[],s1Set:new Set,pendingFree:[],dirCache:[],openPacked:null,sweep:null,initialized:!1,lastKeepAlive:0}
function persistRoot(){wr(0,{provisioned:!0,version:2,nextFree:alloc.nextFree,globalDepth:alloc.globalDepth,dirBlocks:alloc.dirBlocks,sweepHighWater:alloc.sweepHighWater}),alloc.nextFreeDirty=!1}function persistRootIfDirty(){alloc.nextFreeDirty&&persistRoot()}function freeS1(addr){alloc.s1Set.has(addr)||(alloc.s1Ring.length>=CFG.s1RingCap&&alloc.s1Set.delete(alloc.s1Ring.shift()),alloc.s1Ring.push(addr),alloc.s1Set.add(addr))}function noteRef(addr){alloc.sweep&&markBit(alloc.sweep.bitmap,addr)}function allocBlock(){let a
if(alloc.s1Ring.length>0){if(a=alloc.s1Ring.pop(),alloc.s1Set.delete(a),CFG.clearOnReuse){let[x,y,z]=addrToPos(a)
api.setBlock(x,y,z,"Air"),api.setBlock(x,y,z,CFG.placeholderBlock)}}else a=function(){let a=alloc.nextFree
alloc.nextFree=a+1,alloc.nextFreeDirty=!0
let[x,y,z]=addrToPos(a)
return api.setBlock(x,y,z,CFG.placeholderBlock),a}()
return alloc.dirCache=alloc.dirCache.filter(e=>e.addr!==a),noteRef(a),a}function deferFree(addr){alloc.pendingFree.push(addr)}function flushFree(){let p=alloc.pendingFree
alloc.pendingFree=[]
for(let x of p)"number"==typeof x?freeS1(x):freeValueBlocks(x.e,x.k)}function guarded(fn){alloc.pendingFree=[]
try{return fn()}catch(e){throw alloc.initialized=!1,alloc.nextFreeDirty=!1,alloc.s1Ring=[],alloc.s1Set=new Set,alloc.pendingFree=[],alloc.dirCache=[],alloc.openPacked=null,alloc.sweep=null,e}}function ensureLoaded(){let now=api.now()
now-alloc.lastKeepAlive>3e4&&(!function(){for(let r of CFG.regions)api.getBlock(r.x,r.y,r.z)}(),alloc.lastKeepAlive=now)}function ensureInit(){if(regionsReady||function(){let seen={},out=[]
for(let i=0;i<CFG.regions.length;i++){let p=CFG.regions[i],id=api.blockCoordToChunkId([p.x,p.y,p.z])
if(void 0!==seen[id])throw new Error("KVStore: regions["+seen[id]+"] and regions["+i+"] are in the same chunk ("+id+"). Give each region a position in a different chunk.")
seen[id]=i
let c=api.chunkIdToBotLeftCoord(id)
out.push({x:c[0],y:c[1],z:c[2]})}CFG.regions=out,regionsReady=!0}(),ensureLoaded(),alloc.initialized)return!0
let[rx,ry,rz]=addrToPos(0)
if(!api.isBlockInLoadedChunk(rx,ry,rz))return!1
let root=api.getBlockData(rx,ry,rz)
if(root&&root.provisioned){if(2!==root.version)throw new Error("KVStore: found a v"+root.version+" root at this location but this build needs v2. Clear the old data manually or point this instance at a fresh region (set regions in the config).")
if(!Array.isArray(root.dirBlocks))throw new Error("KVStore: found data at this location that is not a valid v2 root. Clear it manually or point this instance at a fresh region (set regions in the config).")
return alloc.nextFree=root.nextFree,alloc.nextFreeDirty=!1,alloc.globalDepth=root.globalDepth,alloc.dirBlocks=root.dirBlocks.slice(),alloc.sweepHighWater=root.sweepHighWater||0,alloc.initialized=!0,!0}let dirSlots=1<<CFG.initialDepth,dirBlockCount=Math.ceil(dirSlots/CFG.dirSlotsPerBlock),nextAddr=1,dirBlockAddrs=[]
for(let i=0;i<dirBlockCount;i++)dirBlockAddrs.push(nextAddr),nextAddr++
let bucketAddrs=[]
for(let i=0;i<dirSlots;i++)bucketAddrs.push(nextAddr),nextAddr++
for(let i=0;i<dirSlots;i++){let a=bucketAddrs[i],[x,y,z]=addrToPos(a)
api.setBlock(x,y,z,CFG.placeholderBlock),wr(a,{d:CFG.initialDepth,entries:{}})}for(let i=0;i<dirBlockCount;i++){let ptrs=bucketAddrs.slice(i*CFG.dirSlotsPerBlock,(i+1)*CFG.dirSlotsPerBlock),a=dirBlockAddrs[i],[x,y,z]=addrToPos(a)
api.setBlock(x,y,z,CFG.placeholderBlock),wr(a,{ptrs:ptrs})}return api.setBlock(rx,ry,rz,CFG.placeholderBlock),wr(0,{provisioned:!0,version:2,nextFree:nextAddr,globalDepth:CFG.initialDepth,dirBlocks:dirBlockAddrs,sweepHighWater:0}),alloc.nextFree=nextAddr,alloc.nextFreeDirty=!1,alloc.globalDepth=CFG.initialDepth,alloc.dirBlocks=dirBlockAddrs,alloc.sweepHighWater=0,alloc.initialized=!0,!0}function getDirBlockPtrs(addr){let cached=function(addr){for(let e of alloc.dirCache)if(e.addr===addr)return e.ptrs
return null}(addr)
if(cached)return cached
let d=rd(addr)
return d?d.ptrs:[]}function maybePromoteDir(dirAddr){!function(addr,ptrs){for(let i=0;i<alloc.dirCache.length;i++)if(alloc.dirCache[i].addr===addr){alloc.dirCache.splice(i,1)
break}alloc.dirCache.push({addr:addr,ptrs:ptrs}),alloc.dirCache.length>CFG.dirCacheCap&&alloc.dirCache.shift()}(dirAddr,getDirBlockPtrs(dirAddr))}function resolveBucket(hash){let slot=dirSlotForDepth(hash,alloc.globalDepth),dirBlockIdx=Math.floor(slot/CFG.dirSlotsPerBlock),slotInBlock=slot%CFG.dirSlotsPerBlock,dirAddr=alloc.dirBlocks[dirBlockIdx]
return{slot:slot,dirBlockIdx:dirBlockIdx,slotInBlock:slotInBlock,dirAddr:dirAddr,bucketAddr:getDirBlockPtrs(dirAddr)[slotInBlock]}}function ensureHeadroomForDepth(depth){for(;alloc.globalDepth<depth&&alloc.globalDepth<CFG.maxDepth;)doubleDirectory()}function doubleDirectory(){let oldDirBlocks=alloc.dirBlocks,oldPtrsFlat=[]
for(let addr of oldDirBlocks)oldPtrsFlat=oldPtrsFlat.concat(getDirBlockPtrs(addr))
let newPtrsFlat=[]
for(let p of oldPtrsFlat)newPtrsFlat.push(p),newPtrsFlat.push(p)
let newDirBlockAddrs=[],newDirBlockCount=Math.ceil(newPtrsFlat.length/CFG.dirSlotsPerBlock)
for(let i=0;i<newDirBlockCount;i++){let addr=allocBlock()
newDirBlockAddrs.push(addr),wr(addr,{ptrs:newPtrsFlat.slice(i*CFG.dirSlotsPerBlock,(i+1)*CFG.dirSlotsPerBlock)})}alloc.globalDepth=alloc.globalDepth+1,alloc.dirBlocks=newDirBlockAddrs
for(let a of oldDirBlocks)deferFree(a)}function readBucketMerged(addr){let d=rd(addr)
if(!d)return{d:CFG.initialDepth,entries:{}}
let entries=Object.assign({},d.entries||{})
if(d.chained&&d.overflow)for(let ov of d.overflow){let od=rd(ov)
od&&od.entries&&Object.assign(entries,od.entries)}return{d:d.d,entries:entries,chained:d.chained,overflow:d.overflow}}function rewriteChainedInPlace(addr,d,entries,oldOverflow){oldOverflow=oldOverflow||[]
let chunks=function(entries){let base=sz({d:CFG.maxDepth,entries:{},chained:!0,overflow:new Array(24).fill(99999)}),chunks=[],cur={},n=0,used=base
for(let k of Object.keys(entries)){let c=utf8(JSON.stringify(k))+utf8(JSON.stringify(entries[k]))+2
used+c>CFG.maxBlockBytes&&n>0&&(chunks.push(cur),cur={},n=0,used=base),cur[k]=entries[k],n++,used+=c}if(chunks.push(cur),chunks.length-1>24)throw new Error("KVStore: bucket needs more than 24 overflow blocks")
return chunks}(entries),overflow=[]
for(let i=1;i<chunks.length;i++){let ovAddr=allocBlock()
overflow.push(ovAddr),wr(ovAddr,{entries:chunks[i]})}let data={d:d,entries:chunks[0]||{}}
overflow.length>0?(data.chained=!0,data.overflow=overflow):(data.chained=!1,data.overflow=[]),persistRootIfDirty(),wr(addr,data)
for(let ov of oldOverflow)deferFree(ov)}function partitionEntries(entries,depth){let a={},b={}
for(let k in entries)(0===bitAt(hashKey(k),depth)?a:b)[k]=entries[k]
return[a,b]}function performSplit(oldAddr,oldData){let d=oldData.d
ensureHeadroomForDepth(d+1)
let worklist=[{depth:d,localPrefix:0,entries:oldData.entries}],finalLeaves=[],rounds=0
for(;worklist.length>0;){let item=worklist.shift()
if(sz({d:item.depth,entries:item.entries})<=CFG.maxBlockBytes||rounds>=CFG.cascadeLimit||item.depth>=CFG.maxDepth){finalLeaves.push(item)
continue}ensureHeadroomForDepth(item.depth+1)
let[a,b]=partitionEntries(item.entries,item.depth)
worklist.push({depth:item.depth+1,localPrefix:item.localPrefix<<1,entries:a}),worklist.push({depth:item.depth+1,localPrefix:item.localPrefix<<1|1,entries:b}),rounds++}let Dfinal=alloc.globalDepth,repKey=Object.keys(oldData.entries)[0],baseRangeStart=(void 0===repKey?0:dirSlotForDepth(hashKey(repKey),d))<<Dfinal-d,leafInfos=[]
for(let leaf of finalLeaves){let bytes=sz({d:leaf.depth,entries:leaf.entries}),addr=allocBlock()
bytes<=CFG.maxBlockBytes?wr(addr,{d:leaf.depth,entries:leaf.entries}):rewriteChainedInPlace(addr,leaf.depth,leaf.entries,[])
let subRangeStart=baseRangeStart+(leaf.localPrefix<<Dfinal-leaf.depth),subRangeSize=1<<Dfinal-leaf.depth
leafInfos.push({addr:addr,rangeStart:subRangeStart,rangeSize:subRangeSize})}!function(leafInfos){let changedBlocks={}
for(let leaf of leafInfos)for(let slot=leaf.rangeStart;slot<leaf.rangeStart+leaf.rangeSize;slot++){let idx=Math.floor(slot/CFG.dirSlotsPerBlock),inBlock=slot%CFG.dirSlotsPerBlock
changedBlocks[idx]||(changedBlocks[idx]=getDirBlockPtrs(alloc.dirBlocks[idx]).slice()),changedBlocks[idx][inBlock]=leaf.addr}let oldAddrsToFree=[],newDirBlocks=alloc.dirBlocks.slice()
for(let idxStr in changedBlocks){let idx=Number(idxStr),oldAddr=alloc.dirBlocks[idx],newAddr=allocBlock()
wr(newAddr,{ptrs:changedBlocks[idx]}),newDirBlocks[idx]=newAddr,oldAddrsToFree.push(oldAddr)}alloc.dirBlocks=newDirBlocks
for(let a of oldAddrsToFree)deferFree(a)}(leafInfos),persistRoot(),deferFree(oldAddr)}function finalizeBucketWrite(addr,d,entries,wasChained,oldOverflow){if(sz({d:d,entries:entries})<=CFG.maxBlockBytes){if(persistRootIfDirty(),wr(addr,wasChained?{d:d,entries:entries,chained:!1,overflow:[]}:{d:d,entries:entries}),wasChained)for(let ov of oldOverflow||[])deferFree(ov)}else{if(wasChained)return persistRootIfDirty(),void rewriteChainedInPlace(addr,d,entries,oldOverflow||[])
performSplit(addr,{d:d,entries:entries})}}function tryUnchainBucket(addr,data){if(!data.chained)return
let merged=Object.assign({},data.entries)
for(let ov of data.overflow||[]){let od=rd(ov)
od&&od.entries&&Object.assign(merged,od.entries)}if(sz({d:data.d,entries:merged})<=CFG.maxBlockBytes){wr(addr,{d:data.d,entries:merged,chained:!1,overflow:[]})
for(let ov of data.overflow||[])deferFree(ov)}else{performSplit(addr,{d:data.d,entries:merged})
for(let ov of data.overflow||[])deferFree(ov)}}function freeValueBlocks(entry,key){0===entry.t?freeS1(entry.a):1===entry.t?function(entry){for(let a of entry.a)freeS1(a)
for(let a of entry.b)freeS1(a)}(entry):2===entry.t&&function(entry,key){let obj=Object.assign({},rd(entry.a)||{})
if(delete obj[key],0===Object.keys(obj).length)return alloc.openPacked===entry.a&&(alloc.openPacked=null),void freeS1(entry.a)
wr(entry.a,obj)}(entry,key)}function markBit(bitmap,addr){let byteIdx=addr>>3,bit=7&addr
byteIdx<bitmap.length&&(bitmap[byteIdx]|=1<<bit)}function isBitMarked(bitmap,addr){let byteIdx=addr>>3,bit=7&addr
return byteIdx>=bitmap.length||!!(bitmap[byteIdx]&1<<bit)}function runSweep(){ensureInit()&&guarded(()=>{alloc.sweep||function(){let hi=alloc.nextFree
alloc.sweep={phase:"mark",dirSlotCursor:0,visitedBuckets:new Set,bitmap:new Uint8Array(Math.ceil(hi/8)),reapCursor:1,targetHigh:hi},markBit(alloc.sweep.bitmap,0)
for(let d of alloc.dirBlocks)markBit(alloc.sweep.bitmap,d)
null!==alloc.openPacked&&markBit(alloc.sweep.bitmap,alloc.openPacked)}(),"mark"===alloc.sweep.phase?function(){let s=alloc.sweep,totalSlots=1<<alloc.globalDepth,end=Math.min(totalSlots,s.dirSlotCursor+CFG.sweepSlice)
for(let slot=s.dirSlotCursor;slot<end;slot++){let dirBlockIdx=Math.floor(slot/CFG.dirSlotsPerBlock),slotInBlock=slot%CFG.dirSlotsPerBlock,dirAddr=alloc.dirBlocks[dirBlockIdx]
markBit(s.bitmap,dirAddr)
let bucketAddr=getDirBlockPtrs(dirAddr)[slotInBlock]
if(s.visitedBuckets.has(bucketAddr))continue
s.visitedBuckets.add(bucketAddr),markBit(s.bitmap,bucketAddr)
let bucket=readBucketMerged(bucketAddr),rawBucket=rd(bucketAddr)
if(rawBucket&&rawBucket.chained){for(let ov of rawBucket.overflow)markBit(s.bitmap,ov)
tryUnchainBucket(bucketAddr,rawBucket)}for(let k in bucket.entries){let e=bucket.entries[k]
if(0===e.t||2===e.t)markBit(s.bitmap,e.a)
else if(1===e.t){for(let a of e.a)markBit(s.bitmap,a)
for(let a of e.b)markBit(s.bitmap,a)}}}s.dirSlotCursor=end,s.dirSlotCursor>=totalSlots&&(s.phase="reap")}():function(){let s=alloc.sweep,end=Math.min(s.targetHigh,s.reapCursor+8*CFG.sweepSlice)
for(let addr=s.reapCursor;addr<end;addr++)isBitMarked(s.bitmap,addr)||freeS1(addr)
s.reapCursor=end,s.reapCursor>=s.targetHigh&&(alloc.sweepHighWater=s.targetHigh,persistRoot(),alloc.sweep=null)}(),flushFree()})}return{set:function(key,value,tier){if("string"!=typeof key||0===key.length||key.length>CFG.maxKeyLen)throw new Error("KVStore: key must be a string of 1-"+CFG.maxKeyLen+" chars")
let valueStr=JSON.stringify(value)
if(void 0===valueStr)throw new Error("KVStore: value is not JSON-serializable")
if(valueStr.length>CFG.maxValueChars)throw new Error("KVStore: value is "+valueStr.length+" chars, max is "+CFG.maxValueChars)
let wantT=sz({[key]:valueStr})>CFG.maxBlockBytes?1:"dedicated"===tier?0:2,parts=1===wantT?function(valueStr){let parts=[],budget=CFG.maxBlockBytes-16
for(let i=0;i<valueStr.length;){let j=takeEsc(valueStr,i,budget)
parts.push(valueStr.slice(i,j)),i=j}if(40+12*parts.length>CFG.maxBlockBytes-400)throw new Error("KVStore: value needs "+parts.length+" blocks, too many for one directory entry")
return parts}(valueStr):null
return!!ensureInit()&&guarded(()=>{let handled,ctx=resolveBucket(hashKey(key)),bucketRaw=readBucketMerged(ctx.bucketAddr),entries=bucketRaw.entries,existing=entries[key]
return existing&&existing.t!==wantT&&(alloc.pendingFree.push({e:existing,k:key}),delete entries[key]),0===wantT&&maybePromoteDir(ctx.dirAddr),handled=1===wantT?function(entries,key,parts){let gen,addrs,entry=entries[key]
if(entry&&1===entry.t&&entry.a.length>=parts.length&&entry.b.length>=parts.length){if(entry={t:1,a:entry.a.slice(),b:entry.b.slice(),g:entry.g,n:entry.n},gen="A"===entry.g?"B":"A",addrs="A"===gen?entry.a:entry.b,addrs.length>parts.length){for(let i=parts.length;i<addrs.length;i++)deferFree(addrs[i])
addrs.length=parts.length}}else{entry&&1===entry.t&&alloc.pendingFree.push({e:entry,k:key})
let a=[],b=[]
for(let i=0;i<parts.length;i++)a.push(allocBlock())
for(let i=0;i<parts.length;i++)b.push(allocBlock())
entry={t:1,a:a,b:b,g:"B",n:0},gen="A",addrs=a}for(let i=0;i<parts.length;i++)wr(addrs[i],{p:parts[i]})
return entry.g=gen,entry.n=parts.length,entries[key]=entry,!1}(entries,key,parts):2===wantT?function(entries,key,valueStr){let existing=entries[key]
if(existing&&2===existing.t){let t=Object.assign({},rd(existing.a)||{},{[key]:valueStr})
if(sz(t)<=CFG.maxBlockBytes)return wr(existing.a,t),!0
alloc.pendingFree.push({e:existing,k:key})}let addr=alloc.openPacked
if(null!==addr){let t=Object.assign({},rd(addr)||{},{[key]:valueStr})
if(sz(t)<=CFG.maxBlockBytes)return noteRef(addr),wr(addr,t),entries[key]={t:2,a:addr},!1}let newAddr=allocBlock()
return wr(newAddr,{[key]:valueStr}),alloc.openPacked=newAddr,entries[key]={t:2,a:newAddr},!1}(entries,key,valueStr):function(entries,key,valueStr){let existing=entries[key]
if(existing&&0===existing.t)return wr(existing.a,{v:valueStr}),!0
let addr=allocBlock()
return wr(addr,{v:valueStr}),entries[key]={t:0,a:addr},!1}(entries,key,valueStr),handled?(persistRootIfDirty(),!0):(finalizeBucketWrite(ctx.bucketAddr,bucketRaw.d,entries,bucketRaw.chained,bucketRaw.overflow),flushFree(),!0)})},get:function(key){if(!ensureInit())return
let raw,ctx=resolveBucket(hashKey(key)),entry=readBucketMerged(ctx.bucketAddr).entries[key]
return entry?(0===entry.t&&maybePromoteDir(ctx.dirAddr),raw=0===entry.t?function(entry){let d=rd(entry.a)
return d?d.v:void 0}(entry):1===entry.t?function(entry,key){let addrs="A"===entry.g?entry.a:entry.b,out=""
for(let i=0;i<entry.n;i++){let d=rd(addrs[i])
if(!d||"string"!=typeof d.p)throw new Error("KVStore: value for key "+JSON.stringify(key)+" is corrupt (block "+addrs[i]+" is missing or empty). Delete the key and write it again.")
out+=d.p}return out}(entry,key):function(entry,key){let d=rd(entry.a)
return d?d[key]:void 0}(entry,key),void 0===raw?void 0:JSON.parse(raw)):void 0},delete:function(key){ensureInit()&&guarded(()=>{let ctx=resolveBucket(hashKey(key)),bucketRaw=readBucketMerged(ctx.bucketAddr),entries=bucketRaw.entries,entry=entries[key]
entry&&(delete entries[key],alloc.pendingFree.push({e:entry,k:key}),finalizeBucketWrite(ctx.bucketAddr,bucketRaw.d,entries,bucketRaw.chained,bucketRaw.overflow),flushFree())})}
//function globMatch(p:string,s:string):boolean{let pi=0,si=0,star=-1,mark=0;while(si<s.length){if(pi<p.length&&p[pi]==="*"){star=pi++;mark=si}else if(pi<p.length&&(p[pi]==="?"||p[pi]===s[si])){pi++;si++}else if(star>=0){pi=star+1;si=++mark}else return false}while(pi<p.length&&p[pi]==="*")pi++;return pi===p.length}
,search:function(pattern){let re
if(void 0===pattern)re=/./
else if(pattern instanceof RegExp)re=pattern
else{if("string"!=typeof pattern)throw new Error("KVStore: search pattern must be a regex string or RegExp, found "+typeof pattern+'. Use something like "^DevKey", "TestValue" or /^DevKey\\d+$/.')
try{re=new RegExp(pattern)}catch(e){throw new Error("KVStore: search pattern "+JSON.stringify(pattern)+" is not valid regex ("+(e&&e.message)+'). Use regex such as "^DevKey", "TestValue" or "." for all keys, not * wildcards.')}}if(!ensureInit())return[]
let out=[],seen=new Set
for(let dirAddr of alloc.dirBlocks){let ptrs=getDirBlockPtrs(dirAddr)
for(let i=0;i<ptrs.length;i++){let b=ptrs[i]
if(seen.has(b))continue
seen.add(b)
let entries=readBucketMerged(b).entries
for(let k in entries)re.lastIndex=0,re.test(k)&&out.push(k)}}return out.sort()},sweep:runSweep,tick:function(){ensureInit(),runSweep()}}}export let KVStore=_createKVStore()

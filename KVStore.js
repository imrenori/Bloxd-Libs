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

export function _createKVStore(userCfg){
const CFG=Object.assign({regions:[{x:397504,y:-320,z:397504},{x:397536,y:-320,z:397504},{x:397568,y:-320,z:397504}],slotsPerRegion:32768,placeholderBlock:"Bedrock",maxBlockBytes:1800,initialDepth:6,maxDepth:10,dirSlotsPerBlock:400,dirCacheCap:2,s1RingCap:500,sweepSlice:50,cascadeLimit:3},userCfg||{})
const SCHEMA_VERSION=1

function addrToPos(addr){let regionIdx=Math.floor(addr/CFG.slotsPerRegion),local=addr%CFG.slotsPerRegion,base=CFG.regions[regionIdx],x=local%32,y=Math.floor(local/32)%32,z=Math.floor(local/1024);return[base.x+x,base.y+y,base.z+z]}

function hashKey(key){let h=2166136261;for(let i=0;i<key.length;i++){h^=key.charCodeAt(i);h=(h*16777619)>>>0}return h}

function bitAt(hash,pos){return(hash>>>(31-pos))&1}
function dirSlotForDepth(hash,d){return d===0?0:(hash>>>(32-d))>>>0}

const alloc={nextFree:0,nextFreeDirty:false,globalDepth:CFG.initialDepth,dirBlocks:[],sweepHighWater:0,s1Ring:[],dirCache:[],openPacked:null,sweep:null,initialized:false,lastKeepAlive:0}

function persistRoot(){let[x,y,z]=addrToPos(0);api.setBlockData(x,y,z,{provisioned:true,version:SCHEMA_VERSION,nextFree:alloc.nextFree,globalDepth:alloc.globalDepth,dirBlocks:alloc.dirBlocks,sweepHighWater:alloc.sweepHighWater});alloc.nextFreeDirty=false}
function persistRootIfDirty(){if(alloc.nextFreeDirty)persistRoot()}

function claimFreshAddr(){let a=alloc.nextFree;alloc.nextFree=a+1;alloc.nextFreeDirty=true;let[x,y,z]=addrToPos(a);api.setBlock(x,y,z,CFG.placeholderBlock);return a}

function freeS1(addr){if(alloc.s1Ring.length>=CFG.s1RingCap)alloc.s1Ring.shift();alloc.s1Ring.push(addr)}
function allocS1(){if(alloc.s1Ring.length>0)return alloc.s1Ring.pop();return claimFreshAddr()}

function keepChunksLoaded(){for(let r of CFG.regions)api.getBlock(r.x,r.y,r.z)}
function ensureLoaded(){let now=api.now();if(now-alloc.lastKeepAlive>30000){keepChunksLoaded();alloc.lastKeepAlive=now}}

function ensureInit(){ensureLoaded();if(alloc.initialized)return true;let[rx,ry,rz]=addrToPos(0);if(!api.isBlockInLoadedChunk(rx,ry,rz))return false;let root=api.getBlockData(rx,ry,rz);if(root&&root.provisioned){if(!root.version||root.version>SCHEMA_VERSION||!Array.isArray(root.dirBlocks))throw new Error("KVStore: found data at this location that isn't a valid v"+SCHEMA_VERSION+" root (likely leftover from an older version) — clear it manually or point this instance at a fresh region");alloc.nextFree=root.nextFree;alloc.nextFreeDirty=false;alloc.globalDepth=root.globalDepth;alloc.dirBlocks=root.dirBlocks.slice();alloc.sweepHighWater=root.sweepHighWater||0;alloc.initialized=true;return true}let dirSlots=1<<CFG.initialDepth,dirBlockCount=Math.ceil(dirSlots/CFG.dirSlotsPerBlock),nextAddr=1,dirBlockAddrs=[];for(let i=0;i<dirBlockCount;i++){dirBlockAddrs.push(nextAddr);nextAddr++}let bucketAddrs=[];for(let i=0;i<dirSlots;i++){bucketAddrs.push(nextAddr);nextAddr++}for(let i=0;i<dirSlots;i++){let[x,y,z]=addrToPos(bucketAddrs[i]);api.setBlock(x,y,z,CFG.placeholderBlock);api.setBlockData(x,y,z,{d:CFG.initialDepth,entries:{}})}for(let i=0;i<dirBlockCount;i++){let ptrs=bucketAddrs.slice(i*CFG.dirSlotsPerBlock,(i+1)*CFG.dirSlotsPerBlock),[x,y,z]=addrToPos(dirBlockAddrs[i]);api.setBlock(x,y,z,CFG.placeholderBlock);api.setBlockData(x,y,z,{ptrs})}api.setBlock(rx,ry,rz,CFG.placeholderBlock);api.setBlockData(rx,ry,rz,{provisioned:true,version:SCHEMA_VERSION,nextFree:nextAddr,globalDepth:CFG.initialDepth,dirBlocks:dirBlockAddrs,sweepHighWater:0});alloc.nextFree=nextAddr;alloc.nextFreeDirty=false;alloc.globalDepth=CFG.initialDepth;alloc.dirBlocks=dirBlockAddrs;alloc.sweepHighWater=0;alloc.initialized=true;return true}

function dirCacheGet(addr){for(let e of alloc.dirCache)if(e.addr===addr)return e.ptrs;return null}
function dirCachePromote(addr,ptrs){for(let i=0;i<alloc.dirCache.length;i++)if(alloc.dirCache[i].addr===addr){alloc.dirCache.splice(i,1);break}alloc.dirCache.push({addr,ptrs});if(alloc.dirCache.length>CFG.dirCacheCap)alloc.dirCache.shift()}
function getDirBlockPtrs(addr){let cached=dirCacheGet(addr);if(cached)return cached;let[x,y,z]=addrToPos(addr),d=api.getBlockData(x,y,z);return d?d.ptrs:[]}
function maybePromoteDir(dirAddr){dirCachePromote(dirAddr,getDirBlockPtrs(dirAddr))}

function resolveBucket(hash){let D=alloc.globalDepth,slot=dirSlotForDepth(hash,D),dirBlockIdx=Math.floor(slot/CFG.dirSlotsPerBlock),slotInBlock=slot%CFG.dirSlotsPerBlock,dirAddr=alloc.dirBlocks[dirBlockIdx],ptrs=getDirBlockPtrs(dirAddr);return{slot,dirBlockIdx,slotInBlock,dirAddr,bucketAddr:ptrs[slotInBlock]}}

function ensureHeadroomForDepth(depth){while(alloc.globalDepth<depth&&alloc.globalDepth<CFG.maxDepth)doubleDirectory()}

function doubleDirectory(){let oldDirBlocks=alloc.dirBlocks,oldPtrsFlat=[];for(let addr of oldDirBlocks)oldPtrsFlat.push(...getDirBlockPtrs(addr));let newPtrsFlat=[];for(let p of oldPtrsFlat)newPtrsFlat.push(p,p);let newDirBlockAddrs=[],newDirBlockCount=Math.ceil(newPtrsFlat.length/CFG.dirSlotsPerBlock);for(let i=0;i<newDirBlockCount;i++){let addr=claimFreshAddr();newDirBlockAddrs.push(addr);let chunk=newPtrsFlat.slice(i*CFG.dirSlotsPerBlock,(i+1)*CFG.dirSlotsPerBlock),[x,y,z]=addrToPos(addr);api.setBlockData(x,y,z,{ptrs:chunk})}alloc.globalDepth=alloc.globalDepth+1;alloc.dirBlocks=newDirBlockAddrs;for(let a of oldDirBlocks)freeS1(a)}

function updateDirectorySlots(leafInfos){let changedBlocks={};for(let leaf of leafInfos){for(let slot=leaf.rangeStart;slot<leaf.rangeStart+leaf.rangeSize;slot++){let idx=Math.floor(slot/CFG.dirSlotsPerBlock),inBlock=slot%CFG.dirSlotsPerBlock;if(!changedBlocks[idx])changedBlocks[idx]=getDirBlockPtrs(alloc.dirBlocks[idx]).slice();changedBlocks[idx][inBlock]=leaf.addr}}let oldAddrsToFree=[],newDirBlocks=alloc.dirBlocks.slice();for(let idxStr in changedBlocks){let idx=Number(idxStr),oldAddr=alloc.dirBlocks[idx],newAddr=claimFreshAddr(),[x,y,z]=addrToPos(newAddr);api.setBlockData(x,y,z,{ptrs:changedBlocks[idx]});newDirBlocks[idx]=newAddr;oldAddrsToFree.push(oldAddr)}alloc.dirBlocks=newDirBlocks;for(let a of oldAddrsToFree)freeS1(a)}

function readBucketMerged(addr){let[x,y,z]=addrToPos(addr),d=api.getBlockData(x,y,z);if(!d)return{d:CFG.initialDepth,entries:{}};let entries=Object.assign({},d.entries||{});if(d.chained&&d.overflow){for(let ov of d.overflow){let[ox,oy,oz]=addrToPos(ov),od=api.getBlockData(ox,oy,oz);if(od&&od.entries)Object.assign(entries,od.entries)}}return{d:d.d,entries,chained:d.chained,overflow:d.overflow}}

function splitEntriesGeneric(entries){let keys=Object.keys(entries),chunks=[],cur={};for(let k of keys){let trial=Object.assign({},cur,{[k]:entries[k]}),bytes=JSON.stringify({entries:trial}).length;if(bytes>CFG.maxBlockBytes&&Object.keys(cur).length>0){chunks.push(cur);cur={}}cur[k]=entries[k]}chunks.push(cur);return chunks}

function rewriteChainedInPlace(addr,d,entries,oldOverflow){oldOverflow=oldOverflow||[];let chunks=splitEntriesGeneric(entries),overflow=[];for(let i=1;i<chunks.length;i++){let ovAddr=(i-1)<oldOverflow.length?oldOverflow[i-1]:claimFreshAddr();overflow.push(ovAddr);let[x,y,z]=addrToPos(ovAddr);api.setBlockData(x,y,z,{entries:chunks[i]})}for(let i=overflow.length;i<oldOverflow.length;i++)freeS1(oldOverflow[i]);let[x,y,z]=addrToPos(addr),data={d,entries:chunks[0]||{}};if(overflow.length>0){data.chained=true;data.overflow=overflow}api.setBlockData(x,y,z,data)}

function partitionEntries(entries,depth){let a={},b={};for(let k in entries)(bitAt(hashKey(k),depth)===0?a:b)[k]=entries[k];return[a,b]}

function performSplit(oldAddr,oldData){let d=oldData.d;ensureHeadroomForDepth(d+1);let worklist=[{depth:d,localPrefix:0,entries:oldData.entries}],finalLeaves=[],rounds=0;while(worklist.length>0){let item=worklist.shift(),bytes=JSON.stringify({d:item.depth,entries:item.entries}).length;if(bytes<=CFG.maxBlockBytes||rounds>=CFG.cascadeLimit||item.depth>=CFG.maxDepth){finalLeaves.push(item);continue}ensureHeadroomForDepth(item.depth+1);let[a,b]=partitionEntries(item.entries,item.depth);worklist.push({depth:item.depth+1,localPrefix:(item.localPrefix<<1),entries:a});worklist.push({depth:item.depth+1,localPrefix:(item.localPrefix<<1)|1,entries:b});rounds++}let Dfinal=alloc.globalDepth,repKey=Object.keys(oldData.entries)[0],prefix=repKey===undefined?0:dirSlotForDepth(hashKey(repKey),d),baseRangeStart=prefix<<(Dfinal-d),leafInfos=[];for(let leaf of finalLeaves){let bytes=JSON.stringify({d:leaf.depth,entries:leaf.entries}).length,addr=claimFreshAddr();if(bytes<=CFG.maxBlockBytes){let[x,y,z]=addrToPos(addr);api.setBlockData(x,y,z,{d:leaf.depth,entries:leaf.entries})}else{rewriteChainedInPlace(addr,leaf.depth,leaf.entries,[])}let subRangeStart=baseRangeStart+(leaf.localPrefix<<(Dfinal-leaf.depth)),subRangeSize=1<<(Dfinal-leaf.depth);leafInfos.push({addr,rangeStart:subRangeStart,rangeSize:subRangeSize})}updateDirectorySlots(leafInfos);persistRoot();freeS1(oldAddr)}

function finalizeBucketWrite(addr,d,entries,wasChained,oldOverflow){let bytes=JSON.stringify({d,entries}).length;if(bytes<=CFG.maxBlockBytes){let[x,y,z]=addrToPos(addr);api.setBlockData(x,y,z,{d,entries});if(wasChained)for(let ov of(oldOverflow||[]))freeS1(ov);persistRootIfDirty();return}if(wasChained){rewriteChainedInPlace(addr,d,entries,oldOverflow||[]);persistRootIfDirty();return}performSplit(addr,{d,entries})}

function tryUnchainBucket(addr,data){if(!data.chained)return;let merged=Object.assign({},data.entries);for(let ov of(data.overflow||[])){let[x,y,z]=addrToPos(ov),od=api.getBlockData(x,y,z);if(od&&od.entries)Object.assign(merged,od.entries)}let bytes=JSON.stringify({d:data.d,entries:merged}).length;if(bytes<=CFG.maxBlockBytes){let[x,y,z]=addrToPos(addr);api.setBlockData(x,y,z,{d:data.d,entries:merged});for(let ov of(data.overflow||[]))freeS1(ov);return}performSplit(addr,{d:data.d,entries:merged});for(let ov of(data.overflow||[]))freeS1(ov)}

function tier0Read(entry){let[x,y,z]=addrToPos(entry.a),d=api.getBlockData(x,y,z);return d?d.v:undefined}
function tier0Write(entries,key,valueStr){let existing=entries[key];if(existing&&existing.t===0){let[x,y,z]=addrToPos(existing.a);api.setBlockData(x,y,z,{v:valueStr});return true}let addr=allocS1(),[x,y,z]=addrToPos(addr);api.setBlockData(x,y,z,{v:valueStr});entries[key]={t:0,a:addr};return false}

function packedRead(entry,key){let[x,y,z]=addrToPos(entry.a),d=api.getBlockData(x,y,z);return d?d[key]:undefined}
function packedDeleteInPlace(entry,key){let[x,y,z]=addrToPos(entry.a),obj=api.getBlockData(x,y,z)||{};delete obj[key];if(Object.keys(obj).length===0){if(alloc.openPacked===entry.a)alloc.openPacked=null;freeS1(entry.a);return}api.setBlockData(x,y,z,obj)}
function packedWrite(entries,key,valueStr){let existing=entries[key];if(existing&&existing.t===2){let[x,y,z]=addrToPos(existing.a),obj=api.getBlockData(x,y,z)||{};obj[key]=valueStr;api.setBlockData(x,y,z,obj);return true}let addr=alloc.openPacked,obj=null;if(addr!==null){let[x,y,z]=addrToPos(addr);obj=api.getBlockData(x,y,z)||{}}if(addr!==null){let trial=Object.assign({},obj,{[key]:valueStr}),bytes=JSON.stringify(trial).length;if(bytes<=CFG.maxBlockBytes){obj[key]=valueStr;let[x,y,z]=addrToPos(addr);api.setBlockData(x,y,z,obj);entries[key]={t:2,a:addr};return false}}let newAddr=claimFreshAddr(),newObj={[key]:valueStr},[x,y,z]=addrToPos(newAddr);api.setBlockData(x,y,z,newObj);alloc.openPacked=newAddr;entries[key]={t:2,a:newAddr};return false}

function tier1Read(entry){let addrs=entry.g==="A"?entry.a:entry.b,out="";for(let i=0;i<entry.n;i++){let[x,y,z]=addrToPos(addrs[i]),d=api.getBlockData(x,y,z);out+=d?d.p:""}return out}
function tier1DeleteAll(entry){for(let a of entry.a)freeS1(a);for(let a of entry.b)freeS1(a)}
function tier1Write(entries,key,valueStr){let parts=[];for(let i=0;i<valueStr.length;i+=CFG.maxBlockBytes)parts.push(valueStr.slice(i,i+CFG.maxBlockBytes));let entry=entries[key],gen,addrs;if(entry&&entry.t===1&&entry.a.length>=parts.length&&entry.b.length>=parts.length){gen=entry.g==="A"?"B":"A";addrs=gen==="A"?entry.a:entry.b;if(addrs.length>parts.length){for(let i=parts.length;i<addrs.length;i++)freeS1(addrs[i]);addrs.length=parts.length}}else{let a=[],b=[];for(let i=0;i<parts.length;i++)a.push(claimFreshAddr());for(let i=0;i<parts.length;i++)b.push(claimFreshAddr());entry={t:1,a,b,g:"B",n:0};gen="A";addrs=a}for(let i=0;i<parts.length;i++){let[x,y,z]=addrToPos(addrs[i]);api.setBlockData(x,y,z,{p:parts[i]})}entry.g=gen;entry.n=parts.length;entries[key]=entry;return false}

function freeValueBlocks(entry,key){if(entry.t===0)freeS1(entry.a);else if(entry.t===1)tier1DeleteAll(entry);else if(entry.t===2)packedDeleteInPlace(entry,key)}

function kvSet(key,value,tier){if(!ensureInit())return false;let dedicated=tier==="dedicated",valueStr=JSON.stringify(value),h=hashKey(key),ctx=resolveBucket(h),bucketRaw=readBucketMerged(ctx.bucketAddr),entries=bucketRaw.entries,forceSharded=valueStr.length>CFG.maxBlockBytes-32,wantT=forceSharded?1:(dedicated?0:2),existing=entries[key];if(existing&&existing.t!==wantT){freeValueBlocks(existing,key);delete entries[key]}if(wantT===0)maybePromoteDir(ctx.dirAddr);let handled;if(wantT===1)handled=tier1Write(entries,key,valueStr);else if(wantT===2)handled=packedWrite(entries,key,valueStr);else handled=tier0Write(entries,key,valueStr);if(handled){persistRootIfDirty();return true}finalizeBucketWrite(ctx.bucketAddr,bucketRaw.d,entries,bucketRaw.chained,bucketRaw.overflow);return true}

function kvGet(key){if(!ensureInit())return undefined;let h=hashKey(key),ctx=resolveBucket(h),bucket=readBucketMerged(ctx.bucketAddr),entry=bucket.entries[key];if(!entry)return undefined;if(entry.t===0)maybePromoteDir(ctx.dirAddr);let raw;if(entry.t===0)raw=tier0Read(entry);else if(entry.t===1)raw=tier1Read(entry);else raw=packedRead(entry,key);return raw===undefined?undefined:JSON.parse(raw)}

function kvDelete(key){if(!ensureInit())return;let h=hashKey(key),ctx=resolveBucket(h),bucketRaw=readBucketMerged(ctx.bucketAddr),entries=bucketRaw.entries,entry=entries[key];if(!entry)return;freeValueBlocks(entry,key);delete entries[key];finalizeBucketWrite(ctx.bucketAddr,bucketRaw.d,entries,bucketRaw.chained,bucketRaw.overflow)}

function markBit(bitmap,addr){let byteIdx=addr>>3,bit=addr&7;if(byteIdx<bitmap.length)bitmap[byteIdx]|=(1<<bit)}
function isBitMarked(bitmap,addr){let byteIdx=addr>>3,bit=addr&7;if(byteIdx>=bitmap.length)return true;return(bitmap[byteIdx]&(1<<bit))!==0}

function initSweepCycle(){let hi=alloc.nextFree;alloc.sweep={phase:"mark",dirSlotCursor:0,visitedBuckets:new Set(),bitmap:new Uint8Array(Math.ceil(hi/8)),reapCursor:1,targetHigh:hi};markBit(alloc.sweep.bitmap,0);for(let d of alloc.dirBlocks)markBit(alloc.sweep.bitmap,d)}

function sweepMarkSlice(){let s=alloc.sweep,D=alloc.globalDepth,totalSlots=1<<D,end=Math.min(totalSlots,s.dirSlotCursor+CFG.sweepSlice);for(let slot=s.dirSlotCursor;slot<end;slot++){let dirBlockIdx=Math.floor(slot/CFG.dirSlotsPerBlock),slotInBlock=slot%CFG.dirSlotsPerBlock,dirAddr=alloc.dirBlocks[dirBlockIdx];markBit(s.bitmap,dirAddr);let ptrs=getDirBlockPtrs(dirAddr),bucketAddr=ptrs[slotInBlock];if(s.visitedBuckets.has(bucketAddr))continue;s.visitedBuckets.add(bucketAddr);markBit(s.bitmap,bucketAddr);let bucket=readBucketMerged(bucketAddr),[bx,by,bz]=addrToPos(bucketAddr),rawBucket=api.getBlockData(bx,by,bz);if(rawBucket&&rawBucket.chained){for(let ov of rawBucket.overflow)markBit(s.bitmap,ov);tryUnchainBucket(bucketAddr,rawBucket)}for(let k in bucket.entries){let e=bucket.entries[k];if(e.t===0||e.t===2)markBit(s.bitmap,e.a);else if(e.t===1){for(let a of e.a)markBit(s.bitmap,a);for(let a of e.b)markBit(s.bitmap,a)}}}s.dirSlotCursor=end;if(s.dirSlotCursor>=totalSlots)s.phase="reap"}

function sweepReapSlice(){let s=alloc.sweep,end=Math.min(s.targetHigh,s.reapCursor+CFG.sweepSlice*8);for(let addr=s.reapCursor;addr<end;addr++)if(!isBitMarked(s.bitmap,addr))freeS1(addr);s.reapCursor=end;if(s.reapCursor>=s.targetHigh){alloc.sweepHighWater=s.targetHigh;persistRoot();alloc.sweep=null}}

function runSweep(){if(!ensureInit())return;if(!alloc.sweep)initSweepCycle();if(alloc.sweep.phase==="mark")sweepMarkSlice();else sweepReapSlice()}

function kvTick(){ensureInit();runSweep()}

return{set:kvSet,get:kvGet,delete:kvDelete,sweep:runSweep,tick:kvTick}
}

export let KVStore=_createKVStore()

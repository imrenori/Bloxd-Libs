/*
╔══════════════════════════════════════════════════════════════╗
║                       BLOXD SCHEDULER                        ║
║                                                              ║
║                    Copyright © 2026                          ║
║                      MangoIsSleepy                           ║
║                                                              ║
║                 Tick Based Task Scheduler                   ║
╚══════════════════════════════════════════════════════════════╝
*/

export let Scheduler={
    tasks:[],
    nextId:1,
    time:0,
    maxPerTick:100,

    add:(delay,fn,repeat=0)=>{if(typeof fn!=="function")return null;let task={id:Scheduler.nextId++,at:Scheduler.time+Math.max(0,delay),repeat:Math.max(0,repeat),fn:fn,cancelled:false};Scheduler.tasks.push(task);return task.id},
    after:(delay,fn)=>Scheduler.add(delay,fn),
    every:(delay,fn)=>Scheduler.add(Math.max(1,delay),fn,Math.max(1,delay)),

    cancel:id=>{for(let task of Scheduler.tasks)if(task.id===id){task.cancelled=true;return true}return false},
    exists:id=>{for(let task of Scheduler.tasks)if(task.id===id&&!task.cancelled)return true;return false},
    clear:()=>{Scheduler.tasks=[]},

    delay:(id,amount)=>{for(let task of Scheduler.tasks)if(task.id===id&&!task.cancelled){task.at+=amount;return true}return false},
    runNow:id=>{for(let task of Scheduler.tasks)if(task.id===id&&!task.cancelled){task.at=Scheduler.time;return true}return false},

    once:(condition,fn,checkRate=50)=>{let id=null;id=Scheduler.every(checkRate,()=>{if(condition()){Scheduler.cancel(id);fn()}});return id},

    until:(condition,fn,checkRate=50)=>{let id=null;id=Scheduler.every(checkRate,()=>{if(condition()){Scheduler.cancel(id);return}fn()});return id},

    debounce:(wait,fn)=>{let id=null;return(...args)=>{if(id!==null)Scheduler.cancel(id);id=Scheduler.after(wait,()=>{id=null;fn(...args)});return id}},

    throttle:(wait,fn)=>{let ready=true;return(...args)=>{if(!ready)return false;ready=false;fn(...args);Scheduler.after(wait,()=>{ready=true});return true}},

    sequence:steps=>{if(!Array.isArray(steps)||!steps.length)return null;let index=0,current=null,next=()=>{if(index>=steps.length)return;let step=steps[index++];if(typeof step==="function"){step();next();return}if(typeof step==="number"){current=Scheduler.after(step,next);return}if(step&&typeof step.delay==="number"){current=Scheduler.after(step.delay,()=>{if(typeof step.fn==="function")step.fn();next()});return}next()};next();return()=>current===null?false:Scheduler.cancel(current)},

    tick:(dt=50)=>{Scheduler.time+=dt;let ran=0;for(let i=0;i<Scheduler.tasks.length&&ran<Scheduler.maxPerTick;i++){let task=Scheduler.tasks[i];if(task.cancelled||task.at>Scheduler.time)continue;ran++;if(task.repeat>0)task.at+=task.repeat;else task.cancelled=true;try{task.fn()}catch(e){api.log("[Scheduler] Task "+task.id+" failed:",e)}}if(Scheduler.tasks.length>200){let active=[];for(let task of Scheduler.tasks)if(!task.cancelled)active.push(task);Scheduler.tasks=active}},

    setMaxPerTick:value=>{Scheduler.maxPerTick=Math.max(1,Math.floor(value))},
    getTime:()=>Scheduler.time,
    pending:()=>{let count=0;for(let task of Scheduler.tasks)if(!task.cancelled)count++;return count}
}
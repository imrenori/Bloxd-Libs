/*
╔══════════════════════════════════════════════════════════════╗
║                       BLOXD MATHLIB                         ║
║                                                              ║
║                    Copyright © 2026                          ║
║                      MangoIsSleepy                           ║
║                                                              ║
║                 3D Math Library 4 Bloxd                      ║
╚══════════════════════════════════════════════════════════════╝
*/

export let MathLib={
    EPS:0.000001,
    clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
    lerp:(a,b,t)=>a+(b-a)*t,
    invLerp:(a,b,v)=>b===a?0:(v-a)/(b-a),
    map:(v,a,b,c,d)=>c+(d-c)*MathLib.invLerp(a,b,v),
    smoothstep:(a,b,v)=>{let t=MathLib.clamp(MathLib.invLerp(a,b,v),0,1);return t*t*(3-2*t)},
    smootherstep:(a,b,v)=>{let t=MathLib.clamp(MathLib.invLerp(a,b,v),0,1);return t*t*t*(t*(t*6-15)+10)},
    approach:(v,target,amount)=>v<target?Math.min(v+amount,target):Math.max(v-amount,target),
    sign:v=>v<0?-1:v>0?1:0,
    fract:v=>v-Math.floor(v),
    mod:(a,b)=>((a%b)+b)%b,
    degToRad:v=>v*Math.PI/180,
    radToDeg:v=>v*180/Math.PI,
    wrap:(v,min,max)=>MathLib.mod(v-min,max-min)+min,
    distance:(a,b)=>{let x=b[0]-a[0],y=b[1]-a[1],z=b[2]-a[2];return Math.sqrt(x*x+y*y+z*z)},
    distance2:(a,b)=>{let x=b[0]-a[0],y=b[1]-a[1],z=b[2]-a[2];return x*x+y*y+z*z},
    manhattan:(a,b)=>Math.abs(b[0]-a[0])+Math.abs(b[1]-a[1])+Math.abs(b[2]-a[2]),
    add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],
    sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
    mul:(a,v)=>[a[0]*v,a[1]*v,a[2]*v],
    div:(a,v)=>[a[0]/v,a[1]/v,a[2]/v],
    neg:a=>[-a[0],-a[1],-a[2]],
    dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
    cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    length:a=>Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]),
    length2:a=>a[0]*a[0]+a[1]*a[1]+a[2]*a[2],
    normalize:a=>{let l=MathLib.length(a);return l<MathLib.EPS?[0,0,0]:[a[0]/l,a[1]/l,a[2]/l]},
    lerpVec:(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t],
    floor:a=>[Math.floor(a[0]),Math.floor(a[1]),Math.floor(a[2])],
    ceil:a=>[Math.ceil(a[0]),Math.ceil(a[1]),Math.ceil(a[2])],
    round:a=>[Math.round(a[0]),Math.round(a[1]),Math.round(a[2])],
    abs:a=>[Math.abs(a[0]),Math.abs(a[1]),Math.abs(a[2])],
    min:(a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.min(a[2],b[2])],
    max:(a,b)=>[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.max(a[2],b[2])],
    rotateY:(v,r)=>{let c=Math.cos(r),s=Math.sin(r);return[v[0]*c-v[2]*s,v[1],v[0]*s+v[2]*c]},
    rotateX:(v,r)=>{let c=Math.cos(r),s=Math.sin(r);return[v[0],v[1]*c-v[2]*s,v[1]*s+v[2]*c]},
    rotateZ:(v,r)=>{let c=Math.cos(r),s=Math.sin(r);return[v[0]*c-v[1]*s,v[0]*s+v[1]*c,v[2]]},
    angleBetween:(a,b)=>{let al=MathLib.length(a),bl=MathLib.length(b);return al<MathLib.EPS||bl<MathLib.EPS?0:Math.acos(MathLib.clamp(MathLib.dot(a,b)/(al*bl),-1,1))},
    randomRange:(a,b)=>a+Math.random()*(b-a),
    randomInt:(a,b)=>Math.floor(a+Math.random()*(b-a+1)),
    hash:(x,y,z)=>{let n=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453123;return MathLib.fract(n)},
    noise2:(x,y)=>{let x0=Math.floor(x),y0=Math.floor(y),xf=MathLib.fract(x),yf=MathLib.fract(y),a=MathLib.hash(x0,y0,0),b=MathLib.hash(x0+1,y0,0),c=MathLib.hash(x0,y0+1,0),d=MathLib.hash(x0+1,y0+1,0),u=MathLib.smootherstep(0,1,xf),v=MathLib.smootherstep(0,1,yf);return MathLib.lerp(MathLib.lerp(a,b,u),MathLib.lerp(c,d,u),v)},
    noise3:(x,y,z)=>{let x0=Math.floor(x),y0=Math.floor(y),z0=Math.floor(z),xf=MathLib.fract(x),yf=MathLib.fract(y),zf=MathLib.fract(z),c000=MathLib.hash(x0,y0,z0),c100=MathLib.hash(x0+1,y0,z0),c010=MathLib.hash(x0,y0+1,z0),c110=MathLib.hash(x0+1,y0+1,z0),c001=MathLib.hash(x0,y0,z0+1),c101=MathLib.hash(x0+1,y0,z0+1),c011=MathLib.hash(x0,y0+1,z0+1),c111=MathLib.hash(x0+1,y0+1,z0+1),u=MathLib.smootherstep(0,1,xf),v=MathLib.smootherstep(0,1,yf),w=MathLib.smootherstep(0,1,zf),x1=MathLib.lerp(c000,c100,u),x2=MathLib.lerp(c010,c110,u),x3=MathLib.lerp(c001,c101,u),x4=MathLib.lerp(c011,c111,u);return MathLib.lerp(MathLib.lerp(x1,x2,v),MathLib.lerp(x3,x4,v),w)},
    fbm2:(x,y,octaves=5,lacunarity=2,gain=.5)=>{let value=0,amp=1,freq=1,total=0;for(let i=0;i<octaves;i++){value+=MathLib.noise2(x*freq,y*freq)*amp;total+=amp;amp*=gain;freq*=lacunarity}return value/total},
    fbm3:(x,y,z,octaves=4,lacunarity=2,gain=.5)=>{let value=0,amp=1,freq=1,total=0;for(let i=0;i<octaves;i++){value+=MathLib.noise3(x*freq,y*freq,z*freq)*amp;total+=amp;amp*=gain;freq*=lacunarity}return value/total},
    bezier:(a,b,c,t)=>{let u=1-t;return[u*u*a[0]+2*u*t*b[0]+t*t*c[0],u*u*a[1]+2*u*t*b[1]+t*t*c[1],u*u*a[2]+2*u*t*b[2]+t*t*c[2]]},
    rayPlane:(origin,direction,planePoint,planeNormal)=>{let d=MathLib.dot(direction,planeNormal);if(Math.abs(d)<MathLib.EPS)return null;let t=MathLib.dot(MathLib.sub(planePoint,origin),planeNormal)/d;return t<0?null:MathLib.add(origin,MathLib.mul(direction,t))},
    pointInBox:(p,a,b)=>p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1])&&p[2]>=Math.min(a[2],b[2])&&p[2]<=Math.max(a[2],b[2])
}
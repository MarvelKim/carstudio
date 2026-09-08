import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {feverPathState,nextFeverStarY,SCORE_RULES} from './game-physics.js';

const html=readFileSync(new URL('./game.html',import.meta.url),'utf8');
function scene(y,vy=0){
  const state={Math,Number,car:{x:100,y,vy,vx:2800,rot:1.2,vr:3,h:60},H:800,
    ground:()=>700,MIN_BOUNCE_SPEED:100,feverPathState,nextFeverStarY,SCORE_RULES,
    seedRandom:()=>.5,obstacles:[{x:200,used:false},{x:10000,used:false}],
    scorePopup:()=>{},feverCount:0,feverEntrySpeed:0,feverEntrySpin:1,
    feverActive:false,feverEnding:false,feverRemaining:0,feverGauge:0,bounces:2,
    rolling:false,feverEntry:null,feverRouteOriginX:0,feverRouteOriginY:0,
    feverRouteLastX:0,feverRouteLastY:0};
  vm.createContext(state);
  for(const name of ['feverBlend','feverReveal','feverHeightBounds','assignFeverStar','prepareFeverRoute','feverPathAt','updateFeverFlight','startFever','updateFever'])
    vm.runInContext(html.split('\n').find(l=>l.includes(`function ${name}(`)),state);
  return state;
}

test('fever starts at the actual position and velocity, including offscreen flight',()=>{
  for(const y of [-1800,100,650]){
    const s=scene(y,-400),before={...s.car};s.startFever();
    assert.equal(s.car.y,before.y);assert.equal(s.car.rot,before.rot);
    assert.equal(s.car.vy,before.vy);assert.equal(s.feverReveal(),0);
    assert.equal(s.obstacles[0].feverY,undefined);
    s.updateFeverFlight(0);
    assert.equal(s.car.y,before.y);assert.equal(s.car.vy,before.vy);
  }
});

test('entry converges continuously at different frame rates and preserves the full fever timer',()=>{
  for(const fps of [30,60,120]){
    const s=scene(-1800,-400);s.startFever();
    const duration=s.feverEntry.duration;
    let elapsed=0,previous=s.car.y;
    while(elapsed<duration){
      const dt=Math.min(1/fps,duration-elapsed);
      s.updateFever(dt);s.car.x+=s.car.vx*dt;s.updateFeverFlight(dt);
      assert.ok(Math.abs(s.car.y-previous)<100);
      assert.ok(s.feverReveal()>=0&&s.feverReveal()<=1);
      previous=s.car.y;elapsed+=dt;
    }
    assert.ok(Math.abs(s.car.y-s.feverEntry.target)<1e-6);
    assert.ok(Math.abs(s.car.vy)<1e-6);assert.equal(s.car.rot,0);
    assert.equal(s.feverRemaining,SCORE_RULES.FEVER_DURATION_SECONDS);
    s.car.x+=s.car.vx/fps;s.updateFeverFlight(1/fps);
    assert.ok(Math.abs(s.car.y-previous)<1);
  }
});

test('item rendering starts with the original sprite and fades into the star',()=>{
  const s=scene(300);s.startFever();
  const draws=[];
  Object.assign(s,{W:12000,worldToScreen:x=>x,worldY:y=>y,
    itemSprite:(_o,star)=>star?'star':'item',ctx:{globalAlpha:1,save(){},restore(){},
      drawImage(sprite,...args){draws.push({sprite,alpha:this.globalAlpha,args})}}});
  vm.runInContext(html.split('\n').find(l=>l.includes('function drawObstacle(')),s);
  s.drawObstacle(s.obstacles[1]);
  assert.equal(draws.length,1);assert.equal(draws[0].sprite,'item');
  assert.equal(draws[0].alpha,1);
  s.feverEntry.elapsed=s.feverEntry.duration/2;draws.length=0;
  s.drawObstacle(s.obstacles[1]);
  assert.deepEqual(draws.map(d=>d.sprite),['item','star']);
  assert.ok(draws.every(d=>d.alpha===.5));
});

test('entry connects to collectible stars and exits fever on a star',()=>{
  const s=scene(300,-200);s.startFever();
  Object.assign(s,{SKY_ITEM_LIFT:720,MIN_AIR_SPIN:2,time:0,lastEffectAt:0,hitFlash:0,
    burst:()=>{},addHelpfulScore:()=>{s.collected++},collected:0});
  for(const name of ['collide','finishFeverOnStar'])
    vm.runInContext(html.split('\n').find(l=>l.includes(`function ${name}(`)),s);
  let frames=0;
  while(s.feverActive&&frames++<600){
    const previous=s.car.x;
    s.updateFever(1/60);s.car.x+=s.car.vx/60;s.updateFeverFlight(1/60);
    if(s.obstacles.at(-1).x<s.car.x+1000){
      const o={x:s.obstacles.at(-1).x+500,used:false,w:76,feverOrder:frames};
      s.obstacles.push(o);s.assignFeverStar(o);
    }
    for(const o of s.obstacles){if(!s.feverActive)break;s.collide(o,previous);}
  }
  assert.equal(s.feverActive,false);assert.ok(s.collected>0);
  assert.equal(s.car.vx,s.feverEntrySpeed);assert.ok(Number.isFinite(s.car.y));
});

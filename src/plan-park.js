/* Deterministic parking layout; classic script, metres throughout. */
window.PlanPark = (function () {
  function generate(ctx) {
    const G = window.Geom, C = G.C, R = G.R, codes = ctx.codes || window.CODES.parking;
    const plate = ctx.plate, cores = ctx.cores || [], ramps = ctx.ramps || [], need = ctx.need || {};
    const box = G.bboxOf(plate);
    let obstacles, reserved, placementFlags;
    const inside = r => plate.some(p => r.x >= p.x && r.y >= p.y && r.x+r.w <= p.x+p.w+1e-8 && r.y+r.d <= p.y+p.d+1e-8) || G.subtractAll([r], plate).reduce((s, p) => s + G.area(p), 0) < 1e-7;
    const free = (r, holes) => {
      if(!inside(r))return false;
      for(const h of holes)if(r.x<h.x+h.w-1e-9&&r.x+r.w>h.x+1e-9&&r.y<h.y+h.d-1e-9&&r.y+r.d>h.y+1e-9)return false;
      return true;
    };
    const exit = ramps.length ? (() => {
      const r = ramps[0].rect, d = ramps[0].dir;
      return [r.x + (d === 'E' ? r.w : d === 'W' ? 0 : r.w / 2),
        r.y + (d === 'N' ? r.d : d === 'S' ? 0 : r.d / 2)];
    })() : G.centre(box);
    // Keep the entire core buffer unavailable to service rooms before layout selection.
    const buffers = cores.map(c => G.inset(c, -1.5));
    let protectedAisles = [], serviceBands = [], stallBands = [];
    const lane = ctx.laneSide || 'N';
    function spacesIn(bands, holes) {
      if(largeBike) {
        const spaces=G.subtractAll(bands,holes);
        for(let i=0;i<spaces.length;i++)for(let j=i+1;j<spaces.length;j++) {
          const a=spaces[i],b=spaces[j],eq=(x,y)=>Math.abs(x-y)<1e-7;
          if(eq(a.x,b.x)&&eq(a.w,b.w)&&(eq(a.y+a.d,b.y)||eq(b.y+b.d,a.y)) ||
            eq(a.y,b.y)&&eq(a.d,b.d)&&(eq(a.x+a.w,b.x)||eq(b.x+b.w,a.x))) {
            spaces[i]=G.bboxOf([a,b]);spaces.splice(j--,1);
          }
        }
        return spaces;
      }
      let spaces=[];
      for(const b of bands)spaces.push(...G.subtractAll([b],spaces));
      for(const h of holes) {
        if(!spaces.some(r=>G.overlaps(r,h)))continue;
        spaces=G.subtractAll(spaces,[h]);
        for(let i=0;i<spaces.length;i++)for(let j=i+1;j<spaces.length;j++) {
          const a=spaces[i],b=spaces[j],eq=(x,y)=>Math.abs(x-y)<1e-7;
          if(eq(a.x,b.x)&&eq(a.w,b.w)&&(eq(a.y+a.d,b.y)||eq(b.y+b.d,a.y)) ||
            eq(a.y,b.y)&&eq(a.d,b.d)&&(eq(a.x+a.w,b.x)||eq(b.x+b.w,a.x))) {
            spaces[i]=G.bboxOf([a,b]);spaces.splice(j,1);i=-1;break;
          }
        }
      }
      return spaces;
    }
    function reserve(kind, name, w, d, quiet = false) {
      let chosen = null, chosenLink = null, score = Infinity;
      const roomHoles=obstacles.concat(buffers, protectedAisles);
      const linkHoles=obstacles.concat(buffers);
      const scoreFor = r => {
        const c = G.centre(r);
        let s = (c[0]-exit[0])**2 + (c[1]-exit[1])**2;
        if (kind === 'bike' && cores.length) s = Math.min(...cores.map(k => {
          const q = G.centre(k); return (c[0]-q[0])**2+(c[1]-q[1])**2;
        }));
        if(kind==='bike')s+=stallBands.reduce((a,b)=>a+G.area(G.inter(r,b)||R(0,0,0,0)),0)*1000;
        if (kind === 'loading') {
          const gap = lane === 'N' ? box.y+box.d-r.y-r.d : lane === 'S' ? r.y-box.y :
            lane === 'E' ? box.x+box.w-r.x-r.w : r.x-box.x;
          s += gap*10000 + (lane==='N'||lane==='S' ? r.w : r.d)*1000;
        }
        return s;
      };
      const consider = (r,s) => {
        const width = kind === 'loading' ? 3 : 1;
        let access = null;
        for (const a of protectedAisles) {
          const x=Math.max(r.x,a.x), X=Math.min(r.x+r.w,a.x+a.w);
          const y=Math.max(r.y,a.y), Y=Math.min(r.y+r.d,a.y+a.d);
          const links=[];
          if (X-x >= width-1e-8) {
            if(a.y>=r.y+r.d-1e-8) links.push(R(x,r.y+r.d,width,Math.max(0,a.y-r.y-r.d)));
            if(r.y>=a.y+a.d-1e-8) links.push(R(x,a.y+a.d,width,Math.max(0,r.y-a.y-a.d)));
          }
          if (Y-y >= width-1e-8) {
            if(a.x>=r.x+r.w-1e-8) links.push(R(r.x+r.w,y,Math.max(0,a.x-r.x-r.w),width));
            if(r.x>=a.x+a.w-1e-8) links.push(R(a.x+a.w,y,Math.max(0,r.x-a.x-a.w),width));
          }
          const link=links.find(l=>l.w<1e-8 || l.d<1e-8 || free(l,linkHoles));
          if(link && Math.max(link.w,link.d)<=10+1e-8 && (!access || G.area(link)<G.area(access))) access=link;
          if(access && G.area(access)<1e-8)break;
        }
        if (!access) return;
        if (s < score) { chosen = r; chosenLink = access; score = s; }
      };
      const spaces = serviceBands;
      const options=[];
      for (const p of spaces) for (const [a,b] of [[w,d],[d,w]]) {
        if (a > p.w + 1e-8 || b > p.d + 1e-8) continue;
        const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
        const xs = [p.x,p.x+p.w-a,clamp(exit[0]-a/2,p.x,p.x+p.w-a)];
        const ys = [p.y,p.y+p.d-b,clamp(exit[1]-b/2,p.y,p.y+p.d-b)];
        if(a>=b)for(const h of roomHoles)xs.push(clamp(h.x+h.w,p.x,p.x+p.w-a),clamp(h.x-a,p.x,p.x+p.w-a));
        else for(const h of roomHoles)ys.push(clamp(h.y+h.d,p.y,p.y+p.d-b),clamp(h.y-b,p.y,p.y+p.d-b));
        for (const x of new Set(xs)) for (const y of new Set(ys)) {
          const r=R(x,y,a,b);
          if(free(r,roomHoles))options.push({r,s:scoreFor(r)});
        }
      }
      options.sort((a,b)=>a.s-b.s);
      for(const o of options){consider(o.r,o.s);if(chosen)break;}
      if (chosen) { reserved.push({kind,name,rect:chosen}); obstacles.push(chosen);
        if (chosenLink.w>1e-8 && chosenLink.d>1e-8) protectedAisles.push(chosenLink); }
      else if(!quiet) placementFlags.push('Unable to place '+name);
      return chosen ? G.area(chosen) : 0;
    }
    const levels = Math.max(1, need.parkingLevels || 1), totalBike = (need.bikeA || 0)*1.8;
    const bikeArea = Math.max(12,Math.min(400,totalBike/levels));
    const largeBike=(ctx.level.isTop?totalBike-bikeArea*(levels-1):bikeArea)>400;
    function bike(name, area) {
      // Storage consumes perimeter stall bands, keeping the rest of each row intact.
      let remaining = area, placed = 0, part = 0;
      const nearCore = r => cores.length ? Math.min(...cores.map(c => {
        const p=G.centre(r), q=G.centre(c); return Math.hypot(p[0]-q[0],p[1]-q[1]);
      })) : 0;
      if(!largeBike) {
        const spaces=spacesIn(serviceBands,obstacles.concat(buffers,protectedAisles)).filter(r=>r.w>=2&&r.d>=2);
        spaces.sort((a,b)=>nearCore(a)-nearCore(b)||G.area(b)-G.area(a)||a.y-b.y||a.x-b.x);
        for(const space of spaces) {
          if(remaining<1e-7)break;
          const depth=Math.min(5.5,space.w,space.d), length=Math.max(space.w,space.d);
          let amount=Math.min(remaining,depth*length);
          if(remaining>amount&&remaining-amount<9)amount=remaining-9;
          if(amount<4||amount/depth<2)continue;
          const got=reserve('bike',part?name+' '+(part+1):name,amount/depth,depth,true);
          if(got){part++;placed+=got;remaining-=got;}
        }
      }
      while(remaining>1e-7) {
        const spaces=spacesIn(serviceBands,obstacles.concat(buffers,protectedAisles)).filter(r=>r.w>=2&&r.d>=2);
        // An area bound rules out an incomplete service program before trying
        // many small fragments. Such candidates cannot win a feasible layout.
        if(spaces.reduce((s,r)=>s+G.area(r),0)+1e-7<remaining)break;
        spaces.sort((a,b)=>G.area(b)-G.area(a)||nearCore(a)-nearCore(b)||a.y-b.y||a.x-b.x);
        let got=0;
        for(const space of spaces) {
          const depth=Math.min(largeBike?11:5.5,space.w,space.d), length=Math.max(space.w,space.d);
          let amount=Math.min(remaining,depth*length);
          if(remaining>amount && remaining-amount<12)amount=remaining-12;
          if(amount<4||amount/depth<2)continue;
          got=reserve('bike',part ? name+' '+(part+1) : name,amount/depth,depth,true);
          if(got)break;
        }
        if(!got)break;
        part++;placed+=got;remaining-=got;
      }
      if (remaining > 1e-7) placementFlags.push('Unable to place '+name+' ('+remaining.toFixed(1)+' m2)');
      return placed;
    }
    function candidate(alongX, offset) {

      const candidateAlongX=alongX;
      const mouth=s => (s.row.cross ? !alongX : alongX) ?
        (s.row.side===1?'N':'S') : (s.row.side===1?'E':'W');
      obstacles = cores.concat(ramps.map(r => r.rect));
      reserved = []; placementFlags = []; protectedAisles = []; serviceBands = [];
      const grid = ctx.grid, // candidates only read grid coordinates; rasterize the winner
         aisles = [], rows = [], stalls = [], service = [];
      const rect = (u, v, w, d) => alongX ? R(u, v, w, d) : R(v, u, d, w);
      const u0 = alongX ? box.x : box.y, v0 = alongX ? box.y : box.x;
      const length = alongX ? box.w : box.d, depth = alongX ? box.d : box.w;
      const endHigh = (alongX ? exit[0] : exit[1]) >= u0 + length / 2;
      function aisle(r, walkway = false) {
        // Disjoint plate pieces prevent double counting at footprint overlaps.
        let pieces = [], remaining = [r];
        for (const p of plate) {
          for (const s of remaining) { const i = G.inter(s, p); if (i) pieces.push(i); }
          remaining = G.subtractAll(remaining, [p]);
        }
        pieces = G.subtractAll(pieces, walkway ? obstacles.concat(aisles) : obstacles);
        for (const p of pieces) {
          // Short pedestrian links are represented by Walkway rooms, never drive aisles.
          if (!walkway && Math.min(p.w,p.d) < 2) continue;
          aisles.push(p);
        }
      }
      let v = v0 + offset;
      while (v + 17.7 <= v0 + depth + 1e-8) {
        rows.push({v, d: 5.5, side: 1}, {v: v + 12.2, d: 5.5, side: -1});
        aisle(rect(u0+5.5, v + 5.5, length-11, 6.7)); v += 17.7;
      }
      if (v0 + depth - v >= 12.2 - 1e-8) {
        aisle(rect(u0+5.5, v, length-11, 6.7)); rows.push({v: v + 6.7, d: 5.5, side: -1});
      } else if (v0 + depth - v >= 11.3 - 1e-8) {
        aisle(rect(u0+5.5, v, length-11, 6.7)); rows.push({v: v + 6.7, d: 4.6, side: -1, small: true});
      }
      const spineLow=u0+5.5, spineHigh=u0+length-12.2;
      const firstV=rows.length ? rows[0].v+5.5 : v0;
      const lastV=rows.length ? rows[rows.length-1].v : v0+depth;
      aisle(rect(endHigh ? spineHigh : spineLow, firstV, 6.7, Math.max(6.7,lastV-firstV)));
      if (Math.max(length, depth) > 40) aisle(rect(endHigh ? spineLow : spineHigh, firstV, 6.7, Math.max(6.7,lastV-firstV)));
      // Join each ramp end to the connecting spine, including a short landing.
      for (const ramp of ramps) {
        const r = ramp.rect;
        if (alongX) aisle(R(Math.min(r.x, endHigh ? spineHigh : spineLow),
          ramp.dir === 'S' ? r.y - 6.7 : r.y + r.d, Math.max(6.7, r.w + Math.abs(r.x - (endHigh ? spineHigh : spineLow))), 6.7));
        else aisle(R(ramp.dir === 'W' ? r.x - 6.7 : r.x + r.w, Math.min(r.y, endHigh ? spineHigh : spineLow),
          6.7, Math.max(6.7, r.d + Math.abs(r.y - (endHigh ? spineHigh : spineLow)))));
      }
      const drive = aisles.slice(), walkways = [];
      for (let n=0;n<cores.length;n++) {
        const c=cores[n], outer=buffers[n], start=aisles.length;
        for (const part of G.subtract(outer,c)) aisle(part, true);
        const pieces=aisles.slice(start);
        // Extend the ring by its shortest clear 1.5 m spur to a drive aisle.
        const links=[];
        for (const r of pieces) for (const a of drive) {
          const x=Math.max(r.x,a.x), X=Math.min(r.x+r.w,a.x+a.w);
          const y=Math.max(r.y,a.y), Y=Math.min(r.y+r.d,a.y+a.d);
          if (X-x>=1.5) {
            if(a.y>=r.y+r.d) links.push(R(x,r.y+r.d,1.5,a.y-r.y-r.d));
            if(r.y>=a.y+a.d) links.push(R(x,a.y+a.d,1.5,r.y-a.y-a.d));
          }
          if (Y-y>=1.5) {
            if(a.x>=r.x+r.w) links.push(R(r.x+r.w,y,a.x-r.x-r.w,1.5));
            if(r.x>=a.x+a.w) links.push(R(a.x+a.w,y,r.x-a.x-a.w,1.5));
          }
        }
        links.sort((a,b)=>G.area(a)-G.area(b));
        const link=links.find(r=>free(r,obstacles));
        if(link) aisle(link, true);
        else {
          const bends=[];
          const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
          for(const r of pieces) for(const a of drive) {
            if(r.w<1.5 || r.d<1.5)continue;
            const x=clamp(a.x,r.x,r.x+r.w-1.5), y=clamp(a.y,r.y,r.y+r.d-1.5);
            const ax=clamp(x,a.x,a.x+a.w-1.5), ay=clamp(y,a.y,a.y+a.d-1.5);
            const h=R(Math.min(x,ax),y,Math.abs(x-ax)+1.5,1.5);
            const v=R(ax,Math.min(y,ay),1.5,Math.abs(y-ay)+1.5);
            bends.push([h,v], [R(x,Math.min(y,ay),1.5,Math.abs(y-ay)+1.5),
              R(Math.min(x,ax),ay,Math.abs(x-ax)+1.5,1.5)]);
          }
          bends.sort((a,b)=>a.reduce((s,r)=>s+G.area(r),0)-b.reduce((s,r)=>s+G.area(r),0));
          const bend=bends.find(p=>p.every(r=>free(r,obstacles)));
          if(bend)for(const r of bend)aisle(r,true);
        }
        walkways.push({rect:outer, pieces:aisles.slice(start)});
      }
      protectedAisles = aisles.slice();
      stallBands=rows.map(row=>rect(u0,row.v,length,row.d));
      // Perimeter stretches parallel to the stall rows. A perpendicular edge
      // can accommodate deeper loading rooms in two stall widths (11 m).
      for (const p of plate) {
        const pu=alongX?p.x:p.y, pv=alongX?p.y:p.x;
        const pl=alongX?p.w:p.d, pd=alongX?p.d:p.w;
        serviceBands.push(rect(pu,pv,pl,Math.min(11,pd)),
          rect(pu,pv+Math.max(0,pd-11),pl,Math.min(11,pd)));
        serviceBands.push(rect(pu,pv,Math.min(5.5,pl),pd),
          rect(pu+Math.max(0,pl-5.5),pv,Math.min(5.5,pl),pd));
      }
      if (ctx.level.isTop) {
        for (let i=0;i<(need.loadingA || 0);i++) reserve('loading','Loading A '+(i+1),3,6);
        for (let i=0;i<(need.loadingB || 0);i++) reserve('loading','Loading B '+(i+1),3,8.5);
      }
      reserve('electrical', 'Electrical room', 3, 4);
      const placedBike = bike('Class A bicycle room',bikeArea);
      if (ctx.level.isTop) {
        const remainder = totalBike - bikeArea*(levels-1) - placedBike;
        if (remainder > 1e-7) bike('Class A bicycle room 2',Math.max(12,remainder));
      }
      for(const link of protectedAisles) if(!aisles.includes(link)) aisle(link,true);

      service.push(...reserved.map(r => ({...r, doors:[]})));
      // A short perimeter connector ties the loading pockets to each other and
      // to the core ring instead of making each bay a separate long spur.
      if(service.some(r=>r.kind==='loading')) {
        const start=aisles.length;
        const connector=lane==='N' ? R(box.x,box.y+box.d-6.5,Math.max(2,box.w-3),2.75) :
          lane==='S' ? R(box.x,box.y+4,box.w,2) :
          lane==='E' ? R(box.x+box.w-6,box.y,2,box.d) : R(box.x+4,box.y,2,box.d);
        aisle(connector,true);
        for(const c of buffers) {
          const x=c.x+c.w/2-1,y=c.y+c.d/2-1;
          const link=lane==='N'?R(x,c.y+c.d,2,connector.y-c.y-c.d):
            lane==='S'?R(x,connector.y+connector.d,2,c.y-connector.y-connector.d):
            lane==='E'?R(c.x+c.w,y,connector.x-c.x-c.w,2):
            R(connector.x+connector.w,y,c.x-connector.x-connector.w,2);
          if(link.w>0&&link.d>0&&Math.max(link.w,link.d)<=20&&free(link,obstacles))aisle(link,true);
        }
        drive.push(...aisles.slice(start).filter(r=>Math.min(r.w,r.d)>=2));
      }
      // Choose a side with an unobstructed straight connection to an aisle.
      for (const room of service) {
        const r = room.rect, options = [];
        for (const a of aisles.slice()) {
          const x = Math.max(r.x, a.x), X = Math.min(r.x + r.w, a.x + a.w);
          const y = Math.max(r.y, a.y), Y = Math.min(r.y + r.d, a.y + a.d);
          const w = room.kind === 'loading' ? 3 : 0.9;
          if (X - x >= w) {
            if (a.y >= r.y + r.d - 1e-8) options.push({side:'N', at:(x+X)/2, w, link:R((x+X-w)/2,r.y+r.d,w,Math.max(0,a.y-r.y-r.d))});
            if (a.y + a.d <= r.y + 1e-8) options.push({side:'S', at:(x+X)/2, w, link:R((x+X-w)/2,a.y+a.d,w,Math.max(0,r.y-a.y-a.d))});
          }
          if (Y - y >= w) {
            if (a.x >= r.x + r.w - 1e-8) options.push({side:'E', at:(y+Y)/2, w, link:R(r.x+r.w,(y+Y-w)/2,Math.max(0,a.x-r.x-r.w),w)});
            if (a.x+a.w <= r.x + 1e-8) options.push({side:'W', at:(y+Y)/2, w, link:R(a.x+a.w,(y+Y-w)/2,Math.max(0,r.x-a.x-a.w),w)});
          }
        }
        options.sort((a,b) => G.area(a.link)-G.area(b.link));
        let door = options.find(o => (o.link.w < 1e-8 || o.link.d < 1e-8) || free(o.link, obstacles));
        if (!door) {
          const w=room.kind==='loading'?3:1;
          // A bent connector handles rooms whose projection misses every aisle.
          for(const a of aisles.slice()) {
            const ax=G.snapQ(a.x+a.w/2-w/2), ay=G.snapQ(a.y+a.d/2-w/2);
            const rx=G.snapQ(r.x+r.w/2-w/2), ry=G.snapQ(r.y+r.d/2-w/2);
            const paths=[
              {side:'N',at:rx+w/2,parts:[R(rx,r.y+r.d,w,Math.max(0,ay+w-r.y-r.d)),R(Math.min(rx,ax),ay,Math.abs(rx-ax)+w,w)]},
              {side:'S',at:rx+w/2,parts:[R(rx,ay,w,Math.max(0,r.y-ay)),R(Math.min(rx,ax),ay,Math.abs(rx-ax)+w,w)]},
              {side:'E',at:ry+w/2,parts:[R(r.x+r.w,ry,Math.max(0,ax+w-r.x-r.w),w),R(ax,Math.min(ry,ay),w,Math.abs(ry-ay)+w)]},
              {side:'W',at:ry+w/2,parts:[R(ax,ry,Math.max(0,r.x-ax),w),R(ax,Math.min(ry,ay),w,Math.abs(ry-ay)+w)]}
            ];
            const path=paths.find(p=>p.parts.every(l=>l.w>0 && l.d>0 && free(l,obstacles)));
            if(path) { path.parts.forEach(r => aisle(r, true));door={side:path.side,at:path.at,w,link:R(0,0,0,0)};break; }
          }
        }
        if (door) { aisle(door.link, true); room.doors = [{side:door.side,at:door.at,w:door.w}]; }
      }
      const holes = obstacles.concat(aisles), rowHoles=holes;

      rows.push({v:u0,d:5.5,side:1,cross:true},
        {v:u0+length-5.5,d:5.5,side:-1,cross:true});
      for (const row of rows) {
        const alongX = row.cross ? !candidateAlongX : candidateAlongX;
        const rect = (u,v,w,d) => alongX ? R(u,v,w,d) : R(v,u,d,w);
        const u0 = alongX ? box.x : box.y, length = alongX ? box.w : box.d;
        const holes = row.cross ? obstacles.concat(aisles,stalls.map(s=>s.rect)) : rowHoles;
        const cuts = [u0,u0+length];
        for (const h of holes) if(G.overlaps(rect(u0,row.v,length,row.d),h)) {
          cuts.push(Math.max(u0,alongX?h.x:h.y),Math.min(u0+length,alongX?h.x+h.w:h.y+h.d));
        }
        cuts.sort((a,b)=>a-b);
        for(let c=0;c<cuts.length-1;c++) {
        const end=cuts[c+1]; let u=cuts[c];
        if(!free(rect(u,row.v,end-u,row.d),holes))continue;
        while (u + (row.small ? 2.3 : 2.5) <= end + 1e-8) {
          const wall = u === u0 || u + 5 >= u0 + length;
          const w = row.small ? 2.3 : wall ? 2.7 : 2.5;
          const r = rect(u, row.v, w, row.d);
          if (u+w<=end+1e-8) stalls.push({rect:r, unitType:row.small?'small':'std', row, u, width:w});
          u += w;
        }
        }
      }
      // Quantized rectangle adjacency is the same four-neighbour graph as the
      // raster, without visiting every drive cell for each of six candidates.

      const reached=new Uint8Array(grid.cells.length);
      const network=aisles.concat(ramps.map(r=>r.rect)), bounds=network.map(r=>grid.rectCells(r));
      const connected=new Uint8Array(network.length), queue=[];
      let head=0,tail=0;
      const seed=n=>{if(!connected[n]){connected[n]=1;queue[tail++]=n;}};
      const seedPoint=(x,y)=>{const [i,j]=grid.toCell(x,y);bounds.forEach(([a,b,A,B],n)=>{if(i>=a&&i<A&&j>=b&&j<B)seed(n);});};
      if(ramps.length)for(let n=aisles.length;n<network.length;n++)seed(n);
      else if(cores.length) for(const c of cores) for(const [x,y] of [
        [c.x+c.w/2,c.y+c.d+G.CELL/2],[c.x+c.w/2,c.y-G.CELL/2],
        [c.x+c.w+G.CELL/2,c.y+c.d/2],[c.x-G.CELL/2,c.y+c.d/2]]) {
        seedPoint(x,y);
      } else if(aisles.length)seed(0);
      while(head<tail) {
        const [x,y,X,Y]=bounds[queue[head++]];
        if(X<=x||Y<=y)continue;
        for(let n=0;n<bounds.length;n++)if(!connected[n]) {
          const [a,b,A,B]=bounds[n];
          if(A>a&&B>b&&((Math.min(X,A)>Math.max(x,a)&&Math.min(Y,B)>=Math.max(y,b))||
            (Math.min(Y,B)>Math.max(y,b)&&Math.min(X,A)>=Math.max(x,a))))seed(n);
        }
      }
      for(let n=0;n<bounds.length;n++)if(connected[n] && n<aisles.length) {
        const [x,y,X,Y]=bounds[n];
        for(let j=y;j<Y;j++)reached.fill(1,grid.idx(x,j),grid.idx(X,j));
      }
      // Do not emit isolated drive fragments on clipped or obstructed footprints.
      for (let n=aisles.length-1;n>=0;n--) {
        const [x,y,X,Y]=grid.rectCells(aisles[n]);
        if (X>x && Y>y && !reached[grid.idx(x,y)]) aisles.splice(n,1);
      }

      for(let i=stalls.length-1;i>=0;i--) {
        const s=stalls[i],side=mouth(s);
        if(!edge(s.rect,side).some(k=>reached[k]))stalls.splice(i,1);
      }
      // Re-cut nearest-core stretches to the accessible width; adjacent stalls consumed.

      const distance = s => cores.length ? Math.min(...cores.map(c => {
        const p = G.centre(s.rect), q = G.centre(c); return (p[0]-q[0])**2+(p[1]-q[1])**2;
      })) : 0;
      let acc = 0;
      for(const s of stalls)s.distance=distance(s);
      for (const s of stalls.slice().sort((a,b)=>a.distance-b.distance)) {
        if (acc >= Math.ceil(Math.max(stalls.length * (need.accessibleFraction == null ? 0.05 : need.accessibleFraction), 1))) break;
        if (!stalls.includes(s) || s.unitType !== 'std') continue;
        const r = s.row.cross ? rect(s.row.v,s.u,5.5,4) : rect(s.u, s.row.v, 4, 5.5);
        if (!free(r, holes) || stalls.some(t => t.unitType === 'acc' && G.overlaps(r,t.rect))) continue;
        for (let i=stalls.length-1;i>=0;i--) if (stalls[i]!==s && G.overlaps(r,stalls[i].rect)) stalls.splice(i,1);
        s.rect=r; s.unitType='acc'; acc++;
      }
      // Repack the clear intervals beside accessible stalls so widening one
      // does not strand a metre from every consumed neighbour.
      const accessible=stalls.filter(s=>s.unitType==='acc');
      let smallBudget=Math.floor(stalls.length*0.25);
      stalls.length=0;stalls.push(...accessible);
      for(const row of rows) {
        const axis=row.cross ? !alongX : alongX;
        const rr=(u,v,w,d)=>axis?R(u,v,w,d):R(v,u,d,w);
        const low=axis?box.x:box.y, len=axis?box.w:box.d;
        const blocked=holes.concat(stalls.map(s=>s.rect));
        const band=rr(low,row.v,len,row.d), cuts=[low,low+len];
        for(const h of blocked)if(G.overlaps(band,h))cuts.push(Math.max(low,axis?h.x:h.y),Math.min(low+len,axis?h.x+h.w:h.y+h.d));
        cuts.sort((a,b)=>a-b);
        for(let i=0;i<cuts.length-1;i++) {
          const end=cuts[i+1];let u=cuts[i];
          if(!free(rr(u,row.v,end-u,row.d),blocked))continue;
          const n=Math.floor((end-u+1e-8)/2.5)+1;
          const narrow=Math.max(0,Math.ceil((n*2.5-(end-u)-1e-8)/0.2));
          let smallHere=narrow<=smallBudget && narrow<=n ? narrow : 0;
          while(u+2.5<=end+1e-8) {
            const useSmall=smallHere>0;
            const width=useSmall?2.3:u===low||u+5>=low+len?2.7:2.5;
            const depth=useSmall?4.6:row.d, v=useSmall&&row.side===1?row.v+row.d-depth:row.v;
            const r=rr(u,v,width,depth);
            const s={rect:r,unitType:useSmall||row.small?'small':'std',row,u,width};
            if(u+width<=end+1e-8&&edge(r,mouth(s)).some(k=>reached[k]))stalls.push(s);
            if(useSmall){smallHere--;smallBudget--;}
            u+=width;
          }
          if(u+2.3<=end+1e-8) {
            const shallow=row.side===1?row.v+row.d-4.6:row.v;
            const r=rr(u,shallow,2.3,4.6), s={rect:r,unitType:'small',row,u,width:2.3};
            if(edge(r,mouth(s)).some(k=>reached[k]))stalls.push(s);
          }
        }
      }
      const requiredAcc=Math.ceil(Math.max(stalls.length*(need.accessibleFraction==null?0.05:need.accessibleFraction),1));
      if(acc<requiredAcc)for(const s of stalls.filter(s=>s.unitType==='std').sort((a,b)=>distance(a)-distance(b))) {
        if(acc>=requiredAcc)break;
        if(!stalls.includes(s))continue;
        const r=s.row.cross?rect(s.row.v,s.u,5.5,4):rect(s.u,s.row.v,4,5.5);
        if(!free(r,holes)||stalls.some(t=>t.unitType==='acc'&&G.overlaps(r,t.rect)))continue;
        for(let i=stalls.length-1;i>=0;i--)if(stalls[i]!==s&&G.overlaps(r,stalls[i].rect))stalls.splice(i,1);
        s.rect=r;s.unitType='acc';acc++;
      }
      let small = stalls.filter(s=>s.unitType==='small').length;
      for (let i=stalls.length-1;i>=0 && small > stalls.length*0.25;i--) if(stalls[i].unitType==='small') {stalls.splice(i,1);small--;}



      const rooms=[], paint=[];
      function add(kind,name,r,doors=[],unitType) {
        const room={id:'park-'+rooms.length,kind,use:'parking',name,rect:r,parent:null,doors,area:G.area(r),occ:kind==='aisle'?G.area(r)/46:0};
        if(unitType) room.unitType=unitType;
        const index=rooms.length; rooms.push(room);
        paint.push([r,kind==='stall'?C.STALL:kind==='aisle'?C.AISLE:kind==='ramp'?C.RAMP:C.ROOM,index]);
      }
      ramps.forEach((r,i)=>add('ramp','Ramp '+(i+1),r.rect));
      service.forEach(r=>add(r.kind,r.name,r.rect,r.doors));
      aisles.forEach((r,i)=>{ if(drive.includes(r)) add('aisle','Aisle '+(i+1),r); });
      for (const w of walkways) {
        const index=rooms.length;
        const area=w.pieces.reduce((s,r)=>s+G.area(r),0);
        rooms.push({id:'park-'+index,kind:'aisle',use:'parking',name:'Walkway',rect:w.rect,parent:null,doors:[],area,occ:area/46});
        for(const p of w.pieces) if(aisles.includes(p)) paint.push([p,C.AISLE,index]);
      }
      stalls.forEach((r,i)=>add('stall','Stall '+(i+1),r.rect,[],r.unitType));
      function edge(r,side) {
        const [x,y,X,Y]=grid.rectCells(r), result=[];
        if(side==='N'||side==='S') for(let i=x;i<X;i++) {const j=side==='N'?Y:y-1;if(grid.inb(i,j))result.push(grid.idx(i,j));}
        else for(let j=y;j<Y;j++){const i=side==='E'?X:x-1;if(grid.inb(i,j))result.push(grid.idx(i,j));}
        return result;
      }
      const unreachable=stalls.filter(s=>!edge(s.rect,mouth(s)).some(k=>reached[k])).length;
      const touch=ramps.every(r=>['N','S','E','W'].some(side=>edge(r.rect,side).some(k=>reached[k])));

      const actual=ramps.length?(ramps[0].len == null ? Math.max(ramps[0].rect.w,ramps[0].rect.d):ramps[0].len):0;
      const slope=actual?ctx.level.h/Math.max(0,actual-2*codes.ramp.transitionLen):null;
      const headroom=ctx.level.h-0.45, flags=placementFlags.slice();
      if(slope!==null && slope>0.125)flags.push('Ramp slope exceeds 12.5%');
      if(headroom<2)flags.push('Headroom below 2.0 m');
      if(acc && headroom<2.3)flags.push('Accessible headroom below 2.3 m');
      if(unreachable)flags.push(unreachable+' unreachable stalls');
      if(!ramps.length && ctx.level.z<0)flags.push('No ramp on below-grade level');
      if(!touch)flags.push('Ramp not touching an aisle');
      if(small>stalls.length*0.25)flags.push('Small-car share exceeds 25%');
      if(service.some(r=>!r.doors.length))flags.push('Room has no aisle-facing door');
      return {rooms,grid,paint,aisles,alongX,metrics:{stalls:stalls.length,standard:stalls.length-small-acc,small,accessible:acc,van:0,
        aisleArea:0,rampSlope:slope,rampLenNeeded:ctx.level.h/0.125+8,
        rampLenActual:actual,headroom,unreachableStalls:unreachable,bikeArea:reserved.filter(r=>r.kind==='bike').reduce((s,r)=>s+G.area(r.rect),0),flags}};
    }
    function paintCandidate(c) {
      if(c.painted)return;
      c.grid=new G.Grid(R(ctx.grid.ox,ctx.grid.oy,ctx.grid.W*G.CELL,ctx.grid.H*G.CELL));
      for(const r of c.aisles)c.grid.fill(r,C.AISLE);
      for(const r of cores)c.grid.fill(r,C.CORE);
      for(const [r,code,index] of c.paint)c.grid.fill(r,code,index);
      c.painted=true;
    }
    function rampDistance(c) {
      if(c.rampDistance!==undefined)return c.rampDistance;
      if(!ramps.length)return c.rampDistance=0;
      paintCandidate(c);
      const g=c.grid, sources=[];
      for(let k=0;k<g.cells.length;k++)if(g.cells[k]===C.RAMP) {
        const i=k%g.W;
        if(i>0&&g.cells[k-1]===C.AISLE||i+1<g.W&&g.cells[k+1]===C.AISLE||
          k>=g.W&&g.cells[k-g.W]===C.AISLE||k+g.W<g.cells.length&&g.cells[k+g.W]===C.AISLE)sources.push(k);
      }
      const distances=G.dijkstra(g,sources,k=>g.cells[k]===C.AISLE||g.cells[k]===C.RAMP);
      let max=0;
      for(let k=0;k<g.cells.length;k++)if(g.cells[k]===C.AISLE)max=Math.max(max,distances[k]);
      return c.rampDistance=max;
    }
    let best;
    for(const alongX of [true,false])for(const offset of [0,2.5,5.5]) {
      const c=candidate(alongX,offset);
      const valid=c.metrics.flags.every(f=>!f.startsWith('Unable to place')&&f!=='Room has no aisle-facing door');
      c.valid=valid;
      if(!best||valid&&!best.valid||valid===best.valid&&(c.metrics.stalls>best.metrics.stalls||c.metrics.stalls===best.metrics.stalls &&
        rampDistance(c)<rampDistance(best)))best=c;
    }
    paintCandidate(best);
    let aisleCells=0;
    for(let k=0;k<best.grid.cells.length;k++)if(best.grid.cells[k]===C.AISLE)aisleCells++;
    best.metrics.aisleArea=aisleCells*G.CELL*G.CELL;
    ctx.grid.cells.set(best.grid.cells);ctx.grid.region.set(best.grid.region);
    return {rooms:best.rooms,metrics:best.metrics};
  }
  return {generate};
})();


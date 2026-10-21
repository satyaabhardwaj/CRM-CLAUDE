/* Shared, deterministic selectors. This is also exercised by isolated Node tests. */
(function(root) {
  const STAGES = ['First Measurement','EPT Marking','EPT Verification','PDI'];
  const defaults = () => ({stages:[...STAGES],search:'',status:'All statuses',city:'',region:'',owner:'',product:'',zone:'',zones:[],withProblems:false,problemReason:'',dateRange:'All time',sort:'recent'});
  function inDateRange(value, range, now = new Date()) {
    if (range === 'All time') return true;
    if (!value) return false;
    const date = new Date(value);
    if (!Number.isFinite(+date)) return false;
    const start = new Date(now.getFullYear(),now.getMonth(),now.getDate());
    if (range === 'Last 7 days') start.setDate(start.getDate()-6);
    if (range === 'Last 30 days') start.setDate(start.getDate()-29);
    if (range === 'This month') start.setDate(1);
    const end = new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
    return date >= start && date < end;
  }
  function filter(records, filters, {ignoreStatus=false,now=new Date()}={}) {
    const q = filters.search.trim().toLocaleLowerCase(), seen = new Set();
    return records.filter(r => filters.stages.includes(r.stage)
      && (!q || [r.client,r.order,r.id,r.record_id,r.city,r.assignee,r.owner].some(v=>String(v||'').toLocaleLowerCase().includes(q)))
      && [['city','city'],['region','state'],['owner','owner'],['product','product'],['zone','zone']].every(([f,k])=>!filters[f]||r[k]===filters[f])
      && (!filters.zones?.length || filters.zones.includes(r.zone||'Zone not set'))
      && inDateRange(r.modified_at,filters.dateRange,now)
      && (ignoreStatus || filters.status==='All statuses' || (filters.status==='Open'?r.status!=='Completed':r.status===filters.status))).filter(r=>{if(r.id&&seen.has(r.id))return false;if(r.id)seen.add(r.id);return true;});
  }
  function sort(records, order) {
    return [...records].sort((a,b)=> {
      if (order==='client') return a.client.localeCompare(b.client)||a.id.localeCompare(b.id);
      if (order==='received') return String(b.received_at||'').localeCompare(String(a.received_at||''))||a.id.localeCompare(b.id);
      if (order==='visit') return (a.date||'9999').localeCompare(b.date||'9999')||a.id.localeCompare(b.id);
      return String(b.modified_at||'').localeCompare(String(a.modified_at||''))||a.id.localeCompare(b.id);
    });
  }
  function counts(records) {
    return {Open:records.filter(r=>r.status!=='Completed').length,Scheduled:records.filter(r=>r.status==='Scheduled').length,'To Schedule':records.filter(r=>r.status==='To Schedule').length};
  }
  function group(records,key) {
    const groups = new Map();
    records.forEach(r=>{const name=r[key]||'Not provided';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(r);});
    return [...groups].map(([name,items])=>({name,items,total:items.length,...counts(items)})).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
  }
  const mapped = records=>records.map(r=>({...r,coordinates:validCoordinates(r.coordinates)?r.coordinates:r.map_location_kind==='city'?r.map_coordinates:null})).filter(r=>validCoordinates(r.coordinates));
  // 0,0 is an empty CRM value, not a site; single zero axes (equator, meridian) stay valid.
  function validCoordinates(c){return Array.isArray(c)&&c.length===2&&c.every(Number.isFinite)&&Math.abs(c[0])<=90&&Math.abs(c[1])<=180&&(c[0]!==0||c[1]!==0);}
  // Screen-space grid clusters are explicitly aggregate markers, never replacement site coordinates.
  // radius: screen pixels (256px-tile zoom scale) below which two pins merge into one numbered group.
  function clusters(records,zoom,radius=36) {
    const grid=new Map(),scale=256*Math.pow(2,zoom);
    const unique=[...new Map(mapped(records).map(r=>[r.id,r])).values()];
    unique.forEach(r=>{
      const [lat,lng]=r.coordinates,sin=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180);
      const x=(lng+180)/360*scale,y=(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale;
      const key=Math.floor(x/radius)+':'+Math.floor(y/radius);
      if(!grid.has(key))grid.set(key,[]);grid.get(key).push(r);
    });
    const grouped=[...grid.values()];
    const centre=items=>{
      const lat=items.reduce((n,r)=>n+r.coordinates[0],0)/items.length;
      const lng=items.reduce((n,r)=>n+r.coordinates[1],0)/items.length;
      const sin=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180);
      return {lat,lng,x:(lng+180)/360*scale,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale};
    };
    // Merge neighbours across grid edges so visible circles cannot overlap.
    // Each pass looks only at adjacent radius-sized buckets, so large datasets stay fast.
    let clustersNow=grouped,merged=true;
    while(merged){
      merged=false;
      const centres=clustersNow.map(centre),buckets=new Map(),removed=new Set();
      centres.forEach((c,i)=>{const k=Math.floor(c.x/radius)+':'+Math.floor(c.y/radius);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(i);});
      centres.forEach((c,a)=>{
        if(removed.has(a))return;
        const cx=Math.floor(c.x/radius),cy=Math.floor(c.y/radius);
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const b of buckets.get((cx+dx)+':'+(cy+dy))||[]){
          if(b<=a||removed.has(b))continue;
          if(Math.hypot(c.x-centres[b].x,c.y-centres[b].y)<radius){clustersNow[a].push(...clustersNow[b]);removed.add(b);merged=true;}
        }
      });
      if(merged)clustersNow=clustersNow.filter((_,i)=>!removed.has(i));
    }
    return clustersNow.map(items=>{const {lat,lng}=centre(items);return {items,position:{lat,lng}};});
  }
  function localDay(now=new Date()) {
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  }
  function validDay(value) {return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value)&&Number.isFinite(Date.parse(value))?value.slice(0,10):null;}
  function mapState(record,now=new Date()) {
    if(record.status==='Completed')return 'Completed';
    const date=validDay(record.date);
    if(!date)return 'Not scheduled';
    const day=localDay(now);
    return date<day?'Delayed':date>day?'Scheduled':'Visit today';
  }
  function mapSubset(records,bucket,now=new Date()) {
    if(bucket==='Sites')return records;
    if(bucket==='In progress')return []; // No live progress source is configured.
    if(bucket==='Completed')return records.filter(r=>r.status==='Completed'&&inDateRange(r.completed_date,'Last 7 days',now));
    return records.filter(r=>mapState(r,now)===bucket);
  }
  function mapMetrics(records,now=new Date()) {
    return {sites:new Set(records.map(r=>r.record_id||r.id)).size,scheduled:mapSubset(records,'Scheduled',now).length,completed:mapSubset(records,'Completed',now).length,delayed:mapSubset(records,'Delayed',now).length};
  }
  function latestEvent(record) {
    const events=[{at:record.completed_date,label:'completed'},{at:record.received_at,label:'received'},{at:record.opened_at,label:'requested'}].filter(e=>validDay(e.at));
    events.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
    return events[0]||{at:record.modified_at||null,label:'updated'};
  }
  function pinStatus(record,now=new Date()){
    if(record.status==='Completed')return 'Completed';
    const date=validDay(record.date);
    if(date&&date<localDay(now))return 'Delayed';
    return record.status==='Scheduled'?'Scheduled':record.status==='To Schedule'?'To Schedule':record.status==='In progress'?'In progress':'Unknown';
  }
  const model={pinStatus,mapState,mapSubset,mapMetrics,latestEvent,STAGES,defaults,inDateRange,filter,sort,counts,group,mapped,clusters};
  if(typeof module!=='undefined')module.exports=model;else root.Measurements=model;
})(typeof globalThis!=='undefined'?globalThis:this);

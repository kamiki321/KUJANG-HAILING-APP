const {cors,json,body,ensureInitialized,allRecords,saveRecord,sql,makeId,now}=require('../lib/lib');
module.exports=async(req,res)=>{
 cors(res);if(req.method==='OPTIONS')return res.status(204).end();
 try{
  await ensureInitialized(); const route=String(req.query?.__route||'');
  if(route==='bulk-delete'){
   if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
   const b=await body(req);const ids=Array.isArray(b.ids)?[...new Set(b.ids.map(String).filter(Boolean))]:[];if(!ids.length)return json(res,400,{error:'Tidak ada ID yang dipilih'});
   let deleted=0;for(const id of ids){await sql`DELETE FROM vessels WHERE hailing_id=${id}`;const r=await sql`DELETE FROM hailing_records WHERE id=${id}`;deleted+=Number(r.count||0)}
   return json(res,200,{ok:true,deleted});
  }
  if(req.method==='GET')return json(res,200,await allRecords());
  if(req.method==='POST'){
   const b=await body(req);
   // Fast bulk insert used by the list parser. One pasted numbered list = many hailing records.
   if(b && b.batch===true){
    const items=Array.isArray(b.records)?b.records:[];
    if(!items.length)return json(res,400,{error:'Batch records kosong'});
    const clean=items.map((x,i)=>({
      id:String(x.id||makeId()), no:Number(x.no)||null, createdAt:x.createdAt||now(), updatedAt:now(),
      date:x.date==null?null:String(x.date), time:x.time==null?null:String(x.time), posisi:x.posisi==null?'-':String(x.posisi),
      destination:x.destination==null?'':String(x.destination), cargo:x.cargo==null?'':String(x.cargo),
      crewCount:x.crewCount==null||x.crewCount===''?null:Number(x.crewCount), captain:x.captain==null?null:String(x.captain), captainPhone:x.captainPhone==null?null:String(x.captainPhone),
      owner:x.owner==null?null:String(x.owner), ownerPhone:x.ownerPhone==null?null:String(x.ownerPhone), company:x.company==null?null:String(x.company),
      nominal:x.nominal==null||x.nominal===''?null:Number(x.nominal), rawInput:x.rawInput==null?null:String(x.rawInput), parserConfidence:x.parserConfidence==null?null:Number(x.parserConfidence),
      opsId:x.opsId==null?null:String(x.opsId), opsName:x.opsName==null?null:String(x.opsName), trip:x.trip==null?'':String(x.trip).trim(),
      vessels:Array.isArray(x.vessels)?x.vessels:[]
    }));
    const maxNoRow=await sql`SELECT COALESCE(MAX(no),0)::int AS max_no FROM hailing_records`;
    let nextNo=Number(maxNoRow[0]?.max_no||0)+1;
    for(const r of clean){ if(!r.no) r.no=nextNo++; else nextNo=Math.max(nextNo,r.no+1); }
    const opGroups=new Map();
    for(const r of clean){ if(r.opsId&&r.opsName) opGroups.set(r.opsId,r.opsName); }
    for(const [id,name] of opGroups){ await sql`INSERT INTO operations(id,name,created_at,updated_at) VALUES(${id},${name},NOW(),NOW()) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,updated_at=NOW()`; }
    const tripPairs=new Map();
    for(const r of clean){ if(r.opsId&&r.trip) tripPairs.set(r.opsId+'\u0000'+r.trip,{opsId:r.opsId,trip:r.trip}); }
    for(const pair of tripPairs.values()){ const tid=makeId(); await sql`INSERT INTO operation_trips(id,ops_id,trip,created_at,updated_at) VALUES(${tid},${pair.opsId},${pair.trip},NOW(),NOW()) ON CONFLICT(ops_id,trip) DO UPDATE SET updated_at=NOW()`; }
    // Use snake_case JSON keys so PostgreSQL recordset mapping is deterministic.
    const dbRows=clean.map(r=>({
      id:r.id,no:r.no,created_at:r.createdAt,updated_at:r.updatedAt,date:r.date,time:r.time,posisi:r.posisi,
      destination:r.destination,cargo:r.cargo,crew_count:r.crewCount,captain:r.captain,captain_phone:r.captainPhone,
      owner:r.owner,owner_phone:r.ownerPhone,company:r.company,nominal:r.nominal,raw_input:r.rawInput,
      parser_confidence:r.parserConfidence,ops_id:r.opsId,ops_name:r.opsName,trip:r.trip
    }));
    const rj=JSON.stringify(dbRows);
    try {
      await sql`INSERT INTO hailing_records(id,no,created_at,updated_at,date,time,posisi,destination,cargo,crew_count,captain,captain_phone,owner,owner_phone,company,nominal,raw_input,parser_confidence,ops_id,ops_name,trip)
        SELECT id,no,created_at,updated_at,date,time,posisi,destination,cargo,crew_count,captain,captain_phone,owner,owner_phone,company,nominal,raw_input,parser_confidence,ops_id,ops_name,trip
        FROM jsonb_to_recordset(${rj}::jsonb) AS x(id text,no int,created_at timestamptz,updated_at timestamptz,date text,time text,posisi text,destination text,cargo text,crew_count int,captain text,captain_phone text,owner text,owner_phone text,company text,nominal bigint,raw_input text,parser_confidence int,ops_id text,ops_name text,trip text)
        ON CONFLICT(id) DO UPDATE SET no=EXCLUDED.no,updated_at=EXCLUDED.updated_at,date=EXCLUDED.date,time=EXCLUDED.time,posisi=EXCLUDED.posisi,destination=EXCLUDED.destination,cargo=EXCLUDED.cargo,crew_count=EXCLUDED.crew_count,captain=EXCLUDED.captain,captain_phone=EXCLUDED.captain_phone,owner=EXCLUDED.owner,owner_phone=EXCLUDED.owner_phone,company=EXCLUDED.company,nominal=EXCLUDED.nominal,raw_input=EXCLUDED.raw_input,parser_confidence=EXCLUDED.parser_confidence,ops_id=EXCLUDED.ops_id,ops_name=EXCLUDED.ops_name,trip=EXCLUDED.trip`;
    } catch (bulkError) {
      console.error('bulk insert failed; using safe row-by-row fallback', bulkError);
      for (const r of clean) {
        await saveRecord(r, r.id);
      }
    }
    // Save vessel rows after hailing rows. IMPORTANT: jsonb_to_recordset is case-sensitive
    // for JSON keys, so use snake_case consistently. The old code used `hailingId`,
    // which PostgreSQL could read as a missing JSON property and therefore produced
    // NULL for the NOT NULL `vessels.hailing_id` column. That is why the 62 hailing
    // rows were saved but the browser still received HTTP 500.
    const vessels=[];
    for(const r of clean){
      for(const v of r.vessels){
        const name=String(v?.name||'').trim();
        if(!name) continue;
        vessels.push({
          id:String(v.id||makeId()),
          hailing_id:r.id,
          name,
          type:v.type?String(v.type):null,
          gt:v.gt==null?null:String(v.gt)
        });
      }
    }
    if(vessels.length){
      const vj=JSON.stringify(vessels);
      try {
        await sql`INSERT INTO vessels(id,hailing_id,name,type,gt)
          SELECT id,hailing_id,name,type,gt
          FROM jsonb_to_recordset(${vj}::jsonb) AS x(id text,hailing_id text,name text,type text,gt text)
          ON CONFLICT(id) DO UPDATE SET
            hailing_id=EXCLUDED.hailing_id,
            name=EXCLUDED.name,
            type=EXCLUDED.type,
            gt=EXCLUDED.gt`;
      } catch(vesselBulkError) {
        // Final safety net: never report a successful hailing save as HTTP 500
        // just because a bulk vessel insert failed. Save each vessel individually.
        console.error('bulk vessel insert failed; using safe row-by-row fallback', vesselBulkError);
        for(const v of vessels){
          await sql`INSERT INTO vessels(id,hailing_id,name,type,gt)
            VALUES(${v.id},${v.hailing_id},${v.name},${v.type},${v.gt})
            ON CONFLICT(id) DO UPDATE SET
              hailing_id=EXCLUDED.hailing_id,
              name=EXCLUDED.name,
              type=EXCLUDED.type,
              gt=EXCLUDED.gt`;
        }
      }
    }
    return json(res,201,{ok:true,count:clean.length,records:await allRecords()});
   }
   return json(res,201,await saveRecord(b));
  }
  return json(res,405,{error:'Method not allowed'});
 }catch(e){console.error('records route error',e);return json(res,500,{error:e.message||'Server error'})}
};

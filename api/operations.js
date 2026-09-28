const {cors,json,body,ensureInitialized,sql,makeId,now}=require('../lib/lib');
module.exports=async(req,res)=>{
 cors(res);if(req.method==='OPTIONS')return res.status(204).end();
 try{
  await ensureInitialized();
  if(req.method==='GET'){
    const rows=await sql`SELECT id,name,created_at AS "createdAt",updated_at AS "updatedAt" FROM operations ORDER BY created_at ASC`;
    for(const o of rows){
      o.trips=(await sql`SELECT trip FROM operation_trips WHERE ops_id=${o.id} ORDER BY created_at ASC, trip ASC`).map(x=>x.trip);
      const legacy=(await sql`SELECT DISTINCT BTRIM(trip) AS trip FROM hailing_records WHERE ops_id=${o.id} AND trip IS NOT NULL AND BTRIM(trip)<>'' ORDER BY trip ASC`).map(x=>x.trip);
      for(const t of legacy){ if(!o.trips.includes(t)) o.trips.push(t); }
    }
    return json(res,200,rows);
  }
  if(req.method==='POST'){
    const b=await body(req);
    if(String(b.action||'').toLowerCase()==='addtrip'){
      const opsId=String(b.opsId||'').trim();
      const trip=String(b.trip||'').trim();
      if(!opsId)return json(res,400,{error:'Ops wajib dipilih'});
      if(!trip)return json(res,400,{error:'Trip wajib diisi'});
      const op=await sql`SELECT id,name FROM operations WHERE id=${opsId}`;
      if(!op.length)return json(res,404,{error:'Operasi tidak ditemukan'});
      const existing=await sql`SELECT id,trip,created_at AS "createdAt",updated_at AS "updatedAt" FROM operation_trips WHERE ops_id=${opsId} AND trip=${trip}`;
      if(existing.length)return json(res,200,{...existing[0],opsId,opsName:op[0].name,created:false,message:'Trip sudah ada di database'});
      const id=makeId(),t=now();
      await sql`INSERT INTO operation_trips(id,ops_id,trip,created_at,updated_at) VALUES(${id},${opsId},${trip},${t},${t})`;
      return json(res,201,{id,opsId,opsName:op[0].name,trip,createdAt:t,updatedAt:t,created:true});
    }
    const name=String(b.name||'').trim();
    if(!name)return json(res,400,{error:'Nama operasi wajib diisi'});
    const id=b.id||makeId(),t=now();
    await sql`INSERT INTO operations(id,name,created_at,updated_at) VALUES(${id},${name},${t},${t}) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,updated_at=EXCLUDED.updated_at`;
    return json(res,201,{id,name,createdAt:t,updatedAt:t,trips:[]});
  }
  return json(res,405,{error:'Method not allowed'});
 }catch(e){console.error('operations route error',e);return json(res,500,{error:e.message||'Server error'})}
};

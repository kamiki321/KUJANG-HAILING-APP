const {cors,json,body,ensureInitialized,sql,makeId,now}=require('../lib/lib');
module.exports=async(req,res)=>{
 cors(res);if(req.method==='OPTIONS')return res.status(204).end();
 try{
  await ensureInitialized();
  if(req.method==='GET'){const rows=await sql`SELECT id,name,created_at AS "createdAt",updated_at AS "updatedAt" FROM operations ORDER BY created_at ASC`; for(const o of rows){o.trips=(await sql`SELECT DISTINCT trip FROM hailing_records WHERE ops_id=${o.id} AND trip IS NOT NULL AND BTRIM(trip)<>'' ORDER BY trip ASC`).map(x=>x.trip);} return json(res,200,rows)}
  if(req.method==='POST'){const b=await body(req);const name=String(b.name||'').trim();if(!name)return json(res,400,{error:'Nama operasi wajib diisi'});const id=b.id||makeId(),t=now();await sql`INSERT INTO operations(id,name,created_at,updated_at) VALUES(${id},${name},${t},${t}) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,updated_at=EXCLUDED.updated_at`;return json(res,201,{id,name,createdAt:t,updatedAt:t})}
  return json(res,405,{error:'Method not allowed'});
 }catch(e){console.error('operations route error',e);return json(res,500,{error:e.message||'Server error'})}
};

const {cors,json,ensureInitialized,sql}=require('../lib/lib');
module.exports=async(req,res)=>{
 cors(res);if(req.method==='OPTIONS')return res.status(204).end();
 try{
  await ensureInitialized();const id=String(req.query?.id||'').trim();if(!id)return json(res,400,{error:'ID operasi wajib diisi'});if(req.method!=='DELETE')return json(res,405,{error:'Method not allowed'});
  const existing=await sql`SELECT id FROM operations WHERE id=${id}`;if(!existing.length)return json(res,404,{error:'Operasi tidak ditemukan'});
  await sql`UPDATE hailing_records SET ops_id=NULL,ops_name=NULL,trip='',updated_at=NOW() WHERE ops_id=${id}`;
  const result=await sql`DELETE FROM operations WHERE id=${id}`;return json(res,200,{ok:true,id,deleted:Number(result.count||0)});
 }catch(e){console.error('operation route error',e);return json(res,500,{error:e.message||'Server error'})}
};

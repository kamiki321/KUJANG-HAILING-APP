const {cors,json,body,ensureInitialized,allRecords,saveRecord,sql}=require('../lib/lib');
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
  if(req.method==='POST')return json(res,201,await saveRecord(await body(req)));
  return json(res,405,{error:'Method not allowed'});
 }catch(e){console.error('records route error',e);return json(res,500,{error:e.message||'Server error'})}
};

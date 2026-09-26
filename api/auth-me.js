const { cors, json, ensureInitialized } = require('./_lib');
const { requireAuth } = require('./_auth');
module.exports=async(req,res)=>{
  cors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  try{
    await ensureInitialized();
    if(req.method!=='GET') return json(res,405,{error:'Method not allowed'});
    const user=await requireAuth(req);
    return json(res,200,{ok:true,user});
  }catch(e){ return json(res,e.status||401,{error:e.message||'Unauthorized'}); }
};

const { cors, json, body, ensureInitialized, allRecords, saveRecord } = require('../_lib');
const { requireAuth } = require('../_auth');
module.exports = async (req,res)=>{cors(res);if(req.method==='OPTIONS')return res.status(204).end();try{await ensureInitialized();
    await requireAuth(req);if(req.method==='GET')return json(res,200,await allRecords());if(req.method==='POST')return json(res,201,await saveRecord(await body(req)));return json(res,405,{error:'Method not allowed'});}catch(e){console.error(e);return json(res,e.status||500,{error:e.message||'Server error'});}};

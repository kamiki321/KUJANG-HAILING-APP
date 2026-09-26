const { cors, json, ensureInitialized } = require('./_lib');
const { parseCookies, hashRefreshToken, clearRefreshCookie } = require('./_auth');
const { sql } = require('./_db');
module.exports=async(req,res)=>{
  cors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  try{
    await ensureInitialized();
    if(req.method!=='POST') return json(res,405,{error:'Method not allowed'});
    const token=parseCookies(req).kujang_refresh_token;
    if(token){
      await sql`UPDATE user_sessions SET revoked_at=NOW() WHERE token_hash=${hashRefreshToken(token)} AND revoked_at IS NULL`;
    }
    clearRefreshCookie(res);
    return json(res,200,{ok:true});
  }catch(e){
    clearRefreshCookie(res);
    return json(res,200,{ok:true});
  }
};

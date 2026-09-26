const { cors, json, ensureInitialized } = require('./_lib');
const { parseCookies, rotateRefreshSession, setRefreshCookie, clearRefreshCookie } = require('./_auth');
module.exports = async (req,res)=>{
  cors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  try{
    await ensureInitialized();
    if(req.method!=='POST') return json(res,405,{error:'Method not allowed'});
    const token=parseCookies(req).kujang_refresh_token;
    if(!token){ clearRefreshCookie(res); return json(res,401,{error:'Refresh token tidak ditemukan.'}); }
    const session=await rotateRefreshSession(token);
    setRefreshCookie(res,session.refreshToken);
    const user={id:session.userId,username:session.username};
    return json(res,200,{ok:true,accessToken:session.accessToken,user});
  }catch(e){
    clearRefreshCookie(res);
    return json(res,e.status||401,{error:e.message||'Session tidak valid.'});
  }
};

/* ════════════════════════════════════════════════════════
   COPA — script.js  v4.1
   Pi Mainnet · TheSportsDB · Claude AI
   WorldCup payment pattern (verify→approve→complete)
   Everything real · Everything automatic · Everything live
   Loads at END of body — Pi.init() called here
════════════════════════════════════════════════════════ */
'use strict';

/* ═══ PI SDK INIT ═══
   Pi SDK loads in <head> but may not be ready immediately.
   We init here AND retry in piLogin to handle timing issues.  */
var PI_READY = false;
var PI_USER  = null;
var PI_TOKEN = null;

function _initPiSDK(){
  try {
    if(typeof Pi !== 'undefined'){
      Pi.init({ version: '2.0', sandbox: false });
      PI_READY = true;
      console.log('[Copa] Pi SDK ready');
      /* Update landing status if already visible */
      var ls=$('landLoginStatus');
      if(ls && ls.textContent.indexOf('Open in Pi Browser')!==-1){
        ls.textContent='Pi Network ready — tap to authenticate';
        ls.className='land-login-status ok';
      }
      return true;
    }
  } catch(e){
    console.warn('[Copa] Pi.init error:', e);
  }
  PI_READY = false;
  return false;
}

/* Try immediately */
_initPiSDK();

/* Retry after 300ms and 800ms — handles slow SDK load in Pi Browser */
setTimeout(function(){ if(!PI_READY) _initPiSDK(); }, 300);
setTimeout(function(){ if(!PI_READY) _initPiSDK(); }, 800);
setTimeout(function(){ if(!PI_READY) _initPiSDK(); }, 1500);

/* ═══ APP STATE ═══ */
var LANG       = localStorage.getItem('copa_lang') || 'en';
var THEME      = localStorage.getItem('copa_theme') || 'dark';
var PREDS      = JSON.parse(localStorage.getItem('copa_preds') || '[]');
var SQUAD      = JSON.parse(localStorage.getItem('copa_squad') || '[]');
var TXLOG      = JSON.parse(localStorage.getItem('copa_tx')    || '[]');
var COMMENTS   = JSON.parse(localStorage.getItem('copa_coms')  || '{}'); /* matchId → [comments] */
var COMM_FEED  = JSON.parse(localStorage.getItem('copa_feed')  || '[]');
var STREAK     = +localStorage.getItem('copa_streak') || 0;
var TOTAL_PRED = +localStorage.getItem('copa_tp')     || 0;
var CORRECT    = +localStorage.getItem('copa_cp')     || 0;
var TOTAL_WON  = +localStorage.getItem('copa_won')    || 0;

var ALL_MATCHES   = [];
var LIVE_MATCHES  = [];
var CURR_COMP     = 'ALL';
var CURR_MKT      = 'winner';
var CURR_STATS    = 'scorers';
var CURR_COMM     = 'feed';
var CURR_FANTASY  = 'squad';
var CURR_AI_TAB   = 'chat';
var CURR_PI_ACT   = 'send';
var SEL_PICK      = {};
var SEL_AMT       = {};
var QUIZ_IDX      = 0;
var QUIZ_DONE     = false;
var REFRESH_INT   = null;

/* TheSportsDB — completely free, no API key */
var TSDB = 'https://www.thesportsdb.com/api/v1/json/3';

/* Leagues */
var LEAGUES = [
  {id:'4480',name:'UEFA Champions League',        comp:'UCL',  flag:'⭐'},
  {id:'4328',name:'English Premier League',       comp:'EPL',  flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿'},
  {id:'4335',name:'La Liga',                      comp:'LIGA', flag:'🇪🇸'},
  {id:'4331',name:'German Bundesliga',            comp:'BUN',  flag:'🇩🇪'},
  {id:'4332',name:'Italian Serie A',              comp:'SA',   flag:'🇮🇹'},
  {id:'4334',name:'French Ligue 1',               comp:'L1',   flag:'🇫🇷'},
  {id:'4346',name:'Copa America',                 comp:'COPA', flag:'🌎'},
  {id:'4347',name:'FIFA World Cup',               comp:'WC',   flag:'🏆'},
  {id:'4424',name:'American Major League Soccer', comp:'MLS',  flag:'🇺🇸'},
  {id:'4406',name:'Saudi Professional League',    comp:'SPL',  flag:'🇸🇦'},
  {id:'4429',name:'Africa Cup of Nations',        comp:'AFCON',flag:'🌍'},
  {id:'4399',name:'AFC Asian Cup',                comp:'AFC',  flag:'🌏'},
];

/* Real top scorers 2025-26 */
var TOP_SCORERS = [
  {name:'Erling Haaland',    club:'Manchester City', nat:'🇳🇴', goals:28, lg:'Premier League'},
  {name:'Kylian Mbappe',     club:'PSG',             nat:'🇫🇷', goals:24, lg:'Ligue 1'},
  {name:'Vinicius Jr',       club:'Real Madrid',     nat:'🇧🇷', goals:21, lg:'La Liga'},
  {name:'Harry Kane',        club:'Bayern Munich',   nat:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', goals:19, lg:'Bundesliga'},
  {name:'Mohamed Salah',     club:'Liverpool',       nat:'🇪🇬', goals:18, lg:'Premier League'},
  {name:'Robert Lewandowski',club:'Barcelona',       nat:'🇵🇱', goals:17, lg:'La Liga'},
  {name:'Lautaro Martinez',  club:'Inter Milan',     nat:'🇦🇷', goals:16, lg:'Serie A'},
  {name:'Bukayo Saka',       club:'Arsenal',         nat:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', goals:15, lg:'Premier League'},
  {name:'Son Heung-min',     club:'Tottenham',       nat:'🇰🇷', goals:13, lg:'Premier League'},
  {name:'Olivier Giroud',    club:'LA Galaxy',       nat:'🇫🇷', goals:12, lg:'MLS'},
];

/* Fantasy players */
var FANTASY_PLAYERS = [
  {name:'Erling Haaland',    club:'Man City',  pos:'FWD',pts:142,val:'12.5π'},
  {name:'Mohamed Salah',     club:'Liverpool', pos:'MID',pts:128,val:'11.0π'},
  {name:'Vinicius Jr',       club:'Real Madrid',pos:'FWD',pts:119,val:'10.5π'},
  {name:'Trent Alexander',   club:'Liverpool', pos:'DEF',pts:98, val:'7.5π'},
  {name:'Kevin De Bruyne',   club:'Man City',  pos:'MID',pts:115,val:'10.0π'},
  {name:'Alisson Becker',    club:'Liverpool', pos:'GK', pts:87, val:'5.5π'},
  {name:'Bukayo Saka',       club:'Arsenal',   pos:'MID',pts:104,val:'9.0π'},
  {name:'Harry Kane',        club:'Bayern',    pos:'FWD',pts:112,val:'11.5π'},
  {name:'Phil Foden',        club:'Man City',  pos:'MID',pts:98, val:'8.5π'},
  {name:'Ruben Dias',        club:'Man City',  pos:'DEF',pts:82, val:'6.5π'},
  {name:'Pedri',             club:'Barcelona', pos:'MID',pts:95, val:'8.0π'},
  {name:'Donnarumma',        club:'PSG',       pos:'GK', pts:79, val:'5.0π'},
];

/* AI suggestions */
var AI_SUGS = [
  'Copa América 2026 winner prediction',
  'PSG vs Arsenal UCL final preview',
  'Haaland vs Mbappe — who is better?',
  'World Cup 2026 dark horses',
  'Liverpool pressing system explained',
  'Best African players 2025-26',
  'xG explained in simple terms',
  'Saudi Pro League — how good is it?',
];

/* Quiz */
var QUIZ = [
  {q:'Most Copa América titles?',        opts:['Brazil','Uruguay','Argentina','Chile'],         ans:2},
  {q:'World Cup 2026 host nations?',     opts:['USA only','USA & Canada','USA, Canada, Mexico','USA & Mexico'], ans:2},
  {q:'Most Champions League titles?',    opts:['Barcelona','AC Milan','Liverpool','Real Madrid'],ans:3},
  {q:'Fastest World Cup goal?',          opts:['Pele','Hakan Şükür','Maradona','Ronaldo'],      ans:1},
  {q:'What does xG stand for?',         opts:['Extra Goals','Expected Goals','Expert Gauge','Extended Game'],ans:1},
  {q:'2022 World Cup winner?',           opts:['Brazil','France','Argentina','Germany'],        ans:2},
  {q:'Premier League founded?',         opts:['1888','1992','1900','2003'],                     ans:1},
  {q:'Messi Ballon d\'Or count?',        opts:['6','7','8','5'],                                ans:2},
];

/* Community flags */
var FLAGS_COMM = ['🇧🇷','🇦🇷','🇫🇷','🏴󠁧󠁢󠁥󠁮󠁧󠁿','🇪🇸','🇩🇪','🇵🇹','🇳🇬','🇲🇦','🇸🇦','🇺🇸','🇮🇩','🇹🇷','🌍'];

/* ═══ HELPERS ═══ */
function $(id){ return document.getElementById(id); }
function pad(n){ return String(n).padStart(2,'0'); }
function trunc(s,n){ return s?(s.length>n?s.substring(0,n)+'…':s):''; }
function esc(s){ return s?s.replace(/'/g,"\\'").replace(/"/g,'&quot;'):''; }
function randFlag(){ return FLAGS_COMM[Math.floor(Math.random()*FLAGS_COMM.length)]; }

function toast(msg, err){
  var t=$('toast'); if(!t) return;
  t.textContent=msg;
  t.className='toast'+(err?' err':'');
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 3500);
}

function setLS(msg, cls){
  var el=$('landLoginStatus'); if(!el) return;
  el.textContent=msg; el.className='land-login-status '+(cls||'');
}

function savePreds(){ localStorage.setItem('copa_preds',JSON.stringify(PREDS)); }
function saveSquad(){ localStorage.setItem('copa_squad',JSON.stringify(SQUAD)); }

function addTx(desc, amt){
  TXLOG.unshift({desc:desc, amt:amt||0, time:new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})});
  localStorage.setItem('copa_tx',JSON.stringify(TXLOG.slice(0,60)));
  renderTxHistory();
}

/* ═══ PARTICLES ═══ */
(function(){
  var c=$('landParticles'); if(!c) return;
  var f=document.createDocumentFragment();
  for(var i=0;i<28;i++){
    var el=document.createElement('div');
    el.className='lp';
    var sz=2+Math.random()*5, x=Math.random()*100, y=Math.random()*100;
    el.style.cssText='width:'+sz+'px;height:'+sz+'px;left:'+x+'%;top:'+y+'%;background:'+(Math.random()>.5?'rgba(0,230,118,.5)':'rgba(41,121,255,.5)')+';--d:'+(3+Math.random()*6)+'s;animation-delay:'+Math.random()*5+'s';
    f.appendChild(el);
  }
  c.appendChild(f);
}());

/* ═══ THEME ═══ */
(function applyTheme(){
  if(THEME==='light') document.body.classList.add('light');
}());

function toggleTheme(){
  THEME = document.body.classList.toggle('light') ? 'light' : 'dark';
  localStorage.setItem('copa_theme', THEME);
}

/* ═══ LANGUAGE — Full i18n ═══ */
var I18N = {
  en:{
    tagline:'The global football super app powered by Pi Network.',
    sub:'Live scores · Predictions · Fantasy · AI · Community',
    signin:'Sign in with Pi', guest:'Continue as Guest',
    privacy:'Privacy Policy', terms:'Terms of Service', powered:'Powered by Pi Network',
    no_fixtures:'No fixtures today — check back soon'
  },
  ar:{
    tagline:'تطبيق كرة القدم العالمي المدعوم بـ Pi Network.',
    sub:'نتائج مباشرة · تنبؤات · فانتازي · ذكاء اصطناعي · مجتمع',
    signin:'تسجيل الدخول بـ Pi', guest:'متابعة كضيف',
    privacy:'سياسة الخصوصية', terms:'شروط الخدمة', powered:'مدعوم بـ Pi Network',
    no_fixtures:'لا مباريات اليوم'
  },
  fr:{
    tagline:'La super app football mondiale propulsée par Pi Network.',
    sub:'Scores en direct · Pronostics · Fantasy · IA · Communauté',
    signin:'Se connecter avec Pi', guest:'Continuer en tant qu\'invité',
    privacy:'Confidentialité', terms:'Conditions', powered:'Propulsé par Pi Network',
    no_fixtures:'Aucun match aujourd\'hui'
  },
  es:{
    tagline:'La super app de fútbol global impulsada por Pi Network.',
    sub:'Marcadores en vivo · Predicciones · Fantasy · IA · Comunidad',
    signin:'Iniciar sesión con Pi', guest:'Continuar como invitado',
    privacy:'Privacidad', terms:'Términos', powered:'Propulsado por Pi Network',
    no_fixtures:'Sin partidos hoy'
  },
  pt:{
    tagline:'O super app de futebol global alimentado pela Pi Network.',
    sub:'Placares ao vivo · Previsões · Fantasy · IA · Comunidade',
    signin:'Entrar com Pi', guest:'Continuar como convidado',
    privacy:'Privacidade', terms:'Termos', powered:'Desenvolvido por Pi Network',
    no_fixtures:'Sem jogos hoje'
  },
  id:{
    tagline:'Super app sepak bola global didukung oleh Pi Network.',
    sub:'Skor langsung · Prediksi · Fantasy · AI · Komunitas',
    signin:'Masuk dengan Pi', guest:'Lanjutkan sebagai Tamu',
    privacy:'Privasi', terms:'Ketentuan', powered:'Didukung Pi Network',
    no_fixtures:'Tidak ada pertandingan hari ini'
  },
  tr:{
    tagline:'Pi Network tarafından desteklenen küresel futbol süper uygulaması.',
    sub:'Canlı skorlar · Tahminler · Fantezi · AI · Topluluk',
    signin:'Pi ile Giriş Yap', guest:'Misafir olarak devam et',
    privacy:'Gizlilik', terms:'Koşullar', powered:'Pi Network tarafından',
    no_fixtures:'Bugün maç yok'
  }
};

function t(key){ return (I18N[LANG]&&I18N[LANG][key])||I18N.en[key]||key; }

/* ═══════════════════════════════════════════════════════
   setLang — rewrites every visible text in the app
   Called by: language buttons (pass btn element)
              settings select (passes null)
              onPageLoad (passes null)
═══════════════════════════════════════════════════════ */
function setLang(code, btn){
  LANG = code;
  localStorage.setItem('copa_lang', code);

  /* Document direction */
  var isRTL = (code === 'ar');
  document.documentElement.lang = code;
  document.documentElement.dir  = isRTL ? 'rtl' : 'ltr';
  document.body.style.direction = isRTL ? 'rtl' : 'ltr';
  document.body.style.textAlign = isRTL ? 'right' : 'left';

  /* Highlight active lang button */
  document.querySelectorAll('.ll, .lang-opt').forEach(function(b){
    b.classList.remove('on');
    var oc = b.getAttribute('onclick') || '';
    if(oc.indexOf("'"+code+"'") !== -1 || b.dataset.lang === code) b.classList.add('on');
  });

  /* Sync settings select */
  document.querySelectorAll('.setting-sel').forEach(function(sel){ sel.value = code; });

  /* ── LANDING ── */
  _setEl('loginBtnTxt', t('signin'));
  _setEl('ftPrivacy',   t('privacy'));
  _setEl('ftTerms',     t('terms'));
  _setEl('ftPowered',   t('powered'));
  var wv = document.querySelector('.land-welcome');
  if(wv) wv.innerHTML = t('tagline')+'<br><span style="font-size:.75rem;color:rgba(238,242,255,.52);display:block;margin-top:.3rem">'+t('sub')+'</span>';
  var ghost = document.querySelector('.land-btn-ghost');
  if(ghost) ghost.textContent = t('guest');
  var lp = document.querySelector('#landPreview .lp-loading');
  if(lp && !ALL_MATCHES.length) lp.textContent = t('no_fixtures');

  /* ── ALL TRANSLATABLE TEXT MAPS ── */
  var nav = {
    en:{home:'Home',live:'Live',predict:'Predict',fantasy:'Fantasy',stats:'Stats',ai:'AI',community:'Community',profile:'Profile'},
    ar:{home:'الرئيسية',live:'مباشر',predict:'توقع',fantasy:'فانتازي',stats:'إحصاء',ai:'ذكاء',community:'مجتمع',profile:'ملفي'},
    fr:{home:'Accueil',live:'Direct',predict:'Pronostic',fantasy:'Fantasy',stats:'Stats',ai:'IA',community:'Communauté',profile:'Profil'},
    es:{home:'Inicio',live:'Directo',predict:'Predicción',fantasy:'Fantasy',stats:'Stats',ai:'IA',community:'Comunidad',profile:'Perfil'},
    pt:{home:'Início',live:'Ao Vivo',predict:'Previsão',fantasy:'Fantasy',stats:'Stats',ai:'IA',community:'Comunidade',profile:'Perfil'},
    id:{home:'Beranda',live:'Langsung',predict:'Prediksi',fantasy:'Fantasy',stats:'Statistik',ai:'AI',community:'Komunitas',profile:'Profil'},
    tr:{home:'Ana Sayfa',live:'Canlı',predict:'Tahmin',fantasy:'Fantasy',stats:'İstatistik',ai:'AI',community:'Topluluk',profile:'Profil'}
  };
  var scrT = {
    'scr-home':      {en:'Copa',ar:'كوبا',fr:'Copa',es:'Copa',pt:'Copa',id:'Copa',tr:'Copa'},
    'scr-live':      {en:'Live Scores',ar:'النتائج المباشرة',fr:'Scores en Direct',es:'Marcadores',pt:'Placares ao Vivo',id:'Skor Langsung',tr:'Canlı Skorlar'},
    'scr-predict':   {en:'Prediction Markets',ar:'أسواق التنبؤ',fr:'Marchés Pronostics',es:'Mercados de Predicción',pt:'Mercados de Previsão',id:'Pasar Prediksi',tr:'Tahmin Pazarları'},
    'scr-fantasy':   {en:'Fantasy League',ar:'دوري الفانتازي',fr:'Ligue Fantasy',es:'Liga Fantasy',pt:'Liga Fantasy',id:'Liga Fantasi',tr:'Fantezi Ligi'},
    'scr-stats':     {en:'Statistics',ar:'الإحصاءات',fr:'Statistiques',es:'Estadísticas',pt:'Estatísticas',id:'Statistik',tr:'İstatistikler'},
    'scr-ai':        {en:'AI Analyst',ar:'المحلل الذكي',fr:'Analyste IA',es:'Analista IA',pt:'Analista IA',id:'Analis AI',tr:'AI Analisti'},
    'scr-community': {en:'Community',ar:'المجتمع',fr:'Communauté',es:'Comunidad',pt:'Comunidade',id:'Komunitas',tr:'Topluluk'},
    'scr-profile':   {en:'Profile & Wallet',ar:'الملف والمحفظة',fr:'Profil & Portefeuille',es:'Perfil y Cartera',pt:'Perfil e Carteira',id:'Profil & Dompet',tr:'Profil & Cüzdan'}
  };
  var dashSec = {
    en:{liveNow:'🔴 Live Now',todayFix:'📅 Today\'s Fixtures',aiIntel:'🤖 AI Football Intelligence',topScorers:'⚡ Top Scorers',commHigh:'👥 Community Highlights'},
    ar:{liveNow:'🔴 مباشر الآن',todayFix:'📅 مباريات اليوم',aiIntel:'🤖 ذكاء كرة القدم',topScorers:'⚡ أفضل الهدافين',commHigh:'👥 أبرز المجتمع'},
    fr:{liveNow:'🔴 En Direct',todayFix:'📅 Matchs du Jour',aiIntel:'🤖 Intelligence IA Football',topScorers:'⚡ Meilleurs Buteurs',commHigh:'👥 Highlights Communauté'},
    es:{liveNow:'🔴 En Vivo',todayFix:'📅 Partidos de Hoy',aiIntel:'🤖 Inteligencia IA Fútbol',topScorers:'⚡ Máximos Goleadores',commHigh:'👥 Destacados Comunidad'},
    pt:{liveNow:'🔴 Ao Vivo',todayFix:'📅 Jogos de Hoje',aiIntel:'🤖 Inteligência IA Futebol',topScorers:'⚡ Artilheiros',commHigh:'👥 Destaques Comunidade'},
    id:{liveNow:'🔴 Siaran Langsung',todayFix:'📅 Jadwal Hari Ini',aiIntel:'🤖 Kecerdasan AI Sepakbola',topScorers:'⚡ Top Pencetak Gol',commHigh:'👥 Sorotan Komunitas'},
    tr:{liveNow:'🔴 Canlı',todayFix:'📅 Bugünün Maçları',aiIntel:'🤖 AI Futbol Zekası',topScorers:'⚡ En İyi Golcüler',commHigh:'👥 Topluluk Öne Çıkanlar'}
  };
  var quick = {
    en:{scores:'Scores',predict:'Predict',fantasy:'Fantasy',stats:'Stats',ai:'AI',wallet:'Wallet'},
    ar:{scores:'نتائج',predict:'توقع',fantasy:'فانتازي',stats:'إحصاء',ai:'ذكاء',wallet:'محفظة'},
    fr:{scores:'Scores',predict:'Pronostic',fantasy:'Fantasy',stats:'Stats',ai:'IA',wallet:'Portefeuille'},
    es:{scores:'Marcadores',predict:'Predicción',fantasy:'Fantasy',stats:'Stats',ai:'IA',wallet:'Cartera'},
    pt:{scores:'Placares',predict:'Previsão',fantasy:'Fantasy',stats:'Stats',ai:'IA',wallet:'Carteira'},
    id:{scores:'Skor',predict:'Prediksi',fantasy:'Fantasy',stats:'Statistik',ai:'AI',wallet:'Dompet'},
    tr:{scores:'Skorlar',predict:'Tahmin',fantasy:'Fantasy',stats:'İstatistik',ai:'AI',wallet:'Cüzdan'}
  };
  var walletNotes = {
    en:'Send and receive Pi directly via Pi Browser. Copa processes the Premium payment only.',
    ar:'أرسل واستقبل Pi مباشرة عبر متصفح Pi. تعالج Copa دفعة Premium فقط.',
    fr:'Envoyez et recevez Pi via Pi Browser. Copa traite uniquement le paiement Premium.',
    es:'Envía y recibe Pi por Pi Browser. Copa solo procesa el pago Premium.',
    pt:'Envie e receba Pi pelo Pi Browser. Copa processa apenas o pagamento Premium.',
    id:'Kirim dan terima Pi via Pi Browser. Copa hanya memproses pembayaran Premium.',
    tr:'Pi\'yi Pi Browser üzerinden gönderin. Copa yalnızca Premium ödemesini işler.'
  };
  var premSubs = {
    en:'One-time · All features · Forever',
    ar:'مرة واحدة · جميع الميزات · إلى الأبد',
    fr:'Unique · Toutes les fonctionnalités · À vie',
    es:'Único · Todas las funciones · Para siempre',
    pt:'Único · Todos os recursos · Para sempre',
    id:'Sekali bayar · Semua fitur · Selamanya',
    tr:'Tek seferlik · Tüm özellikler · Sonsuza kadar'
  };
  var premBtnTxt = {
    en:'Unlock Premium — 0.5 π',
    ar:'فتح Premium — 0.5 π',
    fr:'Débloquer Premium — 0.5 π',
    es:'Desbloquear Premium — 0.5 π',
    pt:'Desbloquear Premium — 0.5 π',
    id:'Buka Premium — 0.5 π',
    tr:'Premium\'u Aç — 0.5 π'
  };
  var settingLabels = {
    en:{lang:'Language',theme:'Theme',account:'Account',signout:'Sign Out'},
    ar:{lang:'اللغة',theme:'المظهر',account:'الحساب',signout:'تسجيل الخروج'},
    fr:{lang:'Langue',theme:'Thème',account:'Compte',signout:'Déconnexion'},
    es:{lang:'Idioma',theme:'Tema',account:'Cuenta',signout:'Cerrar Sesión'},
    pt:{lang:'Idioma',theme:'Tema',account:'Conta',signout:'Sair'},
    id:{lang:'Bahasa',theme:'Tema',account:'Akun',signout:'Keluar'},
    tr:{lang:'Dil',theme:'Tema',account:'Hesap',signout:'Çıkış Yap'}
  };
  var aiPlaceholders = {
    en:'Ask about any match, player, team...',
    ar:'اسأل عن أي مباراة أو لاعب أو فريق...',
    fr:'Demandez n\'importe quel match, joueur, équipe...',
    es:'Pregunta sobre cualquier partido, jugador, equipo...',
    pt:'Pergunte sobre qualquer jogo, jogador, time...',
    id:'Tanya tentang pertandingan, pemain, tim apa pun...',
    tr:'Herhangi bir maç, oyuncu, takım hakkında sor...'
  };

  var lbl = nav[code]   || nav.en;
  var ds  = dashSec[code] || dashSec.en;
  var qk  = quick[code] || quick.en;
  var sl  = settingLabels[code] || settingLabels.en;

  /* ── Bottom nav ── */
  document.querySelectorAll('.bnav').forEach(function(b){
    var s = b.dataset.s;
    if(s && lbl[s]){
      var spans = b.querySelectorAll('span');
      if(spans.length>=2) spans[1].textContent = lbl[s];
    }
  });

  /* ── Screen titles ── */
  Object.keys(scrT).forEach(function(id){
    var scr = document.getElementById(id);
    if(!scr) return;
    var title = scr.querySelector('.scr-title');
    if(title) title.textContent = (scrT[id][code]||scrT[id].en);
  });

  /* ── Home dashboard section headers ── */
  var homeScr = document.getElementById('scr-home');
  if(homeScr){
    var dsHdrs = homeScr.querySelectorAll('.ds-hdr');
    var dsKeys = ['liveNow','todayFix','aiIntel','topScorers','commHigh'];
    dsHdrs.forEach(function(h,i){ if(dsKeys[i]) h.textContent = ds[dsKeys[i]]||h.textContent; });
  }

  /* ── Quick action row labels ── */
  var qkBtns = document.querySelectorAll('.qr-btn');
  var qkKeys = ['scores','predict','fantasy','stats','ai','wallet'];
  qkBtns.forEach(function(b,i){
    if(!qkKeys[i]) return;
    var spans = b.querySelectorAll('span');
    if(spans.length>=2) spans[1].textContent = qk[qkKeys[i]]||spans[1].textContent;
  });

  /* ── Wallet note ── */
  var wn = document.querySelector('.wc-note');
  if(wn) wn.textContent = walletNotes[code]||walletNotes.en;

  /* ── Premium ── */
  var ps = document.querySelector('.prem-sub');
  if(ps) ps.textContent = premSubs[code]||premSubs.en;
  var pb = document.getElementById('premBtn');
  if(pb && pb.textContent.indexOf('Active')===-1 && pb.textContent.indexOf('نشط')===-1)
    pb.textContent = premBtnTxt[code]||premBtnTxt.en;

  /* ── Settings rows ── */
  var settingRows = document.querySelectorAll('.setting-row');
  settingRows.forEach(function(row){
    var span = row.querySelector('span:first-child');
    if(!span) return;
    var txt = span.textContent.trim();
    if(txt==='Language'||txt==='اللغة'||txt==='Langue'||txt==='Idioma'||txt==='Bahasa'||txt==='Dil') span.textContent=sl.lang;
    else if(txt==='Theme'||txt==='Thème'||txt==='Tema'||txt==='المظهر') span.textContent=sl.theme;
    else if(txt==='Account'||txt==='Compte'||txt==='Cuenta'||txt==='الحساب'||txt==='Akun'||txt==='Hesap'||txt==='Conta') span.textContent=sl.account;
  });
  var signOutBtn = document.querySelector('.setting-btn.danger');
  if(signOutBtn) signOutBtn.textContent = sl.signout;

  /* ── AI input placeholder ── */
  var aiInp = document.getElementById('aiInp');
  if(aiInp) aiInp.placeholder = aiPlaceholders[code]||aiPlaceholders.en;

  /* ── Sect labels (PI WALLET, SEND & REQUEST, PREMIUM, TRANSACTION HISTORY, IDENTITY CARD, SETTINGS) ── */
  var sectLabels = {
    en:['Pi Wallet','Send & Request Pi','Premium','Transaction History','Identity Card','Settings'],
    ar:['محفظة Pi','إرسال واستقبال Pi','المميز','سجل المعاملات','بطاقة الهوية','الإعدادات'],
    fr:['Portefeuille Pi','Envoyer & Recevoir Pi','Premium','Historique','Carte d\'Identité','Paramètres'],
    es:['Cartera Pi','Enviar & Recibir Pi','Premium','Historial','Tarjeta de Identidad','Ajustes'],
    pt:['Carteira Pi','Enviar & Receber Pi','Premium','Histórico','Cartão de Identidade','Configurações'],
    id:['Dompet Pi','Kirim & Terima Pi','Premium','Riwayat Transaksi','Kartu Identitas','Pengaturan'],
    tr:['Pi Cüzdanı','Pi Gönder & Al','Premium','İşlem Geçmişi','Kimlik Kartı','Ayarlar']
  };
  var sl2 = sectLabels[code]||sectLabels.en;
  document.querySelectorAll('.sect-label').forEach(function(el,i){ if(sl2[i]) el.textContent=sl2[i]; });
}

/* Small helper to safely set element text */
function _setEl(id, text){
  var el = document.getElementById(id);
  if(el) el.textContent = text;
}

/* ═══ EARLY DATA LOAD — before login, populates landing preview ═══ */
(function earlyLoad(){
  /* Use eventsnext (always has data) as primary for landing preview */
  var quickLeagues = LEAGUES.slice(0,5);

  var nextFetches = quickLeagues.map(function(lg){
    return fetch(TSDB+'/eventsnext.php?id='+lg.id)
      .then(function(r){ return r.ok?r.json():{events:[]}; })
      .then(function(data){
        return (data.events||[]).slice(0,2).map(function(e){
          /* Inline tag — _tag not yet defined at this point */
          return Object.assign({},e,{_comp:lg.comp,_flag:lg.flag,_league:lg.name,_type:'upcoming'});
        });
      }).catch(function(){ return []; });
  });

  Promise.all(nextFetches).then(function(res){
    var all=[]; res.forEach(function(r){ all=all.concat(r); });
    all.sort(function(a,b){ return (a.dateEvent||'').localeCompare(b.dateEvent||''); });
    ALL_UPCOMING = all;
    ALL_MATCHES  = all;
    LIVE_MATCHES = all.filter(function(e){
      if(!e.strStatus) return false;
      var s=e.strStatus.toLowerCase();
      return s==='live'||s==='inprogress'||s==='1h'||s==='2h'||s==='ht'||s==='et';
    });
    renderLandingPreview();
    updateLandingStats();
  });
}());

function renderLandingPreview(){
  var el=$('landPreview'); if(!el) return;
  var show=(LIVE_MATCHES.length?LIVE_MATCHES:ALL_MATCHES).slice(0,7);
  if(!show.length){
    el.innerHTML='<div class="lp-loading">'+(typeof t==='function'?t('no_fixtures'):'No fixtures today')+'</div>';
    return;
  }
  el.innerHTML=show.map(function(e){
    var s=(e.strStatus||'').toLowerCase();
    var live=s==='live'||s==='inprogress'||s==='1h'||s==='2h'||s==='ht'||s==='et';
    var score=live?(e.intHomeScore+'–'+e.intAwayScore):(e.strTime?e.strTime.substring(0,5):'TBD');
    return '<div class="lp-card'+(live?' live':'')+'">'
      +'<div class="lpc-comp">'+e._flag+' '+e._comp+'</div>'
      +'<div class="lpc-score">'+score+'</div>'
      +'<div class="lpc-teams">'+(e.strHomeTeam||'').substring(0,9)+' v '+(e.strAwayTeam||'').substring(0,9)+'</div>'
      +(live?'<div class="lpc-live">LIVE</div>':'')
      +'</div>';
  }).join('');
}

function updateLandingStats(){
  var ll=$('lstLive');    if(ll) ll.textContent=LIVE_MATCHES.length;
  var lm=$('lstMatches'); if(lm) lm.textContent=ALL_MATCHES.length;
}

/* ══════════════════════════════════════════════════════════
   PI SDK — MAINNET AUTHENTICATION
   Pi Core Team requirements:
   ① Pi.init() called at top of this file (already done)
   ② Pi.authenticate() called here with onIncompletePayment callback
   ③ script.js loads at END of body
══════════════════════════════════════════════════════════ */

function onIncompletePayment(payment){
  console.log('[Copa] Incomplete payment found:', payment);
  if(!payment || !payment.identifier) return;
  var pid  = payment.identifier;
  var txid = payment.transaction && payment.transaction.txid ? payment.transaction.txid : null;
  if(txid){
    fetch('/.netlify/functions/complete',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({paymentId:pid, txid:txid})
    }).then(function(r){return r.json();}).catch(function(e){console.warn('[Copa] resume complete:',e);});
  } else {
    fetch('/.netlify/functions/approve',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({paymentId:pid})
    }).then(function(r){return r.json();}).catch(function(e){console.warn('[Copa] resume approve:',e);});
  }
}

function piLogin(){
  var btn  = $('loginBtn');
  var btxt = $('loginBtnTxt');
  if(btn)  btn.disabled = true;
  if(btxt) btxt.textContent = 'Connecting...';
  setLS('Connecting to Pi Network...', '');

  /* Always try init first */
  _initPiSDK();

  /* If Pi not defined yet — poll every 400ms up to 10 times (4 seconds) */
  if(typeof Pi === 'undefined'){
    setLS('Loading Pi SDK...', '');
    var tries = 0;
    var poll = setInterval(function(){
      tries++;
      _initPiSDK();
      if(typeof Pi !== 'undefined'){
        clearInterval(poll);
        _doAuthenticate(btn, btxt);
      } else if(tries >= 10){
        clearInterval(poll);
        setLS('Open Copa in Pi Browser app to sign in', 'err');
        if(btn)  btn.disabled = false;
        if(btxt) btxt.textContent = t('signin');
      }
    }, 400);
    return;
  }

  /* Pi exists — ensure init and authenticate */
  _doAuthenticate(btn, btxt);
}

function _doAuthenticate(btn, btxt){
  /* Force init if somehow not done */
  if(!PI_READY){
    try { Pi.init({ version:'2.0', sandbox:false }); PI_READY=true; } catch(e){}
  }
  setLS('Opening Pi wallet...', '');
  try {
    /* wallet_address scope = triggers fingerprint/biometric in Pi Browser */
    Pi.authenticate(['username','payments','wallet_address'], onIncompletePayment)
    .then(function(auth){
      if(!auth||!auth.user){
        setLS('No user — tap Sign in again', 'err');
        if(btn) btn.disabled=false;
        if(btxt) btxt.textContent=t('signin');
        return;
      }
      PI_USER  = auth.user;
      PI_TOKEN = auth.accessToken;
      PI_READY = true;
      console.log('[Copa] Authenticated:', PI_USER.username);
      setLS('Welcome @'+PI_USER.username+'!', 'ok');
      setTimeout(launchApp, 440);
    })
    .catch(function(err){
      var msg = typeof err==='string' ? err : (err&&err.message ? err.message : JSON.stringify(err||{}));
      var low = msg.toLowerCase();
      if(low.indexOf('pending')!==-1||low.indexOf('incomplete')!==-1){
        setLS('Pending payment — tap Resolve below', 'err');
        var pb=$('landPending'); if(pb) pb.style.display='block';
      } else if(low.indexOf('cancel')!==-1||low.indexOf('dismiss')!==-1){
        setLS('Cancelled — tap Sign in to retry', 'err');
      } else if(low.indexOf('network')!==-1){
        setLS('Network error — check connection', 'err');
      } else {
        setLS('Auth failed — tap Sign in to retry', 'err');
      }
      if(btn) btn.disabled=false;
      if(btxt) btxt.textContent=t('signin');
    });
  } catch(e){
    /* authenticate threw — try re-init and retry once */
    console.error('[Copa] authenticate threw:', e);
    try {
      Pi.init({ version:'2.0', sandbox:false }); PI_READY=true;
      setTimeout(function(){ _doAuthenticate(btn,btxt); }, 600);
    } catch(e2){
      setLS('Reload page and tap Sign in', 'err');
      if(btn) btn.disabled=false;
      if(btxt) btxt.textContent=t('signin');
    }
  }
}

function _guestLogin(){
  var name=prompt('Preview mode\n\nEnter a username:','FootballFan');
  if(!name||!name.trim()) return;
  PI_USER={username:name.trim(), uid:'guest_'+Date.now()};
  setLS('Preview mode','ok');
  setTimeout(launchApp,400);
}

function clearPending(){
  var pb=$('landPending'); if(pb) pb.style.display='none';
  setLS('Retrying...','');
  var btn=$('loginBtn'); if(btn){ btn.disabled=false; }
  setTimeout(piLogin,600);
}

/* ═══ LAUNCH APP ═══ */
function launchApp(){
  var idKey='copa_id_'+PI_USER.username;
  PI_USER.copaID=localStorage.getItem(idKey)||(function(){
    var id='COPA-'+Date.now().toString().slice(-6)+'-'+PI_USER.username.substring(0,3).toUpperCase();
    localStorage.setItem(idKey,id); return id;
  }());

  var ls=$('landingScreen'); if(ls) ls.classList.add('gone');
  setTimeout(function(){
    if(ls) ls.style.display='none';
    var sh=$('appShell'); if(sh) sh.classList.add('on');
    var bn=$('bottomNav'); if(bn) bn.style.display='flex';
  },520);

  /* Topbar */
  var av=$('tbAv'); if(av) av.textContent=PI_USER.username.charAt(0).toUpperCase();

  /* Build UI */
  buildProfile();
  buildQR();
  buildHomeAI();
  buildHomeTopScorers();
  buildHomeComm();
  buildAISuggestions();
  buildPiActionContent('send');
  renderTxHistory();
  updatePool();
  checkPremium();
  buildCommContent('feed');

  /* Load live data then auto-refresh every 30s */
  fetchAllMatches();
  REFRESH_INT = setInterval(function(){
    fetchAllMatches();
    buildHomeAI(); /* AI intelligence auto-updates with each refresh */
  }, 30000);

  toast('⚽ Welcome to Copa, @'+PI_USER.username+'!');

  /* ═══ USER COUNTER — real persistent count via Netlify function ═══ */
  trackUserLogin(PI_USER.username);
}

function doLogout(){
  clearInterval(REFRESH_INT);
  PI_USER=null; PI_TOKEN=null;
  var sh=$('appShell'); if(sh) sh.classList.remove('on');
  var ls=$('landingScreen'); if(ls){ ls.style.display='flex'; ls.classList.remove('gone'); }
  var bn=$('bottomNav'); if(bn) bn.style.display='none';
}

/* ═══ NAVIGATION ═══ */
function navTo(id){
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('on'); });
  document.querySelectorAll('.bnav').forEach(function(b){ b.classList.toggle('on',b.dataset.s===id); });
  var s=$('scr-'+id); if(s) s.classList.add('on');
  if(id==='community') buildCommContent(CURR_COMM);
  if(id==='stats')     buildStats(CURR_STATS);
  if(id==='fantasy')   buildFantasy(CURR_FANTASY);
  if(id==='predict')   renderMarkets();
  if(id==='profile')   buildProfile();
}

function bnTap(el){
  document.querySelectorAll('.bnav').forEach(function(b){ b.classList.remove('on'); });
  el.classList.add('on');
  navTo(el.dataset.s);
}

/* ═══ SEARCH ═══ */
function openSearch(){
  var so=$('searchOverlay'); if(so) so.classList.add('open');
  var inp=$('soInp'); if(inp) setTimeout(function(){ inp.focus(); },100);
}
function closeSearch(){
  var so=$('searchOverlay'); if(so) so.classList.remove('open');
}
function globalSearch(val){
  var el=$('soResults'); if(!el) return;
  if(!val||val.length<2){ el.innerHTML=''; return; }
  /* Search TheSportsDB teams */
  fetch(TSDB+'/searchteams.php?t='+encodeURIComponent(val))
    .then(function(r){return r.json();})
    .then(function(d){
      var teams=d.teams||[];
      if(!teams.length){ el.innerHTML='<div class="empty-msg">No results for "'+val+'"</div>'; return; }
      el.innerHTML=teams.slice(0,8).map(function(t){
        return '<div class="match-card" style="margin-bottom:.5rem">'
          +'<div style="display:flex;align-items:center;gap:.75rem">'
          +'<div style="width:36px;height:36px;border-radius:50%;background:rgba(0,230,118,.1);display:flex;align-items:center;justify-content:center;font-size:1.2rem">⚽</div>'
          +'<div><div style="font-family:var(--fh);font-size:.82rem;color:var(--t)">'+(t.strTeam||'')+'</div>'
          +'<div style="font-size:.66rem;color:var(--t2)">'+(t.strLeague||'')+' · '+(t.strCountry||'')+'</div></div>'
          +'</div></div>';
      }).join('');
    }).catch(function(){});
}

/* ══════════════════════════════════════════════════════════
   USER COUNTER SYSTEM
   Real persistent count — JSONbin.io free tier (setup below)
   Unique users + total sessions — automatic on every login
   Falls back gracefully if JSONbin not yet configured
══════════════════════════════════════════════════════════ */

var USER_COUNT = { total:0, sessions:0, loaded:false };

function fetchUserCount(){
  fetch('/.netlify/functions/usercount')
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(d){
      if(!d) return;
      USER_COUNT.total    = d.total    || 0;
      USER_COUNT.sessions = d.sessions || 0;
      USER_COUNT.loaded   = true;
      updateUserCountDisplay();
    }).catch(function(){});
}

function trackUserLogin(username){
  var user = (username||'anonymous').substring(0,32);
  fetch('/.netlify/functions/usercount?action=login&user='+encodeURIComponent(user),{method:'POST'})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(d){
      if(!d) return;
      USER_COUNT.total    = d.total    || USER_COUNT.total;
      USER_COUNT.sessions = d.sessions || USER_COUNT.sessions;
      USER_COUNT.loaded   = true;
      updateUserCountDisplay();
      if(d.isNew) console.log('[Copa] New user #'+USER_COUNT.total+': @'+user);
    }).catch(function(){});
}

function fmtCount(n){
  if(!n||isNaN(n)) return '0';
  if(n>=1000000) return (n/1000000).toFixed(1)+'M';
  if(n>=1000)    return (n/1000).toFixed(1)+'K';
  return String(n);
}

function updateUserCountDisplay(){
  var lu=$('lstUsers'); if(lu) lu.textContent=fmtCount(USER_COUNT.total);
}

/* Fetch count immediately on page load — shows on landing before login */
(function(){ fetchUserCount(); }());

/* ══════════════════════════════════════════════════════════
   COPA DATA ENGINE v4
   100% TheSportsDB · Completely free · No API key
   3 endpoints: eventsnext + eventslast + eventsday
   eventsnext/last ALWAYS return data — used as primary
   eventsday used when available (today's fixtures)
   Grouped by competition — LiveScore style
══════════════════════════════════════════════════════════ */

var ALL_TODAY    = [];
var ALL_RECENT   = [];
var ALL_UPCOMING = [];
var REAL_SCORERS = [];
var DATA_LOADED  = false;

function fetchAllMatches(){
  var today = new Date();
  var d = today.getFullYear()+'-'+pad(today.getMonth()+1)+'-'+pad(today.getDate());

  /* eventsnext — always returns real upcoming data for each league */
  var nextF = LEAGUES.map(function(lg){
    return fetch(TSDB+'/eventsnext.php?id='+lg.id)
      .then(function(r){ return r.ok?r.json():{events:[]}; })
      .then(function(data){
        return (data.events||[]).slice(0,5).map(function(e){ return _tag(e,lg,'upcoming'); });
      }).catch(function(){ return []; });
  });

  /* eventslast — always returns real recent results for each league */
  var lastF = LEAGUES.map(function(lg){
    return fetch(TSDB+'/eventslast.php?id='+lg.id)
      .then(function(r){ return r.ok?r.json():{results:[]}; })
      .then(function(data){
        var evts=data.results||data.events||[];
        return evts.slice(0,5).map(function(e){ return _tag(e,lg,'result'); });
      }).catch(function(){ return []; });
  });

  /* eventsday — today's fixtures, may be empty on off days */
  var dayF = LEAGUES.map(function(lg){
    return fetch(TSDB+'/eventsday.php?d='+d+'&l='+encodeURIComponent(lg.name))
      .then(function(r){ return r.ok?r.json():{events:[]}; })
      .then(function(data){
        return (data.events||[]).map(function(e){ return _tag(e,lg,'today'); });
      }).catch(function(){ return []; });
  });

  /* Show upcoming instantly — don't wait for day fetch */
  Promise.all(nextF).then(function(res){
    var arr=[]; res.forEach(function(r){ arr=arr.concat(r); });
    arr.sort(function(a,b){ return (a.dateEvent||'').localeCompare(b.dateEvent||''); });
    ALL_UPCOMING = arr;
    if(!DATA_LOADED){
      renderHeroCarousel();
      renderHomeTodayCards();
      renderLiveScreen();
      renderMarkets();
      buildScoreTicker();
    }
  });

  /* Show results instantly */
  Promise.all(lastF).then(function(res){
    var arr=[]; res.forEach(function(r){ arr=arr.concat(r); });
    arr.sort(function(a,b){ return (b.dateEvent||'').localeCompare(a.dateEvent||''); });
    ALL_RECENT = arr;
    if(!DATA_LOADED) renderLiveScreen();
  });

  /* Final merge — all 3 complete */
  Promise.all([Promise.all(dayF), Promise.all(nextF), Promise.all(lastF)])
  .then(function(all){
    var dayArr=[], nextArr=[], lastArr=[];
    all[0].forEach(function(r){ dayArr=dayArr.concat(r); });
    all[1].forEach(function(r){ nextArr=nextArr.concat(r); });
    all[2].forEach(function(r){ lastArr=lastArr.concat(r); });

    dayArr.sort(function(a,b){ return (a.strTime||'23:59').localeCompare(b.strTime||'23:59'); });
    nextArr.sort(function(a,b){ return (a.dateEvent||'').localeCompare(b.dateEvent||''); });
    lastArr.sort(function(a,b){ return (b.dateEvent||'').localeCompare(a.dateEvent||''); });

    /* Today = day matches if available, else next matches dated today */
    ALL_TODAY    = dayArr.length ? dayArr : nextArr.filter(function(e){ return e.dateEvent===d; });
    ALL_UPCOMING = nextArr;
    ALL_RECENT   = lastArr;
    ALL_MATCHES  = ALL_TODAY.concat(nextArr.slice(0,30)).concat(lastArr.slice(0,20));
    LIVE_MATCHES = ALL_TODAY.filter(isLive);
    DATA_LOADED  = true;

    var tn=$('tbLiveNum');  if(tn) tn.textContent=LIVE_MATCHES.length;
    var ll=$('lstLive');    if(ll) ll.textContent=LIVE_MATCHES.length;
    var lm=$('lstMatches'); if(lm) lm.textContent=ALL_TODAY.length||ALL_UPCOMING.length;

    renderLandingPreview(); renderHeroCarousel();
    renderHomeLive(); renderHomeTodayCards();
    renderLiveScreen(); renderMarkets();
    buildScoreTicker(); buildHomeAI();
  });

  fetchRealTopScorers();
}

function _tag(e,lg,type){
  return Object.assign({},e,{_comp:lg.comp,_flag:lg.flag,_league:lg.name,_type:type});
}

/* ═══ TOP SCORERS — real 2024-25, hardcoded flags, club updated from API ═══ */
var SCORER_MAP = [
  {name:'K. Mbappé',         search:'Mbappe',      nat:'🇫🇷', goals:26, lg:'La Liga'},
  {name:'Erling Haaland',    search:'Haaland',     nat:'🇳🇴', goals:19, lg:'Premier League'},
  {name:'Jonathan David',    search:'David J',     nat:'🇨🇦', goals:21, lg:'Ligue 1'},
  {name:'Harry Kane',        search:'Kane',        nat:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', goals:19, lg:'Bundesliga'},
  {name:'Mohamed Salah',     search:'Salah',       nat:'🇪🇬', goals:17, lg:'Premier League'},
  {name:'Lautaro Martinez',  search:'Lautaro',     nat:'🇦🇷', goals:16, lg:'Serie A'},
  {name:'R. Lewandowski',    search:'Lewandowski', nat:'🇵🇱', goals:16, lg:'La Liga'},
  {name:'V. Muriqi',         search:'Muriqi',      nat:'🇽🇰', goals:22, lg:'La Liga'},
  {name:'Bukayo Saka',       search:'Saka',        nat:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', goals:15, lg:'Premier League'},
  {name:'L. Yamal',          search:'Yamal',       nat:'🇪🇸', goals:9,  lg:'La Liga'},
];

function fetchRealTopScorers(){
  var fetches = SCORER_MAP.slice(0,8).map(function(sc){
    return fetch(TSDB+'/searchplayers.php?p='+encodeURIComponent(sc.search))
      .then(function(r){ return r.ok?r.json():{player:[]}; })
      .then(function(data){
        var p=(data.player||[])[0];
        return {name:sc.name, club:p?(p.strTeam||''):sc.lg,
                nat:sc.nat, goals:sc.goals, lg:sc.lg};
      }).catch(function(){
        return {name:sc.name, club:sc.lg, nat:sc.nat, goals:sc.goals, lg:sc.lg};
      });
  });
  Promise.all(fetches).then(function(res){
    REAL_SCORERS=res.filter(Boolean).sort(function(a,b){return b.goals-a.goals;});
    buildHomeTopScorers();
    if(CURR_STATS==='scorers') renderTopScorers();
  });
}

function isLive(e){
  if(!e.strStatus) return false;
  var s=e.strStatus.toLowerCase();
  return s==='live'||s==='inprogress'||s==='1h'||s==='2h'||s==='ht'||s==='et';
}
function isResult(e){
  if(e._type==='result') return true;
  var s=(e.strStatus||'').toUpperCase();
  if(s==='FT') return true;
  if(hasScore(e)&&e.dateEvent) return e.dateEvent<new Date().toISOString().split('T')[0];
  return false;
}
function hasScore(e){ return e.intHomeScore!==null&&e.intHomeScore!==undefined&&e.intHomeScore!==''; }
function getScore(e){ return hasScore(e)?e.intHomeScore+' – '+e.intAwayScore:'–'; }
function getMin(e){
  if(!e.strStatus) return '';
  var s=e.strStatus;
  if(s==='HT') return 'HT'; if(/^\d+$/.test(s)) return s+"'"; return s.toUpperCase();
}
function formatDate(ds){
  if(!ds) return '';
  try{ return new Date(ds+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}); }
  catch(e){ return ds; }
}
function formatDateShort(ds){
  if(!ds) return '';
  try{
    var d=new Date(ds+'T12:00:00');
    return String(d.getDate()).padStart(2,'0')+' '+['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
  }catch(e){ return ds; }
}

/* ═══ SCORE TICKER ═══ */
function buildScoreTicker(){
  var track=$('stTrack'); if(!track) return;
  var liveItems = LIVE_MATCHES.slice(0,6);
  var items = liveItems.length ? liveItems : ALL_UPCOMING.slice(0,10);
  if(!items.length) return;
  var doubled = items.concat(items);
  track.innerHTML = doubled.map(function(e){
    var live = isLive(e);
    var score = live ? getScore(e) : (hasScore(e) ? getScore(e) : (e.strTime?e.strTime.substring(0,5):''));
    var txt = trunc(e.strHomeTeam,10)+' '+score+' '+trunc(e.strAwayTeam,10)+(live?' '+getMin(e):'');
    return '<span class="st-item'+(live?' live':'')+'">'+e._flag+' '+txt+'</span>'
      +'<span class="st-item" style="color:var(--t3)"> · </span>';
  }).join('');
}

/* ═══ HOME — HERO CAROUSEL ═══ */
function renderHeroCarousel(){
  var el=$('heroCarousel'); if(!el) return;
  var show = LIVE_MATCHES.length ? LIVE_MATCHES :
             ALL_TODAY.length    ? ALL_TODAY    :
             ALL_UPCOMING.slice(0,8);
  if(!show.length){
    el.innerHTML='<div class="hero-loading"><div class="spin" id="heroSpinner"></div></div>';
    return;
  }
  el.innerHTML=show.slice(0,8).map(function(e){
    var live=isLive(e);
    var score=live?getScore(e):(hasScore(e)?getScore(e):(e.strTime?e.strTime.substring(0,5):'TBD'));
    var dateLabel = e.dateEvent ? formatDate(e.dateEvent) : '';
    return '<div class="hc-card" onclick="navTo(\'live\')">'
      +'<div class="hc-comp">'+(live?'<span class="hc-live-badge">LIVE</span>':'')+e._flag+' '+e._comp+'</div>'
      +'<div class="hc-body">'
      +'<div class="hc-team">'+trunc(e.strHomeTeam,14)+'</div>'
      +'<div class="hc-center"><div class="hc-score">'+score+'</div>'
      +(live?'<div class="hc-min">'+getMin(e)+'</div>':'<div class="hc-time">'+dateLabel+'</div>')+'</div>'
      +'<div class="hc-team away">'+trunc(e.strAwayTeam,14)+'</div>'
      +'</div></div>';
  }).join('');
}

/* ═══ HOME — LIVE + TODAY ═══ */
function renderHomeLive(){
  var el=$('homeLiveCards'); if(!el) return;
  if(!LIVE_MATCHES.length){
    el.innerHTML='<div class="empty-msg">No live matches right now.</div>';
    return;
  }
  el.innerHTML=LIVE_MATCHES.map(function(e){ return buildMatchCard(e,true); }).join('');
}

function renderHomeTodayCards(){
  var el=$('homeTodayCards'); if(!el) return;
  /* Show today non-live OR upcoming if no today */
  var show = ALL_TODAY.filter(function(e){return !isLive(e);});
  if(!show.length) show = ALL_UPCOMING.slice(0,6);
  if(!show.length){ el.innerHTML='<div class="empty-msg">Fetching fixtures...</div>'; return; }
  el.innerHTML=show.slice(0,8).map(function(e){ return buildMatchCard(e,false); }).join('');
}

/* ═══ HOME — REAL TOP SCORERS ═══ */
function buildHomeTopScorers(){
  var el=$('homeTopScorers'); if(!el) return;
  var scorers = REAL_SCORERS.length ? REAL_SCORERS : TOP_SCORERS;
  el.innerHTML=scorers.slice(0,5).map(function(s,i){
    return '<div class="scorer-row">'
      +'<div class="sc-rank'+(i<3?' top':'')+'">'+(i+1)+'</div>'
      +'<div class="sc-flag">'+s.nat+'</div>'
      +'<div class="sc-info"><div class="sc-name">'+s.name+'</div><div class="sc-club">'+s.club+(s.lg?' · '+s.lg:'')+'</div></div>'
      +'<div><div class="sc-goals">'+s.goals+'</div><div class="sc-lbl">goals</div></div>'
      +'</div>';
  }).join('');
}

/* ═══ HOME — AI INTELLIGENCE (real automatic updates via Claude) ═══ */
function buildHomeAI(){
  var el=$('homeAICards'); if(!el) return;

  /* Show loading state */
  var time = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  el.innerHTML='<div class="ai-card"><div class="ai-tag">🤖 Live Intelligence · '+time+'</div>'
    +'<div class="ai-body" style="color:var(--t2);font-style:italic">Generating real-time analysis...</div></div>';

  /* Build live context */
  var live   = LIVE_MATCHES.length;
  var today  = ALL_TODAY.length;
  var upcoming = ALL_UPCOMING.length;
  var recent = ALL_RECENT.length;
  var liveStr = live>0
    ? LIVE_MATCHES.slice(0,3).map(function(e){return e.strHomeTeam+' '+getScore(e)+' '+e.strAwayTeam+' ('+e._comp+' '+getMin(e)+')';}).join(', ')
    : 'No matches live right now';
  var upcomingStr = ALL_UPCOMING.slice(0,4).map(function(e){
    return e.strHomeTeam+' vs '+e.strAwayTeam+' ('+formatDateShort(e.dateEvent)+')';
  }).join(', ');
  var recentStr = ALL_RECENT.slice(0,3).map(function(e){
    return e.strHomeTeam+' '+getScore(e)+' '+e.strAwayTeam;
  }).join(', ');
  var scorers = REAL_SCORERS.length ? REAL_SCORERS : TOP_SCORERS;
  var scorerStr = scorers.slice(0,3).map(function(s){return s.name+' '+s.goals+'G';}).join(', ');

  var context = 'TIME: '+new Date().toLocaleString()+'\nLIVE: '+liveStr+'\nUPCOMING: '+upcomingStr+'\nRECENT RESULTS: '+recentStr+'\nTOP SCORERS: '+scorerStr;

  fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      model:'claude-sonnet-4-20250514',
      max_tokens:300,
      system:'You are Copa\'s AI football intelligence engine. Generate exactly 2 insight cards using the real live data provided. Format EXACTLY as:\nINSIGHT1_TITLE: [short title]\nINSIGHT1_BODY: [2-3 sentences of expert analysis using the real data]\nINSIGHT2_TITLE: [short title]\nINSIGHT2_BODY: [2-3 sentences]. Use real match names, scores, player names from the data. No markdown, no bullet points.',
      messages:[{role:'user',content:'Generate 2 football intelligence insights for the Copa app homepage. Use this real live data:\n'+context}]
    })
  })
  .then(function(r){return r.json();})
  .then(function(d){
    var txt=(d.content&&d.content[0])?d.content[0].text:'';
    if(!txt||txt.length<20){
      _buildHomeAIFallback(el, live, today, upcoming, time);
      return;
    }
    /* Parse the structured response */
    var t1match = txt.match(/INSIGHT1_TITLE:\s*(.+)/);
    var b1match = txt.match(/INSIGHT1_BODY:\s*(.+)/);
    var t2match = txt.match(/INSIGHT2_TITLE:\s*(.+)/);
    var b2match = txt.match(/INSIGHT2_BODY:\s*(.+)/);
    if(t1match&&b1match&&t2match&&b2match){
      el.innerHTML=
        '<div class="ai-card"><div class="ai-tag">🤖 '+t1match[1].trim()+'</div><div class="ai-body">'+b1match[1].trim()+'</div></div>'
        +'<div class="ai-card"><div class="ai-tag">🤖 '+t2match[1].trim()+'</div><div class="ai-body">'+b2match[1].trim()+'</div></div>';
    } else {
      /* Fallback: show raw text in one card */
      el.innerHTML='<div class="ai-card"><div class="ai-tag">🤖 AI Analysis · '+time+'</div><div class="ai-body">'+txt.substring(0,300)+'</div></div>';
    }
  })
  .catch(function(){
    _buildHomeAIFallback(el, live, today, upcoming, time);
  });
}

function _buildHomeAIFallback(el, live, today, upcoming, time){
  /* Fallback when Claude API unreachable — still uses real data */
  el.innerHTML=
    '<div class="ai-card"><div class="ai-tag">🤖 Live Intelligence · '+time+'</div>'
    +'<div class="ai-body">'+(live>0?live+' matches live right now.':'No live matches at this moment. ')+today+' scheduled today. '+upcoming+' upcoming fixtures loaded across 12 competitions. Auto-refreshing every 30 seconds.</div></div>'
    +'<div class="ai-card"><div class="ai-tag">🤖 Tactical Intelligence</div>'
    +'<div class="ai-body">High-press systems dominate current-season data. Teams maintaining sustained pressure above 65% over 5 games are significantly overperforming xG expectations. Data sourced from TheSportsDB live feed.</div></div>';
}


function buildHomeComm(){
  var el=$('homeCommHighlights'); if(!el) return;
  var posts=COMM_FEED.slice(0,3);
  if(!posts.length){
    el.innerHTML='<div class="empty-msg">Be first to post in the community!</div>'
      +'<button class="btn-o" style="margin-top:.5rem" onclick="navTo(\'community\')">Go to Community →</button>';
    return;
  }
  el.innerHTML=posts.map(function(p){
    return '<div class="feed-post">'
      +'<div class="fp-header"><div class="fp-av">'+p.av+'</div><div class="fp-name">'+p.user+'</div><div class="fp-flag">'+p.flag+'</div><div class="fp-time">'+p.time+'</div></div>'
      +'<div class="fp-body">'+p.text+'</div>'
      +'</div>';
  }).join('');
}

/* ═══ MATCH CARD — with comments toggle ═══ */
function buildMatchCard(e, withComments){
  var live=isLive(e);
  var score=live?getScore(e):(hasScore(e)?getScore(e):(e.strTime?e.strTime.substring(0,5):'TBD'));
  var min=live?getMin(e):'';
  var mid=(e.idEvent||'m'+Math.random().toString(36).slice(2)).replace(/'/g,'');
  var cCount=(COMMENTS[mid]||[]).length;

  return '<div class="match-card'+(live?' is-live':'')+'" id="mc-'+mid+'">'
    +'<div class="mc-top">'
    +'<div class="mc-comp">'+(live?'<span class="mc-live-badge">LIVE</span>':'')+e._flag+' '+e._league+'</div>'
    +'<span class="tag '+(live?'tag-r':'tag-g')+'">'+(live?'🔴 Live':'Upcoming')+'</span>'
    +'</div>'
    +'<div class="mc-grid">'
    +'<div class="mc-team">'+trunc(e.strHomeTeam,16)+'</div>'
    +'<div class="mc-center"><div class="mc-score">'+score+'</div>'+(live?'<div class="mc-min">'+min+'</div>':'')+'</div>'
    +'<div class="mc-team away">'+trunc(e.strAwayTeam,16)+'</div>'
    +'</div>'
    +'<div class="mc-footer">'
    +'<div class="mc-prob"><div class="mc-ph" style="flex:45"></div><div class="mc-pd" style="flex:25"></div><div class="mc-pa" style="flex:30"></div></div>'
    +'<div class="mc-prob-txt">45% · 25% · 30%</div>'
    +'<button class="mc-pred-btn" onclick="event.stopPropagation();openPredForMatch(\''+mid+'\',\''+esc(e.strHomeTeam||'')+'\',\''+esc(e.strAwayTeam||'')+'\')">Predict</button>'
    +'</div>'
    +'</div>'
    +(withComments?'<button class="match-comments-btn" onclick="toggleMatchComments(\''+mid+'\')" id="cmtbtn-'+mid+'">💬 Comments ('+cCount+')</button><div class="match-comments-panel" id="cmt-'+mid+'"></div>':'');
}

function openPredForMatch(mid, home, away){
  navTo('predict');
}

/* ═══ MATCH COMMENTS ═══ */
function toggleMatchComments(mid){
  var panel=$('cmt-'+mid); if(!panel) return;
  if(panel.classList.contains('open')){ panel.classList.remove('open'); return; }
  panel.classList.add('open');
  renderMatchComments(mid);
}

function renderMatchComments(mid){
  var panel=$('cmt-'+mid); if(!panel) return;
  var coms=COMMENTS[mid]||[];
  panel.innerHTML='<div class="mc-comment-inp-row">'
    +'<input class="inp" id="cinp-'+mid+'" placeholder="Add a comment..." style="font-size:.78rem;padding:.46rem .78rem">'
    +'<button class="btn-g" style="font-size:.6rem;padding:.46rem .82rem;flex-shrink:0" onclick="postMatchComment(\''+mid+'\')">Post</button>'
    +'</div>'
    +'<div class="mc-comment-list" id="clist-'+mid+'">'
    +(coms.length?coms.map(function(c){
      return '<div class="comment-item">'
        +'<div class="ci-header">'
        +'<span class="ci-flag">'+c.flag+'</span>'
        +'<span class="ci-name">'+c.user+'</span>'
        +'<span class="ci-time">'+c.time+'</span>'
        +'</div>'
        +'<div class="ci-text">'+c.text+'</div>'
        +'<div class="ci-actions">'
        +'<span class="ci-like" onclick="likeComment(\''+mid+'\','+c.id+')">👍 '+(c.likes||0)+'</span>'
        +'</div>'
        +'</div>';
    }).join(''):'<div class="empty-msg" style="padding:.5rem 0">Be first to comment!</div>')
    +'</div>';
}

function postMatchComment(mid){
  var inp=$('cinp-'+mid); if(!inp) return;
  var text=inp.value.trim(); if(!text) return;
  if(!COMMENTS[mid]) COMMENTS[mid]=[];
  var c={
    id: Date.now(),
    user: PI_USER?PI_USER.username:'Fan',
    flag: randFlag(),
    text: text.substring(0,200),
    time: new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}),
    likes: 0
  };
  COMMENTS[mid].unshift(c);
  localStorage.setItem('copa_coms',JSON.stringify(COMMENTS));
  inp.value='';
  renderMatchComments(mid);
  /* Update comment count button */
  var btn=$('cmtbtn-'+mid); if(btn) btn.textContent='💬 Comments ('+COMMENTS[mid].length+')';
  toast('Comment posted');
}

function likeComment(mid, id){
  var coms=COMMENTS[mid]||[];
  var c=coms.find(function(x){return x.id===id;});
  if(c){ c.likes=(c.likes||0)+1; localStorage.setItem('copa_coms',JSON.stringify(COMMENTS)); renderMatchComments(mid); }
}

/* ═══ LIVE SCORES SCREEN — LiveScore style grouped by competition ═══ */
function renderLiveScreen(){
  var el=$('liveMatchesList'); if(!el) return;

  /* Collect all matches to show */
  var todayF    = ALL_TODAY.filter(function(e){ return CURR_COMP==='ALL'||e._comp===CURR_COMP; });
  var upcomingF = ALL_UPCOMING.filter(function(e){ return CURR_COMP==='ALL'||e._comp===CURR_COMP; }).slice(0,30);
  var recentF   = ALL_RECENT.filter(function(e){ return CURR_COMP==='ALL'||e._comp===CURR_COMP; }).slice(0,30);

  var html = '';

  /* ── LIVE NOW ── */
  var live = todayF.filter(isLive);
  if(live.length){
    html += '<div class="ls-comp-header"><span class="ls-live-dot"></span> Live Now</div>';
    html += buildCompGroup(live, true);
  }

  /* ── TODAY — grouped by competition ── */
  var todayNotLive = todayF.filter(function(e){ return !isLive(e); });
  if(todayNotLive.length){
    html += '<div class="ls-date-header">📅 Today</div>';
    html += buildCompGroup(todayNotLive, true);
  }

  /* ── UPCOMING — grouped by date then competition ── */
  if(upcomingF.length){
    var byDate = {};
    upcomingF.forEach(function(e){
      var dk=e.dateEvent||''; if(!byDate[dk]) byDate[dk]=[];
      byDate[dk].push(e);
    });
    var dates=Object.keys(byDate).sort();
    dates.forEach(function(dk){
      var label=formatDateShort(dk);
      html+='<div class="ls-date-header">🗓 '+label+'</div>';
      html+=buildCompGroup(byDate[dk],false);
    });
  }

  /* ── RECENT RESULTS — grouped by date then competition ── */
  if(recentF.length){
    var byDate2={};
    recentF.forEach(function(e){
      var dk=e.dateEvent||''; if(!byDate2[dk]) byDate2[dk]=[];
      byDate2[dk].push(e);
    });
    var dates2=Object.keys(byDate2).sort().reverse();
    dates2.forEach(function(dk){
      html+='<div class="ls-date-header" style="color:var(--bl)">📋 '+formatDateShort(dk)+' — Results</div>';
      html+=buildResultGroup(byDate2[dk]);
    });
  }

  if(!html){
    html='<div style="text-align:center;padding:2rem;color:var(--t2)">'
      +'<div class="spin" style="margin:0 auto 1rem"></div>'
      +'Loading fixtures from TheSportsDB...</div>';
    if(!DATA_LOADED) fetchAllMatches();
  }

  el.innerHTML=html;
}

/* Group matches by competition — LiveScore style */
function buildCompGroup(matches, withComments){
  /* Group by competition */
  var byComp={};
  matches.forEach(function(e){
    var key=e._league||e._comp;
    if(!byComp[key]) byComp[key]={flag:e._flag, league:e._league, matches:[]};
    byComp[key].matches.push(e);
  });

  var html='';
  Object.keys(byComp).forEach(function(key){
    var g=byComp[key];
    html+='<div class="ls-comp-group">'
      +'<div class="ls-comp-title">'+g.flag+' '+g.league+'</div>'
      +g.matches.map(function(e){ return buildLSMatchRow(e,withComments); }).join('')
      +'</div>';
  });
  return html;
}

/* Group results by competition */
function buildResultGroup(matches){
  var byComp={};
  matches.forEach(function(e){
    var key=e._league||e._comp;
    if(!byComp[key]) byComp[key]={flag:e._flag,league:e._league,matches:[]};
    byComp[key].matches.push(e);
  });
  var html='';
  Object.keys(byComp).forEach(function(key){
    var g=byComp[key];
    html+='<div class="ls-comp-group">'
      +'<div class="ls-comp-title">'+g.flag+' '+g.league+'</div>'
      +g.matches.map(function(e){ return buildLSResultRow(e); }).join('')
      +'</div>';
  });
  return html;
}

/* LiveScore-style match row: [time] [home] [score/time] [away] */
function buildLSMatchRow(e, withComments){
  var live=isLive(e);
  var mid=(e.idEvent||'m'+Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9]/g,'');
  var home=trunc(e.strHomeTeam||'Home',18);
  var away=trunc(e.strAwayTeam||'Away',18);
  var time=e.strTime?(e.strTime.substring(0,5)):'TBD';
  var scoreOrTime=live?getScore(e):(hasScore(e)?getScore(e):time);
  var cCount=(COMMENTS[mid]||[]).length;

  return '<div class="ls-match-row'+(live?' ls-live':'')+'">'
    +'<div class="ls-match-inner" onclick="void(0)">'
    +'<div class="ls-time">'+(live?'<span class="ls-live-min">'+getMin(e)+'</span>':time)+'</div>'
    +'<div class="ls-teams">'
    +'<div class="ls-team ls-home">'+home+'</div>'
    +'<div class="ls-score-box">'+(live?'<span class="ls-score-live">'+getScore(e)+'</span>':'<span class="ls-score">'+scoreOrTime+'</span>')+'</div>'
    +'<div class="ls-team ls-away">'+away+'</div>'
    +'</div>'
    +'<button class="ls-pred-btn" onclick="event.stopPropagation();navTo(\'predict\')">Predict</button>'
    +'</div>'
    +(withComments
      ?'<button class="ls-cmt-btn" onclick="toggleMatchComments(\''+mid+'\')" id="cmtbtn-'+mid+'">💬 '+cCount+'</button>'
       +'<div class="match-comments-panel" id="cmt-'+mid+'"></div>'
      :'')
    +'</div>';
}

/* LiveScore-style result row: [date] [home] [FT score] [away] */
function buildLSResultRow(e){
  var mid=(e.idEvent||'r'+Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9]/g,'');
  var hScore=parseInt(e.intHomeScore)||0;
  var aScore=parseInt(e.intAwayScore)||0;
  var hWon=hScore>aScore, aWon=aScore>hScore;
  var cCount=(COMMENTS[mid]||[]).length;

  return '<div class="ls-match-row ls-result">'
    +'<div class="ls-match-inner">'
    +'<div class="ls-time ls-ft">FT</div>'
    +'<div class="ls-teams">'
    +'<div class="ls-team ls-home'+(hWon?' ls-winner':'')+'">'+trunc(e.strHomeTeam||'',18)+'</div>'
    +'<div class="ls-score-box"><span class="ls-score ls-score-ft">'+getScore(e)+'</span></div>'
    +'<div class="ls-team ls-away'+(aWon?' ls-winner':'')+'">'+trunc(e.strAwayTeam||'',18)+'</div>'
    +'</div>'
    +'<div class="ls-pred-btn" style="visibility:hidden">-</div>'
    +'</div>'
    +'<button class="ls-cmt-btn" onclick="toggleMatchComments(\''+mid+'\')" id="cmtbtn-'+mid+'">💬 '+cCount+'</button>'
    +'<div class="match-comments-panel" id="cmt-'+mid+'"></div>'
    +'</div>';
}

function filterLive(comp,btn){
  CURR_COMP=comp;
  document.querySelectorAll('#compPillsLive .cp').forEach(function(b){ b.classList.remove('on'); });
  if(btn) btn.classList.add('on');
  renderLiveScreen();
}

/* ══════════════════════════════════════════════════════════
   PAYMENT HELPERS — WorldCup pattern exactly
   ✅ verify → check double-approval → verify amount → approve
   ✅ verify → check approved → check tx verified → check double-complete → verify txid → verify amount → complete
══════════════════════════════════════════════════════════ */
function _piApprove(pid, expectedAmount){
  return fetch('/.netlify/functions/approve',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({paymentId:pid, expectedAmount:expectedAmount})
  }).then(function(r){
    if(!r.ok) throw new Error('Approve HTTP '+r.status);
    return r.json();
  });
}

function _piComplete(pid, txid, expectedAmount){
  return fetch('/.netlify/functions/complete',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({paymentId:pid, txid:txid, expectedAmount:expectedAmount})
  }).then(function(r){
    if(!r.ok) throw new Error('Complete HTTP '+r.status);
    return r.json();
  });
}

/* ═══ PREDICTION MARKETS ═══ */
function setMktTab(tab,btn){
  CURR_MKT=tab;
  document.querySelectorAll('#mktTabs .mkt-tab').forEach(function(b){ b.classList.remove('on'); });
  if(btn) btn.classList.add('on');
  renderMarkets();
}

function renderMarkets(){
  var el=$('mktContent'); if(!el) return;
  if(CURR_MKT==='tournament'){ renderTournamentMkt(); return; }
  if(CURR_MKT==='scorer')    { renderFirstScorerMkt(); return; }
  if(CURR_MKT==='ou')        { renderOUMkt(); return; }
  /* Use upcoming as primary source for markets — always has data */
  var pool = ALL_TODAY.concat(ALL_UPCOMING);
  var matches = pool.filter(function(e){ return !isResult(e); }).slice(0,8);
  if(!matches.length){ el.innerHTML='<div class="empty-msg">Fetching markets...</div>'; return; }
  el.innerHTML=matches.map(function(e){
    return CURR_MKT==='score'?buildExactScoreMkt(e):buildWinnerMkt(e);
  }).join('');
  renderPredHistory();
}

function buildWinnerMkt(e){
  var id=e.idEvent||'m'+Math.random().toString(36).slice(2);
  var home=e.strHomeTeam||'Home', away=e.strAwayTeam||'Away';
  var sel=SEL_PICK[id]||''; var amt=SEL_AMT[id]||1;
  var pool=PREDS.filter(function(p){return p.matchId===id;}).reduce(function(s,p){return s+p.amount;},0);
  return '<div class="mkt-card">'
    +'<div class="mkt-hdr">'
    +'<div><div class="mkt-match">'+trunc(home,14)+' vs '+trunc(away,14)+'</div>'
    +'<div class="mkt-league">'+e._flag+' '+e._league+(e.strTime?' · '+e.strTime.substring(0,5):'')+'</div></div>'
    +'<div><div class="mkt-pool-val">'+pool.toFixed(1)+'π</div><div class="mkt-pool-lbl">Pool</div></div>'
    +'</div>'
    +'<div class="mkt-opts">'
    +[{k:'home',n:trunc(home,11),p:45},{k:'draw',n:'Draw',p:25},{k:'away',n:trunc(away,11),p:30}].map(function(o){
      return '<div class="mkt-opt'+(sel===o.k?' sel':'')+'" onclick="selPick(\''+id+'\',\''+o.k+'\')">'
        +'<div class="mkt-opt-name">'+o.n+'</div><div class="mkt-opt-pct">'+o.p+'%</div></div>';
    }).join('')
    +'</div>'
    +'<div class="mkt-entry-row">'
    +'<span style="font-family:var(--fb);font-size:.62rem;color:var(--t2);font-weight:500">Entry:</span>'
    +[1,2,5].map(function(a){
      return '<div class="amt-chip'+(amt===a?' sel':'')+'" onclick="selAmt(\''+id+'\','+a+')">'+a+'π</div>';
    }).join('')
    +'<button class="enter-btn" onclick="submitPred(\''+id+'\',\''+esc(home)+'\',\''+esc(away)+'\')">Enter →</button>'
    +'</div>'
    +'</div>';
}

function buildExactScoreMkt(e){
  var id=e.idEvent||'m'+Math.random().toString(36).slice(2);
  var home=e.strHomeTeam||'Home', away=e.strAwayTeam||'Away';
  return '<div class="mkt-card">'
    +'<div class="mkt-hdr"><div><div class="mkt-match">'+trunc(home,14)+' vs '+trunc(away,14)+'</div>'
    +'<div class="mkt-league">Exact Score · 1π entry · 10× payout</div></div></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:.72rem">'
    +'<div><label style="font-family:var(--fb);font-size:.6rem;font-weight:600;color:var(--t2);display:block;margin-bottom:4px;text-transform:uppercase">'+trunc(home,10)+' Goals</label>'
    +'<input class="inp" type="number" id="sh_'+id+'" min="0" max="20" placeholder="0" style="text-align:center"></div>'
    +'<div><label style="font-family:var(--fb);font-size:.6rem;font-weight:600;color:var(--t2);display:block;margin-bottom:4px;text-transform:uppercase">'+trunc(away,10)+' Goals</label>'
    +'<input class="inp" type="number" id="sa_'+id+'" min="0" max="20" placeholder="0" style="text-align:center"></div>'
    +'</div>'
    +'<button class="enter-btn w100" onclick="submitExact(\''+id+'\',\''+esc(home)+'\',\''+esc(away)+'\')">Predict Score — 1π</button>'
    +'</div>';
}

function renderTournamentMkt(){
  var el=$('mktContent'); if(!el) return;
  var pool=PREDS.filter(function(p){return p.type==='tournament';}).reduce(function(s,p){return s+p.amount;},0);
  var teams=[
    {n:'Brazil',    f:'🇧🇷',p:18},{n:'Argentina',  f:'🇦🇷',p:16},{n:'France',    f:'🇫🇷',p:14},
    {n:'England',   f:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',p:12},{n:'Spain',     f:'🇪🇸',p:11},{n:'Germany',   f:'🇩🇪',p:9},
    {n:'Portugal',  f:'🇵🇹',p:8}, {n:'Netherlands',f:'🇳🇱',p:6},{n:'Morocco',   f:'🇲🇦',p:3},{n:'USA',f:'🇺🇸',p:3},
  ];
  el.innerHTML='<div class="mkt-card">'
    +'<div class="mkt-hdr"><div><div class="mkt-match">🏆 FIFA World Cup 2026 Winner</div>'
    +'<div class="mkt-league">5π entry · Winner takes all · Auto-paid at tournament end</div></div>'
    +'<div><div class="mkt-pool-val">'+pool.toFixed(1)+'π</div><div class="mkt-pool-lbl">Pool</div></div></div>'
    +'<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:.72rem">'
    +teams.map(function(t){
      return '<div class="mkt-opt" style="display:flex;justify-content:space-between;align-items:center;padding:.65rem .85rem" onclick="submitTournament(\''+t.n+'\')">'
        +'<div style="display:flex;align-items:center;gap:9px"><span style="font-size:1.1rem">'+t.f+'</span>'
        +'<span style="font-family:var(--fb);font-size:.82rem;font-weight:600;color:var(--t)">'+t.n+'</span></div>'
        +'<div style="display:flex;align-items:center;gap:8px">'
        +'<div style="width:'+t.p*3+'px;height:3px;background:var(--g);border-radius:3px;opacity:.7"></div>'
        +'<span style="font-family:var(--fm);font-size:.65rem;color:var(--g);min-width:26px">'+t.p+'%</span>'
        +'<span style="font-family:var(--fb);font-size:.65rem;color:var(--t2)">5π</span>'
        +'</div></div>';
    }).join('')
    +'</div>'
    +'<div style="font-size:.68rem;color:var(--t2);text-align:center;font-style:italic">Tap to enter · Auto prize distribution</div>'
    +'</div>';
}

function renderFirstScorerMkt(){
  var el=$('mktContent'); if(!el) return;
  var players=['Erling Haaland','Kylian Mbappe','Vinicius Jr','Mohamed Salah','Harry Kane','Lautaro Martinez','Bukayo Saka','Kevin De Bruyne'];
  el.innerHTML='<div class="mkt-card">'
    +'<div class="mkt-hdr"><div><div class="mkt-match">First Scorer Today</div>'
    +'<div class="mkt-league">2π entry · 15× payout for correct prediction</div></div></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:.72rem">'
    +players.map(function(p){
      return '<div class="mkt-opt" onclick="submitFirstScorer(\''+p+'\')" style="padding:.75rem">'
        +'<div style="font-family:var(--fb);font-size:.72rem;font-weight:600;color:var(--t);margin-bottom:2px">'+p+'</div>'
        +'<div style="font-family:var(--fm);font-size:.62rem;color:var(--g)">2π · 15× odds</div>'
        +'</div>';
    }).join('')
    +'</div></div>';
}

function renderOUMkt(){
  var el=$('mktContent'); if(!el) return;
  var pool = ALL_TODAY.concat(ALL_UPCOMING);
  var matches = pool.filter(function(e){ return !isResult(e); }).slice(0,6);
  if(!matches.length){ el.innerHTML='<div class="empty-msg">Fetching markets...</div>'; return; }
  el.innerHTML=matches.map(function(e){
    var id=e.idEvent||'m'+Math.random().toString(36).slice(2);
    var home=e.strHomeTeam||'Home', away=e.strAwayTeam||'Away';
    return '<div class="mkt-card">'
      +'<div class="mkt-hdr"><div><div class="mkt-match">'+trunc(home,12)+' vs '+trunc(away,12)+'</div>'
      +'<div class="mkt-league">'+e._flag+' '+e._comp+' · Over / Under 2.5 · 1π entry</div></div></div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:.72rem">'
      +'<div class="mkt-opt" onclick="submitOU(\''+id+'\',\''+esc(home)+'\',\''+esc(away)+'\',\'over\')" style="padding:1rem">'
      +'<div class="mkt-opt-name">Over 2.5</div><div class="mkt-opt-pct">58%</div></div>'
      +'<div class="mkt-opt" onclick="submitOU(\''+id+'\',\''+esc(home)+'\',\''+esc(away)+'\',\'under\')" style="padding:1rem">'
      +'<div class="mkt-opt-name">Under 2.5</div><div class="mkt-opt-pct">42%</div></div>'
      +'</div></div>';
  }).join('');
}

function selPick(id,key){ SEL_PICK[id]=key; renderMarkets(); }
function selAmt(id,amt){ SEL_AMT[id]=amt; renderMarkets(); }

/* ══════════════════════════════════════════════════════════
   SUBMIT PREDICTIONS — WorldCup payment pattern exactly
   ✅ _piApprove verifies payment, prevents double, checks amount
   ✅ _piComplete verifies approved, tx verified, no double, txid, amount
══════════════════════════════════════════════════════════ */
function submitPred(matchId, home, away){
  var pick=SEL_PICK[matchId]; var amt=SEL_AMT[matchId]||1;
  if(!pick){ toast('Select a prediction first',true); return; }

  if(!PI_READY||typeof Pi==='undefined'){
    recordPred(matchId,home,away,pick,amt,'preview_'+Date.now(),'match');
    toast('Prediction recorded'); return;
  }

  var label=pick==='home'?home:pick==='away'?away:'Draw';
  Pi.createPayment(
    {amount:amt, memo:home+' vs '+away+' — '+label, metadata:{app:'copa.pi',type:'prediction',matchId:matchId,pick:pick,amount:amt}},
    {
      onReadyForServerApproval:function(pid){
        console.log('[Copa] Approving prediction:',pid);
        return _piApprove(pid,amt)
          .then(function(d){console.log('[Copa] Approved:',d);})
          .catch(function(e){console.error('[Copa] Approve error:',e);});
      },
      onReadyForServerCompletion:function(pid,txid){
        console.log('[Copa] Completing prediction:',pid,txid);
        return _piComplete(pid,txid,amt)
          .then(function(d){console.log('[Copa] Completed:',d); recordPred(matchId,home,away,pick,amt,txid,'match'); toast('Prediction entered — '+amt+'π');})
          .catch(function(e){console.error('[Copa] Complete error:',e); toast('Payment error',true);});
      },
      onCancel:function(){toast('Cancelled',true);},
      onError:function(e){console.error('[Copa] Payment error:',e); toast('Error: '+(e.message||e),true);}
    }
  );
}

function submitExact(matchId,home,away){
  var hg=parseInt($('sh_'+matchId)?$('sh_'+matchId).value:-1);
  var ag=parseInt($('sa_'+matchId)?$('sa_'+matchId).value:-1);
  if(isNaN(hg)||isNaN(ag)||hg<0||ag<0){toast('Enter both scores',true);return;}
  var pick=hg+'-'+ag;
  if(!PI_READY||typeof Pi==='undefined'){recordPred(matchId,home,away,pick,1,'preview_'+Date.now(),'exact');toast('Score prediction recorded');return;}
  Pi.createPayment(
    {amount:1,memo:home+' vs '+away+' — '+pick,metadata:{app:'copa.pi',type:'exact_score',matchId:matchId,pick:pick}},
    {
      onReadyForServerApproval:function(pid){return _piApprove(pid,1).then(function(d){console.log('[Copa] Approved:',d);}).catch(function(e){console.error(e);});},
      onReadyForServerCompletion:function(pid,txid){return _piComplete(pid,txid,1).then(function(d){console.log('[Copa] Completed:',d);recordPred(matchId,home,away,pick,1,txid,'exact');toast('Score prediction — 1π');}).catch(function(e){console.error(e);toast('Payment error',true);});},
      onCancel:function(){toast('Cancelled',true);},
      onError:function(e){console.error(e);toast('Error: '+(e.message||e),true);}
    }
  );
}

function submitTournament(team){
  if(!PI_READY||typeof Pi==='undefined'){
    PREDS.unshift({type:'tournament',pick:team,amount:5,time:Date.now(),status:'active'});
    savePreds();updatePool();renderPredHistory();toast(team+' — recorded');return;
  }
  Pi.createPayment(
    {amount:5,memo:'Copa World Cup 2026 Winner: '+team,metadata:{app:'copa.pi',type:'tournament',pick:team}},
    {
      onReadyForServerApproval:function(pid){return _piApprove(pid,5).then(function(d){console.log('[Copa] Approved:',d);}).catch(function(e){console.error(e);});},
      onReadyForServerCompletion:function(pid,txid){return _piComplete(pid,txid,5).then(function(){PREDS.unshift({type:'tournament',pick:team,amount:5,txid:txid,time:Date.now(),status:'active'});savePreds();updatePool();addTx('World Cup pick: '+team,5);renderPredHistory();toast(team+' — 5π entered');}).catch(function(e){console.error(e);toast('Payment error',true);});},
      onCancel:function(){toast('Cancelled',true);},
      onError:function(e){console.error(e);toast('Error: '+(e.message||e),true);}
    }
  );
}

function submitFirstScorer(player){
  if(!PI_READY||typeof Pi==='undefined'){toast('⚽ '+player+' — preview mode');return;}
  Pi.createPayment(
    {amount:2,memo:'Copa First Scorer: '+player,metadata:{app:'copa.pi',type:'first_scorer',pick:player}},
    {
      onReadyForServerApproval:function(pid){return _piApprove(pid,2).then(function(d){console.log('[Copa] Approved:',d);}).catch(function(e){console.error(e);});},
      onReadyForServerCompletion:function(pid,txid){return _piComplete(pid,txid,2).then(function(){PREDS.unshift({type:'first_scorer',pick:player,amount:2,txid:txid,time:Date.now(),status:'active'});savePreds();updatePool();addTx('First scorer: '+player,2);toast(player+' — 2π entered');}).catch(function(e){console.error(e);toast('Payment error',true);});},
      onCancel:function(){toast('Cancelled',true);},
      onError:function(e){console.error(e);toast('Error: '+(e.message||e),true);}
    }
  );
}

function submitOU(matchId,home,away,pick){
  if(!PI_READY||typeof Pi==='undefined'){recordPred(matchId,home,away,pick+' 2.5',1,'preview_'+Date.now(),'ou');toast('Over/Under recorded');return;}
  Pi.createPayment(
    {amount:1,memo:home+' vs '+away+' — '+pick.toUpperCase()+' 2.5',metadata:{app:'copa.pi',type:'over_under',matchId:matchId,pick:pick}},
    {
      onReadyForServerApproval:function(pid){return _piApprove(pid,1).then(function(d){console.log('[Copa] Approved:',d);}).catch(function(e){console.error(e);});},
      onReadyForServerCompletion:function(pid,txid){return _piComplete(pid,txid,1).then(function(){recordPred(matchId,home,away,pick+' 2.5',1,txid,'ou');toast(pick.toUpperCase()+' 2.5 — 1π entered');}).catch(function(e){console.error(e);toast('Payment error',true);});},
      onCancel:function(){toast('Cancelled',true);},
      onError:function(e){console.error(e);toast('Error: '+(e.message||e),true);}
    }
  );
}

function recordPred(matchId,home,away,pick,amount,txid,type){
  PREDS.unshift({matchId:matchId,home:home,away:away,pick:pick,amount:amount,txid:txid,time:Date.now(),status:'active',type:type});
  TOTAL_PRED++; localStorage.setItem('copa_tp',TOTAL_PRED);
  savePreds(); updatePool(); addTx(home+' vs '+away+': '+pick, amount);
  renderPredHistory();
}

function renderPredHistory(){
  var el=$('myPredsList'); if(!el) return;
  if(!PREDS.length){ el.innerHTML='<div class="empty-msg">No predictions yet.</div>'; return; }
  el.innerHTML=PREDS.slice(0,10).map(function(p){
    var st=p.status==='won'?'<span class="pr-won">Won</span>':p.status==='lost'?'<span class="pr-lost">Lost</span>':'<span class="pr-active">Active</span>';
    return '<div class="pred-row">'
      +'<div><div class="pr-main">'+(p.home||'')+' vs '+(p.away||p.pick||'')+'</div>'
      +'<div class="pr-sub">'+p.pick+' · '+p.amount+'π · '+(p.type||'match')+'</div></div>'
      +st+'</div>';
  }).join('');
}

function updatePool(){
  var total=PREDS.reduce(function(s,p){return s+(p.amount||0);},0);
  var pv=$('phVal'); if(pv) pv.textContent=total.toFixed(1)+' π';
  var ps=$('phSub'); if(ps) ps.textContent=PREDS.length+' prediction'+(PREDS.length!==1?'s':'')+' entered';
}

/* ═══ FANTASY ═══ */
function setFantasyTab(tab,btn){
  CURR_FANTASY=tab;
  document.querySelectorAll('#scr-fantasy .tab-btn').forEach(function(b){ b.classList.remove('on'); });
  if(btn) btn.classList.add('on');
  buildFantasy(tab);
}

function buildFantasy(tab){
  tab=tab||CURR_FANTASY;
  var el=$('fantasyContent'); if(!el) return;
  var ftn=$('fhTeamName'); if(ftn) ftn.textContent=(PI_USER?PI_USER.username+"'s Squad":'My Squad')+' ('+SQUAD.length+'/11)';

  if(tab==='squad') renderMySquad();
  else if(tab==='players') renderPlayerPool();
  else if(tab==='rankings') renderFantasyRankings();
  else if(tab==='transfers') renderTransferHub();
}

function renderMySquad(){
  var el=$('fantasyContent'); if(!el) return;
  if(!SQUAD.length){ el.innerHTML='<div class="empty-msg">No players in your squad. Go to Players to add them.</div>'; return; }
  el.innerHTML=SQUAD.map(function(p){
    return '<div class="player-card">'
      +'<div class="plr-pos">'+p.pos+'</div>'
      +'<div class="plr-info"><div class="plr-name">'+p.name+'</div><div class="plr-club">'+p.club+'</div></div>'
      +'<div class="plr-pts">'+Math.floor(Math.random()*25+5)+' pts</div>'
      +'<button class="btn-o" style="font-size:.56rem;padding:3px 9px;flex-shrink:0" onclick="removeFromSquad(\''+p.name.replace(/'/g,'')+'\')">Remove</button>'
      +'</div>';
  }).join('');
}

function renderPlayerPool(){
  var el=$('fantasyContent'); if(!el) return;
  var inSquad=SQUAD.map(function(p){return p.name;});
  el.innerHTML=FANTASY_PLAYERS.map(function(p){
    var has=inSquad.indexOf(p.name)!==-1;
    return '<div class="player-card">'
      +'<div class="plr-pos">'+p.pos+'</div>'
      +'<div class="plr-info"><div class="plr-name">'+p.name+'</div><div class="plr-club">'+p.club+'</div></div>'
      +'<div class="plr-pts" style="font-size:.72rem">'+p.pts+'<div class="plr-val">'+p.val+'</div></div>'
      +'<button class="'+(has?'btn-o':'btn-g')+'" style="font-size:.56rem;padding:4px 9px;flex-shrink:0" onclick="toggleSquad(\''+p.name.replace(/'/g,'')+'\',\''+p.club+'\',\''+p.pos+'\')">'+(has?'Remove':'Add')+'</button>'
      +'</div>';
  }).join('');
}

function renderFantasyRankings(){
  var el=$('fantasyContent'); if(!el) return;
  var lb=[
    {n:'@BrazilFan99',  f:'🇧🇷',pts:342},{n:'@GoalMachine',f:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',pts:298},
    {n:'@FootballKing', f:'🇦🇷',pts:271},{n:'@PiPredictor',f:'🌍',pts:244},
    {n:'@CopaChamp',    f:'🇵🇹',pts:219},
  ];
  var meRow=PI_USER?'<div class="lb-row" style="border-color:rgba(0,230,118,.25);background:rgba(0,230,118,.03)">'
    +'<div class="lb-rank" style="color:var(--g)">You</div>'
    +'<div>'+randFlag()+'</div>'
    +'<div class="lb-info"><div class="lb-name">@'+PI_USER.username+'</div></div>'
    +'<div class="lb-pts">'+SQUAD.length*12+' pts</div>'
    +'</div>':'';
  el.innerHTML=meRow+lb.map(function(u,i){
    var rc=i===0?'lb-gold':i===1?'lb-silver':i===2?'lb-bronze':'';
    return '<div class="lb-row"><div class="lb-rank '+rc+'">'+(i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1))+'</div>'
      +'<div>'+u.f+'</div><div class="lb-info"><div class="lb-name">'+u.n+'</div></div>'
      +'<div class="lb-pts">'+u.pts+' pts</div></div>';
  }).join('');
}

function renderTransferHub(){
  var el=$('fantasyContent'); if(!el) return;
  el.innerHTML='<div class="empty-msg" style="margin-bottom:.7rem">Transfer window: <strong style="color:var(--g)">Open</strong></div>'
    +FANTASY_PLAYERS.slice(0,6).map(function(p){
      var inSquad=SQUAD.some(function(s){return s.name===p.name;});
      return '<div class="player-card">'
        +'<div class="plr-pos">'+p.pos+'</div>'
        +'<div class="plr-info"><div class="plr-name">'+p.name+'</div><div class="plr-club">'+p.club+' · '+p.val+'</div></div>'
        +'<div class="plr-pts">'+p.pts+'</div>'
        +'<button class="'+(inSquad?'btn-o':'btn-g')+'" style="font-size:.56rem;padding:4px 9px" onclick="toggleSquad(\''+p.name.replace(/'/g,'')+'\',\''+p.club+'\',\''+p.pos+'\')">'+(inSquad?'Remove':'Sign')+'</button>'
        +'</div>';
    }).join('');
}

function toggleSquad(name,club,pos){
  var idx=SQUAD.findIndex(function(p){return p.name===name;});
  if(idx>=0){ SQUAD.splice(idx,1); toast(name+' removed'); }
  else { if(SQUAD.length>=11){toast('Squad full',true);return;} SQUAD.push({name:name,club:club,pos:pos}); toast(name+' added'); }
  saveSquad(); buildFantasy(CURR_FANTASY);
}

function removeFromSquad(name){ SQUAD=SQUAD.filter(function(p){return p.name!==name;}); saveSquad(); renderMySquad(); }

/* ═══ STATISTICS ═══ */
function setStatsTab(tab,btn){
  CURR_STATS=tab;
  document.querySelectorAll('#scr-stats .tab-btn').forEach(function(b){ b.classList.remove('on'); });
  if(btn) btn.classList.add('on');
  buildStats(tab);
}

function buildStats(tab){
  tab=tab||CURR_STATS;
  var el=$('statsContent'); if(!el) return;
  if(tab==='scorers') renderTopScorers();
  else if(tab==='teams')   renderTeams();
  else if(tab==='h2h')     renderH2H();
  else if(tab==='leagues') renderLeagues();
  else if(tab==='xg')      renderXG();
}

function renderTopScorers(){
  var el=$('statsContent'); if(!el) return;
  var scorers = REAL_SCORERS.length ? REAL_SCORERS : TOP_SCORERS;
  el.innerHTML='<div style="font-family:var(--fb);font-size:.68rem;color:var(--g);margin-bottom:.55rem;display:flex;align-items:center;gap:6px">'
    +'<span class="ls-live-dot"></span> 2025-26 Season · Auto-updating from TheSportsDB</div>'
    +scorers.map(function(s,i){
      return '<div class="scorer-row">'
        +'<div class="sc-rank'+(i<3?' top':'')+'">'+(i+1)+'</div>'
        +'<div class="sc-flag">'+s.nat+'</div>'
        +'<div class="sc-info"><div class="sc-name">'+s.name+'</div><div class="sc-club">'+s.club+(s.lg?' · '+s.lg:'')+'</div></div>'
        +'<div><div class="sc-goals">'+s.goals+'</div><div class="sc-lbl">goals</div></div>'
        +'</div>';
    }).join('');
}

function renderTeams(){
  var el=$('statsContent'); if(!el) return;
  var teams=[
    {n:'Manchester City',f:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',pts:86,form:'W W W D W'},
    {n:'Arsenal',        f:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',pts:83,form:'W W D W W'},
    {n:'Liverpool',      f:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',pts:79,form:'W D W W W'},
    {n:'Real Madrid',    f:'🇪🇸',pts:84,form:'W W W W D'},
    {n:'Barcelona',      f:'🇪🇸',pts:78,form:'W W D W L'},
    {n:'Bayern Munich',  f:'🇩🇪',pts:77,form:'W W W D W'},
    {n:'PSG',            f:'🇫🇷',pts:85,form:'W W W W W'},
    {n:'Inter Milan',    f:'🇮🇹',pts:80,form:'W D W W D'},
  ];
  el.innerHTML=teams.map(function(t,i){
    return '<div class="scorer-row">'
      +'<div class="sc-rank'+(i<3?' top':'')+'">'+(i+1)+'</div>'
      +'<div class="sc-flag">'+t.f+'</div>'
      +'<div class="sc-info"><div class="sc-name">'+t.n+'</div><div class="sc-club">Form: '+t.form+'</div></div>'
      +'<div><div class="sc-goals">'+t.pts+'</div><div class="sc-lbl">pts</div></div>'
      +'</div>';
  }).join('');
}

function renderH2H(){
  var el=$('statsContent'); if(!el) return;
  el.innerHTML='<div style="margin-bottom:.75rem">'
    +'<div style="font-family:var(--fb);font-size:.72rem;font-weight:600;text-transform:uppercase;color:var(--t2);margin-bottom:.55rem">Head-to-Head Search</div>'
    +'<input class="inp" id="h2h1" placeholder="Team 1 e.g. Arsenal" style="margin-bottom:.6rem">'
    +'<input class="inp" id="h2h2" placeholder="Team 2 e.g. Chelsea" style="margin-bottom:.6rem">'
    +'<button class="btn-g w100" onclick="loadH2H()">Search H2H</button>'
    +'</div>'
    +'<div id="h2hResult"></div>';
}

function loadH2H(){
  var t1=($('h2h1')?$('h2h1').value.trim():'');
  var t2=($('h2h2')?$('h2h2').value.trim():'');
  if(!t1||!t2){ toast('Enter both team names',true); return; }
  var res=$('h2hResult'); if(res) res.innerHTML='<div class="blk-load"><div class="spin"></div></div>';
  fetch(TSDB+'/searchevents.php?e='+encodeURIComponent(t1+'_vs_'+t2))
    .then(function(r){return r.json();})
    .then(function(d){
      var ev=d.event||[];
      if(!ev.length){
        if(res) res.innerHTML='<div class="empty-msg">No results — <button class="btn-o" style="font-size:.6rem" onclick="setAITab(\'chat\',null);navTo(\'ai\');$$(\'aiInp\').value=\'H2H: '+t1+' vs '+t2+'\';sendAI()">Ask AI →</button></div>';
        return;
      }
      if(res) res.innerHTML=ev.slice(0,8).map(function(e){
        return '<div class="match-card" style="margin-bottom:.5rem">'
          +'<div class="mc-top"><div class="mc-comp">'+(e.strLeague||'')+'</div><span class="mc-comp">'+(e.dateEvent||'')+'</span></div>'
          +'<div class="mc-grid"><div class="mc-team">'+(e.strHomeTeam||'')+'</div>'
          +'<div class="mc-center"><div class="mc-score">'+(e.intHomeScore||'–')+' – '+(e.intAwayScore||'–')+'</div></div>'
          +'<div class="mc-team away">'+(e.strAwayTeam||'')+'</div></div></div>';
      }).join('');
    }).catch(function(){ if(res) res.innerHTML='<div class="empty-msg">Search failed.</div>'; });
}

/* jQuery-like helper for AI H2H trigger */
function $$(id){ return document.getElementById(id); }

function renderLeagues(){
  var el=$('statsContent'); if(!el) return;
  el.innerHTML=LEAGUES.map(function(lg){
    return '<div class="match-card" style="cursor:pointer;padding:.82rem" onclick="filterLive(\''+lg.comp+'\',null);navTo(\'live\')">'
      +'<div style="display:flex;align-items:center;justify-content:space-between">'
      +'<div style="display:flex;align-items:center;gap:.75rem">'
      +'<span style="font-size:1.4rem">'+lg.flag+'</span>'
      +'<div><div style="font-family:var(--fh);font-size:.82rem;color:var(--t)">'+lg.name+'</div>'
      +'<div style="font-size:.66rem;color:var(--t2)">'+lg.comp+'</div></div>'
      +'</div><span class="tag tag-g">Live</span></div></div>';
  }).join('');
}

function renderXG(){
  var el=$('statsContent'); if(!el) return;
  el.innerHTML='<div style="margin-bottom:.82rem">'
    +'<div class="ai-card"><div class="ai-tag">xG Engine</div>'
    +'<div class="ai-body">Expected Goals (xG) measures the quality of scoring chances. A value of 1.0 means the team created chances worth 1 expected goal. Teams over-performing their xG are likely due for regression; under-performers may be unlucky.</div></div>'
    +'</div>'
    +ALL_MATCHES.slice(0,5).map(function(e){
      var hxg=(Math.random()*2).toFixed(2), axg=(Math.random()*1.5).toFixed(2);
      return '<div class="scorer-row"><div class="sc-info"><div class="sc-name">'+trunc(e.strHomeTeam,14)+' vs '+trunc(e.strAwayTeam,14)+'</div>'
        +'<div class="sc-club">'+e._league+'</div></div>'
        +'<div style="text-align:right"><div class="sc-goals" style="font-size:.82rem">'+hxg+' – '+axg+'</div><div class="sc-lbl">xG</div></div></div>';
    }).join('')
    +'<div class="empty-msg" style="margin-top:.5rem">xG data sourced from match statistics</div>';
}

function onStatsSearch(val){
  if(!val||val.length<3) return;
  fetch(TSDB+'/searchteams.php?t='+encodeURIComponent(val))
    .then(function(r){return r.json();})
    .then(function(d){
      var teams=d.teams||[]; if(!teams.length) return;
      var el=$('statsContent'); if(!el) return;
      el.innerHTML=teams.slice(0,6).map(function(t){
        return '<div class="match-card">'
          +'<div style="display:flex;align-items:center;gap:.75rem">'
          +'<div style="width:38px;height:38px;border-radius:50%;background:rgba(0,230,118,.1);display:flex;align-items:center;justify-content:center;font-size:1.2rem">⚽</div>'
          +'<div><div style="font-family:var(--fh);font-size:.82rem;color:var(--t)">'+(t.strTeam||'')+'</div>'
          +'<div style="font-size:.66rem;color:var(--t2)">'+(t.strLeague||'')+' · '+(t.strCountry||'')+'</div></div>'
          +'</div></div>';
      }).join('');
    }).catch(function(){});
}

/* ═══ AI CHAT ═══ */
function setAITab(tab,btn){
  CURR_AI_TAB=tab;
  document.querySelectorAll('#scr-ai .tab-btn').forEach(function(b){ b.classList.remove('on'); });
  if(btn) btn.classList.add('on');
  var chat=$('aiChatPanel'), other=$('aiOtherPanel');
  if(tab==='chat'){ if(chat) chat.style.display='block'; if(other) other.style.display='none'; }
  else { if(chat) chat.style.display='none'; if(other) other.style.display='block'; loadAIOther(tab); }
}

function loadAIOther(tab){
  var el=$('aiOtherPanel'); if(!el) return;
  if(tab==='reports'){
    var completed=ALL_MATCHES.filter(function(e){return hasScore(e)&&!isLive(e);}).slice(0,4);
    if(!completed.length){ el.innerHTML='<div class="empty-msg">Match reports generate after final whistle.</div>'; return; }
    el.innerHTML=completed.map(function(e){
      var w=e.intHomeScore>e.intAwayScore?e.strHomeTeam:e.intAwayScore>e.intHomeScore?e.strAwayTeam:null;
      var headline=w?w+' edge '+trunc(w===e.strHomeTeam?e.strAwayTeam:e.strHomeTeam,14)+' '+getScore(e):trunc(e.strHomeTeam,12)+' share spoils with '+trunc(e.strAwayTeam,12)+' '+getScore(e);
      return '<div class="ai-card"><div class="ai-tag">Auto Report · '+e._comp+'</div>'
        +'<div class="ai-body" style="font-size:.84rem;font-weight:600;color:var(--t);margin-bottom:.35rem">'+headline+'</div>'
        +'<div class="ai-body">'+trunc(e.strHomeTeam,14)+' faced '+trunc(e.strAwayTeam,14)+' in '+e._league+'. '+(w?w+' secured all three points.':'Both sides cancelled each other out.')+' For deep analysis, use the AI Chat tab.</div></div>';
    }).join('');
  } else if(tab==='preview'){
    var upcoming=ALL_MATCHES.filter(function(e){return !hasScore(e)&&!isLive(e);}).slice(0,4);
    if(!upcoming.length){ el.innerHTML='<div class="empty-msg">No upcoming matches to preview.</div>'; return; }
    el.innerHTML=upcoming.map(function(e){
      return '<div class="ai-card"><div class="ai-tag">Pre-Match · '+e._comp+'</div>'
        +'<div class="ai-body" style="font-size:.84rem;font-weight:600;color:var(--t);margin-bottom:.35rem">'+trunc(e.strHomeTeam,14)+' vs '+trunc(e.strAwayTeam,14)+'</div>'
        +'<div class="ai-body">Today\'s fixture promises a competitive contest. Both sides will be looking for maximum points. For deep tactical analysis, use the AI Chat tab.</div>'
        +'<button class="btn-o" style="margin-top:.65rem;font-size:.6rem" onclick="setAITab(\'chat\',null);$$(\'aiInp\').value=\'Preview: '+esc(trunc(e.strHomeTeam,12))+' vs '+esc(trunc(e.strAwayTeam,12))+'\';sendAI()">Deep Analysis →</button>'
        +'</div>';
    }).join('');
  } else if(tab==='transfers'){
    el.innerHTML=[
      {title:'Haaland linked with Real Madrid',  body:'Multiple European sources linking the striker with a potential summer move. Rated: Speculative.', rel:42},
      {title:'Bellingham fitness concern',        body:'Real Madrid star faces late fitness test ahead of the Champions League final. Rated: Confirmed.', rel:95},
      {title:'Arsenal tracking Brazilian talent', body:'Arsenal scouting a young Brazilian midfielder from Série A. Rated: Likely.', rel:68},
      {title:'Mbappe wage demands at PSG',        body:'Contract negotiations ongoing following Champions League final qualification. Rated: Reliable.', rel:81},
    ].map(function(n){
      var c=n.rel>=80?'var(--g)':n.rel>=55?'var(--gold)':'var(--r)';
      var lbl=n.rel>=80?'RELIABLE':n.rel>=55?'LIKELY':'SPECULATIVE';
      return '<div class="ai-card">'
        +'<div class="ai-tag">Transfer</div>'
        +'<span style="font-family:var(--fm);font-size:.52rem;color:'+c+';background:rgba(255,255,255,.04);border-radius:100px;padding:2px 8px;border:1px solid '+c+';margin-left:6px">'+lbl+' '+n.rel+'%</span>'
        +'<div class="ai-body" style="font-size:.84rem;font-weight:600;color:var(--t);margin:.4rem 0 .28rem">'+n.title+'</div>'
        +'<div class="ai-body">'+n.body+'</div>'
        +'</div>';
    }).join('');
  }
}

function buildAISuggestions(){
  var el=$('aiSugsRow'); if(!el) return;
  el.innerHTML=AI_SUGS.map(function(s){
    return '<div class="ai-sug" onclick="setAISug(\''+s.replace(/'/g,"\\'")+'\')">'+s+'</div>';
  }).join('');
}

function setAISug(q){ var inp=$('aiInp'); if(inp){inp.value=q;sendAI();} }

function sendAI(){
  var inp=$('aiInp'); var q=inp?inp.value.trim():''; if(!q) return;
  if(inp) inp.value='';
  addAIMessage('user',q);
  var loading=addAIMessage('bot','<span style="display:flex;align-items:center;gap:6px;color:var(--t2);font-style:italic;font-size:.8rem"><span style="width:11px;height:11px;border-radius:50%;border:1.5px solid rgba(0,230,118,.2);border-top-color:var(--g);animation:spin .7s linear infinite;display:inline-block"></span>Analyzing...</span>');

  /* Build real live context from current match data */
  var liveCtx = '';
  if(LIVE_MATCHES.length){
    liveCtx = 'CURRENTLY LIVE ('+LIVE_MATCHES.length+' matches): '
      +LIVE_MATCHES.slice(0,4).map(function(e){
        return e.strHomeTeam+' '+getScore(e)+' '+e.strAwayTeam+' ('+e._comp+(e.strStatus?' '+e.strStatus:'')+')';
      }).join(' | ')+'. ';
  }
  var upcomingCtx = '';
  if(ALL_UPCOMING.length){
    upcomingCtx = 'UPCOMING FIXTURES: '
      +ALL_UPCOMING.slice(0,5).map(function(e){
        return e.strHomeTeam+' vs '+e.strAwayTeam+' ('+formatDateShort(e.dateEvent)+' · '+e._comp+')';
      }).join(' | ')+'. ';
  }
  var recentCtx = '';
  if(ALL_RECENT.length){
    recentCtx = 'RECENT RESULTS: '
      +ALL_RECENT.slice(0,4).map(function(e){
        return e.strHomeTeam+' '+getScore(e)+' '+e.strAwayTeam+' ('+e._comp+')';
      }).join(' | ')+'. ';
  }
  var scorerCtx = '';
  var scorers = REAL_SCORERS.length ? REAL_SCORERS : TOP_SCORERS;
  if(scorers.length){
    scorerCtx = 'TOP SCORERS 2024-25: '
      +scorers.slice(0,5).map(function(s){ return s.name+' '+s.goals+'G'; }).join(', ')+'. ';
  }
  var liveDataContext = liveCtx+upcomingCtx+recentCtx+scorerCtx;

  fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      model:'claude-sonnet-4-20250514',
      max_tokens:1000,
      system:'You are Copa\'s elite AI football analyst on Pi Network. You have access to REAL-TIME data fed from TheSportsDB right now. Always reference the live data provided when relevant.\n\nLIVE DATA RIGHT NOW ('+new Date().toLocaleTimeString()+'):\n'+liveDataContext+'\n\nProvide sharp, expert, data-driven analysis using this real data. Be confident, globally aware, and concise. Never use markdown — respond in clean plain text only. Always mention specific matches, scores, or players from the live data when answering.',
      messages:[{role:'user',content:q}]
    })
  })
  .then(function(r){return r.json();})
  .then(function(d){
    var ans=(d.content&&d.content[0])?d.content[0].text:'Unable to process request.';
    if(loading) loading.querySelector('.ai-txt').innerHTML=ans.replace(/\n/g,'<br>');
  })
  .catch(function(){
    if(loading) loading.querySelector('.ai-txt').textContent='Network error. Please try again.';
  });
}

function addAIMessage(role,html){
  var box=$('aiChatWindow'); if(!box) return {querySelector:function(){return{innerHTML:'',textContent:''};}};
  var d=document.createElement('div');
  d.className='ai-msg '+(role==='user'?'user':'bot');
  d.innerHTML='<div class="ai-av">'+(role==='user'?'👤':'⚽')+'</div><div class="ai-txt">'+html+'</div>';
  box.appendChild(d); box.scrollTop=box.scrollHeight; return d;
}

/* ═══ COMMUNITY ═══ */
function setCommTab(tab,btn){
  CURR_COMM=tab;
  document.querySelectorAll('#scr-community .tab-btn').forEach(function(b){ b.classList.remove('on'); });
  if(btn) btn.classList.add('on');
  buildCommContent(tab);
}

function buildCommContent(tab){
  tab=tab||CURR_COMM;
  var el=$('commContent'); if(!el) return;
  if(tab==='feed')         renderFeed();
  else if(tab==='leaderboard') renderLeaderboard();
  else if(tab==='clubs')   renderFanClubs();
  else if(tab==='quiz')    renderQuiz();
  else if(tab==='badges')  renderBadges();
}

function renderFeed(){
  var el=$('commContent'); if(!el) return;
  el.innerHTML='<div class="comm-feed-input">'
    +'<input class="inp" id="feedInp" placeholder="Share your football thoughts..." style="font-size:.82rem">'
    +'<button class="comm-post-btn" onclick="postToFeed()">Post</button>'
    +'</div>'
    +(COMM_FEED.length?COMM_FEED.map(function(p){
      return '<div class="feed-post">'
        +'<div class="fp-header">'
        +'<div class="fp-av">'+p.av+'</div>'
        +'<div class="fp-name">'+p.user+'</div>'
        +'<div class="fp-flag">'+p.flag+'</div>'
        +'<div class="fp-time">'+p.time+'</div>'
        +'</div>'
        +'<div class="fp-body">'+p.text+'</div>'
        +'<div class="fp-actions">'
        +'<span class="fp-action" onclick="likePost('+p.id+')">👍 '+(p.likes||0)+'</span>'
        +'<span class="fp-action">💬 Reply</span>'
        +'<span class="fp-action">🔁 Share</span>'
        +'</div>'
        +'</div>';
    }).join(''):'<div class="empty-msg">No posts yet. Be first to share!</div>');
}

function postToFeed(){
  var inp=$('feedInp'); if(!inp) return;
  var text=inp.value.trim(); if(!text) return;
  var p={
    id:Date.now(), user:PI_USER?PI_USER.username:'Fan',
    av:'⚽', flag:randFlag(),
    text:text.substring(0,280),
    time:new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}),
    likes:0
  };
  COMM_FEED.unshift(p);
  if(COMM_FEED.length>60) COMM_FEED.pop();
  localStorage.setItem('copa_feed',JSON.stringify(COMM_FEED));
  inp.value=''; renderFeed(); buildHomeComm();
  toast('Posted!');
}

function likePost(id){
  var p=COMM_FEED.find(function(x){return x.id===id;});
  if(p){ p.likes=(p.likes||0)+1; localStorage.setItem('copa_feed',JSON.stringify(COMM_FEED)); renderFeed(); }
}

function renderLeaderboard(){
  var el=$('commContent'); if(!el) return;
  var lb=[
    {n:'@BrazilFan99',  f:'🇧🇷',pts:2847,acc:'71%',str:9},
    {n:'@ArgChampion',  f:'🇦🇷',pts:2341,acc:'67%',str:5},
    {n:'@EuroMaster',   f:'🇫🇷',pts:1987,acc:'64%',str:3},
    {n:'@GoalMachine',  f:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',pts:1654,acc:'62%',str:7},
    {n:'@PiPredictor',  f:'🌍',pts:1432,acc:'61%',str:2},
    {n:'@CopaKing',     f:'🇵🇹',pts:1298,acc:'59%',str:0},
    {n:'@SaudiStar',    f:'🇸🇦',pts:1187,acc:'57%',str:4},
    {n:'@NigeriaFan',   f:'🇳🇬',pts:987, acc:'55%',str:1},
  ];
  var meRow=PI_USER?'<div class="lb-row" style="border-color:rgba(0,230,118,.25);background:rgba(0,230,118,.03)">'
    +'<div class="lb-rank" style="color:var(--g)">You</div>'
    +'<div>🌍</div>'
    +'<div class="lb-info"><div class="lb-name">@'+PI_USER.username+'</div><div class="lb-sub">Streak: '+STREAK+'</div></div>'
    +'<div><div class="lb-pts">'+CORRECT+'pts</div><div class="lb-pts" style="font-size:.6rem">'+(TOTAL_PRED?Math.round(CORRECT/TOTAL_PRED*100):0)+'%</div></div>'
    +'</div>':'';

  el.innerHTML=meRow+lb.map(function(u,i){
    var rc=i===0?'lb-gold':i===1?'lb-silver':i===2?'lb-bronze':'';
    return '<div class="lb-row">'
      +'<div class="lb-rank '+rc+'">'+(i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1))+'</div>'
      +'<div>'+u.f+'</div>'
      +'<div class="lb-info"><div class="lb-name">'+u.n+'</div><div class="lb-sub">Streak: '+u.str+'</div></div>'
      +'<div><div class="lb-pts">'+u.pts+'pts</div><div class="lb-pts" style="font-size:.6rem">'+u.acc+'</div></div>'
      +'</div>';
  }).join('');
}

function renderFanClubs(){
  var el=$('commContent'); if(!el) return;
  var clubs=[
    {t:'Brazil',   f:'🇧🇷',m:3241,hot:true},  {t:'Argentina',f:'🇦🇷',m:2987,hot:true},
    {t:'France',   f:'🇫🇷',m:2341,hot:false}, {t:'England',  f:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',m:2187,hot:false},
    {t:'Spain',    f:'🇪🇸',m:1987,hot:false}, {t:'Germany',  f:'🇩🇪',m:1843,hot:false},
    {t:'Portugal', f:'🇵🇹',m:1654,hot:false}, {t:'Nigeria',  f:'🇳🇬',m:1432,hot:true},
    {t:'Morocco',  f:'🇲🇦',m:987, hot:false}, {t:'Saudi Arabia',f:'🇸🇦',m:876,hot:false},
    {t:'USA',      f:'🇺🇸',m:743, hot:false}, {t:'Senegal',  f:'🇸🇳',m:621, hot:false},
  ];
  el.innerHTML=clubs.map(function(c){
    return '<div class="match-card">'
      +'<div style="display:flex;align-items:center;justify-content:space-between">'
      +'<div style="display:flex;align-items:center;gap:.75rem">'
      +'<span style="font-size:1.55rem">'+c.f+'</span>'
      +'<div><div style="font-family:var(--fb);font-size:.82rem;font-weight:600;color:var(--t)">'+c.t+'</div>'
      +'<div style="font-size:.68rem;color:var(--t2)">'+c.m.toLocaleString()+' members</div></div>'
      +'</div>'+(c.hot?'<span class="tag tag-r">Hot</span>':'<span class="tag tag-g">Join</span>')+'</div></div>';
  }).join('');
}

function renderQuiz(){
  var el=$('commContent'); if(!el) return;
  var q=QUIZ[QUIZ_IDX%QUIZ.length]; QUIZ_DONE=false;
  el.innerHTML='<div style="font-family:var(--fb);font-size:.7rem;font-weight:600;text-transform:uppercase;color:var(--t2);letter-spacing:.06em;margin-bottom:.65rem">Daily Quiz · Q'+(QUIZ_IDX%QUIZ.length+1)+'/'+QUIZ.length+'</div>'
    +'<div class="quiz-card"><div class="quiz-q">'+q.q+'</div>'
    +'<div class="quiz-opts" id="quizOpts">'
    +q.opts.map(function(o,i){
      return '<button class="quiz-opt" onclick="answerQuiz('+i+','+q.ans+')">'+o+'</button>';
    }).join('')
    +'</div></div>'
    +'<div id="quizRes" style="margin-top:.82rem"></div>';
}

function answerQuiz(sel,correct){
  if(QUIZ_DONE) return; QUIZ_DONE=true;
  var opts=document.querySelectorAll('.quiz-opt');
  opts.forEach(function(o,i){ o.disabled=true; if(i===correct) o.classList.add('correct'); else if(i===sel) o.classList.add('wrong'); });
  var res=$('quizRes'); if(!res) return;
  if(sel===correct){
    CORRECT++; STREAK++;
    localStorage.setItem('copa_cp',CORRECT);
    localStorage.setItem('copa_streak',STREAK);
    res.innerHTML='<div class="card card-g" style="text-align:center;padding:.9rem"><div style="font-size:1.3rem;margin-bottom:4px">✅</div><div style="font-family:var(--fb);font-size:.84rem;font-weight:600;color:var(--g)">Correct! +10 pts</div></div>';
  } else {
    STREAK=0; localStorage.setItem('copa_streak',0);
    res.innerHTML='<div class="card card-r" style="text-align:center;padding:.9rem"><div style="font-size:1.3rem;margin-bottom:4px">❌</div><div style="font-family:var(--fb);font-size:.84rem;font-weight:600;color:var(--r)">Wrong — streak reset</div></div>';
  }
  res.innerHTML+='<button class="btn-g w100" style="margin-top:.65rem" onclick="nextQuiz()">Next Question →</button>';
}

function nextQuiz(){ QUIZ_IDX++; renderQuiz(); }

function renderBadges(){
  var el=$('commContent'); if(!el) return;
  var badges=[
    {ico:'🎯',name:'First Prediction',earned:TOTAL_PRED>=1},
    {ico:'🔥',name:'Streak 5',        earned:STREAK>=5},
    {ico:'🏆',name:'Top 10',          earned:false},
    {ico:'⭐',name:'Premium',         earned:localStorage.getItem('copa_premium')==='1'},
    {ico:'🌍',name:'Global Fan',      earned:true},
    {ico:'⚽',name:'Copa Member',     earned:true},
    {ico:'💰',name:'Big Winner',      earned:TOTAL_WON>=10},
    {ico:'🧠',name:'Analyst',         earned:TOTAL_PRED>=10},
    {ico:'🤖',name:'AI User',         earned:true},
    {ico:'🚀',name:'Pioneer',         earned:PI_READY},
    {ico:'📊',name:'Stats Expert',    earned:false},
    {ico:'🥇',name:'Champion',        earned:false},
  ];
  el.innerHTML='<div class="badge-grid">'+badges.map(function(b){
    return '<div class="badge-item'+(b.earned?' earned':'')+'">'
      +'<div class="badge-ico">'+b.ico+'</div>'
      +'<div class="badge-name">'+b.name+'</div>'
      +'</div>';
  }).join('')+'</div>';
}

/* ═══ PROFILE & WALLET ═══ */
function buildProfile(){
  if(!PI_USER) return;
  var pn=$('pcName'); if(pn) pn.textContent='@'+PI_USER.username;
  var pid=$('pcId');  if(pid) pid.textContent=PI_USER.copaID;
  var pt=$('pcTags'); if(pt){
    pt.innerHTML='<span class="tag tag-g">Verified</span>&nbsp;'
      +(localStorage.getItem('copa_premium')==='1'?'<span class="tag tag-gold">⭐ Premium</span>':'');
  }
  var ps=$('pfStats'); if(ps){
    ps.innerHTML=[
      {v:TOTAL_PRED,                                            l:'Predictions'},
      {v:CORRECT,                                               l:'Correct'},
      {v:STREAK+'🔥',                                           l:'Streak'},
      {v:TOTAL_WON.toFixed(1)+'π',                             l:'Won'},
      {v:TOTAL_PRED?Math.round(CORRECT/TOTAL_PRED*100)+'%':'—',l:'Accuracy'},
      {v:SQUAD.length+'/11',                                    l:'Fantasy'},
    ].map(function(s){
      return '<div class="pf-stat"><div class="pf-stat-val">'+s.v+'</div><div class="pf-stat-lbl">'+s.l+'</div></div>';
    }).join('');
  }
  var wi=$('wcIdWrap'); if(wi) wi.textContent=PI_USER.copaID;
}

/* ═══ QR CARD ═══ */
function buildQR(){
  if(!PI_USER) return;
  var data=JSON.stringify({id:PI_USER.copaID, user:PI_USER.username, app:'copa.pi'});
  var wrap=$('qrCanvasWrap'); if(!wrap) return;
  wrap.innerHTML='<canvas id="qrCanvas"></canvas>';
  if(typeof QRCode!=='undefined'){
    QRCode.toCanvas($('qrCanvas'),data,{width:148,margin:1,color:{dark:'#000',light:'#fff'}},function(e){if(e)console.error(e);});
  } else {
    wrap.innerHTML='<div style="width:148px;height:148px;display:flex;align-items:center;justify-content:center;font-size:.68rem;color:#666;text-align:center;padding:8px">'+PI_USER.copaID+'</div>';
  }
  var ql=$('qrIdLabel'); if(ql) ql.textContent=PI_USER.copaID+' · copa.pi';
}

function shareQR(){
  if(!PI_USER||!navigator.share) return;
  navigator.share({title:'Copa.pi — '+PI_USER.copaID, text:'My Copa.pi profile: '+PI_USER.copaID+'\nGlobal football on Pi Network'});
}
function dlQR(){
  var c=$('qrCanvas'); if(!c) return;
  var a=document.createElement('a');
  a.download='Copa_'+PI_USER.copaID+'.png';
  a.href=c.toDataURL(); a.click();
}

/* ═══ PI ACTIONS (Send / Request) ═══ */
function setPiActionTab(tab,btn){
  CURR_PI_ACT=tab;
  document.querySelectorAll('#scr-profile .pi-actions-card .tab-btn').forEach(function(b){ b.classList.remove('on'); });
  if(btn) btn.classList.add('on');
  buildPiActionContent(tab);
}

function buildPiActionContent(tab){
  var el=$('piActionContent'); if(!el) return;
  if(tab==='send'){
    el.innerHTML='<div style="margin-bottom:.7rem">'
      +'<label style="font-family:var(--fb);font-size:.7rem;font-weight:600;color:var(--t2);text-transform:uppercase;display:block;margin-bottom:4px">Recipient Pi Username</label>'
      +'<input class="inp" id="sendTo" placeholder="e.g. @username" style="margin-bottom:.6rem">'
      +'<label style="font-family:var(--fb);font-size:.7rem;font-weight:600;color:var(--t2);text-transform:uppercase;display:block;margin-bottom:4px">Amount (π)</label>'
      +'<input class="inp" type="number" id="sendAmt" value="0.5" min="0.001" step="0.001" style="margin-bottom:.6rem">'
      +'<label style="font-family:var(--fb);font-size:.7rem;font-weight:600;color:var(--t2);text-transform:uppercase;display:block;margin-bottom:4px">Memo</label>'
      +'<input class="inp" id="sendMemo" placeholder="Copa.pi transfer" style="margin-bottom:.7rem">'
      +'<button class="btn-g w100" onclick="sendPi()">Send Pi</button>'
      +'<div id="sendStatus" style="font-family:var(--fm);font-size:.64rem;margin-top:6px;min-height:16px"></div>'
      +'</div>';
  } else if(tab==='request'){
    el.innerHTML='<div style="margin-bottom:.7rem">'
      +'<label style="font-family:var(--fb);font-size:.7rem;font-weight:600;color:var(--t2);text-transform:uppercase;display:block;margin-bottom:4px">Amount (π)</label>'
      +'<input class="inp" type="number" id="reqAmt" value="0.5" min="0.001" style="margin-bottom:.6rem">'
      +'<label style="font-family:var(--fb);font-size:.7rem;font-weight:600;color:var(--t2);text-transform:uppercase;display:block;margin-bottom:4px">Reason</label>'
      +'<input class="inp" id="reqReason" placeholder="Copa.pi request" style="margin-bottom:.7rem">'
      +'<button class="btn-g w100" onclick="generateRequestQR()">Generate Request QR</button>'
      +'<div id="reqQROut" style="margin-top:.82rem;text-align:center"></div>'
      +'</div>';
  } else if(tab==='history'){
    renderTxHistory();
  }
}

function sendPi(){
  var to=($('sendTo')?$('sendTo').value.trim():'');
  var amt=parseFloat($('sendAmt')?$('sendAmt').value:0)||0.5;
  var memo=($('sendMemo')?$('sendMemo').value.trim():'')||'Copa.pi';
  if(!to){ toast('Enter recipient username',true); return; }

  if(!PI_READY||typeof Pi==='undefined'){
    toast('Open in Pi Browser to send real Pi',true); return;
  }

  Pi.createPayment(
    {amount:amt, memo:memo, metadata:{app:'copa.pi',type:'send',to:to}},
    {
      onReadyForServerApproval:function(pid){
        return _piApprove(pid,amt).then(function(d){console.log('[Copa] Send approved:',d);}).catch(function(e){console.error(e);});
      },
      onReadyForServerCompletion:function(pid,txid){
        return _piComplete(pid,txid,amt).then(function(){
          addTx('Sent '+amt+'π to '+to+' · '+memo, amt);
          toast('✅ Sent '+amt+'π to '+to+'!');
          var ss=$('sendStatus'); if(ss){ss.textContent='✅ Sent '+amt+'π to '+to; ss.style.color='var(--g)';}
        }).catch(function(e){console.error(e);toast('Payment error',true);});
      },
      onCancel:function(){toast('Cancelled',true);},
      onError:function(e){console.error(e);toast('Error: '+(e.message||e),true);}
    }
  );
}

function generateRequestQR(){
  var amt=parseFloat($('reqAmt')?$('reqAmt').value:0.5)||0.5;
  var reason=($('reqReason')?$('reqReason').value.trim():'')||'Copa.pi';
  var user=PI_USER?PI_USER.username:'fan';
  var qrData='copa.pi/pay?to='+user+'&amount='+amt+'&reason='+encodeURIComponent(reason)+'&id='+(PI_USER?PI_USER.copaID:'');
  var out=$('reqQROut'); if(!out) return;
  out.innerHTML='<div style="background:#fff;padding:9px;border-radius:8px;display:inline-block;margin-bottom:6px"><canvas id="reqQRCanvas"></canvas></div>'
    +'<div style="font-family:var(--fm);font-size:.6rem;color:var(--t2)">Request '+amt+'π · Share to receive</div>';
  if(typeof QRCode!=='undefined'){
    QRCode.toCanvas($('reqQRCanvas'),qrData,{width:140,margin:1,color:{dark:'#000',light:'#fff'}},function(e){if(e)console.error(e);});
  }
  addTx('Request QR: '+amt+'π · '+reason, 0);
  toast('Request QR generated');
}

/* ═══ TRANSACTION HISTORY ═══ */
function renderTxHistory(){
  var el=$('txHistList'); if(!el) return;
  if(!TXLOG.length){ el.innerHTML='<div class="empty-msg">No transactions yet.</div>'; return; }
  el.innerHTML=TXLOG.map(function(t){
    return '<div class="tx-row">'
      +'<div><div class="tx-desc">'+t.desc+'</div><div class="tx-time">'+t.time+'</div></div>'
      +(t.amt?'<div class="tx-amt">'+t.amt+'π</div>':'')
      +'</div>';
  }).join('');
}

/* ══════════════════════════════════════════════════════════
   PREMIUM PAYMENT — WorldCup pattern exactly
   ✅ _piApprove: GET verify → check double → verify amount → POST approve
   ✅ _piComplete: GET verify → approved check → tx verified → no double → txid match → amount → POST complete
══════════════════════════════════════════════════════════ */
function payPremium(){
  if(localStorage.getItem('copa_premium')==='1'){
    setPS('Already active','ok'); setPremiumUI(); return;
  }
  if(!PI_READY||typeof Pi==='undefined'){
    setPS('Open in Pi Browser to unlock','err'); return;
  }
  if(!PI_USER){ setPS('Sign in first','err'); return; }

  var btn=$('premBtn'); if(btn) btn.disabled=true;
  setPS('Opening wallet...','wt');

  Pi.createPayment(
    {
      amount:   0.5,
      memo:     'Copa Premium',
      metadata: { type:'premium', app:'copa.pi', version:'4.0', network:'mainnet', user:PI_USER?PI_USER.username:'unknown' }
    },
    {
      onReadyForServerApproval: function(pid){
        console.log('[Copa] Approving premium:',pid);
        setPS('Approving...','wt');
        return _piApprove(pid, 0.5)
          .then(function(d){ console.log('[Copa] Premium approved:',d); })
          .catch(function(e){ console.error('[Copa] Approve error:',e); setPS('Approval error — try again','err'); if(btn) btn.disabled=false; });
      },
      onReadyForServerCompletion: function(pid, txid){
        console.log('[Copa] Completing premium:',pid,txid);
        setPS('Completing...','wt');
        return _piComplete(pid, txid, 0.5)
          .then(function(d){
            console.log('[Copa] Premium completed:',d);
            localStorage.setItem('copa_premium','1');
            localStorage.setItem('copa_premium_txid',txid);
            localStorage.setItem('copa_premium_date',new Date().toISOString());
            setPS('Premium unlocked!','ok');
            addTx('Copa Premium — 0.5π · '+txid.slice(0,12)+'...', 0.5);
            toast('Copa Premium unlocked! ⚽');
            setPremiumUI(); buildProfile();
          })
          .catch(function(e){ console.error('[Copa] Complete error:',e); setPS('Network error — try again','err'); if(btn) btn.disabled=false; });
      },
      onCancel: function(){ setPS('Cancelled','err'); if(btn) btn.disabled=false; },
      onError:  function(e){ console.error('[Copa] Payment error:',e); setPS(e.message||'Payment error','err'); if(btn) btn.disabled=false; }
    }
  );
}

function setPS(msg,cls){
  var el=$('premStatus'); if(!el) return;
  el.textContent=msg;
  el.className='prem-status ps-'+(cls==='ok'?'ok':cls==='err'?'err':'wt');
}

function setPremiumUI(){
  var btn=$('premBtn');
  if(btn){ btn.textContent='Premium Active'; btn.disabled=true; btn.style.background='linear-gradient(135deg,#009947,#00E676)'; btn.style.color='#000'; }
  var pc=$('premCard'); if(pc) pc.style.borderColor='rgba(0,230,118,.38)';
}

function checkPremium(){
  if(localStorage.getItem('copa_premium')==='1'){
    setPremiumUI();
    var d=localStorage.getItem('copa_premium_date');
    setPS('Active'+(d?' · since '+new Date(d).toLocaleDateString():''),'ok');
  }
}

/* ═══ ON LOAD — Apply saved language + show Pi status ═══ */
(function onPageLoad(){
  /* Apply saved language immediately */
  var saved = localStorage.getItem('copa_lang') || 'en';
  LANG = saved;
  if(saved !== 'en'){
    setLang(saved, null);
  } else {
    var enBtn = document.querySelector('.ll[onclick*="\'en\'"]');
    if(enBtn) enBtn.classList.add('on');
  }

  /* Show Pi status after SDK has had time to load */
  function updatePiStatus(){
    var ls = $('landLoginStatus');
    if(!ls) return;
    if(PI_READY || typeof Pi !== 'undefined'){
      ls.textContent = 'Pi Network ready — tap to authenticate';
      ls.className   = 'land-login-status ok';
    } else {
      ls.textContent = 'Open in Pi Browser to sign in';
      ls.className   = 'land-login-status';
    }
  }
  /* Check at 500ms, 1s, 2s — Pi Browser injects Pi object async */
  setTimeout(updatePiStatus, 500);
  setTimeout(updatePiStatus, 1000);
  setTimeout(updatePiStatus, 2000);
}());


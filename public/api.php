<?php
declare(strict_types=1);
date_default_timezone_set('America/Denver');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function respond(array $data, int $code = 200): never {
    http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); exit;
}
function fail(string $message, int $code=400): never { respond(['error'=>$message],$code); }
function validDate(mixed $date): bool {
    if (!is_string($date)) return false;
    $d=DateTimeImmutable::createFromFormat('!Y-m-d',$date);
    return $d && $d->format('Y-m-d') === $date;
}
try {
    $private=getenv('GINGER_DATA_DIR') ?: dirname(__DIR__).'/private';
    $preview=getenv('GINGER_LOCAL_PREVIEW')==='1' && in_array($_SERVER['REMOTE_ADDR']??'', ['127.0.0.1','::1'],true)
        && in_array($_SERVER['SERVER_ADDR']??'127.0.0.1', ['127.0.0.1','::1'],true);
    $config=is_file($private.'/config.php') ? require $private.'/config.php' : [];
    $hash=$config['password_hash']??'';
    $configured=str_starts_with($hash,'$2') || str_starts_with($hash,'$argon2');
    if (!$preview && !$configured) respond(['configured'=>false,'authenticated'=>false],503);
    ini_set('session.use_strict_mode','1');
    session_name('ginger_hours');
    // Use the visible URL, since Apache can rewrite /hours/api.php to /hours/public/api.php.
    $requestPath=parse_url($_SERVER['REQUEST_URI']??$_SERVER['SCRIPT_NAME'],PHP_URL_PATH);
    session_set_cookie_params(['lifetime'=>0,'path'=>rtrim(str_replace('\\','/',dirname($requestPath)), '/').'/',
        'secure'=>!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off','httponly'=>true,'samesite'=>'Strict']);
    session_start();
    if (isset($_SESSION['last']) && time()-$_SESSION['last']>43200) $_SESSION=[];
    $authenticated=$preview || (($_SESSION['authenticated']??false) && ($_SESSION['credential']??'')===hash('sha256',$hash));
    $db=new PDO('sqlite:'.$private.'/hours.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $db->exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1); CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS attempts (ip TEXT PRIMARY KEY, count INTEGER, since INTEGER);');
    $seedPath=is_file($private.'/seed.json')?$private.'/seed.json':dirname(__DIR__).'/private/seed.json';
    $seed=json_decode(file_get_contents($seedPath),true,512,JSON_THROW_ON_ERROR);
    $entryStart=$seed['settings']['entryStart']??($seed['periods']?end($seed['periods'])['start']:$seed['settings']['weeklyStart']);
    if (!$db->query("SELECT value FROM meta WHERE key='seeded'")->fetchColumn()) {
        $db->exec('BEGIN IMMEDIATE');
        if (!$db->query("SELECT value FROM meta WHERE key='seeded'")->fetchColumn()) {
            $stmt=$db->prepare('INSERT OR IGNORE INTO records(id,payload) VALUES(?,?)');
            foreach($seed['records'] as $record) $stmt->execute([$record['id'],json_encode($record)]);
            $db->exec("INSERT INTO meta(key,value) VALUES('seeded','1')");
        }
        $db->exec('COMMIT');
    }
    // Upgrade existing installations without changing hours, notes or new Flex entries.
    if (!$db->query("SELECT value FROM meta WHERE key='engagement-v2'")->fetchColumn()) {
        $db->exec('BEGIN IMMEDIATE');
        if (!$db->query("SELECT value FROM meta WHERE key='engagement-v2'")->fetchColumn()) {
            $update=$db->prepare('UPDATE records SET payload=?,version=version+1 WHERE id=?');
            foreach($db->query('SELECT id,payload FROM records')->fetchAll(PDO::FETCH_ASSOC) as $stored) {
                $record=json_decode($stored['payload'],true,512,JSON_THROW_ON_ERROR);
                if (($record['archived']??false) && $record['category']==='flex' && str_starts_with(strtolower($record['originalCategory']??''),'engagement')) {
                    $record['category']='engagement';$update->execute([json_encode($record,JSON_THROW_ON_ERROR),$stored['id']]);
                }
            }
            $db->exec("INSERT OR REPLACE INTO meta(key,value) VALUES('engagement-v2','1')");
        }
        $db->exec('COMMIT');
    }
    $action=$_GET['action']??'state';
    $method=$_SERVER['REQUEST_METHOD'];
    $body=[];
    if ($method==='POST') {
        if (!str_starts_with($_SERVER['CONTENT_TYPE']??'','application/json')) fail('JSON request required.',415);
        if ((int)($_SERVER['CONTENT_LENGTH']??0)>20000) fail('Request too large.',413);
        $body=json_decode(file_get_contents('php://input'),true,16,JSON_THROW_ON_ERROR);
        if (!is_array($body)) fail('Invalid request.');
    }
    if ($action==='session' && $method==='GET') {
        if ($authenticated) {$_SESSION['last']=time();$_SESSION['csrf']??=bin2hex(random_bytes(32));}
        respond(['configured'=>true,'authenticated'=>$authenticated,'preview'=>$preview,'csrf'=>$authenticated?$_SESSION['csrf']:null]);
    }
    if ($action==='login' && $method==='POST') {
        $ip=$_SERVER['REMOTE_ADDR']??'unknown';
        $stmt=$db->prepare('SELECT * FROM attempts WHERE ip=?');$stmt->execute([$ip]);$attempt=$stmt->fetch(PDO::FETCH_ASSOC);
        if ($attempt && (int)$attempt['since']>time()-900 && (int)$attempt['count']>=10) fail('Too many attempts. Try again in 15 minutes.',429);
        if (!is_string($body['pin']??null) || !preg_match('/^[0-9]{4}$/D',$body['pin']) || !password_verify($body['pin'],$hash)) {
            $stmt=$db->prepare('INSERT INTO attempts(ip,count,since) VALUES(?,1,?) ON CONFLICT(ip) DO UPDATE SET count=CASE WHEN since<? THEN 1 ELSE count+1 END,since=CASE WHEN since<? THEN excluded.since ELSE since END');
            $stmt->execute([$ip,time(),time()-900,time()-900]);fail('That PIN did not match.',401);
        }
        $stmt=$db->prepare('DELETE FROM attempts WHERE ip=?');$stmt->execute([$ip]);
        session_regenerate_id(true);$_SESSION=['authenticated'=>true,'credential'=>hash('sha256',$hash),'last'=>time(),'csrf'=>bin2hex(random_bytes(32))];
        respond(['authenticated'=>true,'csrf'=>$_SESSION['csrf'],'preview'=>false]);
    }
    if (!$authenticated) fail('Please sign in.',401);
    $_SESSION['last']=time();$_SESSION['csrf']??=bin2hex(random_bytes(32));
    if ($method==='POST' && !hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??'')) fail('Session check failed. Reload and try again.',403);
    if ($action==='logout' && $method==='POST') {$_SESSION=[];session_destroy();respond(['ok'=>true]);}
    if ($action==='state' && $method==='GET') {
        $records=[];
        foreach($db->query('SELECT payload,version FROM records') as $r) {
            $record=json_decode($r['payload'],true);$record['version']=(int)$r['version'];$records[]=$record;
        }
        $seed['records']=$records; respond($seed);
    }
    if (in_array($action,['save','delete'],true) && $method==='POST') {
        $id=$body['id']??'';
        if (!is_string($id)||!preg_match('/^[a-zA-Z0-9-]{1,80}$/',$id)) fail('Invalid entry ID.');
        $db->exec('BEGIN IMMEDIATE');
        $stmt=$db->prepare('SELECT payload,version FROM records WHERE id=?');$stmt->execute([$id]);$old=$stmt->fetch(PDO::FETCH_ASSOC);
        $oldRecord=$old?json_decode($old['payload'],true):[];
        if ($old && (int)($body['version']??0)!==(int)$old['version']) fail('This entry changed on another device. Refresh before editing.',409);
        if ($action==='delete') {
            if (!$old) fail('Entry no longer exists.',404);
            if ($oldRecord['archived']) fail('Set an imported row to zero hours to remove its hours while keeping its source record.');
            $stmt=$db->prepare('DELETE FROM records WHERE id=?');$stmt->execute([$id]);$db->exec('COMMIT');respond(['ok'=>true]);
        }
        $date=$body['date']??null;$kind=$body['kind']??'';$category=$body['category']??'';$hours=$body['hours']??null;$note=$body['note']??'';
        if ($old && $oldRecord['archived']) {
            $original=array_column($seed['records'],null,'id')[$id]??null;
            if (!$original) fail('The source record could not be found.');
            if ($kind!=='work'||$date!==$oldRecord['start']) fail('Imported entries stay attached to their original period.');
            if (!in_array($category,['admin','whimc','invite','teaching','flex','engagement'],true)) fail('Choose a category.');
            if (!is_numeric($hours)||!is_finite((float)$hours)||$hours<0||$hours>10000||$hours*2!=floor($hours*2)) fail('Use 30-minute increments for the period total, including zero.');
            $extraNote=$body['extraNote']??($oldRecord['extraNote']??'');
            if (!is_string($note)||strlen($note)>6000||!is_string($extraNote)||strlen($extraNote)>6000) fail('Keep each note under 6,000 bytes.');
            if ($category===$oldRecord['category']&&(float)$hours===(float)$oldRecord['hours']&&trim($note)===$oldRecord['note']&&trim($extraNote)===($oldRecord['extraNote']??'')) {
                $db->exec('COMMIT');$oldRecord['version']=(int)$old['version'];respond(['record'=>$oldRecord]);
            }
            $record=$oldRecord;
            $record['category']=$category;$record['hours']=(float)$hours;$record['note']=trim($note);$record['extraNote']=trim($extraNote);
            $record['originalValues']=['category'=>$original['category'],'hours'=>$original['hours'],'note'=>$original['note'],'extraNote'=>$original['extraNote']??''];
            $record['updatedAt']=gmdate('c');$version=(int)$old['version']+1;
            $stmt=$db->prepare('UPDATE records SET payload=?,version=? WHERE id=?');
            $stmt->execute([json_encode($record,JSON_THROW_ON_ERROR),$version,$id]);$db->exec('COMMIT');
            $record['version']=$version;respond(['record'=>$record]);
        }
        if (!validDate($date)||$date<$entryStart||$date>'2100-12-31') fail('Choose a date within this log. Earlier hours may be imported period totals.');
        if (!is_string($note)||strlen($note)>6000) fail('Keep notes under 6,000 bytes.');
        if (!in_array($kind,['work','leave'],true)) fail('Choose work or leave.');
        if (!is_numeric($hours)||!is_finite((float)$hours)||$hours<=0) fail('Enter a positive duration.');
        $hours=(float)$hours;
        if ($kind==='work') {
            if (!in_array($category,['admin','whimc','invite','teaching','flex','engagement'],true)) fail('Choose a category.');
            if ($hours>24||$hours*2!==floor($hours*2)) fail('Use 30-minute increments, up to 24 hours.');
            $now=new DateTimeImmutable('now',new DateTimeZone('America/Denver'));
            $workDate=((int)$now->format('G')<2?$now->modify('-1 day'):$now)->format('Y-m-d');
            if ($date>$workDate) fail('Work entries cannot be in the future. Workdays begin at 2 a.m. Denver time.');
        } else {
            if (!in_array($category,['vacation','sick','holiday','other'],true)) fail('Choose a leave type.');
            if (!in_array($hours,[4.0,8.0],true)) fail('Choose a half day or full day.');
            if ($category==='other' && trim($note)==='') fail('Please explain Other leave.');
            $sameDay=0;
            foreach($db->query('SELECT id,payload FROM records') as $r) {
                $p=json_decode($r['payload'],true);
                if ($r['id']!==$id && $p['start']===$date && $p['kind']==='leave') $sameDay+=$p['hours'];
            }
            if ($sameDay+$hours>8) fail('Leave cannot exceed eight hours on one day.');
            $dow=(int)(new DateTimeImmutable($date))->format('N');
            if ($dow>=6) fail('Leave reduces a workday target. Please choose Monday–Friday.');
        }
        $oldRecord=$old?json_decode($old['payload'],true):[];
        $record=['id'=>$id,'kind'=>$kind,'category'=>$category,'hours'=>$hours,'start'=>$date,'end'=>$date,'note'=>trim($note),'archived'=>false,
            'createdAt'=>$oldRecord['createdAt']??gmdate('c'),'updatedAt'=>gmdate('c')];
        $version=$old?(int)$old['version']+1:1;
        $stmt=$db->prepare('INSERT INTO records(id,payload,version) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,version=excluded.version');
        $stmt->execute([$id,json_encode($record,JSON_THROW_ON_ERROR),$version]);$db->exec('COMMIT');
        $record['version']=$version; respond(['record'=>$record]);
    }
    fail('Unknown request.',404);
} catch (JsonException $e) {fail('Invalid JSON.',400);
} catch (Throwable $e) {error_log((string)$e);fail('The server could not save or load your hours. Your entry has not been confirmed. Please retry.',500);}

<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') {http_response_code(404);exit;}
function reject(string $message): never {fwrite(STDERR,$message."\n");exit(1);}
function validDate(mixed $date): bool {
    if (!is_string($date)) return false;
    $d=DateTimeImmutable::createFromFormat('!Y-m-d',$date);
    return $d && $d->format('Y-m-d')===$date;
}
try {
    $file=$argv[1]??'';
    if (!$file || !is_file($file)) reject('Usage: php tools/restore_backup.php /private/path/backup.json');
    if (filesize($file)>20*1024*1024) reject('Backup is too large.');
    $backup=json_decode(file_get_contents($file),true,512,JSON_THROW_ON_ERROR);
    $private=getenv('GINGER_DATA_DIR')?:dirname(__DIR__).'/private';
    $seedPath=is_file($private.'/seed.json')?$private.'/seed.json':dirname(__DIR__).'/private/seed.json';
    $seed=json_decode(file_get_contents($seedPath),true,512,JSON_THROW_ON_ERROR);
    $entryStart=$seed['settings']['entryStart']??($seed['periods']?end($seed['periods'])['start']:$seed['settings']['weeklyStart']);
    $legacyPolicy='Server, research and meetings → WHIMC/QRF; admin variants → Admin; media, curriculum and engagement variants → Faculty flex time; standalone teaching → Teaching.';
    if (($backup['import']['categoryPolicy']??null)===$legacyPolicy) {
        foreach($backup['records'] as &$r) {
            if (($r['archived']??false) && ($r['category']??null)==='flex' && str_starts_with(strtolower($r['originalCategory']??''),'engagement')) $r['category']='engagement';
        }
        unset($r);$backup['import']['categoryPolicy']=$seed['import']['categoryPolicy'];
    }
    if (($backup['version']??null)!==1 || ($backup['periods']??null)!=$seed['periods'] || ($backup['settings']??null)!=$seed['settings'] || ($backup['import']??null)!=$seed['import']) reject('Backup period/import metadata does not match this installation.');
    if (!is_array($backup['records']??null)) reject('Missing records.');
    $original=array_column($seed['records'],null,'id');$seen=[];$leave=[];
    foreach($backup['records'] as &$record) {
        if (!is_array($record)||!is_string($record['id']??null)||!preg_match('/^[a-zA-Z0-9-]{1,80}$/',$record['id'])||isset($seen[$record['id']])) reject('Invalid or duplicate record ID.');
        $seen[$record['id']]=true;unset($record['version']);
        if (isset($original[$record['id']])) {
            $source=$original[$record['id']];$fixed=$record;$fixedSource=$source;
            foreach(['category','hours','note','extraNote','originalValues','updatedAt'] as $field) {unset($fixed[$field]);unset($fixedSource[$field]);}
            if ($fixed!=$fixedSource) reject('Imported record dates or source metadata differ from the preserved source.');
            $h=$record['hours']??null;
            if (!in_array($record['category']??null,['admin','whimc','invite','teaching','flex','engagement'],true)||!is_numeric($h)||!is_finite((float)$h)||$h<0||$h>10000||$h*2!=floor($h*2)) reject('Invalid imported category or hours.');
            foreach(['note','extraNote'] as $field) if (!is_string($record[$field]??'')||strlen($record[$field]??'')>6000) reject('Invalid imported note.');
            $baseline=['category'=>$source['category'],'hours'=>$source['hours'],'note'=>$source['note'],'extraNote'=>$source['extraNote']??''];
            if (isset($record['originalValues'])&&$record['originalValues']!=$baseline) reject('Original imported values do not match the source.');
            $current=['category'=>$record['category'],'hours'=>$record['hours'],'note'=>$record['note']??'','extraNote'=>$record['extraNote']??''];
            if ($current!=$baseline) $record['originalValues']=$baseline;
            continue;
        }
        if (($record['archived']??null)!==false||!validDate($record['start']??null)||$record['start']<$entryStart||$record['start']>'2100-12-31'||($record['end']??null)!==$record['start']) reject('Invalid daily record date.');
        $h=$record['hours']??null;$note=$record['note']??null;
        if (!is_numeric($h)||!is_finite((float)$h)||$h<=0||!is_string($note)||strlen($note)>6000) reject('Invalid duration or note.');
        if (($record['kind']??null)==='work') {
            if (!in_array($record['category']??null,['admin','whimc','invite','teaching','flex','engagement'],true)||$h>24||$h*2!=floor($h*2)) reject('Invalid work entry.');
        } elseif (($record['kind']??null)==='leave') {
            if (!in_array($record['category']??null,['vacation','sick','holiday','other'],true)||!in_array((float)$h,[4.0,8.0],true)||($record['category']==='other'&&trim($note)==='')) reject('Invalid leave entry.');
            if ((int)(new DateTimeImmutable($record['start']))->format('N')>=6) reject('Leave must be on a weekday.');
            $leave[$record['start']]=($leave[$record['start']]??0)+(float)$h;
            if ($leave[$record['start']]>8) reject('Daily leave exceeds eight hours.');
        } else reject('Invalid record type.');
    }
    unset($record);
    foreach($original as $id=>$record) if (!isset($seen[$id])) reject('An imported record is missing from the backup.');
    $private=getenv('GINGER_DATA_DIR')?:dirname(__DIR__).'/private';
    if (!is_file($private.'/hours.sqlite')) reject('No existing database. Open the configured app once before restoring.');
    fwrite(STDOUT,'This will replace all saved entries with '.count($backup['records'])." records. Type RESTORE to continue: ");
    if (trim((string)fgets(STDIN))!=='RESTORE') reject('Restore cancelled.');
    $db=new PDO('sqlite:'.$private.'/hours.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $db->exec('PRAGMA busy_timeout=5000');
    $safety=$private.'/before-restore-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(3)).'.sqlite';
    $db->exec('VACUUM INTO '.$db->quote($safety));
    $db->exec('BEGIN IMMEDIATE');$db->exec('DELETE FROM records');
    $insert=$db->prepare('INSERT INTO records(id,payload,version) VALUES(?,?,?)');
    $revision=(int)(microtime(true)*1000000);
    foreach($backup['records'] as $r) $insert->execute([$r['id'],json_encode($r,JSON_THROW_ON_ERROR),$revision]);
    $db->exec('COMMIT');
    fwrite(STDOUT,"Restored. Safety database: ".$safety."\nRefresh every open app tab before editing.\n");
} catch (Throwable $e) {reject('Restore failed: '.$e->getMessage());}

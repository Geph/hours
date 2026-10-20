<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') {http_response_code(404);exit;}
fwrite(STDOUT,"New 4-digit PIN (terminal input may be visible): ");
$pin=rtrim((string)fgets(STDIN),"\r\n");
if (!preg_match('/^[0-9]{4}$/D',$pin)) {fwrite(STDERR,"Use exactly four digits (0-9).\n");exit(1);}
$private=getenv('GINGER_DATA_DIR') ?: dirname(__DIR__).'/private';
if (!is_dir($private) && !mkdir($private,0700,true)) {fwrite(STDERR,"Could not create private data directory.\n");exit(1);}
// A fresh install starts empty in this workweek. Existing private history is never replaced.
if (!is_file($private.'/seed.json') && !is_file(dirname(__DIR__).'/private/seed.json')) {
    $seed=json_decode(file_get_contents(dirname(__DIR__).'/private/seed.example.json'),true,512,JSON_THROW_ON_ERROR);
    $now=new DateTimeImmutable('now',new DateTimeZone($seed['settings']['timezone']));
    if ((int)$now->format('G')<2) $now=$now->modify('-1 day');
    $seed['settings']['weeklyStart']=$now->modify('-'.$now->format('w').' days')->format('Y-m-d');
    if (file_put_contents($private.'/seed.json',json_encode($seed,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR),LOCK_EX)===false) {fwrite(STDERR,"Could not initialize private dataset.\n");exit(1);}
    @chmod($private.'/seed.json',0600);
}
$path=$private.'/config.php';
if (file_put_contents($path,"<?php\nreturn ['password_hash' => ".var_export(password_hash($pin,PASSWORD_DEFAULT),true)."];\n",LOCK_EX)===false) {fwrite(STDERR,"Could not save PIN configuration.\n");exit(1);}
@chmod($path,0600);
fwrite(STDOUT,"PIN configured. Existing sessions will need to sign in again.\n");

"""Synthetic integration checks. No personal database or dataset is read."""
import http.cookiejar
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
PHP=os.environ.get('PHP_BIN') or shutil.which('php')
if not PHP:raise SystemExit('Install PHP with PDO SQLite or set PHP_BIN.')


def main():
    runtime=ROOT/'.runtime';runtime.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='api-test-',dir=runtime) as td:
        private=Path(td);env={**os.environ,'GINGER_DATA_DIR':td};env.pop('GINGER_LOCAL_PREVIEW',None)
        # This PIN is only for this disposable test instance, never a deployed account.
        pin='0007'
        setup=lambda value:subprocess.run([PHP,str(ROOT/'tools/set_pin.php')],input=value+'\n',text=True,capture_output=True,env=env)
        for invalid in ['123','12345','abcd']:assert setup(invalid).returncode==1
        assert not (private/'config.php').exists()
        assert setup(pin).returncode==0
        seed=json.loads((private/'seed.json').read_text());assert seed['records']==[] and seed['periods']==[]
        with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
        with open(private/'server.log','w') as log:
            proc=subprocess.Popen([PHP,'-S',f'127.0.0.1:{port}','-t',str(ROOT/'public')],stdout=log,stderr=log,env=env,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            def request(action,body=None,csrf=None):
                headers={};data=None
                if body is not None:headers['Content-Type']='application/json';data=json.dumps(body).encode()
                if csrf:headers['X-CSRF-Token']=csrf
                req=urllib.request.Request(f'http://127.0.0.1:{port}/api.php?action='+action,data=data,headers=headers)
                try:
                    with client.open(req,timeout=10) as response:return response.status,json.load(response)
                except urllib.error.HTTPError as error:return error.code,json.load(error)
            try:
                for _ in range(50):
                    try:status,session=request('session');break
                    except OSError:
                        if proc.poll() is not None:raise AssertionError('PHP server did not start; check PDO SQLite.')
                        time.sleep(.1)
                else:raise AssertionError('PHP server did not start.')
                assert status==200 and not session['authenticated']
                assert request('state')[0]==401
                assert request('login',{'pin':'nope'})[0]==401
                status,session=request('login',{'pin':pin});assert status==200
                csrf=session['csrf'];status,state=request('state');assert status==200 and state['records']==[]
                date=subprocess.run([PHP,'-r',"$n=new DateTimeImmutable('now',new DateTimeZone('America/Denver'));echo ((int)$n->format('G')<2?$n->modify('-1 day'):$n)->format('Y-m-d');"],capture_output=True,text=True,check=True).stdout
                work={'id':'synthetic-work','kind':'work','date':date,'category':'admin','hours':.5,'note':'Synthetic test entry'}
                assert request('save',work)[0]==403
                assert request('save',{**work,'hours':.25},csrf)[0]==400
                status,result=request('save',{**work,'createdAt':'2000-01-01T00:00:00Z'},csrf);assert status==200
                entered=result['record']['createdAt'];assert entered!='2000-01-01T00:00:00Z'
                status,result=request('save',{**work,'version':1,'hours':1},csrf);assert status==200 and result['record']['createdAt']==entered
                assert request('save',{**work,'version':1},csrf)[0]==409
                # Changing the PIN must not reset the private seed or accumulated records.
                before=(private/'seed.json').read_bytes();assert setup(pin).returncode==0;assert (private/'seed.json').read_bytes()==before
                assert request('state')[0]==401
                status,session=request('login',{'pin':pin});assert status==200;csrf=session['csrf']
                status,backup=request('state');assert status==200
                backup_path=private/'backup.json';backup_path.write_text(json.dumps(backup))
                restore=subprocess.run([PHP,str(ROOT/'tools/restore_backup.php'),str(backup_path)],input='RESTORE\n',capture_output=True,text=True,env=env)
                assert restore.returncode==0,restore.stdout+restore.stderr
                status,state=request('state');assert status==200 and state['records'][0]['createdAt']==entered
                record=state['records'][0];assert request('delete',{'id':record['id'],'version':record['version']},csrf)[0]==200
                assert request('logout',{},csrf)[0]==200 and request('state')[0]==401
                for _ in range(10):assert request('login',{'pin':'9999'})[0]==401
                assert request('login',{'pin':pin})[0]==429
                (private/'config.php').unlink();assert request('session')[0]==503
                print('PASS: empty setup, PIN/leading zeros, private API, CSRF, entry/edit timestamps, conflicts, backup/restore, PIN reset preservation, and guess limiting.')
            finally:
                proc.terminate();proc.wait(timeout=10)

if __name__=='__main__':main()

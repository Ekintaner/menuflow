import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
const container = `menuflow-db-test-${process.pid}`;
function docker(args, input) {
 const result = spawnSync('docker', args, { input, encoding: 'utf8' });
 if (result.status !== 0) throw new Error(result.stderr || result.stdout);
 return result.stdout + result.stderr;
}
try {
 docker(['run','--rm','-d','--name',container,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine']);
 let ready = false;
 for (let i=0;i<60;i++) {
  if(spawnSync('docker',['exec',container,'pg_isready','-U','postgres']).status===0) { ready=true; break; }
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 if(!ready) throw new Error('Local PostgreSQL did not become ready');
 const sql = path => docker(['exec','-i',container,'psql','-X','-U','postgres','-v','ON_ERROR_STOP=1'],readFileSync(path,'utf8'));
 sql('supabase/tests/bootstrap.sql');
 for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) sql(`supabase/migrations/${file}`);
 console.log(sql('supabase/tests/isolation.sql'));
} finally { docker(['rm','-f',container]); }

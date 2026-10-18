import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';
await import('./build-electron.mjs');
const server=await createServer({server:{host:'127.0.0.1',port:5173,strictPort:true}}); await server.listen();
const child=spawn(electron,['.'],{stdio:'inherit',env:{...process.env,GITATLAS_DEV:'1'}});
child.on('close',async()=>{await server.close();process.exit(0)});
process.on('SIGINT',()=>child.kill());

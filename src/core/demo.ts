import type { FileChange, GitCommit, HistoryData, RepositoryFile } from './model';
const hash=(n:number)=>n.toString(16).padStart(40,'0');
const titles=['Initial project','Build application shell','Add navigation components','Create repository reader','Refine typography and spacing','Add commit search','Introduce timeline playback','Improve keyboard navigation','Add activity heatmap','Refactor file explorer','Build snapshot comparison','Polish window transitions'];
const folders=['src/components','src/core','src/views','src/hooks','tests','docs'];
export function makeDemo():HistoryData {
  const data:HistoryData={version:1,repository:'atlas-studio',branch:'main',branches:['main'],totalCommits:64,commits:[],snapshots:{},shallow:false,source:'demo',scannedAt:'2026-10-17T12:00:00Z'};
  const files=new Map<string,RepositoryFile>();
  for(let i=0;i<64;i++){
    const id=hash(i+1);const date=new Date(Date.UTC(2026,1,6+i*4,9+i%13)).toISOString();
    const path=i===0?'README.md':`${folders[(i-1)%folders.length]}/${['Navigation','Timeline','Repository','Search','Activity','Inspector'][i%6]}${Math.floor(i/6)+1}.${i%6===5?'md':i%6===4?'test.ts':'tsx'}`;
    const changes:FileChange[]=[{path,type:'added',insertions:32+(i*37)%180,deletions:0}];
    files.set(path,{path,oid:hash(1000+i),mode:'100644'});
    if(i>2){const existing=[...files.keys()][i%Math.max(1,files.size-1)];changes.push({path:existing,type:'modified',insertions:10+i%38,deletions:4+i%21});files.set(existing,{path:existing,oid:hash(2000+i),mode:'100644'});}
    if(i%11===0&&i>0){const remove=[...files.keys()][1];changes.push({path:remove,type:'deleted',insertions:0,deletions:47});files.delete(remove);}
    const c:GitCommit={hash:id,shortHash:id.slice(-7),message:titles[i%titles.length],author:['Zheng','Alice','Zheng','Chen'][i%4],date,parents:i?[hash(i)]:[],branchRefs:i===63?['HEAD -> main']:[],changes,stats:{filesChanged:changes.length,insertions:changes.reduce((n,f)=>n+f.insertions,0),deletions:changes.reduce((n,f)=>n+f.deletions,0)}};
    data.commits.push(c);data.snapshots[id]={commitHash:id,totalFiles:files.size,files:[...files.values()]};
  }
  data.firstCommit={hash:data.commits[0].hash,message:data.commits[0].message,date:data.commits[0].date};return data;
}

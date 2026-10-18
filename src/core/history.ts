import type { FileChange, GitCommit, HistoryData, RepositorySnapshot } from './model';

// A commit describes a state with one or more parents. Merge changes are measured
// against the first parent, but every snapshot comes from its own Git tree.
export function applyChanges(previous: RepositorySnapshot, changes: FileChange[], hash: string): RepositorySnapshot {
  const files = new Map(previous.files.map(f=>[f.path,f]));
  for (const change of changes) {
    if (change.type === 'renamed' && change.oldPath) files.delete(change.oldPath);
    if (change.type === 'deleted') files.delete(change.path);
    else files.set(change.path,{path:change.path,oid:hash,mode:'100644'});
  }
  return {commitHash:hash,totalFiles:files.size,files:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path))};
}
export function compareSnapshots(a: RepositorySnapshot,b: RepositorySnapshot) {
  const before=new Map(a.files.map(f=>[f.path,f]));
  const after=new Map(b.files.map(f=>[f.path,f]));
  return {
    added:b.files.filter(f=>!before.has(f.path)),
    removed:a.files.filter(f=>!after.has(f.path)),
    modified:b.files.filter(f=>before.has(f.path)&&(before.get(f.path)!.oid!==f.oid||before.get(f.path)!.mode!==f.mode)),
  };
}
export interface QueryToken {field:'message'|'author'|'file'|'after'|'before';value:string}
export function parseQuery(input:string):QueryToken[] {
  const parts=input.match(/(?:[^\s"]+|"[^"]*")+/g)??[];
  return parts.map(part=>{
    const colon=part.indexOf(':');
    const field=part.slice(0,colon);
    return colon>0&&['message','author','file','after','before'].includes(field)
      ?{field:field as QueryToken['field'],value:part.slice(colon+1).replace(/^"|"$/g,'')}
      :{field:'message',value:part.replace(/^"|"$/g,'')};
  });
}
export function searchCommits(commits:GitCommit[],query:string) {
  const tokens=parseQuery(query);
  return commits.filter(c=>tokens.every(t=>{
    const value=t.value.toLowerCase();
    if(t.field==='author') return c.author.toLowerCase().includes(value);
    if(t.field==='file')return c.changes.some(f=>f.path.toLowerCase().includes(value)||f.oldPath?.toLowerCase().includes(value));
    if(t.field==='after'||t.field==='before') {
      if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value)))return false;
      return t.field==='after'?c.date.slice(0,10)>=value:c.date.slice(0,10)<=value;
    }
    return c.message.toLowerCase().includes(value);
  }));
}
export function contributors(commits:GitCommit[]) {
  const groups=new Map<string,{name:string;commits:GitCommit[];insertions:number;deletions:number;files:Set<string>}>();
  for(const c of commits){
    const key=c.email||c.author;
    const g=groups.get(key)??{name:c.author,commits:[],insertions:0,deletions:0,files:new Set<string>()};
    g.commits.push(c);g.insertions+=c.stats.insertions;g.deletions+=c.stats.deletions;
    c.changes.forEach(f=>g.files.add(f.path));groups.set(key,g);
  }
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
export function milestones(data:HistoryData) {
  const result:{title:string;commit:GitCommit}[]=[];
  const commits=data.commits;
  if(!commits.length)return result;
  const complete=commits.length===data.totalCommits&&!data.shallow;
  if(complete) result.push({title:'第一次提交',commit:commits[0]});
  if(complete&&commits[99])result.push({title:'第 100 次提交',commit:commits[99]});
  const merge=commits.find(c=>c.parents.length>1);
  if(merge)result.push({title:complete?'第一次合并':'已加载历史的首次合并',commit:merge});
  if(complete)for(const size of [10,50,100]){const c=commits.find(c=>data.snapshots[c.hash]?.totalFiles>=size);if(c)result.push({title:`首次达到 ${size} 个文件`,commit:c});}
  const largest=[...commits].sort((a,b)=>(b.stats.insertions+b.stats.deletions)-(a.stats.insertions+a.stats.deletions))[0];
  result.push({title:complete?'最大变更':'已加载历史的最大变更',commit:largest});
  return result;
}
export function fileHistory(data:HistoryData,path:string,index=data.commits.length-1) {
  const byHash=new Map(data.commits.map(c=>[c.hash,c]));
  const events:GitCommit[]=[];let name=path;let current:GitCommit|undefined=data.commits[index];
  let created:string|undefined;
  // Follow the first-parent lineage, not the linear display order of parallel branches.
  while(current){
    const change=current.changes.find(f=>f.path===name);
    if(change){events.push(current);if(change.type==='added'){created=current.date;break;}if(change.oldPath)name=change.oldPath;}
    current=byHash.get(current.parents[0]);
  }
  return {events:events.reverse(),created,lastModified:events.at(-1)?.date,partial:!created};
}
export function dailyActivity(commits:GitCommit[]) {
  const days:Record<string,number>={};
  for(const c of commits){const date=c.date.slice(0,10);days[date]=(days[date]??0)+1;}return days;
}
export function fileTypes(snapshot:RepositorySnapshot) {
  const counts:Record<string,number>={};
  for(const f of snapshot.files){const ext=f.path.split('/').at(-1)?.match(/\.([^.]+)$/)?.[1]??'无扩展名';counts[ext]=(counts[ext]??0)+1;}
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]);
}

import { z } from 'zod';
import type { HistoryData } from './model';
const hash=z.string().regex(/^[a-f0-9]{40,64}$/);
const count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const path=z.string().min(1).max(8192);
const date=z.string().max(60).refine(v=>Number.isFinite(Date.parse(v)),'Invalid timestamp');
const change=z.object({path,type:z.enum(['added','modified','deleted','renamed']),insertions:count,deletions:count,oldPath:path.optional(),binary:z.boolean().optional()});
const commit=z.object({hash,shortHash:z.string().max(64),message:z.string().max(100000),author:z.string().max(1000),email:z.string().max(1000).optional(),date,parents:z.array(hash).max(128),branchRefs:z.array(z.string().max(1000)).max(10000),stats:z.object({filesChanged:count,insertions:count,deletions:count}),changes:z.array(change).max(200000)});
const schema=z.object({version:z.literal(1),repository:z.string().max(1000),branch:z.string().max(1000),branches:z.array(z.string().max(1000)).max(10000),totalCommits:count,commits:z.array(commit).max(20000),snapshots:z.record(z.object({commitHash:hash,totalFiles:count,files:z.array(z.object({path,oid:hash,mode:z.string().regex(/^[0-7]{6}$/)})).max(200000)})),shallow:z.boolean(),firstCommit:z.object({hash,message:z.string().max(100000),date}).optional(),scannedAt:date});
export function validateHistory(value:unknown):HistoryData {
  const data=schema.parse(value);
  if(data.totalCommits<data.commits.length)throw new Error('提交数量不一致');
  const seen=new Set<string>();let entries=0;
  for(const c of data.commits){
    if(seen.has(c.hash))throw new Error('重复的提交');seen.add(c.hash);
    const snap=data.snapshots[c.hash];
    if(!snap||snap.commitHash!==c.hash||snap.totalFiles!==snap.files.length)throw new Error('快照不完整');
    if(new Set(snap.files.map(f=>f.path)).size!==snap.files.length)throw new Error('快照包含重复路径');
    entries+=snap.files.length;if(entries>2000000)throw new Error('快照数据过大');
  }
  if(Object.keys(data.snapshots).some(key=>!seen.has(key)))throw new Error('存在未知提交的快照');
  const positions=new Map(data.commits.map((c,i)=>[c.hash,i]));
  for(const [i,c]of data.commits.entries())if(c.parents.some(p=>positions.has(p)&&positions.get(p)!>=i))throw new Error('提交父子顺序无效');
  return {...data,source:'import'};
}
export function exportHistory(data:HistoryData):string {
  // Schema strips unknown properties recursively: no absolute repository path,
  // source text, diff, custom metadata or credentials are exported.
  const clean=validateHistory(data);
  const {source:_source,...metadata}=clean;
  return JSON.stringify({...metadata,commits:metadata.commits.map(({email:_email,...c})=>c)},null,2);
}

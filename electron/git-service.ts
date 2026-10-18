import { simpleGit, type SimpleGit } from 'simple-git';
import { stat, realpath, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { FileChange, GitCommit, HistoryData, ScanProgress } from '../src/core/model';
import { validateHistory } from '../src/core/transfer';
import { GitAtlasFailure } from './errors';
import { applyNumstat, parseLog, parseNameStatus, parseTree } from './parsers';
const format='--format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%P%x00%D%x00%s%x00';
export const READ_ONLY_COMMANDS=new Set(['rev-parse','rev-list','log','for-each-ref','diff','diff-tree','ls-tree']);
export class GitService {
  private git?:SimpleGit;
  private root='';
  private data?:HistoryData;
  private busy=false;
  private cancelled=false;
  constructor(private cacheDirectory:string,private progress:(p:ScanProgress)=>void=()=>{}){}
  static async status(){try{return{git:true,version:(await simpleGit().raw(['--version'])).trim(),platform:process.platform};}catch{return{git:false,version:'',platform:process.platform};}}
  get path(){return this.root;}
  private async run(command:string,...args:string[]) {
    if(!this.git||!READ_ONLY_COMMANDS.has(command))throw new GitAtlasFailure('NO_REPOSITORY','No approved repository');
    return this.git.raw(['--no-pager','-c','core.quotepath=false','-c','core.fsmonitor=false','-c','color.ui=false',command,...args]);
  }
  async open(directory:string) {
    if(this.busy)throw new GitAtlasFailure('BUSY','Scan in progress');
    const status=await GitService.status();if(!status.git)throw new GitAtlasFailure('GIT_NOT_FOUND','Git not installed');
    let canonical:string;
    try{canonical=await realpath(directory);if(!(await stat(canonical)).isDirectory())throw new Error();}
    catch{throw new GitAtlasFailure('REPOSITORY_NOT_FOUND','Path does not exist');}
    const git=simpleGit({baseDir:canonical,maxConcurrentProcesses:4,timeout:{block:60000}}).env({...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0',GIT_PAGER:'cat',GIT_LITERAL_PATHSPECS:'1'});
    let root:string;
    try{root=(await git.raw(['rev-parse','--show-toplevel'])).trim();}
    catch{throw new GitAtlasFailure('INVALID_REPOSITORY','Not a working tree');}
    this.root=await realpath(root);this.git=git;this.data=undefined;
    let branch='HEAD';try{branch=(await this.run('rev-parse','--abbrev-ref','HEAD')).trim();}catch{/* Unborn repository. */}
    return this.scan(branch,500);
  }
  cancel(){this.cancelled=true;}
  private checkCancel(){if(this.cancelled)throw new GitAtlasFailure('CANCELLED','Cancelled');}
  private async changes(a:string|undefined,b:string):Promise<FileChange[]> {
    const args=a?[a,b,'--']:['--root',b,'--'];
    const command=a?'diff':'diff-tree';
    const common=['--no-ext-diff','--no-textconv','-r','-M','--no-commit-id'];
    const [names,stats]=await Promise.all([this.run(command,...common,'--name-status','-z',...args),this.run(command,...common,'--numstat','-z',...args)]);
    return applyNumstat(parseNameStatus(names),stats);
  }
  async scan(branch:string,limit:number):Promise<HistoryData> {
    if(this.busy)throw new GitAtlasFailure('BUSY','Scan in progress');
    this.busy=true;this.cancelled=false;
    try{
      this.progress({stage:'读取仓库',current:0,total:0});
      const refs=(await this.run('for-each-ref','--format=%(refname)','refs/heads/','refs/remotes/')).trim().split('\n').filter(Boolean);
      const labels=refs.map(r=>r.replace(/^refs\/(heads|remotes)\//,''));
      const ref=branch==='HEAD'?'HEAD':refs[labels.indexOf(branch)];
      if(!ref&&refs.length)throw new GitAtlasFailure('UNKNOWN_BRANCH','Unknown branch');
      let tip='';try{tip=(await this.run('rev-parse','--verify',`${ref||'HEAD'}^{commit}`)).trim();}catch{if(refs.length)throw new GitAtlasFailure('UNKNOWN_BRANCH','Invalid ref');}
      const shallow=(await this.run('rev-parse','--is-shallow-repository')).trim()==='true';
      const empty:HistoryData={version:1,repository:basename(this.root),branch,branches:labels.length?labels:[branch],totalCommits:0,commits:[],snapshots:{},shallow,source:'local',scannedAt:new Date().toISOString()};
      if(!tip){this.data=empty;return empty;}
      const cacheFile=join(this.cacheDirectory,createHash('sha256').update(this.root+'\0'+branch).digest('hex')+'.json');
      let cached:HistoryData|undefined;
      try{if((await stat(cacheFile)).size<100*1024*1024)cached=validateHistory(JSON.parse(await readFile(cacheFile,'utf8')));}catch{/* A corrupt cache never prevents reading Git. */}
      const totalCommits=Number((await this.run('rev-list','--count',tip,'--')).trim());
      const take=Math.min(Math.max(1,Math.floor(limit)),20000);
      this.progress({stage:'加载提交',current:0,total:Math.min(take,totalCommits)});
      // --topo-order prevents a child preceding a loaded parent even when clocks differ.
      const commits=parseLog(await this.run('log','--topo-order',`-n${take}`,format,tip,'--')).reverse();
      const snapshots:HistoryData['snapshots']={};
      const known=new Map(cached?.commits.map(c=>[c.hash,c]));let current=0,entries=0;
      for(let start=0;start<commits.length;start+=4){
        this.checkCancel();
        await Promise.all(commits.slice(start,start+4).map(async c=>{
          const old=known.get(c.hash);const oldSnapshot=cached?.snapshots[c.hash];
          if(old&&oldSnapshot){c.changes=old.changes;c.stats=old.stats;snapshots[c.hash]=oldSnapshot;}
          else {
            let changes:FileChange[];
            try{changes=await this.changes(c.parents[0],c.hash);}catch(e){if(shallow)changes=await this.changes(undefined,c.hash);else throw e;}
            c.changes=changes;c.stats={filesChanged:changes.length,insertions:changes.reduce((n,f)=>n+f.insertions,0),deletions:changes.reduce((n,f)=>n+f.deletions,0)};
            const files=parseTree(await this.run('ls-tree','-rz','--full-tree',c.hash));
            snapshots[c.hash]={commitHash:c.hash,totalFiles:files.length,files};
          }
          entries+=snapshots[c.hash].totalFiles;
          if(entries>2000000)throw new GitAtlasFailure('TOO_LARGE','Snapshot capacity exceeded');
          this.progress({stage:'分析文件变化',current:++current,total:commits.length});
        }));
      }
      this.checkCancel();
      this.progress({stage:'构建时间轴',current:commits.length,total:commits.length});
      const roots=(await this.run('rev-list','--max-parents=0',tip,'--')).trim().split('\n').filter(Boolean);
      const rootCommits=roots.length?parseLog(await this.run('log','--no-walk',format,...roots,'--')):[];
      const first=rootCommits.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date))[0];
      const data:HistoryData={...empty,totalCommits,commits,snapshots,firstCommit:first?{hash:first.hash,date:first.date,message:first.message}:undefined};
      this.data=data;
      try{await mkdir(this.cacheDirectory,{recursive:true});await writeFile(cacheFile+'.tmp',JSON.stringify(data));await rename(cacheFile+'.tmp',cacheFile);}catch{/* Cache is an optional acceleration. */}
      return data;
    }finally{this.busy=false;}
  }
  private commit(hash:string):GitCommit {
    const c=this.data?.commits.find(c=>c.hash===hash);
    if(!c||!/^[0-9a-f]{40,64}$/.test(hash))throw new GitAtlasFailure('UNKNOWN_COMMIT','Unapproved hash');return c;
  }
  async diff(hash:string,path:string) {
    const c=this.commit(hash);const change=c.changes.find(f=>f.path===path);
    if(!change)throw new GitAtlasFailure('UNKNOWN_COMMIT','Unapproved file');
    const args=c.parents[0]?[c.parents[0],hash]:['--root',hash];
    const result=await this.run(c.parents[0]?'diff':'diff-tree','--no-ext-diff','--no-textconv','--no-color','--no-commit-id','-r','-M','--unified=3','--patch',...args,'--',...(change.oldPath?[change.oldPath]:[]),path);
    return result.length>2000000?result.slice(0,2000000)+'\n\n[Diff 超过 2 MB，显示已截断]':result||'此文件没有文本差异（可能是空文件、模式变化或纯重命名）。';
  }
  async compare(a:string,b:string){this.commit(a);this.commit(b);return this.changes(a,b);}
}

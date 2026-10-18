import {create} from 'zustand';
import type {AtlasError,HistoryData,ScanProgress} from './model';
export type View='overview'|'timeline'|'files'|'growth'|'activity'|'contributors'|'compare';
interface Store {
  data:HistoryData|null;index:number;playing:boolean;speed:number;view:View;query:string;error:AtlasError|null;progress:ScanProgress|null;busy:boolean;
  load:(data:HistoryData)=>void;seek:(index:number)=>void;play:()=>void;set:(partial:Partial<Pick<Store,'playing'|'speed'|'view'|'query'|'error'|'progress'|'busy'>>)=>void;
}
export const useAtlas=create<Store>((set,get)=>({data:null,index:0,playing:false,speed:1,view:'overview',query:'',error:null,progress:null,busy:false,
  load:data=>set({data,index:Math.max(0,data.commits.length-1),playing:false,error:null,query:'',busy:false,progress:null}),
  seek:index=>set({index:Math.max(0,Math.min(index,(get().data?.commits.length??1)-1))}),
  play:()=>{const s=get();if(!s.data?.commits.length)return;set({playing:!s.playing,index:s.index===s.data.commits.length-1&&!s.playing?0:s.index});},
  set:partial=>set(partial),
}));
export const fmt=(n:number)=>new Intl.NumberFormat('en-US').format(n);
export const day=(date?:string)=>date?date.slice(0,10).replaceAll('-','.'): '—';

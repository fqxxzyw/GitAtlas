import {useRef,type ButtonHTMLAttributes,type ReactNode} from 'react';
import {motion,useMotionValue,useSpring,useReducedMotion} from 'framer-motion';
import {ArrowUpRight} from 'lucide-react';
export function MagneticButton({children,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>){
  const ref=useRef<HTMLSpanElement>(null),x=useMotionValue(0),y=useMotionValue(0),reduced=useReducedMotion();
  const sx=useSpring(x,{stiffness:320,damping:22}),sy=useSpring(y,{stiffness:320,damping:22});
  return <motion.span className="magnetic" ref={ref} style={reduced?{}:{x:sx,y:sy}} onPointerMove={e=>{if(reduced)return;const b=ref.current?.getBoundingClientRect();if(b){x.set((e.clientX-b.left-b.width/2)*.10);y.set((e.clientY-b.top-b.height/2)*.12);}}} onPointerLeave={()=>{x.set(0);y.set(0);}}><button className={`button ${className}`} {...props}>{children}</button></motion.span>;
}
export function SectionTitle({eyebrow,title,description,action}:{eyebrow:string;title:string;description?:string;action?:ReactNode}){
  return <div className="section-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</div>;
}
export function Panel({children,className=''}:{children:ReactNode;className?:string}){return <section className={`panel ${className}`}>{children}</section>;}
export function Metric({label,value,note}:{label:string;value:string;note?:string}){return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;}
export function Empty({title,detail}:{title:string;detail:string}){return <div className="empty"><div className="empty-orbit"><ArrowUpRight size={24}/></div><h2>{title}</h2><p>{detail}</p></div>;}

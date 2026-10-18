import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:boolean}>{
  state={error:false};
  static getDerivedStateFromError(){return{error:true};}
  render(){return this.state.error?<div className="fatal-error"><h1>这个视图暂时无法打开</h1><p>仓库文件不会受影响。请重新打开 GitAtlas。</p><button onClick={()=>location.reload()}>重新加载</button></div>:this.props.children;}
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);
